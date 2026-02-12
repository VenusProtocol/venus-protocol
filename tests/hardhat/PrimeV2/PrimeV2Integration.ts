import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  IAccessControlManagerV8,
  IERC20MetadataUpgradeable,
  IPrimeLiquidityProvider,
  IVToken,
  IXVSVault,
  InterfaceComptroller,
  PrimeLeaderboard,
  PrimeV2,
  ResilientOracleInterface,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const MAXIMUM_XVS_CAP = convertToUnit(100000, 18);
const BLOCKS_PER_YEAR = 70080000;
const MINIMUM_STAKE = convertToUnit(500, 18);
const DAY = 24 * 60 * 60;

describe("PrimeV2 Integration", () => {
  let primeV2: PrimeV2;
  let primeLeaderboard: PrimeLeaderboard;
  let accessControlManager: FakeContract<IAccessControlManagerV8>;
  let primeLiquidityProvider: FakeContract<IPrimeLiquidityProvider>;
  let xvsVault: FakeContract<IXVSVault>;
  let oracle: FakeContract<ResilientOracleInterface>;
  let vUSDC: FakeContract<IVToken>;
  let usdc: FakeContract<IERC20MetadataUpgradeable>;
  let comptroller: FakeContract<InterfaceComptroller>;
  let admin: Signer;
  let alice: Signer;
  let bob: Signer;
  let carol: Signer;
  let dave: Signer;

  let xvsAddress: string;
  let wrappedNativeToken: string;
  let nativeMarket: string;

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
    [admin, alice, bob, carol, dave] = await ethers.getSigners();

    xvsAddress = ethers.Wallet.createRandom().address;
    wrappedNativeToken = ethers.Wallet.createRandom().address;
    nativeMarket = ethers.Wallet.createRandom().address;

    // Mock contracts
    accessControlManager = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
    accessControlManager.isAllowedToCall.returns(true);

    primeLiquidityProvider = await smock.fake<IPrimeLiquidityProvider>("IPrimeLiquidityProvider");
    primeLiquidityProvider.accrueTokens.returns();
    primeLiquidityProvider.tokenAmountAccrued.returns(0);

    xvsVault = await smock.fake<IXVSVault>("IXVSVault");
    xvsVault.xvsAddress.returns(xvsAddress);
    xvsVault.getUserInfo.returns([convertToUnit(1000, 18), 0, 0]);

    oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
    oracle.getPrice.returns(convertToUnit(3, 18)); // $3 per XVS
    oracle.getUnderlyingPrice.returns(convertToUnit(1, 18)); // $1 per USDC
    oracle.updateAssetPrice.returns();
    oracle.updatePrice.returns();

    // Mock underlying token (USDC)
    usdc = await smock.fake<IERC20MetadataUpgradeable>("IERC20MetadataUpgradeable");
    usdc.decimals.returns(18);

    vUSDC = await smock.fake<IVToken>("contracts/Tokens/Prime/Interfaces/IVToken.sol:IVToken");
    vUSDC.underlying.returns(usdc.address);
    vUSDC.decimals.returns(18);
    vUSDC.exchangeRateStored.returns(convertToUnit(1, 18));
    vUSDC.balanceOf.returns(0);
    vUSDC.borrowBalanceStored.returns(0);

    comptroller = await smock.fake<InterfaceComptroller>(
      "contracts/Tokens/Prime/Interfaces/InterfaceComptroller.sol:InterfaceComptroller",
    );
    comptroller.markets.returns(true);

    // Deploy PrimeLeaderboard (real contract)
    const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");
    primeLeaderboard = (await upgrades.deployProxy(
      PrimeLeaderboardFactory,
      [
        accessControlManager.address,
        xvsVault.address,
        xvsAddress, // xvsVaultRewardToken
        0, // xvsVaultPoolId
        MINIMUM_STAKE,
        100, // loopsLimit
      ],
      { unsafeAllow: ["constructor"] },
    )) as PrimeLeaderboard;

    // Deploy PrimeV2 (real contract)
    const PrimeV2Factory = await ethers.getContractFactory("PrimeV2");
    primeV2 = (await upgrades.deployProxy(
      PrimeV2Factory,
      [
        xvsVault.address,
        xvsAddress,
        0, // xvsVaultPoolId
        1, // alphaNumerator
        2, // alphaDenominator
        accessControlManager.address,
        primeLiquidityProvider.address,
        comptroller.address,
        oracle.address,
        100, // loopsLimit
      ],
      {
        constructorArgs: [wrappedNativeToken, nativeMarket, MAXIMUM_XVS_CAP, false, BLOCKS_PER_YEAR],
        unsafeAllow: ["constructor", "internal-function-storage"],
      },
    )) as PrimeV2;

    // Wire contracts together
    await primeV2.setPrimeLeaderboard(primeLeaderboard.address);
    await primeLeaderboard.setPrimeV2(primeV2.address);

    return {
      primeV2,
      primeLeaderboard,
      accessControlManager,
      primeLiquidityProvider,
      xvsVault,
      oracle,
      vUSDC,
      usdc,
      comptroller,
      admin,
      alice,
      bob,
      carol,
      dave,
    };
  };

  beforeEach(async () => {
    ({
      primeV2,
      primeLeaderboard,
      accessControlManager,
      primeLiquidityProvider,
      xvsVault,
      oracle,
      vUSDC,
      usdc,
      comptroller,
      admin,
      alice,
      bob,
      carol,
      dave,
    } = await loadFixture(deployFixture));

    accessControlManager.isAllowedToCall.returns(true);
  });

  describe("Full End-to-End Flow: Deposit -> Issue -> Interest -> Claim", () => {
    it("should complete the entire lifecycle for multiple users", async () => {
      const aliceAddr = await alice.getAddress();
      const bobAddr = await bob.getAddress();
      const carolAddr = await carol.getAddress();
      const daveAddr = await dave.getAddress();

      // ============ STEP 1: Users deposit XVS via vault (simulated) ============
      await simulateDeposit(aliceAddr, convertToUnit(10000, 18));
      await simulateDeposit(bobAddr, convertToUnit(5000, 18));
      await simulateDeposit(carolAddr, convertToUnit(1000, 18));
      await simulateDeposit(daveAddr, convertToUnit(800, 18));

      expect(await primeLeaderboard.getParticipantCount()).to.equal(4);

      // ============ STEP 2: Wait for time-weighted multipliers ============
      // 95 days -> all deposits get 2.0x multiplier, capped at 90 days hold duration
      await time.increase(95 * DAY);

      // Verify effective stakes: amount × multiplier × min(holdDays, 90)
      const aliceStake = await primeLeaderboard.getEffectiveStake(aliceAddr);
      const bobStake = await primeLeaderboard.getEffectiveStake(bobAddr);
      const carolStake = await primeLeaderboard.getEffectiveStake(carolAddr);
      const daveStake = await primeLeaderboard.getEffectiveStake(daveAddr);

      // 10000 × 2.0 × 90 = 1,800,000
      expect(aliceStake).to.equal(convertToUnit(1800000, 18));
      // 5000 × 2.0 × 90 = 900,000
      expect(bobStake).to.equal(convertToUnit(900000, 18));
      // 1000 × 2.0 × 90 = 180,000
      expect(carolStake).to.equal(convertToUnit(180000, 18));
      // 800 × 2.0 × 90 = 144,000
      expect(daveStake).to.equal(convertToUnit(144000, 18));

      // ============ STEP 3: Admin issues Prime to top 3 (off-chain ranking) ============
      // Admin reads getScores() off-chain, sorts, and issues to top 3
      await primeV2.addMarket(comptroller.address, vUSDC.address, convertToUnit(2, 18), convertToUnit(2, 18));

      // Mock vault balances for PrimeV2 score calculation
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, aliceAddr).returns([convertToUnit(10000, 18), 0, 0]);
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, bobAddr).returns([convertToUnit(5000, 18), 0, 0]);
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, carolAddr).returns([convertToUnit(1000, 18), 0, 0]);

      // Mock vToken balances
      vUSDC.balanceOf.whenCalledWith(aliceAddr).returns(convertToUnit(50000, 18));
      vUSDC.borrowBalanceStored.whenCalledWith(aliceAddr).returns(0);
      vUSDC.balanceOf.whenCalledWith(bobAddr).returns(0);
      vUSDC.borrowBalanceStored.whenCalledWith(bobAddr).returns(convertToUnit(20000, 18));
      vUSDC.balanceOf.whenCalledWith(carolAddr).returns(convertToUnit(5000, 18));
      vUSDC.borrowBalanceStored.whenCalledWith(carolAddr).returns(0);

      // Admin issues Prime to top 3 directly
      await primeV2.issue(false, [aliceAddr, bobAddr, carolAddr]);

      // Alice, Bob, Carol should have Prime tokens; Dave excluded
      expect(await primeV2.isUserPrimeHolder(aliceAddr)).to.be.true;
      expect(await primeV2.isUserPrimeHolder(bobAddr)).to.be.true;
      expect(await primeV2.isUserPrimeHolder(carolAddr)).to.be.true;
      expect(await primeV2.isUserPrimeHolder(daveAddr)).to.be.false;

      expect(await primeV2.totalRevocable()).to.equal(3);

      // ============ STEP 4: Accrue interest ============
      primeLiquidityProvider.tokenAmountAccrued.whenCalledWith(usdc.address).returns(convertToUnit(1000, 18));
      primeLiquidityProvider.accrueTokens.returns();

      await primeV2.accrueInterest(vUSDC.address);

      // ============ STEP 5: Verify pending rewards ============
      const aliceRewards = await primeV2.callStatic.getPendingRewards(aliceAddr);
      expect(aliceRewards.length).to.equal(1);
      expect(aliceRewards[0].vToken).to.equal(vUSDC.address);
      expect(aliceRewards[0].amount).to.be.gt(0);
    });

    it("should handle user losing Prime via admin burn", async () => {
      const aliceAddr = await alice.getAddress();
      const bobAddr = await bob.getAddress();
      const carolAddr = await carol.getAddress();
      const daveAddr = await dave.getAddress();

      // Setup: All 4 users deposit
      await simulateDeposit(aliceAddr, convertToUnit(10000, 18));
      await simulateDeposit(bobAddr, convertToUnit(5000, 18));
      await simulateDeposit(carolAddr, convertToUnit(1000, 18));
      await simulateDeposit(daveAddr, convertToUnit(800, 18));

      // Admin issues Prime to top 3
      await primeV2.issue(false, [aliceAddr, bobAddr, carolAddr]);
      expect(await primeV2.isUserPrimeHolder(carolAddr)).to.be.true;

      // Dave deposits more, Carol withdraws -> Dave should take Carol's spot
      await simulateDeposit(daveAddr, convertToUnit(5800, 18)); // 800 + 5000
      await simulateWithdrawal(carolAddr, convertToUnit(400, 18)); // 1000 - 600

      // Carol now has 400 XVS, below minimum -> removed from participants
      expect(await primeLeaderboard.isParticipant(carolAddr)).to.be.false;

      // Admin burns Carol's token and issues to Dave
      await primeV2.burn(carolAddr);
      expect(await primeV2.isUserPrimeHolder(carolAddr)).to.be.false;

      await primeV2.issue(false, [daveAddr]);
      expect(await primeV2.isUserPrimeHolder(daveAddr)).to.be.true;
    });

    it("should burn irrevocable tokens via admin burn attempt", async () => {
      const aliceAddr = await alice.getAddress();

      // Admin issues irrevocable Prime
      await primeV2.issue(true, [aliceAddr]);
      expect(await primeV2.isUserPrimeHolder(aliceAddr)).to.be.true;
      expect(await primeV2.totalIrrevocable()).to.equal(1);

      // Admin burn works on irrevocable if explicitly called
      // (policy enforcement is off-chain)
      await primeV2.burn(aliceAddr);
      expect(await primeV2.isUserPrimeHolder(aliceAddr)).to.be.false;
    });

    it("should handle LIFO withdrawal preserving oldest deposits", async () => {
      const aliceAddr = await alice.getAddress();

      // Alice deposits 500 XVS at day 0
      await simulateDeposit(aliceAddr, convertToUnit(500, 18));

      // Wait 60 days -> deposit gets 1.6x multiplier
      await time.increase(60 * DAY);

      // Alice deposits 300 XVS more (total vault balance = 800)
      await simulateDeposit(aliceAddr, convertToUnit(800, 18));

      // Wait 5 days so the second deposit also has some hold duration
      await time.increase(5 * DAY);

      // Effective stake: 500 × 1.6 × 65 + 300 × 1.0 × 5 = 52000 + 1500 = 53500
      const stakeBefore = await primeLeaderboard.getEffectiveStake(aliceAddr);
      expect(stakeBefore).to.equal(convertToUnit(53500, 18));

      // Alice withdraws 200 (from newest 300 deposit via LIFO, vault balance = 600)
      await simulateWithdrawal(aliceAddr, convertToUnit(600, 18));

      // After withdrawal:
      //   Deposit 1 (500): 65 days × 1.6x → 500 × 1.6 × 65 = 52,000
      //   Deposit 2 remaining (100): 5 days × 1.0x → 100 × 1.0 × 5 = 500
      //   Withdrawn score (200): locked at 5 days × 1.0x → 200 × 1.0 × 5 = 1,000
      //   Total: 52,000 + 500 + 1,000 = 53,500
      const stakeAfter = await primeLeaderboard.getEffectiveStake(aliceAddr);
      expect(stakeAfter).to.equal(convertToUnit(53500, 18));

      // But total staked reduced
      expect(await primeLeaderboard.totalStaked(aliceAddr)).to.equal(convertToUnit(600, 18));
    });

    it("should handle batch score updates after alpha change", async () => {
      const aliceAddr = await alice.getAddress();

      // Setup: Give Alice a Prime token with a market
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, aliceAddr).returns([convertToUnit(5000, 18), 0, 0]);
      vUSDC.balanceOf.whenCalledWith(aliceAddr).returns(convertToUnit(10000, 18));
      vUSDC.borrowBalanceStored.whenCalledWith(aliceAddr).returns(0);

      await primeV2.addMarket(comptroller.address, vUSDC.address, convertToUnit(2, 18), convertToUnit(2, 18));
      await primeV2.issue(false, [aliceAddr]);

      // Change alpha
      await primeV2.updateAlpha(1, 3);

      expect(await primeV2.pendingScoreUpdates()).to.equal(1);

      // Update scores
      await primeV2.updateScores([aliceAddr]);

      expect(await primeV2.pendingScoreUpdates()).to.equal(0);
    });

    it("should allow adding and querying markets", async () => {
      // Add a market
      await primeV2.addMarket(comptroller.address, vUSDC.address, convertToUnit(2, 18), convertToUnit(2, 18));

      const allMarkets = await primeV2.getAllMarkets();
      expect(allMarkets.length).to.equal(1);
      expect(allMarkets[0]).to.equal(vUSDC.address);

      // Verify market config
      const market = await primeV2.markets(vUSDC.address);
      expect(market.exists).to.be.true;
      expect(market.supplyMultiplier).to.equal(convertToUnit(2, 18));
      expect(market.borrowMultiplier).to.equal(convertToUnit(2, 18));

      // Should revert if adding same market again
      await expect(
        primeV2.addMarket(comptroller.address, vUSDC.address, convertToUnit(2, 18), convertToUnit(2, 18)),
      ).to.be.revertedWithCustomError(primeV2, "MarketAlreadyExists");
    });

    it("should return batch scores via getScores", async () => {
      const aliceAddr = await alice.getAddress();
      const bobAddr = await bob.getAddress();

      await simulateDeposit(aliceAddr, convertToUnit(10000, 18));
      await simulateDeposit(bobAddr, convertToUnit(5000, 18));

      // Wait 45 days -> 1.3x multiplier, 45 days duration
      await time.increase(45 * DAY);

      const scores = await primeLeaderboard.getScores([aliceAddr, bobAddr]);
      // Alice: 10000 × 1.3 × 45 = 585,000
      expect(scores[0]).to.equal(convertToUnit(585000, 18));
      // Bob: 5000 × 1.3 × 45 = 292,500
      expect(scores[1]).to.equal(convertToUnit(292500, 18));

      // calculateCurrentScore should match getEffectiveStake
      const aliceScore = await primeLeaderboard.calculateCurrentScore(aliceAddr);
      expect(aliceScore).to.equal(scores[0]);
    });

    it("should reset withdrawn score across round boundaries", async () => {
      const aliceAddr = await alice.getAddress();

      // Deposit in round 1
      await simulateDeposit(aliceAddr, convertToUnit(1000, 18));

      // Wait 45 days to get 1.3x multiplier
      await time.increase(45 * DAY);

      // Withdraw 200 XVS -> withdrawn score locked at withdrawal time
      // holdingDuration = 45 days, multiplier = 1.3x
      // withdrawnScore = 200 × 1.3 × 45 = 11,700
      await simulateWithdrawal(aliceAddr, convertToUnit(800, 18));

      // Effective stake should include withdrawn score in current round
      // Active: 800 × 1.3 × 45 = 46,800
      // Withdrawn: 200 × 1.3 × 45 = 11,700
      // Total: 58,500
      const stakeRound1 = await primeLeaderboard.getEffectiveStake(aliceAddr);
      expect(stakeRound1).to.equal(convertToUnit(58500, 18));

      // Advance to round 2
      await primeLeaderboard.advanceRound();
      expect(await primeLeaderboard.currentRound()).to.equal(2);

      // After round advances, withdrawn score from round 1 should NOT count
      // Only active deposits contribute: 800 × 1.3 × 45 = 46,800
      const stakeRound2 = await primeLeaderboard.getEffectiveStake(aliceAddr);

      // Withdrawn score (11,700) should be gone
      expect(stakeRound2).to.be.lt(stakeRound1);

      // The difference should be approximately the withdrawn score (11,700)
      const diff = stakeRound1.sub(stakeRound2);
      expect(diff.gte(convertToUnit(11600, 18))).to.be.true;
      expect(diff.lte(convertToUnit(11800, 18))).to.be.true;
    });

    it("should accumulate withdrawn scores within the same round", async () => {
      const aliceAddr = await alice.getAddress();

      await simulateDeposit(aliceAddr, convertToUnit(1000, 18));

      // Wait 45 days
      await time.increase(45 * DAY);

      // First withdrawal: 100 XVS (vault balance goes to 900)
      await simulateWithdrawal(aliceAddr, convertToUnit(900, 18));

      const stakeAfterFirst = await primeLeaderboard.getEffectiveStake(aliceAddr);

      // Second withdrawal: 100 XVS (vault balance goes to 800, same round)
      await simulateWithdrawal(aliceAddr, convertToUnit(800, 18));

      // Both withdrawn scores should accumulate
      const stakeAfterSecond = await primeLeaderboard.getEffectiveStake(aliceAddr);

      // Active deposits decreased, but withdrawn scores accumulated
      // Total effective stake should remain roughly the same (score is preserved)
      const accumDiff = stakeAfterFirst.sub(stakeAfterSecond).abs();
      expect(accumDiff.lte(convertToUnit(200, 18))).to.be.true;
    });

    it("should compact deposits when hitting 100-deposit limit", async () => {
      const aliceAddr = await alice.getAddress();

      // Make deposits that will reach max multiplier tier (90+ days old)
      let totalBalance = ethers.BigNumber.from(convertToUnit(500, 18));
      await simulateDeposit(aliceAddr, totalBalance.toString());
      totalBalance = totalBalance.add(convertToUnit(500, 18));
      await simulateDeposit(aliceAddr, totalBalance.toString());

      // Wait 95 days so these first deposits are at max multiplier
      await time.increase(95 * DAY);

      // Now fill up to 100 deposits with small amounts
      for (let i = 0; i < 98; i++) {
        totalBalance = totalBalance.add(convertToUnit(10, 18));
        await simulateDeposit(aliceAddr, totalBalance.toString());
      }

      expect(await primeLeaderboard.getDepositCount(aliceAddr)).to.equal(100);

      // Record effective stake before compaction
      const stakeBefore = await primeLeaderboard.getEffectiveStake(aliceAddr);

      // Next deposit triggers compaction of the 2 oldest max-multiplier deposits
      totalBalance = totalBalance.add(convertToUnit(10, 18));
      await simulateDeposit(aliceAddr, totalBalance.toString());

      // 2 old deposits merged into 1 (99 total), then new deposit added = 100
      const countAfter = await primeLeaderboard.getDepositCount(aliceAddr);
      expect(countAfter).to.equal(100);

      // Total staked should be correct: 500 + 500 + 98*10 + 10 = 1990
      expect(await primeLeaderboard.totalStaked(aliceAddr)).to.equal(convertToUnit(1990, 18));

      // Effective stake should not decrease significantly after compaction
      const stakeAfter = await primeLeaderboard.getEffectiveStake(aliceAddr);
      expect(stakeAfter).to.be.gte(stakeBefore);
    });

    it("should handle zero effective stake for brand-new deposits", async () => {
      const aliceAddr = await alice.getAddress();

      // Deposit right now
      await simulateDeposit(aliceAddr, convertToUnit(10000, 18));

      // Effective stake should be 0 because holdDays = 0 (within same block)
      const stake = await primeLeaderboard.getEffectiveStake(aliceAddr);
      expect(stake).to.equal(0);

      // But total staked should reflect the deposit
      expect(await primeLeaderboard.totalStaked(aliceAddr)).to.equal(convertToUnit(10000, 18));
    });

    it("should add/remove participants at minimum threshold boundary", async () => {
      const aliceAddr = await alice.getAddress();

      // Deposit exactly at minimum (500 XVS)
      await simulateDeposit(aliceAddr, convertToUnit(500, 18));
      expect(await primeLeaderboard.isParticipant(aliceAddr)).to.be.true;

      // Withdraw 1 wei -> below minimum (vault balance = 500e18 - 1)
      const belowMin = ethers.BigNumber.from(convertToUnit(500, 18)).sub(1);
      await simulateWithdrawal(aliceAddr, belowMin.toString());
      expect(await primeLeaderboard.isParticipant(aliceAddr)).to.be.false;
      expect(await primeLeaderboard.getParticipantCount()).to.equal(0);

      // Deposit 1 wei back -> at minimum again
      await simulateDeposit(aliceAddr, convertToUnit(500, 18));
      expect(await primeLeaderboard.isParticipant(aliceAddr)).to.be.true;
      expect(await primeLeaderboard.getParticipantCount()).to.equal(1);
    });

    it("should revert xvsUpdated for zero address", async () => {
      await expect(primeLeaderboard.xvsUpdated(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
        primeLeaderboard,
        "ZeroAddress",
      );
    });

    it("should handle multiplier tier transitions correctly", async () => {
      const aliceAddr = await alice.getAddress();

      await simulateDeposit(aliceAddr, convertToUnit(1000, 18));

      // At 29 days: base multiplier (1.0x), 29 days hold
      await time.increase(29 * DAY);
      const stakeBase = await primeLeaderboard.getEffectiveStake(aliceAddr);
      // 1000 × 1.0 × 29 = 29,000
      expect(stakeBase).to.equal(convertToUnit(29000, 18));

      // At 30 days: tier 1 multiplier (1.3x), 30 days hold
      await time.increase(1 * DAY);
      const stakeTier1 = await primeLeaderboard.getEffectiveStake(aliceAddr);
      // 1000 × 1.3 × 30 = 39,000
      expect(stakeTier1).to.equal(convertToUnit(39000, 18));

      // At 60 days: tier 2 multiplier (1.6x), 60 days hold
      await time.increase(30 * DAY);
      const stakeTier2 = await primeLeaderboard.getEffectiveStake(aliceAddr);
      // 1000 × 1.6 × 60 = 96,000
      expect(stakeTier2).to.equal(convertToUnit(96000, 18));

      // At 90 days: tier 3 multiplier (2.0x), 90 days hold (capped)
      await time.increase(30 * DAY);
      const stakeTier3 = await primeLeaderboard.getEffectiveStake(aliceAddr);
      // 1000 × 2.0 × 90 = 180,000
      expect(stakeTier3).to.equal(convertToUnit(180000, 18));

      // At 180 days: still capped at 90 days
      await time.increase(90 * DAY);
      const stakeCapped = await primeLeaderboard.getEffectiveStake(aliceAddr);
      // 1000 × 2.0 × 90 = 180,000 (same as at 90 days)
      expect(stakeCapped).to.equal(convertToUnit(180000, 18));
    });

    it("should handle getMultiplierTiers view function", async () => {
      const [durations, multipliers] = await primeLeaderboard.getMultiplierTiers();
      expect(durations.length).to.equal(3);
      expect(multipliers.length).to.equal(3);

      expect(durations[0]).to.equal(30 * DAY);
      expect(durations[1]).to.equal(60 * DAY);
      expect(durations[2]).to.equal(90 * DAY);

      expect(multipliers[0]).to.equal(convertToUnit(1.3, 18));
      expect(multipliers[1]).to.equal(convertToUnit(1.6, 18));
      expect(multipliers[2]).to.equal(convertToUnit(2, 18));
    });

    it("should handle pause and unpause", async () => {
      const aliceAddr = await alice.getAddress();

      await primeLeaderboard.pause();

      // xvsUpdated should revert when paused
      xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, aliceAddr).returns([convertToUnit(1000, 18), 0, 0]);
      await expect(primeLeaderboard.xvsUpdated(aliceAddr)).to.be.revertedWith("Pausable: paused");

      await primeLeaderboard.unpause();

      // Should work after unpause
      await primeLeaderboard.xvsUpdated(aliceAddr);
      expect(await primeLeaderboard.totalStaked(aliceAddr)).to.equal(convertToUnit(1000, 18));
    });

    it("should handle advanceRound correctly", async () => {
      expect(await primeLeaderboard.currentRound()).to.equal(1);

      await primeLeaderboard.advanceRound();
      expect(await primeLeaderboard.currentRound()).to.equal(2);

      await primeLeaderboard.advanceRound();
      expect(await primeLeaderboard.currentRound()).to.equal(3);
    });

    it("should handle xvsUpdated no-op when balance unchanged", async () => {
      const aliceAddr = await alice.getAddress();

      // First call sets up the deposit
      await simulateDeposit(aliceAddr, convertToUnit(1000, 18));
      expect(await primeLeaderboard.totalStaked(aliceAddr)).to.equal(convertToUnit(1000, 18));
      expect(await primeLeaderboard.getDepositCount(aliceAddr)).to.equal(1);

      // Second call with same balance should be a no-op
      await primeLeaderboard.xvsUpdated(aliceAddr);
      expect(await primeLeaderboard.totalStaked(aliceAddr)).to.equal(convertToUnit(1000, 18));
      expect(await primeLeaderboard.getDepositCount(aliceAddr)).to.equal(1); // no new deposit
    });
  });
});
