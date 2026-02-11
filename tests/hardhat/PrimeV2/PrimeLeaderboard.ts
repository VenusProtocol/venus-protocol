import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { IAccessControlManagerV8, IXVSVault, PrimeLeaderboard } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const MINIMUM_STAKE = convertToUnit(500, 18); // 500 XVS
const LOOPS_LIMIT = 100;
const DAY = 24 * 60 * 60;

describe("PrimeLeaderboard", () => {
  let primeLeaderboard: PrimeLeaderboard;
  let accessControlManager: FakeContract<IAccessControlManagerV8>;
  let xvsVault: FakeContract<IXVSVault>;
  let admin: Signer;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;
  let xvsAddress: string;

  // Helper: simulate a deposit by setting vault balance and calling xvsUpdated
  const simulateDeposit = async (user: string, newTotalBalance: string) => {
    xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user).returns([newTotalBalance, 0, 0]);
    await primeLeaderboard.xvsUpdated(user);
  };

  // Helper: simulate a withdrawal by setting reduced vault balance and calling xvsUpdated
  const simulateWithdrawal = async (user: string, newTotalBalance: string) => {
    xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user).returns([newTotalBalance, 0, 0]);
    await primeLeaderboard.xvsUpdated(user);
  };

  const deployFixture = async () => {
    [admin, user1, user2, user3] = await ethers.getSigners();

    xvsAddress = ethers.Wallet.createRandom().address;

    // Mock access control
    accessControlManager = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
    accessControlManager.isAllowedToCall.returns(true);

    // Mock XVS Vault
    xvsVault = await smock.fake<IXVSVault>("IXVSVault");
    xvsVault.xvsAddress.returns(xvsAddress);
    xvsVault.getUserInfo.returns([0, 0, 0]);

    // Deploy PrimeLeaderboard using upgrades plugin
    const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");
    primeLeaderboard = (await upgrades.deployProxy(
      PrimeLeaderboardFactory,
      [
        accessControlManager.address,
        xvsVault.address,
        xvsAddress, // xvsVaultRewardToken
        0, // xvsVaultPoolId
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

    // Re-set smock mock defaults (not restored by loadFixture snapshot)
    accessControlManager.isAllowedToCall.returns(true);
  });

  describe("Initialization", () => {
    it("should initialize with correct values", async () => {
      expect(await primeLeaderboard.xvsVault()).to.equal(xvsVault.address);
      expect(await primeLeaderboard.minimumStake()).to.equal(MINIMUM_STAKE);
      expect(await primeLeaderboard.currentRound()).to.equal(1);
      expect(await primeLeaderboard.xvsVaultRewardToken()).to.equal(xvsAddress);
      expect(await primeLeaderboard.xvsVaultPoolId()).to.equal(0);
    });

    it("should initialize with default multiplier tiers", async () => {
      const [durations, multipliers] = await primeLeaderboard.getMultiplierTiers();

      expect(durations.length).to.equal(3);
      expect(durations[0]).to.equal(30 * DAY);
      expect(durations[1]).to.equal(60 * DAY);
      expect(durations[2]).to.equal(90 * DAY);

      expect(multipliers[0]).to.equal(convertToUnit("1.3", 18));
      expect(multipliers[1]).to.equal(convertToUnit("1.6", 18));
      expect(multipliers[2]).to.equal(convertToUnit("2", 18));
    });

    it("should revert if initialized twice", async () => {
      await expect(
        primeLeaderboard.initialize(
          accessControlManager.address,
          xvsVault.address,
          xvsAddress,
          0,
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
          [accessControlManager.address, ethers.constants.AddressZero, xvsAddress, 0, MINIMUM_STAKE, LOOPS_LIMIT],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.revertedWithCustomError(PrimeLeaderboardFactory, "ZeroAddress");
    });

    it("should revert with zero xvsVaultRewardToken address", async () => {
      const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");

      await expect(
        upgrades.deployProxy(
          PrimeLeaderboardFactory,
          [
            accessControlManager.address,
            xvsVault.address,
            ethers.constants.AddressZero,
            0,
            MINIMUM_STAKE,
            LOOPS_LIMIT,
          ],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.revertedWithCustomError(PrimeLeaderboardFactory, "ZeroAddress");
    });

    it("should revert with zero minimum stake", async () => {
      const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");

      await expect(
        upgrades.deployProxy(
          PrimeLeaderboardFactory,
          [accessControlManager.address, xvsVault.address, xvsAddress, 0, 0, LOOPS_LIMIT],
          { unsafeAllow: ["constructor"] },
        ),
      ).to.be.revertedWithCustomError(PrimeLeaderboardFactory, "InvalidValue");
    });
  });

  describe("Deposit Recording via xvsUpdated", () => {
    it("should record deposit correctly", async () => {
      const user1Address = await user1.getAddress();
      const amount = convertToUnit(1000, 18);

      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([amount, 0, 0]);
      await expect(primeLeaderboard.xvsUpdated(user1Address)).to.emit(primeLeaderboard, "DepositRecorded");

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(amount);
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.true;
    });

    it("should revert xvsUpdated with zero address", async () => {
      await expect(primeLeaderboard.xvsUpdated(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "ZeroAddress",
      );
    });

    it("should be no-op when vault balance unchanged", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(1);

      // Call again with same balance → no-op
      await primeLeaderboard.xvsUpdated(user1Address);
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(1000, 18));
    });

    it("should not add as participant if below minimum stake", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(100, 18)); // Below 500 XVS minimum

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(100, 18));
      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.false;
    });

    it("should add as participant when crossing minimum threshold", async () => {
      const user1Address = await user1.getAddress();

      // First deposit: 400 XVS (below minimum)
      await simulateDeposit(user1Address, convertToUnit(400, 18));
      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.false;

      // Second deposit: total 600 XVS (above minimum)
      await simulateDeposit(user1Address, convertToUnit(600, 18));
      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.true;
    });

    it("should track multiple deposits for a user", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(500, 18));
      await simulateDeposit(user1Address, convertToUnit(800, 18)); // +300 more

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(800, 18));
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(2);
    });

    it("should allow anyone to call xvsUpdated (unrestricted by design)", async () => {
      const user1Address = await user1.getAddress();

      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);
      await primeLeaderboard.connect(user2).xvsUpdated(user1Address);

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(1000, 18));
    });

    it("should return deposits via getDeposits view function", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(500, 18));
      await simulateDeposit(user1Address, convertToUnit(800, 18)); // +300

      const deposits = await primeLeaderboard.getDeposits(user1Address);
      expect(deposits.length).to.equal(2);
      expect(deposits[0].amount).to.equal(convertToUnit(500, 18));
      expect(deposits[1].amount).to.equal(convertToUnit(300, 18));
    });

    it("should return total staked via getTotalStaked view function", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      expect(await primeLeaderboard.getTotalStaked(user1Address)).to.equal(convertToUnit(1000, 18));
    });
  });

  describe("Withdrawal Recording (LIFO)", () => {
    beforeEach(async () => {
      // Setup: user1 has two deposits (500 + 300 = 800 total)
      const user1Address = await user1.getAddress();
      await simulateDeposit(user1Address, convertToUnit(500, 18));
      await time.increase(10 * DAY);
      await simulateDeposit(user1Address, convertToUnit(800, 18)); // +300
    });

    it("should process withdrawal using LIFO order", async () => {
      const user1Address = await user1.getAddress();

      // Withdraw 200 from vault (balance drops from 800 to 600)
      await simulateWithdrawal(user1Address, convertToUnit(600, 18));

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(600, 18));
      // Should have 2 deposits still (300 partially consumed → 100 remaining)
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(2);
    });

    it("should fully consume newest deposit first", async () => {
      const user1Address = await user1.getAddress();

      // Withdraw 400 (balance drops from 800 to 400)
      // Fully consumes 300 (newest), then 100 from oldest 500
      await simulateWithdrawal(user1Address, convertToUnit(400, 18));

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(400, 18));
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
    });

    it("should emit WithdrawalRecorded event", async () => {
      const user1Address = await user1.getAddress();

      // Set vault balance to 600 (withdraw 200 from 800)
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([convertToUnit(600, 18), 0, 0]);
      await expect(primeLeaderboard.xvsUpdated(user1Address)).to.emit(primeLeaderboard, "WithdrawalRecorded");
    });

    it("should remove from participants if falling below minimum", async () => {
      const user1Address = await user1.getAddress();

      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.true;

      // Withdraw most of the stake (800 → 300)
      await simulateWithdrawal(user1Address, convertToUnit(300, 18));

      // 300 XVS < 500 minimum
      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.false;
    });

    it("should handle full withdrawal to zero", async () => {
      const user1Address = await user1.getAddress();

      await simulateWithdrawal(user1Address, "0"); // vault balance drops to 0

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(0);
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(0);
      expect(await primeLeaderboard.isParticipant(user1Address)).to.be.false;
    });
  });

  describe("Effective Stake Calculation", () => {
    it("should return zero for brand-new deposits (holdDays = 0)", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));

      // holdDays = 0 → effectiveStake = 1000 × 1.0 × 0 = 0
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(0);
    });

    it("should calculate base multiplier (1.0x) for deposits < 30 days", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(10 * DAY);

      // 1000 × 1.0 × 10 = 10,000
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(10000, 18));
    });

    it("should calculate 1.3x multiplier for deposits 30-60 days", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(35 * DAY);

      // 1000 × 1.3 × 35 = 45,500
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(45500, 18));
    });

    it("should calculate 1.6x multiplier for deposits 60-90 days", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(65 * DAY);

      // 1000 × 1.6 × 65 = 104,000
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(104000, 18));
    });

    it("should calculate 2.0x multiplier for deposits 90+ days (capped at 90d)", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(95 * DAY);

      // 1000 × 2.0 × 90 = 180,000 (duration capped at 90 days)
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(180000, 18));
    });

    it("should remain capped at 90 days for very long hold periods", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(180 * DAY);

      // Still 1000 × 2.0 × 90 = 180,000
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(180000, 18));
    });

    it("should sum effective stake across multiple deposits with different ages", async () => {
      const user1Address = await user1.getAddress();

      // Deposit 1: 500 XVS
      await simulateDeposit(user1Address, convertToUnit(500, 18));
      await time.increase(45 * DAY);

      // Deposit 2: 300 XVS (total vault balance = 800)
      await simulateDeposit(user1Address, convertToUnit(800, 18));
      await time.increase(10 * DAY);

      // Deposit 1: held for 55 days → 1.3x: 500 × 1.3 × 55 = 35,750
      // Deposit 2: held for 10 days → 1.0x: 300 × 1.0 × 10 = 3,000
      // Total: 38,750
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(38750, 18));
    });
  });

  describe("Multiplier Tiers", () => {
    it("should return correct multiplier for exact thresholds", async () => {
      expect(await primeLeaderboard.getMultiplier(30 * DAY)).to.equal(convertToUnit("1.3", 18));
      expect(await primeLeaderboard.getMultiplier(60 * DAY)).to.equal(convertToUnit("1.6", 18));
      expect(await primeLeaderboard.getMultiplier(90 * DAY)).to.equal(convertToUnit("2", 18));
    });

    it("should return base multiplier for < 30 days", async () => {
      expect(await primeLeaderboard.getMultiplier(29 * DAY)).to.equal(convertToUnit("1", 18));
      expect(await primeLeaderboard.getMultiplier(0)).to.equal(convertToUnit("1", 18));
    });

    it("should return highest applicable multiplier for durations beyond max tier", async () => {
      expect(await primeLeaderboard.getMultiplier(120 * DAY)).to.equal(convertToUnit("2", 18));
    });
  });

  describe("Participant Management", () => {
    it("should correctly track participant count", async () => {
      expect(await primeLeaderboard.getParticipantCount()).to.equal(0);

      await simulateDeposit(await user1.getAddress(), convertToUnit(600, 18));
      expect(await primeLeaderboard.getParticipantCount()).to.equal(1);

      await simulateDeposit(await user2.getAddress(), convertToUnit(700, 18));
      expect(await primeLeaderboard.getParticipantCount()).to.equal(2);
    });

    it("should return participants in range", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();
      const user3Address = await user3.getAddress();

      await simulateDeposit(user1Address, convertToUnit(600, 18));
      await simulateDeposit(user2Address, convertToUnit(700, 18));
      await simulateDeposit(user3Address, convertToUnit(800, 18));

      const participants = await primeLeaderboard.getParticipants(0, 3);
      expect(participants.length).to.equal(3);
      expect(participants[0]).to.equal(user1Address);
      expect(participants[1]).to.equal(user2Address);
      expect(participants[2]).to.equal(user3Address);
    });

    it("should handle out of range queries gracefully", async () => {
      await simulateDeposit(await user1.getAddress(), convertToUnit(600, 18));

      const participants = await primeLeaderboard.getParticipants(0, 100);
      expect(participants.length).to.equal(1);
    });

    it("should return empty array for start >= length", async () => {
      await simulateDeposit(await user1.getAddress(), convertToUnit(600, 18));

      const participants = await primeLeaderboard.getParticipants(5, 10);
      expect(participants.length).to.equal(0);
    });
  });

  describe("Round Management", () => {
    it("should start at round 1", async () => {
      expect(await primeLeaderboard.currentRound()).to.equal(1);
    });

    it("should increment round on advanceRound", async () => {
      await primeLeaderboard.advanceRound();
      expect(await primeLeaderboard.currentRound()).to.equal(2);

      await primeLeaderboard.advanceRound();
      expect(await primeLeaderboard.currentRound()).to.equal(3);
    });

    it("should emit RoundAdvanced event", async () => {
      await expect(primeLeaderboard.advanceRound()).to.emit(primeLeaderboard, "RoundAdvanced").withArgs(2);
    });

    it("should revert advanceRound when access denied", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      await expect(primeLeaderboard.advanceRound()).to.be.reverted;
    });
  });

  describe("Admin Functions", () => {
    it("should update minimum stake", async () => {
      const newMinimum = convertToUnit(1000, 18);

      await expect(primeLeaderboard.setMinimumStake(newMinimum))
        .to.emit(primeLeaderboard, "MinimumStakeUpdated")
        .withArgs(MINIMUM_STAKE, newMinimum);

      expect(await primeLeaderboard.minimumStake()).to.equal(newMinimum);
    });

    it("should revert setMinimumStake with zero", async () => {
      await expect(primeLeaderboard.setMinimumStake(0)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "InvalidValue",
      );
    });

    it("should update multiplier tiers", async () => {
      const newDurations = [15 * DAY, 30 * DAY, 45 * DAY];
      const newMultipliers = [convertToUnit("1.2", 18), convertToUnit("1.5", 18), convertToUnit("1.8", 18)];

      await expect(primeLeaderboard.setMultiplierTiers(newDurations, newMultipliers)).to.emit(
        primeLeaderboard,
        "MultiplierTiersUpdated",
      );

      const [durations, multipliers] = await primeLeaderboard.getMultiplierTiers();
      expect(durations[0]).to.equal(newDurations[0]);
      expect(durations[1]).to.equal(newDurations[1]);
      expect(durations[2]).to.equal(newDurations[2]);
      expect(multipliers[0]).to.equal(newMultipliers[0]);
      expect(multipliers[1]).to.equal(newMultipliers[1]);
      expect(multipliers[2]).to.equal(newMultipliers[2]);
    });

    it("should revert on invalid multiplier tiers (non-ascending durations)", async () => {
      const invalidDurations = [30 * DAY, 20 * DAY]; // Not ascending
      const multipliers = [convertToUnit("1.2", 18), convertToUnit("1.5", 18)];

      await expect(primeLeaderboard.setMultiplierTiers(invalidDurations, multipliers)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "InvalidMultiplierTiers",
      );
    });

    it("should revert on invalid multiplier tiers (non-ascending multipliers)", async () => {
      const durations = [30 * DAY, 60 * DAY];
      const invalidMultipliers = [convertToUnit("1.5", 18), convertToUnit("1.2", 18)];

      await expect(primeLeaderboard.setMultiplierTiers(durations, invalidMultipliers)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "InvalidMultiplierTiers",
      );
    });

    it("should revert on empty multiplier tiers", async () => {
      await expect(primeLeaderboard.setMultiplierTiers([], [])).to.be.revertedWithCustomError(
        primeLeaderboard,
        "InvalidValue",
      );
    });

    it("should revert on mismatched array lengths", async () => {
      await expect(
        primeLeaderboard.setMultiplierTiers([30 * DAY], [convertToUnit("1.2", 18), convertToUnit("1.5", 18)]),
      ).to.be.revertedWithCustomError(primeLeaderboard, "LengthMismatch");
    });

    it("should revert on multiplier below base (1.0x)", async () => {
      await expect(
        primeLeaderboard.setMultiplierTiers([30 * DAY], [convertToUnit("0.5", 18)]),
      ).to.be.revertedWithCustomError(primeLeaderboard, "InvalidMultiplierTiers");
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

    it("should set XVSVault address", async () => {
      const newVault = await user1.getAddress();

      await expect(primeLeaderboard.setXVSVault(newVault))
        .to.emit(primeLeaderboard, "XVSVaultSet")
        .withArgs(xvsVault.address, newVault);

      expect(await primeLeaderboard.xvsVault()).to.equal(newVault);
    });

    it("should revert when setting zero XVSVault address", async () => {
      await expect(primeLeaderboard.setXVSVault(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "ZeroAddress",
      );
    });

    it("should set XVSVault pool config", async () => {
      const newRewardToken = await user1.getAddress();
      const newPoolId = 5;

      await expect(primeLeaderboard.setXVSVaultPoolConfig(newRewardToken, newPoolId))
        .to.emit(primeLeaderboard, "XVSVaultPoolConfigSet")
        .withArgs(newRewardToken, newPoolId);

      expect(await primeLeaderboard.xvsVaultRewardToken()).to.equal(newRewardToken);
      expect(await primeLeaderboard.xvsVaultPoolId()).to.equal(newPoolId);
    });

    it("should revert when setting zero reward token in pool config", async () => {
      await expect(
        primeLeaderboard.setXVSVaultPoolConfig(ethers.constants.AddressZero, 0),
      ).to.be.revertedWithCustomError(primeLeaderboard, "ZeroAddress");
    });
  });

  describe("Pause functionality", () => {
    it("should pause and unpause", async () => {
      await primeLeaderboard.pause();
      expect(await primeLeaderboard.paused()).to.be.true;

      await primeLeaderboard.unpause();
      expect(await primeLeaderboard.paused()).to.be.false;
    });

    it("should revert xvsUpdated when paused", async () => {
      const user1Address = await user1.getAddress();

      await primeLeaderboard.pause();

      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);
      await expect(primeLeaderboard.xvsUpdated(user1Address)).to.be.revertedWith("Pausable: paused");
    });

    it("should work after unpause", async () => {
      const user1Address = await user1.getAddress();

      await primeLeaderboard.pause();
      await primeLeaderboard.unpause();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(1000, 18));
    });
  });

  describe("Withdrawn Score Tracking", () => {
    it("should preserve total effective stake when withdrawing within same round", async () => {
      const user1Address = await user1.getAddress();

      // Deposit and wait for multiplier
      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(35 * DAY);

      // Effective stake before withdrawal: 1000 × 1.3 × 35 = 45,500
      const stakeBefore = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(stakeBefore).to.equal(convertToUnit(45500, 18));

      // Withdraw 500 XVS (vault balance drops to 500)
      await simulateWithdrawal(user1Address, convertToUnit(500, 18));

      // Remaining: 500 × 1.3 × 35 = 22,750
      // Withdrawn score (locked): 500 × 1.3 × 35 = 22,750
      // Total: 22,750 + 22,750 = 45,500
      const stakeAfter = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(stakeAfter).to.equal(convertToUnit(45500, 18));
    });

    it("should reset withdrawn score after advanceRound", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(45 * DAY);

      // Withdraw 200 XVS (vault balance drops to 800)
      await simulateWithdrawal(user1Address, convertToUnit(800, 18));

      // Score in round 1 includes withdrawn score
      // Active: 800 × 1.3 × 45 = 46,800
      // Withdrawn: 200 × 1.3 × 45 = 11,700
      // Total: 58,500
      const stakeRound1 = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(stakeRound1).to.equal(convertToUnit(58500, 18));

      // Advance to round 2
      await primeLeaderboard.advanceRound();
      expect(await primeLeaderboard.currentRound()).to.equal(2);

      // Score in round 2: only active deposits (withdrawn score not counted)
      const stakeRound2 = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(stakeRound2).to.be.lt(stakeRound1);

      // The difference should be approximately the withdrawn score (11,700)
      const diff = stakeRound1.sub(stakeRound2);
      expect(diff.gte(convertToUnit(11600, 18))).to.be.true;
      expect(diff.lte(convertToUnit(11800, 18))).to.be.true;
    });

    it("should accumulate withdrawn scores within same round", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(45 * DAY);

      // First withdrawal: 100 XVS (vault balance → 900)
      await simulateWithdrawal(user1Address, convertToUnit(900, 18));
      const stakeAfterFirst = await primeLeaderboard.getEffectiveStake(user1Address);

      // Second withdrawal: 100 XVS (vault balance → 800, same round)
      await simulateWithdrawal(user1Address, convertToUnit(800, 18));
      const stakeAfterSecond = await primeLeaderboard.getEffectiveStake(user1Address);

      // Both withdrawn scores accumulate, total effective should stay roughly the same
      const diff = stakeAfterFirst.sub(stakeAfterSecond).abs();
      expect(diff.lte(convertToUnit(200, 18))).to.be.true;
    });
  });

  describe("Batch Score Queries", () => {
    it("should return correct scores for multiple users", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      await simulateDeposit(user1Address, convertToUnit(10000, 18));
      await simulateDeposit(user2Address, convertToUnit(5000, 18));

      await time.increase(45 * DAY);

      const scores = await primeLeaderboard.getScores([user1Address, user2Address]);
      // User1: 10000 × 1.3 × 45 = 585,000
      expect(scores[0]).to.equal(convertToUnit(585000, 18));
      // User2: 5000 × 1.3 × 45 = 292,500
      expect(scores[1]).to.equal(convertToUnit(292500, 18));
    });

    it("should match calculateCurrentScore with getEffectiveStake", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(50 * DAY);

      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      const currentScore = await primeLeaderboard.calculateCurrentScore(user1Address);
      expect(effectiveStake).to.equal(currentScore);
    });
  });

  describe("Access Control", () => {
    it("should revert admin functions when access denied", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      await expect(primeLeaderboard.setMinimumStake(convertToUnit(1000, 18))).to.be.reverted;
      await expect(primeLeaderboard.setMultiplierTiers([30 * DAY], [convertToUnit("1.3", 18)])).to.be.reverted;
      await expect(primeLeaderboard.setPrimeV2(await user1.getAddress())).to.be.reverted;
      await expect(primeLeaderboard.setXVSVault(await user1.getAddress())).to.be.reverted;
      await expect(primeLeaderboard.setXVSVaultPoolConfig(await user1.getAddress(), 0)).to.be.reverted;
      await expect(primeLeaderboard.pause()).to.be.reverted;
      await expect(primeLeaderboard.unpause()).to.be.reverted;
      await expect(primeLeaderboard.advanceRound()).to.be.reverted;
    });
  });
});
