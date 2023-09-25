import { impersonateAccount, loadFixture, mine, mineUpTo, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { ComptrollerInterface, GovernorBravoDelegate, IAccessControlManager } from "../../../typechain";
import { TimelockInterface } from "../../../typechain/contracts/Governance/GovernorAlpha2.sol";
import { getCalldatas, setForkBlock } from "./vip-framework/utils";

const ONE_HOUR_IN_BLOCKS = 800;
const SIX_HOURS_IN_BLOCKS = 6 * ONE_HOUR_IN_BLOCKS;
const ONE_DAY_IN_BLOCKS = 24 * ONE_HOUR_IN_BLOCKS;
const ONE_HOUR_IN_SECONDS = 3600;
const SIX_HOURS_IN_SECONDS = 6 * ONE_HOUR_IN_SECONDS;

const COMPTROLLER_PROXY_MAINNET = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const XVS_VAULT_MAINNET = "0x051100480289e704d20e9db4804837068f3f9204";
const NORMAL_VIP_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const GOVERNOR_PROXY_MAINNET = "0x2d56dC077072B53571b8252008C60e945108c75a";
const PROPOSAL_TYPE_CONFIGS = [
  // ProposalType.NORMAL
  {
    votingDelay: 1,
    votingPeriod: ONE_DAY_IN_BLOCKS,
    proposalThreshold: parseUnits("300000", 18),
  },
  // ProposalType.FASTTRACK
  {
    votingDelay: 1,
    votingPeriod: ONE_DAY_IN_BLOCKS,
    proposalThreshold: parseUnits("300000", 18),
  },
  // ProposalType.CRITICAL
  {
    votingDelay: 1,
    votingPeriod: SIX_HOURS_IN_BLOCKS,
    proposalThreshold: parseUnits("300000", 18),
  },
];

const TIMELOCK_DELAYS_MAINNET = {
  NORMAL: 172800,
  FAST_TRACK: SIX_HOURS_IN_SECONDS,
  CRITICAL: ONE_HOUR_IN_SECONDS,
};

const PROPOSAL_TYPES = {
  NORMAL: 0,
  FAST_TRACK: 1,
  CRITICAL: 2,
};

let comptrollerProxy: ComptrollerInterface;
let accessControl: IAccessControlManager;
let governorProxy: GovernorBravoDelegate;
let proposer: SignerWithAddress;
let supporter: SignerWithAddress;
let governorAdmin: SignerWithAddress;
let aclAdmin: SignerWithAddress;
let timeLockFastTrack: TimelockInterface;
let timeLockCritical: TimelockInterface;

const initMainnetUser = async (user: string, balance: number) => {
  await impersonateAccount(user);
  await setBalance(user, balance);
  return ethers.getSigner(user);
};
const governanceFixture = async (): Promise<void> => {
  // Mandatory when creating forked tests. One must specify form which block the fork should be
  await setForkBlock(22629546);
  proposer = await initMainnetUser("0x55A9f5374Af30E3045FB491f1da3C2E8a74d168D", ethers.utils.parseEther("1.0"));
  supporter = await initMainnetUser("0xc444949e0054a23c44fc45789738bdf64aed2391", ethers.utils.parseEther("1.0"));
  governorAdmin = await initMainnetUser("0x1c2cac6ec528c20800b2fe734820d87b581eaa6b", ethers.utils.parseEther("1.0"));
  aclAdmin = await initMainnetUser(NORMAL_VIP_TIMELOCK, ethers.utils.parseEther("1.0"));

  comptrollerProxy = await ethers.getContractAt("ComptrollerInterface", COMPTROLLER_PROXY_MAINNET);
  const Timelock = await ethers.getContractFactory("Timelock");
  timeLockFastTrack = await Timelock.deploy(GOVERNOR_PROXY_MAINNET, TIMELOCK_DELAYS_MAINNET.FAST_TRACK);
  timeLockCritical = await Timelock.deploy(GOVERNOR_PROXY_MAINNET, TIMELOCK_DELAYS_MAINNET.CRITICAL);

  const aclAddressPadded = await ethers.provider.getStorageAt(COMPTROLLER_PROXY_MAINNET, 40);
  const aclAddress = await ethers.utils.defaultAbiCoder.decode(["address"], aclAddressPadded).toString();
  accessControl = await ethers.getContractAt("IAccessControlManager", aclAddress);

  // Give Permission to Timelocks
  let tx = await accessControl
    .connect(aclAdmin)
    .giveCallPermission(COMPTROLLER_PROXY_MAINNET, "_setLiquidationIncentive(uint256)", timeLockFastTrack.address);
  await tx.wait();
  tx = await accessControl
    .connect(aclAdmin)
    .giveCallPermission(COMPTROLLER_PROXY_MAINNET, "_setLiquidationIncentive(uint256)", timeLockCritical.address);
  await tx.wait();
  governorProxy = await ethers.getContractAt("GovernorBravoDelegator", GOVERNOR_PROXY_MAINNET);

  //Deploy new governance v4 impl
  const GovernorBravo = await ethers.getContractFactory("GovernorBravoDelegate");
  const governorBravoV4Impl = await GovernorBravo.deploy();
  await governorProxy.connect(governorAdmin)._setImplementation(governorBravoV4Impl.address);

  // Iniitalize impl via Proxy
  governorProxy = await ethers.getContractAt("GovernorBravoDelegate", GOVERNOR_PROXY_MAINNET);
  tx = await governorProxy
    .connect(governorAdmin)
    .initialize(
      XVS_VAULT_MAINNET,
      PROPOSAL_TYPE_CONFIGS,
      [NORMAL_VIP_TIMELOCK, timeLockFastTrack.address, timeLockCritical.address],
      await governorAdmin.getAddress(),
    );
  await tx.wait();
};

describe("Governance v4", () => {
  const NEW_LIQ_INCENTIVE = parseUnits("2", 18);

  describe("NORMAL VIP", () => {
    const proposal = {
      signatures: ["_setLiquidationIncentive(uint256)"],
      targets: [COMPTROLLER_PROXY_MAINNET],
      values: ["0"],
      params: [[NEW_LIQ_INCENTIVE]],
    };
    let proposalId;

    before(async () => {
      await loadFixture(governanceFixture);
    });

    describe("Propose:", () => {
      it("should revert if below votingThreshold", async () => {
        const { targets, signatures, values } = proposal;
        await expect(
          governorProxy.propose(targets, values, signatures, getCalldatas(proposal), "VIP 1", PROPOSAL_TYPES.NORMAL),
        ).to.be.revertedWith("GovernorBravo::propose: proposer votes below proposal threshold");
      });

      it("should pass", async () => {
        const { targets, signatures, values } = proposal;
        const proposalIdBefore = await governorProxy.callStatic.proposalCount();
        const tx = await governorProxy
          .connect(proposer)
          .propose(targets, values, signatures, getCalldatas(proposal), "VIP 1", PROPOSAL_TYPES.NORMAL);
        await tx.wait();
        proposalId = await governorProxy.callStatic.proposalCount();
        expect(proposalIdBefore.add(1)).to.equal(proposalId);
      });
    });

    describe("Cast Vote:", () => {
      it("should cast votes", async () => {
        await mine();
        await expect(governorProxy.connect(proposer).castVote(proposalId, 1))
          .to.emit(governorProxy, "VoteCast")
          .withArgs(await proposer.getAddress(), proposalId, 1, 335338539326609831760663n, "");

        await expect(governorProxy.connect(supporter).castVote(proposalId, 1))
          .to.emit(governorProxy, "VoteCast")
          .withArgs(await supporter.getAddress(), proposalId, 1, 846441499442385723656125n, "");
      });
    });

    describe("Queue Proposal:", () => {
      it("should revert if voting period is not passed", async () => {
        await expect(governorProxy.connect(proposer).queue(proposalId)).to.be.revertedWith(
          "GovernorBravo::queue: proposal can only be queued if it is succeeded",
        );
      });

      it("should be queued sucessfully", async () => {
        await mineUpTo((await ethers.provider.getBlockNumber()) + PROPOSAL_TYPE_CONFIGS[0].votingPeriod);
        const tx = await governorProxy.connect(proposer).queue(proposalId);
        await tx.wait();
      });
    });

    describe("Execute Proposal:", () => {
      it("should revert if timelock period has not passed", async () => {
        await expect(governorProxy.connect(proposer).execute(proposalId)).to.be.revertedWith(
          "Timelock::executeTransaction: Transaction hasn't surpassed time lock.",
        );
      });

      it("should be executed successfully", async () => {
        await mineUpTo((await ethers.provider.getBlockNumber()) + TIMELOCK_DELAYS_MAINNET.NORMAL);
        const tx = await governorProxy.connect(proposer).execute(proposalId);
        await tx.wait();
      });

      it("correct value should be set after execution", async () => {
        const liquidationIncentive = await comptrollerProxy.liquidationIncentiveMantissa();
        expect(liquidationIncentive).to.equal(NEW_LIQ_INCENTIVE);
      });
    });
  });
  describe("FAST TRACK VIP", () => {
    const proposal = {
      signatures: ["_setLiquidationIncentive(uint256)"],
      targets: [COMPTROLLER_PROXY_MAINNET],
      values: ["0"],
      params: [[NEW_LIQ_INCENTIVE]],
    };
    let proposalId;

    before(async () => {
      await loadFixture(governanceFixture);
    });

    describe("Propose:", () => {
      it("should revert if below votingThreshold", async () => {
        const { targets, signatures, values } = proposal;
        await expect(
          governorProxy.propose(
            targets,
            values,
            signatures,
            getCalldatas(proposal),
            "VIP 2",
            PROPOSAL_TYPES.FAST_TRACK,
          ),
        ).to.be.revertedWith("GovernorBravo::propose: proposer votes below proposal threshold");
      });

      it("should pass", async () => {
        const { targets, signatures, values } = proposal;
        const proposalIdBefore = await governorProxy.callStatic.proposalCount();
        const tx = await governorProxy
          .connect(proposer)
          .propose(targets, values, signatures, getCalldatas(proposal), "VIP 2", PROPOSAL_TYPES.FAST_TRACK);
        await tx.wait();
        proposalId = await governorProxy.callStatic.proposalCount();
        expect(proposalIdBefore.add(1)).to.equal(proposalId);
      });
    });

    describe("Cast Vote:", () => {
      it("should cast votes", async () => {
        await mine();

        await expect(governorProxy.connect(proposer).castVote(proposalId, 1))
          .to.emit(governorProxy, "VoteCast")
          .withArgs(await proposer.getAddress(), proposalId, 1, 335338539326609831760663n, "");

        await expect(governorProxy.connect(supporter).castVote(proposalId, 1))
          .to.emit(governorProxy, "VoteCast")
          .withArgs(await supporter.getAddress(), proposalId, 1, 846441499442385723656125n, "");
      });
    });

    describe("Queue Proposal:", () => {
      it("should revert if voting period is not passed", async () => {
        await expect(governorProxy.connect(proposer).queue(proposalId)).to.be.revertedWith(
          "GovernorBravo::queue: proposal can only be queued if it is succeeded",
        );
      });

      it("should be queued sucessfully", async () => {
        await mineUpTo((await ethers.provider.getBlockNumber()) + PROPOSAL_TYPE_CONFIGS[1].votingPeriod);
        const tx = await governorProxy.connect(proposer).queue(proposalId);
        await tx.wait();
      });
    });

    describe("Execute Proposal:", () => {
      it("should revert if timelock period has not passed", async () => {
        await expect(governorProxy.connect(proposer).execute(proposalId)).to.be.revertedWith(
          "Timelock::executeTransaction: Transaction hasn't surpassed time lock.",
        );
      });

      it("should be executed successfully", async () => {
        await mineUpTo((await ethers.provider.getBlockNumber()) + TIMELOCK_DELAYS_MAINNET.FAST_TRACK);
        const tx = await governorProxy.connect(proposer).execute(proposalId);
        await tx.wait();
      });

      it("correct value should be set after execution", async () => {
        const liquidationIncentive = await comptrollerProxy.liquidationIncentiveMantissa();
        expect(liquidationIncentive).to.equal(NEW_LIQ_INCENTIVE);
      });
    });
  });

  describe("CRITICAL VIP", () => {
    const proposal = {
      signatures: ["_setLiquidationIncentive(uint256)"],
      targets: [COMPTROLLER_PROXY_MAINNET],
      values: ["0"],
      params: [[NEW_LIQ_INCENTIVE]],
    };
    let proposalId;

    before(async () => {
      await loadFixture(governanceFixture);
    });

    describe("Propose:", () => {
      it("should revert if below votingThreshold", async () => {
        const { targets, signatures, values } = proposal;
        await expect(
          governorProxy.propose(targets, values, signatures, getCalldatas(proposal), "VIP 3", PROPOSAL_TYPES.CRITICAL),
        ).to.be.revertedWith("GovernorBravo::propose: proposer votes below proposal threshold");
      });

      it("should pass", async () => {
        const { targets, signatures, values } = proposal;
        const proposalIdBefore = await governorProxy.callStatic.proposalCount();
        const tx = await governorProxy
          .connect(proposer)
          .propose(targets, values, signatures, getCalldatas(proposal), "VIP 3", PROPOSAL_TYPES.CRITICAL);
        await tx.wait();
        proposalId = await governorProxy.callStatic.proposalCount();
        expect(proposalIdBefore.add(1)).to.equal(proposalId);
      });
    });

    describe("Cast Vote:", () => {
      it("should cast votes", async () => {
        await mine();
        await expect(governorProxy.connect(proposer).castVote(proposalId, 1))
          .to.emit(governorProxy, "VoteCast")
          .withArgs(await proposer.getAddress(), proposalId, 1, 335338539326609831760663n, "");

        await expect(governorProxy.connect(supporter).castVote(proposalId, 1))
          .to.emit(governorProxy, "VoteCast")
          .withArgs(await supporter.getAddress(), proposalId, 1, 846441499442385723656125n, "");
      });
    });

    describe("Queue Proposal:", () => {
      it("should revert if voting period is not passed", async () => {
        await expect(governorProxy.connect(proposer).queue(proposalId)).to.be.revertedWith(
          "GovernorBravo::queue: proposal can only be queued if it is succeeded",
        );
      });

      it("should be queued sucessfully", async () => {
        await mineUpTo((await ethers.provider.getBlockNumber()) + PROPOSAL_TYPE_CONFIGS[2].votingPeriod);
        const tx = await governorProxy.connect(proposer).queue(proposalId);
        await tx.wait();
      });
    });

    describe("Execute Proposal:", () => {
      it("should revert if timelock period has not passed", async () => {
        await expect(governorProxy.connect(proposer).execute(proposalId)).to.be.revertedWith(
          "Timelock::executeTransaction: Transaction hasn't surpassed time lock.",
        );
      });

      it("should be executed successfully", async () => {
        await mineUpTo((await ethers.provider.getBlockNumber()) + TIMELOCK_DELAYS_MAINNET.CRITICAL);
        const tx = await governorProxy.connect(proposer).execute(proposalId);
        await tx.wait();
      });

      it("correct value should be set after execution", async () => {
        const liquidationIncentive = await comptrollerProxy.liquidationIncentiveMantissa();
        expect(liquidationIncentive).to.equal(NEW_LIQ_INCENTIVE);
      });
    });
  });
});
