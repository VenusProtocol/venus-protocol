import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

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

async function governorBravoFixture(): Promise<GovernorBravoDelegateFixture> {
  const GovernorBravoDelegateFactory = await smock.mock<GovernorBravoDelegate__factory>("GovernorBravoDelegate");
  const governorBravoDelegate = await GovernorBravoDelegateFactory.deploy();
  const xvsVault = await smock.fake<XVSVault>("XVSVault");
  const xvsStore = await smock.fake<XVSStore>("XVSStore");
  const xvsToken = await smock.fake<XVS>("XVS");
  return { governorBravoDelegate, xvsVault, xvsStore, xvsToken };
}

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

let targets: any[], values: string | any[], signatures: string | any[], callDatas: string | any[];
describe("Governor Bravo Propose Tests", () => {
  let rootAddress: string;
  let proposalId: BigNumber;
  let trivialProposal: any;
  let proposalBlock: number;
  beforeEach(async () => {
    [root, customer, ...accounts] = await ethers.getSigners();
    rootAddress = await root.getAddress();
    targets = [rootAddress];
    values = ["0"];
    signatures = ["getBalanceOf(address)"];
    callDatas = [encodeParameters(["address"], [rootAddress])];
    const contracts = await loadFixture(governorBravoFixture);
    ({ governorBravoDelegate, xvsVault, xvsToken } = contracts);
    await governorBravoDelegate.setVariable("admin", await root.getAddress());
    await governorBravoDelegate.setVariable("initialProposalId", 1);
    await governorBravoDelegate.setVariable("proposalCount", 1);
    await governorBravoDelegate.setVariable("xvsVault", xvsVault.address);
    await governorBravoDelegate.setVariable("proposalMaxOperations", 10);
    xvsToken.balanceOf.returns(400001);
    xvsVault.getPriorVotes.returns(convertToUnit("300000", 18));
    await governorBravoDelegate.setVariable("proposalConfigs", proposalConfigs);
    await governorBravoDelegate.propose(targets, values, signatures, callDatas, "do nothing", ProposalType.CRITICAL);
    proposalBlock = (await ethers.provider.getBlock("latest")).number;
    proposalId = await governorBravoDelegate.latestProposalIds(rootAddress);
    trivialProposal = await governorBravoDelegate.proposals(proposalId);
  });
  describe("simple initialization", () => {
    it("ID is set to a globally unique identifier", async () => {
      expect(trivialProposal.id).to.equal(proposalId);
    });

    it("Proposer is set to the sender", async () => {
      expect(trivialProposal.proposer).to.equal(rootAddress);
    });

    it("Start block is set to the current block number plus vote delay", async () => {
      expect(trivialProposal.startBlock).to.equal(proposalBlock + 1 + "");
    });

    it("End block is set to the current block number plus the sum of vote delay and vote period", async () => {
      expect(trivialProposal.endBlock).to.equal(
        proposalBlock + proposalConfigs[2].votingDelay + proposalConfigs[2].votingPeriod,
      );
    });

    it("ForVotes and AgainstVotes are initialized to zero", async () => {
      expect(trivialProposal.forVotes).to.equal("0");
      expect(trivialProposal.againstVotes).to.equal("0");
    });

    it("Executed and Canceled flags are initialized to false", async () => {
      expect(trivialProposal.canceled).to.equal(false);
      expect(trivialProposal.executed).to.equal(false);
    });

    it("ETA is initialized to zero", async () => {
      expect(trivialProposal.eta).to.equal("0");
    });

    it("Targets, Values, Signatures, Calldatas are set according to parameters", async () => {
      const dynamicFields = await governorBravoDelegate.getActions(trivialProposal.id);
      expect(dynamicFields.targets).to.deep.equal([rootAddress]);
      // values cannot be get with .values since it is reserved word and returns function
      expect(dynamicFields[1]).to.deep.equal(values);
      expect(dynamicFields.signatures).to.deep.equal(signatures);
      expect(dynamicFields.calldatas).to.deep.equal(callDatas);
    });

    describe("This function must revert if", () => {
      it("the length of the values, signatures or calldatas arrays are not the same length,", async () => {
        await expect(
          governorBravoDelegate.propose(
            targets.concat(rootAddress),
            values,
            signatures,
            callDatas,
            "do nothing",
            ProposalType.CRITICAL,
          ),
        ).to.be.revertedWith("GovernorBravo::propose: proposal function information arity mismatch");

        await expect(
          governorBravoDelegate.propose(
            targets,
            values.concat(rootAddress.toString()),
            signatures,
            callDatas,
            "do nothing",
            ProposalType.CRITICAL,
          ),
        ).to.be.revertedWith("GovernorBravo::propose: proposal function information arity mismatch");

        await expect(
          governorBravoDelegate.propose(
            targets,
            values,
            signatures.concat(rootAddress.toString()),
            callDatas,
            "do nothing",
            ProposalType.CRITICAL,
          ),
        ).to.be.revertedWith("GovernorBravo::propose: proposal function information arity mismatch");

        await expect(
          governorBravoDelegate.propose(
            targets.concat(rootAddress.toString()),
            values,
            signatures,
            callDatas,
            "do nothing",
            ProposalType.CRITICAL,
          ),
        ).to.be.revertedWith("GovernorBravo::propose: proposal function information arity mismatch");
      });

      it("or if that length is zero or greater than Max Operations.", async () => {
        await expect(
          governorBravoDelegate.propose([], [], [], [], "do nothing", ProposalType.CRITICAL),
        ).to.be.revertedWith("GovernorBravo::propose: must provide actions");
      });

      describe("Additionally, if there exists a pending or active proposal from the same proposer, we must revert.", () => {
        it("reverts with pending", async () => {
          await expect(
            governorBravoDelegate.propose(targets, values, signatures, callDatas, "do nothing", ProposalType.CRITICAL),
          ).to.be.revertedWith(
            "GovernorBravo::propose: one live proposal per proposer, found an already pending proposal",
          );
        });
        it("reverts with active", async () => {
          await mine();
          await mine();

          await expect(
            governorBravoDelegate.propose(targets, values, signatures, callDatas, "do nothing", ProposalType.CRITICAL),
          ).to.be.revertedWith(
            "GovernorBravo::propose: one live proposal per proposer, found an already active proposal",
          );
        });
      });
    });

    it("This function returns the id of the newly created proposal. # proposalId(n) = succ(proposalId(n-1))", async () => {
      await mine();

      await governorBravoDelegate
        .connect(customer)
        .propose(targets, values, signatures, callDatas, "yoot", ProposalType.CRITICAL);

      const nextProposalId = await governorBravoDelegate.latestProposalIds(await customer.getAddress());
      expect(+nextProposalId).to.be.equal(+trivialProposal.id + 1);
    });

    it("emits log with id and description", async () => {
      await mine();
      await governorBravoDelegate
        .connect(accounts[3])
        .propose(targets, values, signatures, callDatas, "yoot", ProposalType.CRITICAL);

      const nextProposalId = await governorBravoDelegate.latestProposalIds(await customer.getAddress());

      const currentBlockNumber = (await ethers.provider.getBlock("latest")).number;
      const proposeStartBlock = currentBlockNumber + proposalConfigs[2].votingDelay;
      const proposeEndBlock = proposeStartBlock + proposalConfigs[2].votingPeriod;

      expect(
        await governorBravoDelegate
          .connect(customer)
          .propose(targets, values, signatures, callDatas, "second proposal", ProposalType.CRITICAL),
      )
        .to.emit(governorBravoDelegate, "ProposalCreated")
        .withArgs(
          nextProposalId,
          targets,
          values,
          signatures,
          callDatas,
          proposeStartBlock,
          proposeEndBlock,
          "second proposal",
          customer,
        );
    });
  });
});
