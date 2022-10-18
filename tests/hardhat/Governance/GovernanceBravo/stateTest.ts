import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers, network } from "hardhat";

import { convertToUnit } from "../../../../helpers/utils";
import {
  GovernorBravoDelegate,
  GovernorBravoDelegate__factory,
  Timelock,
  XVS,
  XVSStore,
  XVSVault,
} from "../../../../typechain";
import { ProposalState, ProposalType } from "../../util/Proposals";

const { expect } = chai;
chai.use(smock.matchers);

const { encodeParameters } = require("../../../Utils/BSC");

let root: Signer;
let customer: Signer;
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

describe("Governor Bravo State Tests", () => {
  let rootAddress: string;
  let proposalId: BigNumber;
  let trivialProposal: any;
  let targets: string[];
  let values: string[];
  let signatures: string[];
  let calldatas: string[] = [];

  beforeEach(async () => {
    [root, customer] = await ethers.getSigners();
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

    targets = [rootAddress];
    values = ["0"];
    signatures = ["getBalanceOf(address)"];
    calldatas = [encodeParameters(["address"], [rootAddress])];
    await governorBravoDelegate.propose(targets, values, signatures, calldatas, "do nothing", ProposalType.CRITICAL);
    proposalId = await governorBravoDelegate.latestProposalIds(rootAddress);
    trivialProposal = await governorBravoDelegate.proposals(proposalId);
    await mineBlock();
  });

  it("Invalid for proposal not found", async () => {
    await expect(governorBravoDelegate.state(5)).to.be.revertedWith("GovernorBravo::state: invalid proposal id");
  });

  it("Pending", async () => {
    expect(await governorBravoDelegate.state(trivialProposal.id)).to.equal(ProposalState.Pending);
  });
  it("Active", async () => {
    await mineBlock();
    expect(await governorBravoDelegate.state(trivialProposal.id)).to.equal(ProposalState.Active);
  });
  it("Canceled", async () => {
    await governorBravoDelegate
      .connect(customer)
      .propose(targets, values, signatures, calldatas, "do nothing", ProposalType.CRITICAL);
    xvsVault.getPriorVotes.returns(convertToUnit("200000", 18));

    const newProposalId = await governorBravoDelegate.proposalCount();
    await governorBravoDelegate.cancel(newProposalId);

    expect(await governorBravoDelegate.state(newProposalId)).to.equal(ProposalState.Canceled);
  });
  it("Canceled by Guardian", async () => {
    governorBravoDelegate.setVariable("guardian", rootAddress);
    await governorBravoDelegate
      .connect(customer)
      .propose(targets, values, signatures, calldatas, "do nothing", ProposalType.CRITICAL);
    const newProposalId = await governorBravoDelegate.proposalCount();
    await governorBravoDelegate.cancel(newProposalId);

    expect(await governorBravoDelegate.state(newProposalId)).to.equal(ProposalState.Canceled);
  });
  it("Defeated", async () => {
    // travel to end block
    await advanceBlocks(18);
    expect(await governorBravoDelegate.state(trivialProposal.id)).to.equal(ProposalState.Defeated);
  });
  it("Succeeded", async () => {
    xvsVault.getPriorVotes.returns(convertToUnit("300000", 18));
    await governorBravoDelegate
      .connect(customer)
      .propose(targets, values, signatures, calldatas, "do nothing", ProposalType.CRITICAL);
    const newProposalId = await governorBravoDelegate.proposalCount();
    await mineBlock();
    await governorBravoDelegate.castVote(newProposalId, 1);
    await governorBravoDelegate.connect(customer).castVote(newProposalId, 1);
    await advanceBlocks(18);
    expect(await governorBravoDelegate.state(newProposalId)).to.equal(ProposalState.Succeeded);
  });
  it("Expired", async () => {
    xvsVault.getPriorVotes.returns(convertToUnit("300000", 18));
    await governorBravoDelegate
      .connect(customer)
      .propose(targets, values, signatures, calldatas, "do nothing", ProposalType.CRITICAL);
    const newProposalId = await governorBravoDelegate.proposalCount();
    await mineBlock();
    await governorBravoDelegate.castVote(newProposalId, 1);
    await governorBravoDelegate.connect(customer).castVote(newProposalId, 1);
    await advanceBlocks(16);
    await governorBravoDelegate.queue(newProposalId);
    expect(await governorBravoDelegate.state(newProposalId)).to.equal(ProposalState.Expired);
  });
  it("Queued", async () => {
    timelock.delay.returns(100);
    await mineBlock();
    xvsVault.getPriorVotes.returns(convertToUnit("300000", 18));
    await governorBravoDelegate
      .connect(customer)
      .propose(targets, values, signatures, calldatas, "do nothing", ProposalType.CRITICAL);
    const newProposalId = await governorBravoDelegate.proposalCount();
    await mineBlock();
    await governorBravoDelegate.castVote(newProposalId, 1);
    await governorBravoDelegate.connect(customer).castVote(newProposalId, 1);
    await advanceBlocks(16);
    await governorBravoDelegate.queue(newProposalId);
    expect(await governorBravoDelegate.state(newProposalId)).to.equal(ProposalState.Queued);
  });

  it("Executed", async () => {
    xvsVault.getPriorVotes.returns(convertToUnit("300000", 18));
    timelock.delay.returns(100);
    await governorBravoDelegate
      .connect(customer)
      .propose(targets, values, signatures, calldatas, "do nothing", ProposalType.CRITICAL);
    const newProposalId = await governorBravoDelegate.proposalCount();
    await mineBlock();
    await governorBravoDelegate.castVote(newProposalId, 1);
    await governorBravoDelegate.connect(customer).castVote(newProposalId, 1);
    await advanceBlocks(16);
    await governorBravoDelegate.queue(newProposalId);

    const proposal = await governorBravoDelegate.proposals(newProposalId);

    expect(await governorBravoDelegate.state(newProposalId)).to.equal(ProposalState.Queued);
    await governorBravoDelegate.connect(customer).execute(newProposalId);
    expect(await governorBravoDelegate.state(newProposalId)).to.equal(ProposalState.Executed);
    // still executed even though would be expired
    await minewWithTimestamp(proposal.eta.toNumber() + 10);

    expect(await governorBravoDelegate.state(newProposalId)).to.equal(ProposalState.Executed);
  });
});

async function mineBlock() {
  await mine();
}

// NOTE: very dirty solution
//for bigger block to advance it will throw timeout
async function advanceBlocks(blocks: number) {
  await mine(blocks);
}

/**
 * Sets the timestamp for the new block and mines it
 * @param timestamp Number of seconds to increase time by
 */
async function minewWithTimestamp(timestamp: number) {
  // First we increase the time
  // Time travelling to the future!
  await network.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await mine();
}
