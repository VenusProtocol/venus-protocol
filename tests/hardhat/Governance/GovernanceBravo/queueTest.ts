import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../../helpers/utils";
import {
  GovernorBravoDelegate,
  GovernorBravoDelegate__factory,
  Timelock,
  XVS,
  XVSStore,
  XVSVault,
} from "../../../../typechain";
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
let timelock: FakeContract<Timelock>;

type GovernorBravoDelegateFixture = {
  governorBravoDelegate: MockContract<GovernorBravoDelegate>;
  xvsVault: FakeContract<XVSVault>;
  xvsStore: FakeContract<XVSStore>;
  xvsToken: FakeContract<XVS>;
  timelock: FakeContract<Timelock>;
};

async function governorBravoFixture(): Promise<GovernorBravoDelegateFixture> {
  const GovernorBravoDelegateFactory = await smock.mock<GovernorBravoDelegate__factory>("GovernorBravoDelegate");
  const governorBravoDelegate = await GovernorBravoDelegateFactory.deploy();
  const xvsVault = await smock.fake<XVSVault>("XVSVault");
  const xvsStore = await smock.fake<XVSStore>("XVSStore");
  const xvsToken = await smock.fake<XVS>("XVS");
  const timelock = await smock.fake<Timelock>("Timelock");
  return { governorBravoDelegate, xvsVault, xvsStore, xvsToken, timelock };
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

describe("Governor Bravo Queue Tests", () => {
  let rootAddress: string;
  let proposalId: BigNumber;
  beforeEach(async () => {
    [root, customer, ...accounts] = await ethers.getSigners();
    rootAddress = await root.getAddress();
    const contracts = await loadFixture(governorBravoFixture);
    ({ governorBravoDelegate, xvsVault, xvsToken, timelock } = contracts);

    await governorBravoDelegate.setVariable("admin", await root.getAddress());
    await governorBravoDelegate.setVariable("initialProposalId", 1);
    await governorBravoDelegate.setVariable("proposalCount", 1);
    await governorBravoDelegate.setVariable("xvsVault", xvsVault.address);
    await governorBravoDelegate.setVariable("proposalMaxOperations", 10);
    xvsToken.balanceOf.returns(400001);
    xvsVault.getPriorVotes.returns(convertToUnit("600000", 18));
    await governorBravoDelegate.setVariable("proposalConfigs", proposalConfigs);
    await governorBravoDelegate.setVariable("proposalTimelocks", {
      2: timelock.address,
    });
  });
  describe("overlapping actions", () => {
    it("reverts on queueing overlapping actions in same proposal", async () => {
      await mine();
      const targets = [xvsToken.address, xvsToken.address];
      const values = ["0", "0"];
      const signatures = ["getBalanceOf(address)", "getBalanceOf(address)"];
      const calldatas = [encodeParameters(["address"], [rootAddress]), encodeParameters(["address"], [rootAddress])];
      await governorBravoDelegate
        .connect(customer)
        .propose(targets, values, signatures, calldatas, "do nothing", ProposalType.CRITICAL);
      proposalId = await governorBravoDelegate.latestProposalIds(await customer.getAddress());
      await mine();

      await governorBravoDelegate.connect(customer).castVote(proposalId, 1);
      await advanceBlocks(17);
      timelock.queuedTransactions.returns(true);
      await expect(governorBravoDelegate.queue(proposalId)).to.be.revertedWith(
        "GovernorBravo::queueOrRevertInternal: identical proposal action already queued at eta",
      );
    });

    it("reverts on queueing overlapping actions in different proposals", async () => {
      await mine();

      const targets = [xvsToken.address];
      const values = ["0"];
      const signatures = ["getBalanceOf(address)"];
      const calldatas = [encodeParameters(["address"], [rootAddress])];

      await governorBravoDelegate
        .connect(customer)
        .propose(targets, values, signatures, calldatas, "do nothing1", ProposalType.CRITICAL);

      const proposalId1 = await governorBravoDelegate.latestProposalIds(await customer.getAddress());

      await governorBravoDelegate
        .connect(accounts[3])
        .propose(targets, values, signatures, calldatas, "do nothing", ProposalType.CRITICAL);

      const proposalId2 = await governorBravoDelegate.latestProposalIds(await accounts[3].getAddress());
      await mine();

      await governorBravoDelegate.connect(customer).castVote(proposalId1, 1);
      await governorBravoDelegate.connect(accounts[3]).castVote(proposalId2, 1);
      await advanceBlocks(17);
      timelock.queuedTransactions.returns(false);
      await governorBravoDelegate.queue(proposalId1);
      timelock.queuedTransactions.returns(true);
      await expect(governorBravoDelegate.queue(proposalId2)).to.be.revertedWith(
        "GovernorBravo::queueOrRevertInternal: identical proposal action already queued at eta",
      );
    });
  });
});

async function advanceBlocks(blocks: number) {
  await mine(blocks);
}
