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

describe("PrimeV2 Integration Tests", () => {
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

  describe("Core Callback Chain — XVSVault → PrimeLeaderboard → PrimeV2", () => {
    let f: IntegrationFixture;
    let user1Address: string;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
      user1Address = await f.user1.getAddress();

      f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      await issueAndSetupUser(f, user1Address);
    });

    it("should complete full callback chain without reverting on deposit", async () => {
      await expect(simulateVaultDeposit(f, user1Address, convertToUnit(2000, 18))).to.not.be.reverted;
    });

    it("should update score in PrimeV2 after XVS deposit through leaderboard", async () => {
      const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);
      const scoreBefore = interestBefore.score;

      f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      await simulateVaultDeposit(f, user1Address, convertToUnit(5000, 18));

      const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestAfter.score).to.not.equal(scoreBefore);
    });

    it("should accrue interest at old score before updating (atomicity invariant)", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2.accrueInterest(f.vToken.address);

      const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestBefore.accrued).to.equal(0);

      await simulateVaultDeposit(f, user1Address, convertToUnit(5000, 18));

      const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestAfter.accrued).to.be.gt(0);
    });

    it("should decrease user score in PrimeV2 on withdrawal", async () => {
      f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      await simulateVaultDeposit(f, user1Address, convertToUnit(5000, 18));

      const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);

      await simulateVaultWithdrawal(f, user1Address, convertToUnit(500, 18));

      const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestAfter.score).to.be.lt(interestBefore.score);
    });

    it("should be a silent no-op when primeV2 is not set", async () => {
      const user2Address = await f.user2.getAddress();
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user2Address).returns([convertToUnit(1000, 18), 0, 0]);

      await expect(f.primeLeaderboard.connect(f.xvsVault.wallet).xvsUpdated(user2Address)).to.not.be.reverted;
    });
  });

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
      await issueAndSetupUser(f, user1Address);

      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(50, 18));
      await f.primeV2.accrueInterest(f.vToken.address);

      const marketAfterAccrual = await f.primeV2.markets(f.vToken.address);
      expect(marketAfterAccrual.rewardIndex).to.be.gt(0);

      // Prevents retroactive reward claims — rewardIndex must match current market index
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
      expect(interest1.score).to.be.gt(interest2.score);
    });
  });

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
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(200, 18));
      await f.primeV2.accrueInterest(f.vToken.address);

      await simulateVaultDeposit(f, user1Address, convertToUnit(3000, 18));

      const interest = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interest.accrued).to.be.gt(0);
    });

    it("should accrue incrementally across multiple deposits", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2.accrueInterest(f.vToken.address);

      await simulateVaultDeposit(f, user1Address, convertToUnit(2000, 18));
      const accrued1 = (await f.primeV2.interests(f.vToken.address, user1Address)).accrued;
      expect(accrued1).to.be.gt(0);

      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(300, 18));

      await simulateVaultDeposit(f, user1Address, convertToUnit(3000, 18));
      const accrued2 = (await f.primeV2.interests(f.vToken.address, user1Address)).accrued;

      expect(accrued2).to.be.gt(accrued1);
    });

    it("should return nonzero from getPendingRewards after accrual", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2.accrueInterest(f.vToken.address);

      const rewards = await f.primeV2.getPendingRewardsStatic(user1Address);
      expect(rewards.length).to.equal(1);
      expect(rewards[0].amount).to.be.gt(0);
    });

    it("should match getPendingRewards and getPendingRewardsStatic after manual accrual", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2.accrueInterest(f.vToken.address);

      const rewardsStatic = await f.primeV2.getPendingRewardsStatic(user1Address);
      const rewardsMutating = await f.primeV2.callStatic.getPendingRewards(user1Address);

      expect(rewardsStatic[0].amount).to.equal(rewardsMutating[0].amount);
    });
  });

  describe("claimInterest Two-Argument Overload", () => {
    let f: IntegrationFixture;
    let user1Address: string;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
      user1Address = await f.user1.getAddress();

      f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      await issueAndSetupUser(f, user1Address);

      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);
    });

    it("should allow third party to claim on behalf of user", async () => {
      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);

      await expect(f.primeV2.connect(f.user2)["claimInterest(address,address)"](f.vToken.address, user1Address)).to.not
        .be.reverted;
    });

    it("should transfer tokens to the user, not the caller", async () => {
      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);

      await f.primeV2.connect(f.user2)["claimInterest(address,address)"](f.vToken.address, user1Address);

      // smock fakes use transfer() instead of safeTransfer()
      const transferCalls = f.underlyingToken.transfer.getCall(0);
      expect(transferCalls.args[0]).to.equal(user1Address);
    });

    it("should emit InterestClaimed with user address", async () => {
      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);

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

  describe("releaseFunds Fallback", () => {
    let f: IntegrationFixture;
    let user1Address: string;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
      user1Address = await f.user1.getAddress();

      f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      await issueAndSetupUser(f, user1Address);

      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);
    });

    it("should call releaseFunds when contract balance is insufficient", async () => {
      const interest = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interest.accrued).to.be.gt(0);

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

      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(0);
      f.primeLiquidityProvider.releaseFunds.returns();
      f.underlyingToken.transfer.returns(true);

      await f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);

      const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestAfter.accrued).to.be.gt(0);
    });

    it("should NOT call releaseFunds when balance is already sufficient", async () => {
      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);

      f.primeLiquidityProvider.releaseFunds.reset();

      await f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);

      expect(f.primeLiquidityProvider.releaseFunds).to.not.have.been.called;
    });
  });

  describe("Burn and Re-Issue Lifecycle", () => {
    let f: IntegrationFixture;
    let user1Address: string;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
      user1Address = await f.user1.getAddress();

      f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

      await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
      await issueAndSetupUser(f, user1Address);

      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);
    });

    it("should preserve interests.accrued after burn (score and rewardIndex zeroed)", async () => {
      const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestBefore.accrued).to.be.gt(0);
      expect(interestBefore.score).to.be.gt(0);

      await f.primeV2.burn(user1Address);

      const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestAfter.accrued).to.be.gt(0);
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
      expect(userInterest.rewardIndex).to.equal(marketIndex);
    });

    it("should complete full lifecycle: issue → earn → burn → claim → re-issue", async () => {
      await f.primeV2.burn(user1Address);
      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.false;

      const accruedBefore = (await f.primeV2.interests(f.vToken.address, user1Address)).accrued;
      expect(accruedBefore).to.be.gt(0);

      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);
      await f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);

      const accruedAfterClaim = (await f.primeV2.interests(f.vToken.address, user1Address)).accrued;
      expect(accruedAfterClaim).to.equal(0);

      await f.primeV2["issue(address)"](user1Address);
      expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.true;

      const interestFinal = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestFinal.score).to.be.gt(0);
      expect(interestFinal.accrued).to.equal(0);
    });
  });

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
      const seedTimestamp = (await ethers.provider.getBlock("latest")).timestamp - 45 * 24 * 60 * 60;

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

      await simulateVaultDeposit(f, user1Address, convertToUnit(2000, 18));

      expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(2000, 18));
      expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(2);
    });

    it("should handle live withdrawal correctly against seeded totalStaked", async () => {
      const seedAmount = convertToUnit(1000, 18);
      const seedTimestamp = (await ethers.provider.getBlock("latest")).timestamp - 45 * 24 * 60 * 60;

      await f.primeLeaderboard.initializeStakers([user1Address], [seedAmount], [seedTimestamp]);
      await f.primeLeaderboard.finalizeInitialization();

      await simulateVaultWithdrawal(f, user1Address, convertToUnit(500, 18));

      expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(500, 18));
    });

    it("should trigger PrimeV2 score update for seeded prime holder on xvsUpdated", async () => {
      const seedAmount = convertToUnit(1000, 18);
      const seedTimestamp = (await ethers.provider.getBlock("latest")).timestamp - 45 * 24 * 60 * 60;

      await f.primeLeaderboard.initializeStakers([user1Address], [seedAmount], [seedTimestamp]);
      await f.primeLeaderboard.finalizeInitialization();

      await issueAndSetupUser(f, user1Address);

      const scoreBefore = (await f.primeV2.interests(f.vToken.address, user1Address)).score;
      expect(scoreBefore).to.be.gt(0);

      f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
      await simulateVaultDeposit(f, user1Address, convertToUnit(3000, 18));

      const scoreAfter = (await f.primeV2.interests(f.vToken.address, user1Address)).score;
      expect(scoreAfter).to.not.equal(scoreBefore);
    });
  });

  describe("Deploy Script Wiring Verification", () => {
    let f: IntegrationFixture;

    beforeEach(async () => {
      f = await loadFixture(deployIntegrationFixture);
    });

    it("should have primeV2.primeLeaderboard() pointing to real PrimeLeaderboard", async () => {
      const storedAddress = await f.primeV2.primeLeaderboard();
      expect(storedAddress).to.equal(f.primeLeaderboard.address);
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
