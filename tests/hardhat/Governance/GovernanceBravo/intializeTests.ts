import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";

import { GovernorBravoDelegate, GovernorBravoDelegate__factory, XVSVault } from "../../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

let root: Signer;
let customer: Signer;
let accounts: Signer[];
let governorBravoDelegate: MockContract<GovernorBravoDelegate>;
let xvsVault: FakeContract<XVSVault>;

type GovernorBravoDelegateFixture = {
  governorBravoDelegate: MockContract<GovernorBravoDelegate>;
  xvsVault: FakeContract<XVSVault>;
};

async function governorBravoFixture(): Promise<GovernorBravoDelegateFixture> {
  const GovernorBravoDelegateFactory = await smock.mock<GovernorBravoDelegate__factory>("GovernorBravoDelegate");
  const governorBravoDelegate = await GovernorBravoDelegateFactory.deploy();
  const xvsVault = await smock.fake<XVSVault>("XVSVault");
  return { governorBravoDelegate, xvsVault };
}

describe("Governor Bravo Initializing Test", () => {
  beforeEach(async () => {
    [root, customer, ...accounts] = await ethers.getSigners();
    const contracts = await loadFixture(governorBravoFixture);
    ({ governorBravoDelegate, xvsVault } = contracts);
    await governorBravoDelegate.setVariable("admin", await root.getAddress());
  });

  describe("initilizer", () => {
    it("should revert if not called by admin", async () => {
      await expect(
        governorBravoDelegate
          .connect(customer)
          .initialize(ethers.constants.AddressZero, [], [], ethers.constants.AddressZero),
      ).to.be.revertedWith("GovernorBravo::initialize: admin only");
    });
    it("should revert if invalid xvs address", async () => {
      await expect(
        governorBravoDelegate.initialize(ethers.constants.AddressZero, [], [], ethers.constants.AddressZero),
      ).to.be.revertedWith("GovernorBravo::initialize: invalid xvs address");
    });
    it("should revert if invalid guardian address", async () => {
      await expect(
        governorBravoDelegate.initialize(xvsVault.address, [], [], ethers.constants.AddressZero),
      ).to.be.revertedWith("GovernorBravo::initialize: invalid guardian");
    });
    it("should revert if timelock adress count differs from governance routes count", async () => {
      const guardianAddress = await accounts[0].getAddress();

      const timelocks = [accounts[0].getAddress(), accounts[1].getAddress()];
      await expect(
        governorBravoDelegate.initialize(xvsVault.address, [], timelocks, guardianAddress),
      ).to.be.revertedWith("GovernorBravo::initialize:number of timelocks should match number of governance routes");
    });
    it("should revert if proposal config count differs from governance routes count", async () => {
      const guardianAddress = await accounts[0].getAddress();
      const proposalConfigs = [
        { votingDelay: 0, votingPeriod: 1, proposalThreshold: 2 },
        { votingDelay: 0, votingPeriod: 2, proposalThreshold: 3 },
        { votingDelay: 0, votingPeriod: 3, proposalThreshold: 4 },
        { votingDelay: 0, votingPeriod: 4, proposalThreshold: 5 },
      ];

      const timelocks = [accounts[0].getAddress(), accounts[1].getAddress(), accounts[2].getAddress()];
      await expect(
        governorBravoDelegate.initialize(xvsVault.address, proposalConfigs, timelocks, guardianAddress),
      ).to.be.revertedWith(
        "GovernorBravo::initialize:number of proposal configs should match number of governance routes",
      );
    });

    it("should revert if initialized twice", async () => {
      const guardianAddress = await accounts[0].getAddress();
      const minVotingDelay = await governorBravoDelegate.MIN_VOTING_DELAY();
      const minVotingPeriod = await governorBravoDelegate.MIN_VOTING_PERIOD();
      const minProposalThreshold = await governorBravoDelegate.MIN_PROPOSAL_THRESHOLD();
      const proposalConfigs = [
        {
          votingDelay: minVotingDelay.add(10),
          votingPeriod: minVotingPeriod.add(100),
          proposalThreshold: minProposalThreshold.add(100),
        },
        {
          votingDelay: minVotingDelay.add(10),
          votingPeriod: minVotingPeriod.add(100),
          proposalThreshold: minProposalThreshold.add(100),
        },
        {
          votingDelay: minVotingDelay.add(10),
          votingPeriod: minVotingPeriod.add(100),
          proposalThreshold: minProposalThreshold.add(100),
        },
      ];

      const timelocks = [accounts[0].getAddress(), accounts[1].getAddress(), accounts[2].getAddress()];
      await governorBravoDelegate.initialize(xvsVault.address, proposalConfigs, timelocks, guardianAddress);
      await expect(
        governorBravoDelegate.initialize(xvsVault.address, proposalConfigs, timelocks, guardianAddress),
      ).to.be.revertedWith("GovernorBravo::initialize: cannot initialize twice");
    });

    //TODO: implement tests for min, max value validation of voting period, voting delay, proposal threshold
  });
});
