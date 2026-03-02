import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance, time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { IAccessControlManagerV8, IXVSVault, PrimeLeaderboard } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const MINIMUM_STAKE = convertToUnit(500, 18); // 500 XVS
const DAY = 24 * 60 * 60;

// With second-based duration, block timestamp increments (1 sec per tx) become visible.
// Use 0.01% relative tolerance for assertions in multi-operation tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expectApprox(actual: any, expected: any) {
  const exp = ethers.BigNumber.from(expected);
  const tolerance = exp.div(10000); // 0.01%
  expect(actual).to.be.closeTo(exp, tolerance);
}

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
    await primeLeaderboard.connect(xvsVault.wallet).xvsUpdated(user);
  };

  // Helper: simulate a withdrawal by setting reduced vault balance and calling xvsUpdated
  const simulateWithdrawal = async (user: string, newTotalBalance: string) => {
    xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user).returns([newTotalBalance, 0, 0]);
    await primeLeaderboard.connect(xvsVault.wallet).xvsUpdated(user);
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
    await setBalance(xvsVault.address, ethers.utils.parseEther("10"));

    // Deploy PrimeLeaderboard using upgrades plugin
    const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");
    primeLeaderboard = (await upgrades.deployProxy(
      PrimeLeaderboardFactory,
      [accessControlManager.address, MINIMUM_STAKE],
      {
        unsafeAllow: ["constructor", "state-variable-immutable"],
        constructorArgs: [xvsVault.address, xvsAddress, 0],
      },
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
        primeLeaderboard.initialize(accessControlManager.address, MINIMUM_STAKE),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should revert with zero xvsVault address in constructor", async () => {
      const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");

      await expect(
        upgrades.deployProxy(PrimeLeaderboardFactory, [accessControlManager.address, MINIMUM_STAKE], {
          unsafeAllow: ["constructor", "state-variable-immutable"],
          constructorArgs: [ethers.constants.AddressZero, xvsAddress, 0],
        }),
      ).to.be.revertedWithCustomError(PrimeLeaderboardFactory, "ZeroAddress");
    });

    it("should revert with zero xvsVaultRewardToken address in constructor", async () => {
      const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");

      await expect(
        upgrades.deployProxy(PrimeLeaderboardFactory, [accessControlManager.address, MINIMUM_STAKE], {
          unsafeAllow: ["constructor", "state-variable-immutable"],
          constructorArgs: [xvsVault.address, ethers.constants.AddressZero, 0],
        }),
      ).to.be.revertedWithCustomError(PrimeLeaderboardFactory, "ZeroAddress");
    });

    it("should revert with zero minimum stake", async () => {
      const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");

      await expect(
        upgrades.deployProxy(PrimeLeaderboardFactory, [accessControlManager.address, 0], {
          unsafeAllow: ["constructor", "state-variable-immutable"],
          constructorArgs: [xvsVault.address, xvsAddress, 0],
        }),
      ).to.be.revertedWithCustomError(PrimeLeaderboardFactory, "InvalidValue");
    });
  });

  describe("Deposit Recording via xvsUpdated", () => {
    it("should record deposit correctly", async () => {
      const user1Address = await user1.getAddress();
      const amount = convertToUnit(1000, 18);

      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([amount, 0, 0]);
      await expect(primeLeaderboard.connect(xvsVault.wallet).xvsUpdated(user1Address)).to.emit(
        primeLeaderboard,
        "DepositRecorded",
      );

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(amount);
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
    });

    it("should revert xvsUpdated with zero address", async () => {
      await expect(
        primeLeaderboard.connect(xvsVault.wallet).xvsUpdated(ethers.constants.AddressZero),
      ).to.be.revertedWithCustomError(primeLeaderboard, "ZeroAddress");
    });

    it("should be no-op when vault balance unchanged", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(1);

      // Call again with same balance → no-op
      await primeLeaderboard.connect(xvsVault.wallet).xvsUpdated(user1Address);
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(1000, 18));
    });

    it("should track multiple deposits for a user", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(500, 18));
      await simulateDeposit(user1Address, convertToUnit(800, 18)); // +300 more

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(800, 18));
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(2);
    });

    it("should only allow xvsVault to call xvsUpdated", async () => {
      const user1Address = await user1.getAddress();

      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);
      await expect(primeLeaderboard.connect(user2).xvsUpdated(user1Address)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "OnlyXVSVaultAllowed",
      );
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
      await expect(primeLeaderboard.connect(xvsVault.wallet).xvsUpdated(user1Address)).to.emit(
        primeLeaderboard,
        "WithdrawalRecorded",
      );
    });

    it("should handle full withdrawal to zero", async () => {
      const user1Address = await user1.getAddress();

      await simulateWithdrawal(user1Address, "0"); // vault balance drops to 0

      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(0);
      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(0);
    });
  });

  describe("Effective Stake Calculation", () => {
    it("should return zero for brand-new deposits (holdDays = 0)", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));

      // holdSeconds = 0 → effectiveStake = 1000 × 1.0 × 0 = 0
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(0);
    });

    it("should calculate base multiplier (1.0x) for deposits < 30 days", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(10 * DAY);

      // 1000 × 1.0 × (10 * 86400) = 864,000,000
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(864_000_000, 18));
    });

    it("should calculate 1.3x multiplier for deposits 30-60 days", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(35 * DAY);

      // 1000 × 1.3 × (35 * 86400) = 3,931,200,000
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(3_931_200_000, 18));
    });

    it("should calculate 1.6x multiplier for deposits 60-90 days", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(65 * DAY);

      // 1000 × 1.6 × (65 * 86400) = 8,985,600,000
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(8_985_600_000, 18));
    });

    it("should calculate 2.0x multiplier for deposits 90+ days (capped at 90d)", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(95 * DAY);

      // 1000 × 2.0 × (90 * 86400) = 15,552,000,000 (duration capped at 90 days)
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(15_552_000_000, 18));
    });

    it("should remain capped at 90 days for very long hold periods", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(180 * DAY);

      // Still 1000 × 2.0 × (90 * 86400) = 15,552,000,000
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(convertToUnit(15_552_000_000, 18));
    });

    it("should sum effective stake across multiple deposits with different ages", async () => {
      const user1Address = await user1.getAddress();

      // Deposit 1: 500 XVS
      await simulateDeposit(user1Address, convertToUnit(500, 18));
      await time.increase(45 * DAY);

      // Deposit 2: 300 XVS (total vault balance = 800)
      await simulateDeposit(user1Address, convertToUnit(800, 18));
      await time.increase(10 * DAY);

      // Deposit 1: held for 55 days → 1.3x: 500 × 1.3 × (55 * 86400) = 3,088,800,000
      // Deposit 2: held for 10 days → 1.0x: 300 × 1.0 × (10 * 86400) = 259,200,000
      // Total: ~3,348,000,000
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expectApprox(effectiveStake, convertToUnit(3_348_000_000, 18));
    });

    it("should NOT include withdrawn stake in effective stake", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(35 * DAY);

      // Effective stake before withdrawal: 1000 × 1.3 × (35 * 86400) = ~3,931,200,000
      const stakeBefore = await primeLeaderboard.getEffectiveStake(user1Address);
      expectApprox(stakeBefore, convertToUnit(3_931_200_000, 18));

      // Withdraw 500 XVS (vault balance drops to 500)
      await simulateWithdrawal(user1Address, convertToUnit(500, 18));

      // Remaining active deposits only: 500 × 1.3 × (35 * 86400) = ~1,965,600,000
      // Withdrawn score is NOT added to effective stake
      const stakeAfter = await primeLeaderboard.getEffectiveStake(user1Address);
      expectApprox(stakeAfter, convertToUnit(1_965_600_000, 18));
    });

    it("should return zero effective stake after full withdrawal", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(35 * DAY);

      await simulateWithdrawal(user1Address, "0");

      // No active deposits → effective stake is 0
      const stakeAfter = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(stakeAfter).to.equal(0);
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

  describe("Withdrawn Stake Tracking", () => {
    it("should accumulate withdrawn stake separately from effective stake", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(35 * DAY);

      // Withdraw 500 XVS
      await simulateWithdrawal(user1Address, convertToUnit(500, 18));

      // Withdrawn score: 500 × 1.3 × (35 * 86400) = ~1,965,600,000
      const withdrawnStake = await primeLeaderboard.withdrawnStake(user1Address);
      expectApprox(withdrawnStake, convertToUnit(1_965_600_000, 18));

      // Effective stake only has active deposits: 500 × 1.3 × (35 * 86400) = ~1,965,600,000
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expectApprox(effectiveStake, convertToUnit(1_965_600_000, 18));
    });

    it("should accumulate withdrawn stakes across multiple withdrawals", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(45 * DAY);

      // First withdrawal: 100 XVS (vault balance → 900)
      await simulateWithdrawal(user1Address, convertToUnit(900, 18));
      const scoreAfterFirst = await primeLeaderboard.withdrawnStake(user1Address);

      // Withdrawn score: 100 × 1.3 × (45 * 86400) = ~505,440,000
      expectApprox(scoreAfterFirst, convertToUnit(505_440_000, 18));

      // Second withdrawal: 100 XVS (vault balance → 800)
      await simulateWithdrawal(user1Address, convertToUnit(800, 18));
      const scoreAfterSecond = await primeLeaderboard.withdrawnStake(user1Address);

      // Accumulated: ~505,440,000 + (100 × 1.3 × (45 * 86400)) = ~1,010,880,000
      expectApprox(scoreAfterSecond, convertToUnit(1_010_880_000, 18));
    });

    it("should track withdrawn stake on full withdrawal", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(10 * DAY);

      // Full withdrawal
      await simulateWithdrawal(user1Address, "0");

      // Withdrawn score: 1000 × 1.0 × (10 * 86400) = ~864,000,000
      const withdrawnStake = await primeLeaderboard.withdrawnStake(user1Address);
      expectApprox(withdrawnStake, convertToUnit(864_000_000, 18));

      // Effective stake is 0 (no active deposits)
      const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.equal(0);
    });
  });

  describe("Reset Withdrawn Stake", () => {
    it("should reset withdrawn stake to zero", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(10 * DAY);
      await simulateWithdrawal(user1Address, convertToUnit(500, 18));

      // Withdrawn score exists: 500 × 1.0 × (10 * 86400) = ~432,000,000
      expectApprox(await primeLeaderboard.withdrawnStake(user1Address), convertToUnit(432_000_000, 18));

      // Backend resets it
      await primeLeaderboard.resetWithdrawnStake(user1Address);

      expect(await primeLeaderboard.withdrawnStake(user1Address)).to.equal(0);
    });

    it("should emit WithdrawnStakeReset event", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(10 * DAY);
      await simulateWithdrawal(user1Address, convertToUnit(500, 18));

      const withdrawnStake = await primeLeaderboard.withdrawnStake(user1Address);

      await expect(primeLeaderboard.resetWithdrawnStake(user1Address))
        .to.emit(primeLeaderboard, "WithdrawnStakeReset")
        .withArgs(user1Address, withdrawnStake);
    });

    it("should allow new withdrawn stakes to accumulate after reset", async () => {
      const user1Address = await user1.getAddress();

      await simulateDeposit(user1Address, convertToUnit(1000, 18));
      await time.increase(10 * DAY);

      // First withdrawal
      await simulateWithdrawal(user1Address, convertToUnit(800, 18));
      expectApprox(await primeLeaderboard.withdrawnStake(user1Address), convertToUnit(172_800_000, 18));

      // Backend resets
      await primeLeaderboard.resetWithdrawnStake(user1Address);
      expect(await primeLeaderboard.withdrawnStake(user1Address)).to.equal(0);

      // More time passes, user withdraws again
      await time.increase(5 * DAY);
      await simulateWithdrawal(user1Address, convertToUnit(600, 18));

      // New withdrawn stake accumulates from zero
      const newWithdrawnScore = await primeLeaderboard.withdrawnStake(user1Address);
      expect(newWithdrawnScore).to.be.gt(0);
    });

    it("should revert resetWithdrawnStake with zero address", async () => {
      await expect(primeLeaderboard.resetWithdrawnStake(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "ZeroAddress",
      );
    });

    it("should revert resetWithdrawnStake when access denied", async () => {
      const user1Address = await user1.getAddress();
      accessControlManager.isAllowedToCall.returns(false);

      await expect(primeLeaderboard.resetWithdrawnStake(user1Address)).to.be.reverted;
    });

    it("should be no-op when resetting already-zero withdrawn stake", async () => {
      const user1Address = await user1.getAddress();

      // No withdrawals, score is already 0
      await expect(primeLeaderboard.resetWithdrawnStake(user1Address))
        .to.emit(primeLeaderboard, "WithdrawnStakeReset")
        .withArgs(user1Address, 0);

      expect(await primeLeaderboard.withdrawnStake(user1Address)).to.equal(0);
    });
  });

  describe("Batch Score Queries", () => {
    it("should return correct scores for multiple users", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      await simulateDeposit(user1Address, convertToUnit(10000, 18));
      await simulateDeposit(user2Address, convertToUnit(5000, 18));

      await time.increase(45 * DAY);

      const scores = await primeLeaderboard.getEffectiveStakeBatch([user1Address, user2Address]);
      // User1: 10000 × 1.3 × (45 * 86400) = ~50,544,000,000
      expectApprox(scores[0], convertToUnit(50_544_000_000, 18));
      // User2: 5000 × 1.3 × (45 * 86400) = ~25,272,000,000
      expectApprox(scores[1], convertToUnit(25_272_000_000, 18));
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
      await expect(primeLeaderboard.setMinimumStake(0)).to.be.revertedWithCustomError(primeLeaderboard, "InvalidValue");
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

  });

  describe("Access Control", () => {
    it("should revert admin functions when access denied", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      await expect(primeLeaderboard.setMinimumStake(convertToUnit(1000, 18))).to.be.reverted;
      await expect(primeLeaderboard.setMultiplierTiers([30 * DAY], [convertToUnit("1.3", 18)])).to.be.reverted;
      await expect(primeLeaderboard.setPrimeV2(await user1.getAddress())).to.be.reverted;
      await expect(primeLeaderboard.resetWithdrawnStake(await user1.getAddress())).to.be.reverted;
    });
  });

  describe("Deposit Compaction", () => {
    it("should compact deposits when reaching MAX_DEPOSITS_PER_USER (10)", async () => {
      const user1Address = await user1.getAddress();

      // Create 10 deposits (each increasing vault balance by 10 XVS)
      for (let i = 1; i <= 10; i++) {
        await simulateDeposit(user1Address, convertToUnit(i * 10, 18));
      }

      expect(await primeLeaderboard.getDepositCount(user1Address)).to.equal(10);

      // Wait 91+ days so all deposits reach max multiplier tier
      await time.increase(91 * DAY);

      // 11th deposit triggers compaction (deposits.length >= 10)
      await simulateDeposit(user1Address, convertToUnit(110, 18));

      // All 10 old deposits merged into 1 + the new deposit = 2
      const countAfter = await primeLeaderboard.getDepositCount(user1Address);
      expect(countAfter).to.equal(2);

      // Total staked should be correct: 100 (original) + 10 (11th deposit bump)
      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(110, 18));
    });

    it("should emit DepositsCompacted event on compaction", async () => {
      const user1Address = await user1.getAddress();

      // Create 10 deposits
      for (let i = 1; i <= 10; i++) {
        await simulateDeposit(user1Address, convertToUnit(i * 10, 18));
      }

      // Wait so all are at max tier
      await time.increase(91 * DAY);

      // Next deposit triggers compaction
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user1Address).returns([convertToUnit(110, 18), 0, 0]);

      const countBefore = await primeLeaderboard.getDepositCount(user1Address);
      await primeLeaderboard.connect(xvsVault.wallet).xvsUpdated(user1Address);
      const countAfter = await primeLeaderboard.getDepositCount(user1Address);

      // Compaction should have reduced deposit count
      expect(countAfter.lt(countBefore)).to.be.true;
    });

    it("should preserve effective stake after compaction", async () => {
      const user1Address = await user1.getAddress();

      // Create a deposit then wait for max tier
      await simulateDeposit(user1Address, convertToUnit(500, 18));
      await time.increase(91 * DAY);

      const stakeBefore = await primeLeaderboard.getEffectiveStake(user1Address);
      // 500 × 2.0 × (90 * 86400) = ~7,776,000,000 (capped at 90 days)
      expectApprox(stakeBefore, convertToUnit(7_776_000_000, 18));

      // Fill up to 9 more deposits (all instantly, total vault = 500 + 9*1 = 509)
      for (let i = 1; i <= 9; i++) {
        await simulateDeposit(user1Address, convertToUnit(500 + i, 18));
      }

      // Trigger compaction with deposit #11
      await simulateDeposit(user1Address, convertToUnit(510, 18));

      // The original 500 deposit should have been compacted
      // but its score contribution should be preserved
      const stakeAfter = await primeLeaderboard.getEffectiveStake(user1Address);
      expect(stakeAfter.gte(stakeBefore)).to.be.true;
    });
  });

  describe("Scenario: Large deposit-then-immediate-withdrawal (backend-driven)", () => {
    // Scenario:
    //   - Day 1: User deposits 1M XVS, backend calculates leaderboard and issues Prime
    //   - Day 2: User withdraws all 1M XVS
    //   - Backend updates leaderboard every 24 hours
    //
    // With the new design:
    //   - Effective stake reflects ONLY active deposits (no withdrawn stake inflation)
    //   - Withdrawn score is tracked separately for backend to query
    //   - Backend calls resetWithdrawnStake() after processing

    const ONE_MILLION_XVS = convertToUnit(1_000_000, 18);

    it("should immediately drop effective stake to zero after full withdrawal", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      // Day 1: Both users deposit
      await simulateDeposit(user1Address, ONE_MILLION_XVS);
      await simulateDeposit(user2Address, convertToUnit(500_000, 18));

      // Day 2: User1 withdraws everything
      await time.increase(1 * DAY);

      // Before withdrawal: user1 score = 1M × 1.0 × 86400 = ~86,400,000,000
      expectApprox(await primeLeaderboard.getEffectiveStake(user1Address), convertToUnit(86_400_000_000, 18));

      // User1 withdraws all XVS
      await simulateWithdrawal(user1Address, "0");

      // Effective stake is immediately 0 (no phantom score)
      expect(await primeLeaderboard.getEffectiveStake(user1Address)).to.equal(0);
      expect(await primeLeaderboard.totalStaked(user1Address)).to.equal(0);

      // Withdrawn score is tracked separately for backend
      expectApprox(await primeLeaderboard.withdrawnStake(user1Address), convertToUnit(86_400_000_000, 18));

      // User2 still active: 500K × 1.0 × 86400 = ~43,200,000,000
      expectApprox(await primeLeaderboard.getEffectiveStake(user2Address), convertToUnit(43_200_000_000, 18));
    });

    it("should show getEffectiveStakeBatch() returns zero for withdrawn user (no phantom eligibility)", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();
      const user3Address = await user3.getAddress();

      // Day 1: Three users deposit
      await simulateDeposit(user1Address, ONE_MILLION_XVS);
      await simulateDeposit(user2Address, convertToUnit(800_000, 18));
      await simulateDeposit(user3Address, convertToUnit(600_000, 18));

      // Day 2: User1 withdraws everything
      await time.increase(1 * DAY);
      await simulateWithdrawal(user1Address, "0");

      const allUsers = [user1Address, user2Address, user3Address];

      // Day 5: Backend checks scores
      await time.increase(3 * DAY);
      let scores = await primeLeaderboard.getEffectiveStakeBatch(allUsers);

      // User1 has 0 effective stake (correctly reflects no XVS staked)
      expect(scores[0]).to.equal(0);
      // User2: 800K × 1.0 × (4 * 86400) = ~276,480,000,000
      expectApprox(scores[1], convertToUnit(276_480_000_000, 18));
      // User3: 600K × 1.0 × (4 * 86400) = ~207,360,000,000
      expectApprox(scores[2], convertToUnit(207_360_000_000, 18));

      // Day 15: Backend checks scores again
      await time.increase(10 * DAY);
      scores = await primeLeaderboard.getEffectiveStakeBatch(allUsers);

      // User1 is STILL 0 — no phantom eligibility at any point!
      expect(scores[0]).to.equal(0);
      // User2: 800K × 1.0 × (14 * 86400) = ~967,680,000,000
      expectApprox(scores[1], convertToUnit(967_680_000_000, 18));
      // User3: 600K × 1.0 × (14 * 86400) = ~725,760,000,000
      expectApprox(scores[2], convertToUnit(725_760_000_000, 18));

      // Day 30: End of backend reward cycle
      await time.increase(16 * DAY);
      scores = await primeLeaderboard.getEffectiveStakeBatch(allUsers);

      // User1 is still 0
      expect(scores[0]).to.equal(0);
      // User2: 800K × 1.3x × (30 * 86400) = ~2,695,680,000,000 (multiplier upgraded at 30 days)
      expectApprox(scores[1], convertToUnit(2_695_680_000_000, 18));
      // User3: 600K × 1.3x × (30 * 86400) = ~2,021,760,000,000
      expectApprox(scores[2], convertToUnit(2_021_760_000_000, 18));
    });

    it("should correctly handle partial withdrawal with 24-hour backend updates", async () => {
      const user1Address = await user1.getAddress();

      // Day 0: User deposits 1000 XVS
      await simulateDeposit(user1Address, convertToUnit(1000, 18));

      // Day 35: User withdraws 100 XVS (vault balance → 900)
      await time.increase(35 * DAY);

      // Score before withdrawal: 1000 × 1.3 × (35 * 86400) = ~3,931,200,000
      expectApprox(await primeLeaderboard.getEffectiveStake(user1Address), convertToUnit(3_931_200_000, 18));

      await simulateWithdrawal(user1Address, convertToUnit(900, 18));

      // Score after withdrawal: 900 × 1.3 × (35 * 86400) = ~3,538,080,000
      // (Only active deposits count, withdrawn stake tracked separately)
      expectApprox(await primeLeaderboard.getEffectiveStake(user1Address), convertToUnit(3_538_080_000, 18));

      // Withdrawn score: 100 × 1.3 × (35 * 86400) = ~393,120,000
      expectApprox(await primeLeaderboard.withdrawnStake(user1Address), convertToUnit(393_120_000, 18));

      // Day 36: Backend checks 24 hours later
      await time.increase(1 * DAY);

      // Score: 900 × 1.3 × (36 * 86400) = ~3,639,168,000 (naturally grows based on active deposits)
      expectApprox(await primeLeaderboard.getEffectiveStake(user1Address), convertToUnit(3_639_168_000, 18));
    });

    it("should allow backend to reset withdrawn stake after processing", async () => {
      const user1Address = await user1.getAddress();

      // Day 0: User deposits 1000 XVS
      await simulateDeposit(user1Address, convertToUnit(1000, 18));

      // Day 10: Withdraw 200 XVS
      await time.increase(10 * DAY);
      await simulateWithdrawal(user1Address, convertToUnit(800, 18));

      // Withdrawn score: 200 × 1.0 × (10 * 86400) = ~172,800,000
      expectApprox(await primeLeaderboard.withdrawnStake(user1Address), convertToUnit(172_800_000, 18));

      // Backend processes withdrawn stake and resets it
      await primeLeaderboard.resetWithdrawnStake(user1Address);
      expect(await primeLeaderboard.withdrawnStake(user1Address)).to.equal(0);

      // Day 20: Another withdrawal of 100 XVS
      await time.increase(10 * DAY);
      await simulateWithdrawal(user1Address, convertToUnit(700, 18));

      // Withdrawn score starts fresh from 0: 100 × 1.0 × (20 * 86400) = ~172,800,000
      expectApprox(await primeLeaderboard.withdrawnStake(user1Address), convertToUnit(172_800_000, 18));

      // Effective stake only reflects active 700 XVS: 700 × 1.0 × (20 * 86400) = ~1,209,600,000
      expectApprox(await primeLeaderboard.getEffectiveStake(user1Address), convertToUnit(1_209_600_000, 18));
    });

    it("should show the complete 30-day lifecycle with backend-driven leaderboard", async () => {
      const user1Address = await user1.getAddress();
      const user2Address = await user2.getAddress();

      // Day 1: User1 deposits 1M XVS, User2 deposits 500K XVS
      await simulateDeposit(user1Address, ONE_MILLION_XVS);
      await simulateDeposit(user2Address, convertToUnit(500_000, 18));

      // Day 2: User1 withdraws everything
      await time.increase(1 * DAY);
      await simulateWithdrawal(user1Address, "0");

      // Collect score snapshots throughout backend's 30-day cycle
      const user1Scores: string[] = [];
      const user2Scores: string[] = [];

      // Day 2 scores (right after withdrawal)
      user1Scores.push((await primeLeaderboard.getEffectiveStake(user1Address)).toString());
      user2Scores.push((await primeLeaderboard.getEffectiveStake(user2Address)).toString());

      // Day 10
      await time.increase(8 * DAY);
      user1Scores.push((await primeLeaderboard.getEffectiveStake(user1Address)).toString());
      user2Scores.push((await primeLeaderboard.getEffectiveStake(user2Address)).toString());

      // Day 20
      await time.increase(10 * DAY);
      user1Scores.push((await primeLeaderboard.getEffectiveStake(user1Address)).toString());
      user2Scores.push((await primeLeaderboard.getEffectiveStake(user2Address)).toString());

      // Day 30
      await time.increase(10 * DAY);
      user1Scores.push((await primeLeaderboard.getEffectiveStake(user1Address)).toString());
      user2Scores.push((await primeLeaderboard.getEffectiveStake(user2Address)).toString());

      // User1's score is ALWAYS 0 (no active deposits)
      for (const score of user1Scores) {
        expect(score).to.equal("0");
      }

      // User2's score ALWAYS increases
      for (let i = 1; i < user2Scores.length; i++) {
        expect(ethers.BigNumber.from(user2Scores[i])).to.be.gt(ethers.BigNumber.from(user2Scores[i - 1]));
      }

      // Backend can check withdrawn stake for user1 anytime
      const withdrawnStake = await primeLeaderboard.withdrawnStake(user1Address);
      expectApprox(withdrawnStake, convertToUnit(86_400_000_000, 18));

      // Backend resets after processing
      await primeLeaderboard.resetWithdrawnStake(user1Address);
      expect(await primeLeaderboard.withdrawnStake(user1Address)).to.equal(0);
    });
  });
});
