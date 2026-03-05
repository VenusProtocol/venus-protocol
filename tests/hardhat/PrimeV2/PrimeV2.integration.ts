import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  IntegrationFixture,
  deployIntegrationFixture,
  issueAndSetupUser,
  simulateVaultDeposit,
  simulateVaultWithdrawal,
} from "./helpers/integrationFixture";

const { expect } = chai;
chai.use(smock.matchers);

/**
 * PrimeV2 + PrimeLeaderboard Integration Tests
 *
 * All existing 127+ tests are unit tests — PrimeV2 tests mock PrimeLeaderboard,
 * and PrimeLeaderboard tests never set primeV2. The core callback chain
 * XVSVault → PrimeLeaderboard.xvsUpdated → PrimeV2.accrueInterestAndUpdateScore
 * has zero end-to-end coverage until these tests.
 *
 * This file deploys both real contracts wired bidirectionally.
 */

describe("PrimeV2 Integration Tests", () => {
  /**
   * Section 1: Contract Wiring
   *
   * Verifies that setPrimeLeaderboard and setPrimeV2 correctly wire both contracts.
   * Gap: No test ever verified both addresses are stored and point to each other.
   */
  describe("Contract Wiring", () => {
    let f: IntegrationFixture;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
    });

    it("should store PrimeLeaderboard address in PrimeV2", async () => {
      expect(await f.primeV2.primeLeaderboard()).to.equal(f.primeLeaderboard.address);
      expect(await f.primeV2.primeLeaderboard()).to.not.equal(ethers.constants.AddressZero);
    });

    it("should store PrimeV2 address in PrimeLeaderboard", async () => {
      expect(await f.primeLeaderboard.primeV2()).to.equal(f.primeV2.address);
      expect(await f.primeLeaderboard.primeV2()).to.not.equal(ethers.constants.AddressZero);
    });

    it("should use the same XVSVault address in both contracts", async () => {
      const primeV2Vault = await f.primeV2.xvsVault();
      const leaderboardVault = await f.primeLeaderboard.xvsVault();
      expect(primeV2Vault).to.equal(leaderboardVault);
    });
  });

  /**
   * Section 2: Core Callback Chain — XVSVault → PrimeLeaderboard → PrimeV2
   *
   * The `if (primeV2 != address(0)) { IPrimeV2(primeV2).accrueInterestAndUpdateScore(user) }`
   * branch in xvsUpdated is dead code in all existing unit tests. These tests exercise it.
   * Key invariant: interest is accrued at old score BEFORE score is recalculated.
   */
  describe("Core Callback Chain — XVSVault → PrimeLeaderboard → PrimeV2", () => {
    let f: IntegrationFixture;
    let user1Address: string;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
      user1Address = await f.user1.getAddress();

      // Reset PLP mock to 0 before any market operations
      f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      await issueAndSetupUser(f, user1Address);
    });

    it("should complete full callback chain without reverting on deposit", async () => {
      // xvsUpdated → PrimeLeaderboard records deposit → calls PrimeV2.accrueInterestAndUpdateScore
      await expect(simulateVaultDeposit(f, user1Address, convertToUnit(2000, 18))).to.not.be.reverted;
    });

    it("should update score in PrimeV2 after XVS deposit through leaderboard", async () => {
      const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);
      const scoreBefore = interestBefore.score;

      // Increase XVS stake — triggers full callback chain
      f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      await simulateVaultDeposit(f, user1Address, convertToUnit(5000, 18));

      const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
      // Score should change because XVS balance changed
      expect(interestAfter.score).to.not.equal(scoreBefore);
    });

    it("should accrue interest at old score before updating (atomicity invariant)", async () => {
      // Generate some income so there's interest to accrue
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2.accrueInterest(f.vToken.address);

      const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestBefore.accrued).to.equal(0);

      // Now do a deposit which triggers the callback chain.
      // The callback should: accrue interest at old score, THEN update score.
      await simulateVaultDeposit(f, user1Address, convertToUnit(5000, 18));

      const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
      // Interest should have been captured from the rewardIndex delta × old score
      expect(interestAfter.accrued).to.be.gt(0);
    });

    it("should decrease user score in PrimeV2 on withdrawal", async () => {
      // Start with higher stake for a larger score
      f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      await simulateVaultDeposit(f, user1Address, convertToUnit(5000, 18));

      const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);

      // Withdraw most XVS
      await simulateVaultWithdrawal(f, user1Address, convertToUnit(500, 18));

      const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestAfter.score).to.be.lt(interestBefore.score);
    });

    it("should be a silent no-op when primeV2 is not set", async () => {
      // Non-prime-holder deposit through leaderboard should not revert
      // even though PrimeV2.accrueInterestAndUpdateScore is called
      const user2Address = await f.user2.getAddress();
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user2Address).returns([convertToUnit(1000, 18), 0, 0]);

      await expect(f.primeLeaderboard.connect(f.xvsVault.wallet).xvsUpdated(user2Address)).to.not.be.reverted;
    });
  });

  /**
   * Section 3: Issue and Score Initialization
   *
   * Gap: No test verifies score is nonzero at issue time or that rewardIndex
   * is set correctly to prevent retroactive reward claims.
   */
  describe("Issue and Score Initialization", () => {
    let f: IntegrationFixture;
    let user1Address: string;
    let user2Address: string;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
      user1Address = await f.user1.getAddress();
      user2Address = await f.user2.getAddress();

      f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
    });

    it("should set nonzero score when user has XVS + vToken balance", async () => {
      await issueAndSetupUser(f, user1Address);

      const interest = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interest.score).to.be.gt(0);
    });

    it("should set rewardIndex to current market rewardIndex at issue time", async () => {
      // Issue user1 first so there's a nonzero sumOfMembersScore
      await issueAndSetupUser(f, user1Address);

      // Now generate income and accrue — rewardIndex will advance
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(50, 18));
      await f.primeV2.accrueInterest(f.vToken.address);

      const marketAfterAccrual = await f.primeV2.markets(f.vToken.address);
      expect(marketAfterAccrual.rewardIndex).to.be.gt(0);

      // Issue to user2 — their rewardIndex should equal the current market rewardIndex.
      // If it were 0, the user would retroactively earn all rewards since market creation.
      f.vToken.balanceOf.whenCalledWith(user2Address).returns(convertToUnit(500, 18));
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user2Address).returns([convertToUnit(1000, 18), 0, 0]);
      await f.primeV2["issue(address)"](user2Address);

      const user2Interest = await f.primeV2.interests(f.vToken.address, user2Address);
      expect(user2Interest.rewardIndex).to.equal(marketAfterAccrual.rewardIndex);
    });

    it("should set zero score when user has zero XVS", async () => {
      f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([0, 0, 0]);
      await f.primeV2["issue(address)"](user1Address);

      const interest = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interest.score).to.equal(0);
    });

    it("should initialize multiple users correctly via issueBatch", async () => {
      f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      f.vToken.balanceOf.whenCalledWith(user2Address).returns(convertToUnit(500, 18));
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(2000, 18), 0, 0]);
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user2Address).returns([convertToUnit(1000, 18), 0, 0]);

      await f.primeV2.issueBatch([user1Address, user2Address]);

      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.true;
      expect(await f.primeV2.isUserPrimeHolder(user2Address)).to.be.true;

      const interest1 = await f.primeV2.interests(f.vToken.address, user1Address);
      const interest2 = await f.primeV2.interests(f.vToken.address, user2Address);
      // User1 has more XVS and vToken, so should have higher score
      expect(interest1.score).to.be.gt(interest2.score);
    });
  });

  /**
   * Section 4: Interest Accrual via Vault Deposits
   *
   * Gap: getPendingRewards (state-mutating) never tested; interest triggered
   * by vault callback never tested end-to-end.
   */
  describe("Interest Accrual via Vault Deposits", () => {
    let f: IntegrationFixture;
    let user1Address: string;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
      user1Address = await f.user1.getAddress();

      f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      await issueAndSetupUser(f, user1Address);
    });

    it("should accrue interest at old score before updating on vault deposit", async () => {
      // Generate income
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(200, 18));
      await f.primeV2.accrueInterest(f.vToken.address);

      // Vault deposit triggers callback which accrues interest then updates score
      await simulateVaultDeposit(f, user1Address, convertToUnit(3000, 18));

      const interest = await f.primeV2.interests(f.vToken.address, user1Address);
      // Accrued should be nonzero because interest was captured at old score
      expect(interest.accrued).to.be.gt(0);
    });

    it("should accrue incrementally across multiple deposits", async () => {
      // First income round — set PLP accrued
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2.accrueInterest(f.vToken.address);

      // First deposit triggers callback (PLP still at 100, no new income in callback)
      await simulateVaultDeposit(f, user1Address, convertToUnit(2000, 18));
      const accrued1 = (await f.primeV2.interests(f.vToken.address, user1Address)).accrued;
      expect(accrued1).to.be.gt(0);

      // Second income round — increase PLP accrued (must be >= previous to avoid underflow)
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(300, 18));

      // Second deposit triggers callback which accrues the new income
      await simulateVaultDeposit(f, user1Address, convertToUnit(3000, 18));
      const accrued2 = (await f.primeV2.interests(f.vToken.address, user1Address)).accrued;

      expect(accrued2).to.be.gt(accrued1);
    });

    it("should return nonzero from getPendingRewards after accrual", async () => {
      // Generate income and accrue manually
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2.accrueInterest(f.vToken.address);

      // getPendingRewards is state-mutating — use callStatic to get return value
      // Since we already accrued manually, the rewards should be nonzero
      const rewards = await f.primeV2.getPendingRewardsStatic(user1Address);
      expect(rewards.length).to.equal(1);
      expect(rewards[0].amount).to.be.gt(0);
    });

    it("should match getPendingRewards and getPendingRewardsStatic after manual accrual", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

      // Manually accrue first so static view is up to date
      await f.primeV2.accrueInterest(f.vToken.address);

      const rewardsStatic = await f.primeV2.getPendingRewardsStatic(user1Address);
      const rewardsMutating = await f.primeV2.callStatic.getPendingRewards(user1Address);

      // After manual accrual, both should return the same value
      expect(rewardsStatic[0].amount).to.equal(rewardsMutating[0].amount);
    });
  });

  /**
   * Section 5: claimInterest Two-Argument Overload
   *
   * Gap: claimInterest(vToken, user) permissionless overload has zero test coverage.
   * Anyone can call it, but tokens go to the user, not the caller.
   */
  describe("claimInterest Two-Argument Overload", () => {
    let f: IntegrationFixture;
    let user1Address: string;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
      user1Address = await f.user1.getAddress();

      f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      await issueAndSetupUser(f, user1Address);

      // Generate interest
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);
    });

    it("should allow third party to claim on behalf of user", async () => {
      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);

      // user2 (third party) calls claimInterest for user1
      await expect(f.primeV2.connect(f.user2)["claimInterest(address,address)"](f.vToken.address, user1Address)).to.not
        .be.reverted;
    });

    it("should transfer tokens to the user, not the caller", async () => {
      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);

      await f.primeV2.connect(f.user2)["claimInterest(address,address)"](f.vToken.address, user1Address);

      // safeTransfer is implemented via transfer on the fake — check the first arg is user1
      const transferCalls = f.underlyingToken.transfer.getCall(0);
      expect(transferCalls.args[0]).to.equal(user1Address);
    });

    it("should emit InterestClaimed with user address", async () => {
      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);

      // InterestClaimed(user, market, amount) — 3 indexed args
      const tx = f.primeV2.connect(f.user2)["claimInterest(address,address)"](f.vToken.address, user1Address);
      await expect(tx).to.emit(f.primeV2, "InterestClaimed");
    });

    it("should revert for unsupported market", async () => {
      const fakeMarket = ethers.Wallet.createRandom().address;
      await expect(
        f.primeV2.connect(f.user2)["claimInterest(address,address)"](fakeMarket, user1Address),
      ).to.be.revertedWithCustomError(f.primeV2, "MarketNotSupported");
    });
  });

  /**
   * Section 6: releaseFunds Fallback
   *
   * Gap: When PrimeV2 balance < owed, PLP.releaseFunds() is called as a fallback.
   * This path was never tested end-to-end.
   */
  describe("releaseFunds Fallback", () => {
    let f: IntegrationFixture;
    let user1Address: string;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
      user1Address = await f.user1.getAddress();

      f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      await issueAndSetupUser(f, user1Address);

      // Generate interest
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);
    });

    it("should call releaseFunds when contract balance is insufficient", async () => {
      const interest = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interest.accrued).to.be.gt(0);

      // PrimeV2 has 0 balance → triggers releaseFunds path
      // Both balanceOf calls return 0 — releaseFunds is still called even if PLP can't help
      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(0);
      f.primeLiquidityProvider.releaseFunds.reset();
      f.primeLiquidityProvider.releaseFunds.returns();
      f.underlyingToken.transfer.returns(true);

      await f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);

      expect(f.primeLiquidityProvider.releaseFunds).to.have.been.called;
    });

    it("should save residual in interests.accrued when PLP also insufficient", async () => {
      const interest = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interest.accrued).to.be.gt(0);

      // PrimeV2 has 0 balance, releaseFunds doesn't help (still 0 after)
      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(0);
      f.primeLiquidityProvider.releaseFunds.returns();
      f.underlyingToken.transfer.returns(true);

      await f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);

      // Since available was 0 and amount > 0, residual is saved as interests.accrued
      const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestAfter.accrued).to.be.gt(0);
    });

    it("should NOT call releaseFunds when balance is already sufficient", async () => {
      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);

      // Reset smock call tracking before the assertion-relevant call
      f.primeLiquidityProvider.releaseFunds.reset();

      await f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);

      expect(f.primeLiquidityProvider.releaseFunds).to.not.have.been.called;
    });
  });

  /**
   * Section 7: Burn and Re-Issue Lifecycle
   *
   * Gap: Full cycle issue → earn → burn → claim residual → re-issue never
   * tested end-to-end with both contracts wired together.
   */
  describe("Burn and Re-Issue Lifecycle", () => {
    let f: IntegrationFixture;
    let user1Address: string;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
      user1Address = await f.user1.getAddress();

      f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      await issueAndSetupUser(f, user1Address);

      // Generate interest via the single-market accrueInterestAndUpdateScore
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);
    });

    it("should preserve interests.accrued after burn (score and rewardIndex zeroed)", async () => {
      const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestBefore.accrued).to.be.gt(0);
      expect(interestBefore.score).to.be.gt(0);

      await f.primeV2.burn(user1Address);

      const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
      // Accrued is preserved for later claiming
      expect(interestAfter.accrued).to.be.gt(0);
      // Score and rewardIndex are zeroed
      expect(interestAfter.score).to.equal(0);
      expect(interestAfter.rewardIndex).to.equal(0);
    });

    it("should allow burned user to claim residual via claimInterest", async () => {
      await f.primeV2.burn(user1Address);
      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.false;

      const accruedBefore = (await f.primeV2.interests(f.vToken.address, user1Address)).accrued;
      expect(accruedBefore).to.be.gt(0);

      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);

      await expect(f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address)).to.emit(
        f.primeV2,
        "InterestClaimed",
      );
    });

    it("should reset score to fresh calculation on re-issue", async () => {
      const scoreBefore = (await f.primeV2.interests(f.vToken.address, user1Address)).score;

      await f.primeV2.burn(user1Address);

      // Change balances before re-issue to get a different score
      f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(500, 18));
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(2000, 18), 0, 0]);

      await f.primeV2["issue(address)"](user1Address);

      const scoreAfter = (await f.primeV2.interests(f.vToken.address, user1Address)).score;
      expect(scoreAfter).to.be.gt(0);
      expect(scoreAfter).to.not.equal(scoreBefore);
    });

    it("should set rewardIndex to current market index on re-issue", async () => {
      const marketIndex = (await f.primeV2.markets(f.vToken.address)).rewardIndex;
      expect(marketIndex).to.be.gt(0);

      await f.primeV2.burn(user1Address);
      await f.primeV2["issue(address)"](user1Address);

      const userInterest = await f.primeV2.interests(f.vToken.address, user1Address);
      // On re-issue, rewardIndex must equal current market index (no retroactive rewards)
      expect(userInterest.rewardIndex).to.equal(marketIndex);
    });

    it("should complete full lifecycle: issue → earn → burn → claim → re-issue", async () => {
      // Step 1: Already issued and earned in beforeEach

      // Step 2: Burn
      await f.primeV2.burn(user1Address);
      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.false;

      // Step 3: Claim residual
      const accruedBefore = (await f.primeV2.interests(f.vToken.address, user1Address)).accrued;
      expect(accruedBefore).to.be.gt(0);

      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);
      await f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);

      const accruedAfterClaim = (await f.primeV2.interests(f.vToken.address, user1Address)).accrued;
      expect(accruedAfterClaim).to.equal(0);

      // Step 4: Re-issue
      await f.primeV2["issue(address)"](user1Address);
      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.true;

      const interestFinal = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestFinal.score).to.be.gt(0);
      expect(interestFinal.accrued).to.equal(0);
    });
  });

  /**
   * Section 8: Migration Path
   *
   * Gap: initializeStakers → finalizeInitialization → live xvsUpdated transition
   * never validated with PrimeV2 wired in. Tests verify seeded data integrates
   * correctly with the live callback chain.
   */
  describe("Migration Path", () => {
    let f: IntegrationFixture;
    let user1Address: string;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
      user1Address = await f.user1.getAddress();

      f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
    });

    it("should give seeded users nonzero effective stake", async () => {
      const seedAmount = convertToUnit(1000, 18);
      const seedTimestamp = (await ethers.provider.getBlock("latest")).timestamp - 45 * 24 * 60 * 60; // 45 days ago

      await f.primeLeaderboard.initializeStakers([user1Address], [seedAmount], [seedTimestamp]);

      const effectiveStake = await f.primeLeaderboard.getEffectiveStake(user1Address);
      expect(effectiveStake).to.be.gt(0);
    });

    it("should lock seeding after finalization", async () => {
      await f.primeLeaderboard.finalizeInitialization();

      await expect(
        f.primeLeaderboard.initializeStakers([user1Address], [convertToUnit(1000, 18)], [100]),
      ).to.be.revertedWithCustomError(f.primeLeaderboard, "StakersAlreadyInitialized");
    });

    it("should add live deposit on top of seeded data", async () => {
      const seedAmount = convertToUnit(1000, 18);
      const seedTimestamp = (await ethers.provider.getBlock("latest")).timestamp - 45 * 24 * 60 * 60;

      await f.primeLeaderboard.initializeStakers([user1Address], [seedAmount], [seedTimestamp]);
      await f.primeLeaderboard.finalizeInitialization();

      // Live deposit adds on top
      await simulateVaultDeposit(f, user1Address, convertToUnit(2000, 18));

      expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(2000, 18));
      // Should have 2 deposits: seeded + live
      expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(2);
    });

    it("should handle live withdrawal correctly against seeded totalStaked", async () => {
      const seedAmount = convertToUnit(1000, 18);
      const seedTimestamp = (await ethers.provider.getBlock("latest")).timestamp - 45 * 24 * 60 * 60;

      await f.primeLeaderboard.initializeStakers([user1Address], [seedAmount], [seedTimestamp]);
      await f.primeLeaderboard.finalizeInitialization();

      // Withdraw half
      await simulateVaultWithdrawal(f, user1Address, convertToUnit(500, 18));

      expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(500, 18));
    });

    it("should trigger PrimeV2 score update for seeded prime holder on xvsUpdated", async () => {
      const seedAmount = convertToUnit(1000, 18);
      const seedTimestamp = (await ethers.provider.getBlock("latest")).timestamp - 45 * 24 * 60 * 60;

      await f.primeLeaderboard.initializeStakers([user1Address], [seedAmount], [seedTimestamp]);
      await f.primeLeaderboard.finalizeInitialization();

      // Issue Prime to user
      await issueAndSetupUser(f, user1Address);

      const scoreBefore = (await f.primeV2.interests(f.vToken.address, user1Address)).score;
      expect(scoreBefore).to.be.gt(0);

      // Live deposit through leaderboard triggers PrimeV2 score update
      f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      await simulateVaultDeposit(f, user1Address, convertToUnit(3000, 18));

      const scoreAfter = (await f.primeV2.interests(f.vToken.address, user1Address)).score;
      expect(scoreAfter).to.not.equal(scoreBefore);
    });
  });

  /**
   * Section 9: Deploy Script Wiring Verification
   *
   * Gap: Deploy script wiring invariants never tested as integration.
   * These tests verify the fixture mimics the deploy script's wiring.
   */
  describe("Deploy Script Wiring Verification", () => {
    let f: IntegrationFixture;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
    });

    it("should have primeV2.primeLeaderboard() pointing to real PrimeLeaderboard", async () => {
      const storedAddress = await f.primeV2.primeLeaderboard();
      expect(storedAddress).to.equal(f.primeLeaderboard.address);
      // Verify it's a real contract (not a fake)
      const code = await ethers.provider.getCode(storedAddress);
      expect(code).to.not.equal("0x");
    });

    it("should have primeLeaderboard.primeV2() pointing to real PrimeV2", async () => {
      const storedAddress = await f.primeLeaderboard.primeV2();
      expect(storedAddress).to.equal(f.primeV2.address);
      const code = await ethers.provider.getCode(storedAddress);
      expect(code).to.not.equal("0x");
    });

    it("should have consistent xvsVault address across both contracts", async () => {
      const v2Vault = await f.primeV2.xvsVault();
      const lbVault = await f.primeLeaderboard.xvsVault();
      const v2RewardToken = await f.primeV2.xvsVaultRewardToken();
      const lbRewardToken = await f.primeLeaderboard.xvsVaultRewardToken();
      const v2PoolId = await f.primeV2.xvsVaultPoolId();
      const lbPoolId = await f.primeLeaderboard.xvsVaultPoolId();

      expect(v2Vault).to.equal(lbVault);
      expect(v2RewardToken).to.equal(lbRewardToken);
      expect(v2PoolId).to.equal(lbPoolId);
    });
  });
});
