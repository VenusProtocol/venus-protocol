import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { IAccessControlManagerV8, PrimeLeaderboard } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const EPOCH_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds
const PRIME_SLOTS = 500;
const MINIMUM_STAKE = convertToUnit(500, 18); // 500 XVS
const LOOPS_LIMIT = 100;

describe("PrimeLeaderboard", () => {
  let primeLeaderboard: PrimeLeaderboard;
  let accessControlManager: FakeContract<IAccessControlManagerV8>;
  let xvsVault: Signer;
  let admin: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;

  const deployFixture = async () => {
    [admin, xvsVault, user1, user2, user3] = await ethers.getSigners();

    // Mock access control
    accessControlManager = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
    accessControlManager.isAllowedToCall.returns(true);

    // Deploy PrimeLeaderboard using upgrades plugin
    const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");
    primeLeaderboard = (await upgrades.deployProxy(
      PrimeLeaderboardFactory,
      [
        accessControlManager.address,
        await xvsVault.getAddress(),
        EPOCH_DURATION,
        PRIME_SLOTS,
        MINIMUM_STAKE,
        LOOPS_LIMIT,
      ],
      { unsafeAllow: ["constructor"] },
    )) as PrimeLeaderboard;

    return { primeLeaderboard, accessControlManager, xvsVault, admin, user1, user2, user3 };
  };

  beforeEach(async () => {
    ({ primeLeaderboard, accessControlManager, xvsVault, admin, user1, user2, user3 } =
      await loadFixture(deployFixture));
  });

  describe("Initialization", () => {
    it("should initialize with correct values", async () => {
      expect(await primeLeaderboard.xvsVault()).to.equal(await xvsVault.getAddress());
      expect(await primeLeaderboard.epochDuration()).to.equal(EPOCH_DURATION);
      expect(await primeLeaderboard.primeSlots()).to.equal(PRIME_SLOTS);
      expect(await primeLeaderboard.minimumStake()).to.equal(MINIMUM_STAKE);
      expect(await primeLeaderboard.currentEpoch()).to.equal(1);
    });

    it("should initialize with default multiplier tiers", async () => {
      const [durations, multipliers] = await primeLeaderboard.getMultiplierTiers();

      expect(durations.length).to.equal(3);
      expect(durations[0]).to.equal(30 * 24 * 60 * 60); // 30 days
      expect(durations[1]).to.equal(60 * 24 * 60 * 60); // 60 days
      expect(durations[2]).to.equal(90 * 24 * 60 * 60); // 90 days

      expect(multipliers[0]).to.equal(convertToUnit("1.3", 18));
      expect(multipliers[1]).to.equal(convertToUnit("1.6", 18));
      expect(multipliers[2]).to.equal(convertToUnit("2", 18));
    });

    it("should revert if initialized twice", async () => {
      await expect(
        primeLeaderboard.initialize(
          accessControlManager.address,
          await xvsVault.getAddress(),
          EPOCH_DURATION,
          PRIME_SLOTS,
          MINIMUM_STAKE,
          LOOPS_LIMIT,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should revert with zero xvsVault address", async () => {
      const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");

      await expect(
        upgrades.deployProxy(
          PrimeLeaderboardFactory,
          [
            accessControlManager.address,
            ethers.constants.AddressZero,
            EPOCH_DURATION,
            PRIME_SLOTS,
            MINIMUM_STAKE,
            LOOPS_LIMIT,
          ],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.revertedWithCustomError(PrimeLeaderboardFactory, "ZeroAddress");
    });
  });

  describe("Deposit Recording", () => {
    it("should record deposit correctly", async () => {
      const amount = convertToUnit(1000, 18);
      const user1Address = await user1.getAddress();

      const tx = await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, amount);
      const receipt = await tx.wait();

      // Verify event was emitted
      const event = receipt.events?.find((e: any) => e.event === "DepositRecorded");
      expect(event).to.not.be.undefined;
      expect(event!.args!.user).to.equal(user1Address);
      expect(event!.args!.amount).to.equal(amount);
      expect(event!.args!.newTotalStaked).to.equal(amount);
      expect(event!.args!.depositCount).to.equal(1);

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(amount);
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.true;
    });

    it("should revert if not called by XVSVault", async () => {
      const amount = convertToUnit(1000, 18);
      const user1Address = await user1.getAddress();

      await expect(primeLeaderboard.connect(admin).recordDeposit(user1Address, amount)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "OnlyXVSVaultAllowed",
      );
    });

    it("should revert with zero amount", async () => {
      const user1Address = await user1.getAddress();

      await expect(primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, 0)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "InvalidValue",
      );
    });

    it("should not add as participant if below minimum stake", async () => {
      const amount = convertToUnit(100, 18); // Below 500 XVS minimum
      const user1Address = await user1.getAddress();

      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, amount);

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(amount);
      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.false;
    });

    it("should add as participant when crossing minimum threshold", async () => {
      const user1Address = await user1.getAddress();

      // First deposit: 400 XVS (below minimum)
      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, convertToUnit(400, 18));
      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.false;

      // Second deposit: 200 XVS (total now 600 XVS, above minimum)
      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, convertToUnit(200, 18));
      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.true;
    });

    it("should track multiple deposits for a user", async () => {
      const user1Address = await user1.getAddress();
      const amount1 = BigNumber.from(convertToUnit(500, 18));
      const amount2 = BigNumber.from(convertToUnit(300, 18));

      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, amount1);
      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, amount2);

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(amount1.add(amount2));
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(2);
    });
  });

  describe("Withdrawal Recording (LIFO)", () => {
    beforeEach(async () => {
      // Setup: user1 has two deposits
      const user1Address = await user1.getAddress();
      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, convertToUnit(500, 18));
      await time.increase(10 * 24 * 60 * 60); // 10 days later
      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, convertToUnit(300, 18));
    });

    it("should process withdrawal using LIFO order", async () => {
      const user1Address = await user1.getAddress();
      const withdrawAmount = convertToUnit(200, 18);

      await primeLeaderboard.connect(xvsVault).recordWithdrawal(user1Address, withdrawAmount);

      // Total should be reduced
      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(600, 18));
      // Should have 2 deposits still (300 XVS partially consumed)
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(2);
    });

    it("should fully consume newest deposit first", async () => {
      const user1Address = await user1.getAddress();
      const withdrawAmount = convertToUnit(400, 18); // More than the 300 XVS second deposit

      await primeLeaderboard.connect(xvsVault).recordWithdrawal(user1Address, withdrawAmount);

      // Total should be reduced
      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(400, 18));
      // Should have 1 deposit left (second deposit fully consumed, first partially)
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
    });

    it("should emit WithdrawalRecorded event", async () => {
      const user1Address = await user1.getAddress();
      const withdrawAmount = convertToUnit(200, 18);

      await expect(primeLeaderboard.connect(xvsVault).recordWithdrawal(user1Address, withdrawAmount)).to.emit(
        primeLeaderboard,
        "WithdrawalRecorded",
      );
    });

    it("should revert if withdrawal exceeds total stake", async () => {
      const user1Address = await user1.getAddress();
      const withdrawAmount = convertToUnit(1000, 18); // More than 800 XVS total

      await expect(
        primeLeaderboard.connect(xvsVault).recordWithdrawal(user1Address, withdrawAmount),
      ).to.be.revertedWithCustomError(primeLeaderboard, "InsufficientStake");
    });

    it("should remove from participants if falling below minimum", async () => {
      const user1Address = await user1.getAddress();

      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.true;

      // Withdraw most of the stake
      await primeLeaderboard.connect(xvsVault).recordWithdrawal(user1Address, convertToUnit(500, 18));

      // Still has 300 XVS, below 500 minimum
      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.false;
    });
  });

  describe("Effective Stake Calculation", () => {
    it("should calculate base multiplier (1.0x) for deposits < 30 days", async () => {
      const user1Address = await user1.getAddress();
      const amount = convertToUnit(1000, 18);

      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, amount);

      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(amount); // 1.0x multiplier
    });

    it("should calculate 1.3x multiplier for deposits 30-60 days", async () => {
      const user1Address = await user1.getAddress();
      const amount = convertToUnit(1000, 18);

      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, amount);
      await time.increase(35 * 24 * 60 * 60); // 35 days

      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(1300, 18)); // 1.3x multiplier
    });

    it("should calculate 1.6x multiplier for deposits 60-90 days", async () => {
      const user1Address = await user1.getAddress();
      const amount = convertToUnit(1000, 18);

      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, amount);
      await time.increase(65 * 24 * 60 * 60); // 65 days

      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(1600, 18)); // 1.6x multiplier
    });

    it("should calculate 2.0x multiplier for deposits 90+ days", async () => {
      const user1Address = await user1.getAddress();
      const amount = convertToUnit(1000, 18);

      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, amount);
      await time.increase(95 * 24 * 60 * 60); // 95 days

      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(2000, 18)); // 2.0x multiplier
    });

    it("should sum effective stake across multiple deposits with different ages", async () => {
      const user1Address = await user1.getAddress();

      // Deposit 1: 500 XVS
      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, convertToUnit(500, 18));
      await time.increase(45 * 24 * 60 * 60); // 45 days

      // Deposit 2: 300 XVS (will be 0 days old at calculation)
      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, convertToUnit(300, 18));

      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      // Deposit 1: 500 * 1.3 = 650
      // Deposit 2: 300 * 1.0 = 300
      // Total: 950
      expect(effectiveStake).to.equal(convertToUnit(950, 18));
    });
  });

  describe("Multiplier Tiers", () => {
    it("should return correct multiplier for exact threshold", async () => {
      const multiplier30Days = await primeLeaderboard.getMultiplier(30 * 24 * 60 * 60);
      expect(multiplier30Days).to.equal(convertToUnit("1.3", 18));

      const multiplier60Days = await primeLeaderboard.getMultiplier(60 * 24 * 60 * 60);
      expect(multiplier60Days).to.equal(convertToUnit("1.6", 18));

      const multiplier90Days = await primeLeaderboard.getMultiplier(90 * 24 * 60 * 60);
      expect(multiplier90Days).to.equal(convertToUnit("2", 18));
    });

    it("should return base multiplier for < 30 days", async () => {
      const multiplier = await primeLeaderboard.getMultiplier(29 * 24 * 60 * 60);
      expect(multiplier).to.equal(convertToUnit("1", 18));
    });
  });

  describe("Participant Management", () => {
    it("should correctly track participant count", async () => {
      expect(await primeLeaderboard.getParticipantCount()).to.equal(0);

      await primeLeaderboard.connect(xvsVault).recordDeposit(await user1.getAddress(), convertToUnit(600, 18));
      expect(await primeLeaderboard.getParticipantCount()).to.equal(1);

      await primeLeaderboard.connect(xvsVault).recordDeposit(await user2.getAddress(), convertToUnit(700, 18));
      expect(await primeLeaderboard.getParticipantCount()).to.equal(2);
    });

    it("should return participants in range", async () => {
      await primeLeaderboard.connect(xvsVault).recordDeposit(await user1.getAddress(), convertToUnit(600, 18));
      await primeLeaderboard.connect(xvsVault).recordDeposit(await user2.getAddress(), convertToUnit(700, 18));
      await primeLeaderboard.connect(xvsVault).recordDeposit(await user3.getAddress(), convertToUnit(800, 18));

      const participants = await primeLeaderboard.getParticipants(0, 3);
      expect(participants.length).to.equal(3);
      expect(participants[0]).to.equal(await user1.getAddress());
      expect(participants[1]).to.equal(await user2.getAddress());
      expect(participants[2]).to.equal(await user3.getAddress());
    });

    it("should handle out of range queries gracefully", async () => {
      await primeLeaderboard.connect(xvsVault).recordDeposit(await user1.getAddress(), convertToUnit(600, 18));

      const participants = await primeLeaderboard.getParticipants(0, 100);
      expect(participants.length).to.equal(1);
    });
  });

  describe("Epoch Management", () => {
    it("should track epoch correctly", async () => {
      expect(await primeLeaderboard.currentEpoch()).to.equal(1);
    });

    it("should calculate epoch end time correctly", async () => {
      const epochStartTime = await primeLeaderboard.epochStartTime();
      const epochEndTime = await primeLeaderboard.getEpochEndTime();

      expect(epochEndTime.sub(epochStartTime)).to.equal(EPOCH_DURATION);
    });

    it("should report epoch not ready before duration passes", async () => {
      expect(await primeLeaderboard.isEpochReadyForProcessing()).to.be.false;
    });

    it("should report epoch ready after duration passes", async () => {
      await time.increase(EPOCH_DURATION + 1);
      expect(await primeLeaderboard.isEpochReadyForProcessing()).to.be.true;
    });

    it("should report correct time until epoch end", async () => {
      const timeRemaining = await primeLeaderboard.getTimeUntilEpochEnd();
      expect(timeRemaining).to.be.closeTo(BigNumber.from(EPOCH_DURATION), 10);
    });
  });

  describe("Admin Functions", () => {
    it("should update epoch duration", async () => {
      const newDuration = 7 * 24 * 60 * 60; // 7 days

      await expect(primeLeaderboard.setEpochDuration(newDuration))
        .to.emit(primeLeaderboard, "EpochDurationUpdated")
        .withArgs(EPOCH_DURATION, newDuration);

      expect(await primeLeaderboard.epochDuration()).to.equal(newDuration);
    });

    it("should update prime slots", async () => {
      const newSlots = 1000;

      await expect(primeLeaderboard.setPrimeSlots(newSlots))
        .to.emit(primeLeaderboard, "PrimeSlotsUpdated")
        .withArgs(PRIME_SLOTS, newSlots);

      expect(await primeLeaderboard.primeSlots()).to.equal(newSlots);
    });

    it("should update minimum stake", async () => {
      const newMinimum = convertToUnit(1000, 18);

      await expect(primeLeaderboard.setMinimumStake(newMinimum))
        .to.emit(primeLeaderboard, "MinimumStakeUpdated")
        .withArgs(MINIMUM_STAKE, newMinimum);

      expect(await primeLeaderboard.minimumStake()).to.equal(newMinimum);
    });

    it("should update multiplier tiers", async () => {
      const newDurations = [15 * 24 * 60 * 60, 30 * 24 * 60 * 60, 45 * 24 * 60 * 60];
      const newMultipliers = [convertToUnit("1.2", 18), convertToUnit("1.5", 18), convertToUnit("1.8", 18)];

      await expect(primeLeaderboard.setMultiplierTiers(newDurations, newMultipliers)).to.emit(
        primeLeaderboard,
        "MultiplierTiersUpdated",
      );

      const [durations, multipliers] = await primeLeaderboard.getMultiplierTiers();
      expect(durations[0]).to.equal(newDurations[0]);
      expect(multipliers[0]).to.equal(newMultipliers[0]);
    });

    it("should revert on invalid multiplier tiers (non-ascending)", async () => {
      const invalidDurations = [30 * 24 * 60 * 60, 20 * 24 * 60 * 60]; // Not ascending
      const multipliers = [convertToUnit("1.2", 18), convertToUnit("1.5", 18)];

      await expect(primeLeaderboard.setMultiplierTiers(invalidDurations, multipliers)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "InvalidMultiplierTiers",
      );
    });

    it("should set PrimeV2 address", async () => {
      const primeV2Address = await user1.getAddress();

      await expect(primeLeaderboard.setPrimeV2(primeV2Address))
        .to.emit(primeLeaderboard, "PrimeV2Set")
        .withArgs(ethers.constants.AddressZero, primeV2Address);

      expect(await primeLeaderboard.primeV2()).to.equal(primeV2Address);
    });

    it("should revert when setting zero PrimeV2 address", async () => {
      await expect(primeLeaderboard.setPrimeV2(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "ZeroAddress",
      );
    });
  });

  describe("Pause functionality", () => {
    it("should pause and unpause", async () => {
      await primeLeaderboard.pause();
      expect(await primeLeaderboard.paused()).to.be.true;

      await primeLeaderboard.unpause();
      expect(await primeLeaderboard.paused()).to.be.false;
    });

    it("should revert deposit when paused", async () => {
      await primeLeaderboard.pause();

      await expect(
        primeLeaderboard.connect(xvsVault).recordDeposit(await user1.getAddress(), convertToUnit(1000, 18)),
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("Epoch Processing", () => {
    beforeEach(async () => {
      // Setup: Multiple users with deposits
      await primeLeaderboard.connect(xvsVault).recordDeposit(await user1.getAddress(), convertToUnit(1000, 18));
      await primeLeaderboard.connect(xvsVault).recordDeposit(await user2.getAddress(), convertToUnit(800, 18));
      await primeLeaderboard.connect(xvsVault).recordDeposit(await user3.getAddress(), convertToUnit(600, 18));

      // Move past epoch end
      await time.increase(EPOCH_DURATION + 1);
    });

    it("should process epoch batch", async () => {
      const users = [await user1.getAddress(), await user2.getAddress(), await user3.getAddress()];
      const scores = [
        await primeLeaderboard.getEffectiveStake(users[0]),
        await primeLeaderboard.getEffectiveStake(users[1]),
        await primeLeaderboard.getEffectiveStake(users[2]),
      ];

      await expect(primeLeaderboard.processEpochBatch(users, scores)).to.emit(primeLeaderboard, "EpochBatchProcessed");
    });

    it("should revert epoch batch if not ended", async () => {
      // Deploy fresh and don't wait
      const { primeLeaderboard: fresh } = await loadFixture(deployFixture);
      await fresh.connect(xvsVault).recordDeposit(await user1.getAddress(), convertToUnit(1000, 18));

      const users = [await user1.getAddress()];
      const scores = [await fresh.getEffectiveStake(users[0])];

      await expect(fresh.processEpochBatch(users, scores)).to.be.revertedWithCustomError(fresh, "EpochNotEnded");
    });

    it("should revert if scores don't match", async () => {
      const users = [await user1.getAddress()];
      const wrongScores = [convertToUnit(999999, 18)]; // Wrong score

      await expect(primeLeaderboard.processEpochBatch(users, wrongScores)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "ScoreVerificationFailed",
      );
    });

    it("should finalize epoch and grant Prime status", async () => {
      const users = [await user1.getAddress(), await user2.getAddress(), await user3.getAddress()];
      const scores = [
        await primeLeaderboard.getEffectiveStake(users[0]),
        await primeLeaderboard.getEffectiveStake(users[1]),
        await primeLeaderboard.getEffectiveStake(users[2]),
      ];

      await primeLeaderboard.processEpochBatch(users, scores);

      // Finalize with ranked users (user1 has highest score)
      await expect(primeLeaderboard.finalizeEpoch(users)).to.emit(primeLeaderboard, "EpochFinalized");

      // Check Prime status
      expect(await primeLeaderboard.hasPrimeStatus(users[0])).to.be.true;
      expect(await primeLeaderboard.hasPrimeStatus(users[1])).to.be.true;
      expect(await primeLeaderboard.hasPrimeStatus(users[2])).to.be.true;

      // Check ranks
      expect(await primeLeaderboard.userRank(users[0])).to.equal(1);
      expect(await primeLeaderboard.userRank(users[1])).to.equal(2);
      expect(await primeLeaderboard.userRank(users[2])).to.equal(3);

      // Epoch should advance
      expect(await primeLeaderboard.currentEpoch()).to.equal(2);
    });

    it("should revert finalization with wrong ranking order", async () => {
      const users = [await user1.getAddress(), await user2.getAddress(), await user3.getAddress()];
      const scores = [
        await primeLeaderboard.getEffectiveStake(users[0]),
        await primeLeaderboard.getEffectiveStake(users[1]),
        await primeLeaderboard.getEffectiveStake(users[2]),
      ];

      await primeLeaderboard.processEpochBatch(users, scores);

      // Try to finalize with wrong order (user3 first, but has lower score)
      const wrongOrder = [users[2], users[1], users[0]];
      await expect(primeLeaderboard.finalizeEpoch(wrongOrder)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "InvalidRankingOrder",
      );
    });

    it("should record epoch snapshot", async () => {
      const users = [await user1.getAddress(), await user2.getAddress(), await user3.getAddress()];
      const scores = [
        await primeLeaderboard.getEffectiveStake(users[0]),
        await primeLeaderboard.getEffectiveStake(users[1]),
        await primeLeaderboard.getEffectiveStake(users[2]),
      ];

      await primeLeaderboard.processEpochBatch(users, scores);
      await primeLeaderboard.finalizeEpoch(users);

      const snapshot = await primeLeaderboard.getEpochSnapshot(1);
      expect(snapshot.finalized).to.be.true;
      expect(snapshot.primeHoldersCount).to.equal(3);
      expect(snapshot.totalParticipants).to.equal(3);
    });
  });

  describe("Withdrawn Score Tracking", () => {
    it("should track withdrawn score for current epoch", async () => {
      const user1Address = await user1.getAddress();

      // Deposit and wait for multiplier
      await primeLeaderboard.connect(xvsVault).recordDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(35 * 24 * 60 * 60); // 35 days -> 1.3x multiplier

      // Check effective stake before withdrawal
      const stakeBefore = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(stakeBefore).to.equal(convertToUnit(1300, 18)); // 1000 * 1.3

      // Withdraw 500 XVS
      await primeLeaderboard.connect(xvsVault).recordWithdrawal(user1Address, convertToUnit(500, 18));

      // Withdrawn score should be: 500 * 1.3 = 650 (locked)
      // Remaining stake: 500 * 1.3 = 650
      // Total effective stake: 650 + 650 = 1300
      const stakeAfter = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(stakeAfter).to.equal(convertToUnit(1300, 18));
    });
  });
});
