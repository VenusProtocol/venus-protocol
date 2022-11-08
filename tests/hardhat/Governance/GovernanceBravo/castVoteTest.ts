import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers, network } from "hardhat";

import { convertToUnit } from "../../../../helpers/utils";
import { GovernorBravoDelegate, GovernorBravoDelegate__factory, XVS, XVSStore, XVSVault } from "../../../../typechain";
import { ProposalType } from "../../util/Proposals";

const { expect } = chai;
chai.use(smock.matchers);

const { encodeParameters } = require("../../../Utils/BSC");

let root: Signer;
let customer: Signer;
let accounts: Signer[];
let governorBravoDelegate: MockContract<GovernorBravoDelegate>;
let xvsVault: FakeContract<XVSVault>;
let xvsToken: FakeContract<XVS>;

type GovernorBravoDelegateFixture = {
  governorBravoDelegate: MockContract<GovernorBravoDelegate>;
  xvsVault: FakeContract<XVSVault>;
  xvsStore: FakeContract<XVSStore>;
  xvsToken: FakeContract<XVS>;
};

const proposalConfigs = {
  // ProposalType.NORMAL
  0: {
    votingDelay: 1,
    votingPeriod: 4,
    proposalThreshold: convertToUnit("150000", 18),
  },
  // ProposalType.FASTTRACK
  1: {
    votingDelay: 1,
    votingPeriod: 8,
    proposalThreshold: convertToUnit("200000", 18),
  },
  // ProposalType.CRITICAL
  2: {
    votingDelay: 1,
    votingPeriod: 16,
    proposalThreshold: convertToUnit("250000", 18),
  },
};

async function governorBravoFixture(): Promise<GovernorBravoDelegateFixture> {
  const GovernorBravoDelegateFactory = await smock.mock<GovernorBravoDelegate__factory>("GovernorBravoDelegate");
  const governorBravoDelegate = await GovernorBravoDelegateFactory.deploy();
  const xvsVault = await smock.fake<XVSVault>("XVSVault");
  const xvsStore = await smock.fake<XVSStore>("XVSStore");
  const xvsToken = await smock.fake<XVS>("XVS");
  return { governorBravoDelegate, xvsVault, xvsStore, xvsToken };
}

describe("Governor Bravo Cast Vote Test", () => {
  beforeEach(async () => {
    [root, customer, ...accounts] = await ethers.getSigners();
    const contracts = await loadFixture(governorBravoFixture);
    ({ governorBravoDelegate, xvsVault, xvsToken } = contracts);
    await governorBravoDelegate.setVariable("admin", await root.getAddress());
    await governorBravoDelegate.setVariable("initialProposalId", 1);
    await governorBravoDelegate.setVariable("proposalCount", 1);
    await governorBravoDelegate.setVariable("xvsVault", xvsVault.address);
    await governorBravoDelegate.setVariable("proposalMaxOperations", 10);
  });
  describe("We must revert if:", () => {
    let customerAddress;
    it("We cannot propose without enough voting power by depositing xvs to the vault", async () => {
      customerAddress = await customer.getAddress();
      await expect(
        governorBravoDelegate.propose(
          [customerAddress],
          ["0"],
          ["getBalanceOf(address)"],
          [encodeParameters(["address"], [customerAddress])],
          "do nothing",
          ProposalType.CRITICAL,
        ),
      ).to.be.revertedWith("GovernorBravo::propose: proposer votes below proposal threshold");
    });
    describe("after we deposit xvs to the vault", () => {
      let proposalId: BigNumber;
      beforeEach(async () => {
        customerAddress = await customer.getAddress();
        const rootAddress = await root.getAddress();
        xvsToken.balanceOf.whenCalledWith(rootAddress).returns(400001);
        xvsVault.getPriorVotes.returns(convertToUnit("300000", 18));
        await governorBravoDelegate.setVariable("proposalConfigs", proposalConfigs);
        await governorBravoDelegate.propose(
          [customerAddress],
          ["0"],
          ["getBalanceOf(address)"],
          [encodeParameters(["address"], [customerAddress])],
          "do nothing",
          ProposalType.CRITICAL,
        );
        proposalId = await governorBravoDelegate.latestProposalIds(await root.getAddress());
      });

      it("There does not exist a proposal with matching proposal id where the current block number is between the proposal's start block (exclusive) and end block (inclusive)", async () => {
        await expect(governorBravoDelegate.castVote(proposalId, 1)).to.be.revertedWith(
          "GovernorBravo::castVoteInternal: voting is closed",
        );
      });

      it("Such proposal already has an entry in its voters set matching the sender", async () => {
        await mine();
        await mine();

        await governorBravoDelegate.connect(accounts[4]).castVote(proposalId, 1);
        await governorBravoDelegate.connect(accounts[3]).castVoteWithReason(proposalId, 1, "");
        await expect(governorBravoDelegate.connect(accounts[4]).castVote(proposalId, 1)).to.be.revertedWith(
          "GovernorBravo::castVoteInternal: voter already voted",
        );
      });
      describe("Otherwise", () => {
        it("we add the sender to the proposal's voters set", async () => {
          let receipt = await governorBravoDelegate.getReceipt(proposalId, await accounts[2].getAddress());
          expect(receipt.hasVoted).to.be.false;
          //Mine a block to make the proposal in Active State
          await mine();
          await governorBravoDelegate.connect(accounts[2]).castVote(proposalId, 1);
          receipt = await governorBravoDelegate.getReceipt(proposalId, await accounts[2].getAddress());
          expect(receipt.hasVoted).to.be.true;
        });
      });

      describe("and we take the balance returned by GetPriorVotes for the given sender and the proposal's start block, which may be zero,", () => {
        let actor; // an account that will propose, deposit token to be franchised

        it("and we add that ForVotes", async () => {
          actor = accounts[1];
          const actorAddress = await actor.getAddress();

          await governorBravoDelegate
            .connect(actor)
            .propose(
              [actorAddress],
              ["0"],
              ["getBalanceOf(address)"],
              [encodeParameters(["address"], [actorAddress])],
              "do nothing",
              ProposalType.NORMAL,
            );

          proposalId = await governorBravoDelegate.latestProposalIds(actorAddress);

          let proposal = await governorBravoDelegate.proposals(proposalId);
          const beforeFors = proposal.forVotes;
          await mine();
          await governorBravoDelegate.connect(actor).castVote(proposalId, 1);
          proposal = await governorBravoDelegate.proposals(proposalId);
          const afterFors = proposal.forVotes;

          expect(beforeFors.add(convertToUnit("300000", 18))).to.equal(afterFors);
        });

        it("or AgainstVotes corresponding to the caller's support flag.", async () => {
          actor = accounts[3];
          const actorAddress = await actor.getAddress();

          await governorBravoDelegate
            .connect(actor)
            .propose(
              [actorAddress],
              ["0"],
              ["getBalanceOf(address)"],
              [encodeParameters(["address"], [actorAddress])],
              "do nothing",
              ProposalType.NORMAL,
            );

          proposalId = await governorBravoDelegate.latestProposalIds(actorAddress);

          let proposal = await governorBravoDelegate.proposals(proposalId);
          const beforeAgainsts = proposal.againstVotes;
          await mine();
          await governorBravoDelegate.connect(actor).castVote(proposalId, 0);
          proposal = await governorBravoDelegate.proposals(proposalId);
          const afterAgainsts = proposal.againstVotes;

          expect(beforeAgainsts.add(convertToUnit("300000", 18))).to.equal(afterAgainsts);
        });
      });
      describe("castVoteBySig", () => {
        it("reverts if the signatory is invalid", async () => {
          await expect(
            governorBravoDelegate.castVoteBySig(
              proposalId,
              0,
              0,
              ethers.utils.formatBytes32String("r"),
              ethers.utils.formatBytes32String("s"),
            ),
          ).to.be.revertedWith("GovernorBravo::castVoteBySig: invalid signature");
        });

        it("casts vote on behalf of the signatory", async () => {
          const actor = accounts[1];
          const actorAddress = await actor.getAddress();
          await governorBravoDelegate
            .connect(actor)
            .propose(
              [actorAddress],
              ["0"],
              ["getBalanceOf(address)"],
              [encodeParameters(["address"], [actorAddress])],
              "do nothing",
              ProposalType.NORMAL,
            );

          let proposal = await governorBravoDelegate.proposals(proposalId);
          const beforeFors = proposal.forVotes;
          await mine();

          const proposalIdNum: number = proposalId.toNumber();

          const data = {
            types: {
              Ballot: [
                { name: "proposalId", type: "uint256" },
                { name: "support", type: "uint8" },
              ],
            },
            primaryType: "Ballot",
            domain: {
              name: "Venus Governor Bravo",
              chainId: 1, // await web3.eth.net.getId(); See: https://github.com/trufflesuite/ganache-core/issues/515
              verifyingContract: governorBravoDelegate.address,
            },
            message: {
              proposalId: proposalIdNum,
              support: 1,
            },
          };

          const signatureLike = await network.provider.send("eth_signTypedData_v4", [actorAddress, data]);

          const signature = await ethers.utils.splitSignature(signatureLike);

          const tx = await governorBravoDelegate.castVoteBySig(proposalId, 1, signature.v, signature.r, signature.s);

          const receipt = await tx.wait();
          expect(receipt.gasUsed.toNumber() < 80000);

          proposal = await governorBravoDelegate.proposals(proposalId);
          const afterFors = proposal.forVotes;
          expect(beforeFors.add(convertToUnit("300000", 18))).to.equal(afterFors);
        });
      });
    });
  });
});
