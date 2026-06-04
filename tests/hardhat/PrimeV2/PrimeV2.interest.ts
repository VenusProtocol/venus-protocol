import { smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { PrimeV2Fixture, deployPrimeV2Fixture } from "./helpers/primeV2Fixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeV2 - Interest Accrual and Claiming", () => {
  let f: PrimeV2Fixture;
  let user1Address: string;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeV2Fixture);
    f.accessControlManager.isAllowedToCall.returns(true);

    user1Address = await f.user1.getAddress();

    f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

    f.comptroller.markets.returns(true);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

    f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);

    await f.primeV2["issue(address)"](user1Address);
  });

  it("should accrue interest and update rewardIndex", async () => {
    const marketBefore = await f.primeV2.markets(f.vToken.address);
    expect(marketBefore.rewardIndex).to.equal(0);

    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

    await f.primeV2.accrueInterest(f.vToken.address);

    const marketAfter = await f.primeV2.markets(f.vToken.address);
    expect(marketAfter.rewardIndex).to.be.gt(0);
  });

  it("should not increase rewardIndex when no new income accrued", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
    await f.primeV2.accrueInterest(f.vToken.address);

    const marketBefore = await f.primeV2.markets(f.vToken.address);

    await f.primeV2.accrueInterest(f.vToken.address);

    const marketAfter = await f.primeV2.markets(f.vToken.address);
    expect(marketAfter.rewardIndex).to.equal(marketBefore.rewardIndex);
  });

  it("should revert accrueInterest for unsupported market", async () => {
    const fakeMarket = ethers.Wallet.createRandom().address;
    await expect(f.primeV2.accrueInterest(fakeMarket)).to.be.revertedWithCustomError(f.primeV2, "MarketNotSupported");
  });

  it("should claim interest and transfer tokens to user", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const interest = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interest.accrued).to.be.gt(0);

    f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
    f.underlyingToken.transfer.returns(true);

    const tx = f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);
    await expect(tx).to.emit(f.primeV2, "InterestClaimed");
  });

  it("should return zero when non-holder has no accrued interest", async () => {
    const user2Address = await f.user2.getAddress();

    const rewards = await f.primeV2.getPendingRewardsStatic(user2Address);
    expect(rewards[0].amount).to.equal(0);
  });

  it("should revert claimInterest for unsupported market", async () => {
    const fakeMarket = ethers.Wallet.createRandom().address;
    await expect(f.primeV2.connect(f.user1)["claimInterest(address)"](fakeMarket)).to.be.revertedWithCustomError(
      f.primeV2,
      "MarketNotSupported",
    );
  });

  it("should revert claimInterest when paused", async () => {
    await f.primeV2.pause();

    await expect(f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address)).to.be.revertedWith(
      "Pausable: paused",
    );
  });

  it("should allow burned user to claim residual accrued interest", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestBefore.accrued).to.be.gt(0);

    await f.primeV2.burn(user1Address);
    expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.false;

    const interestAfterBurn = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestAfterBurn.accrued).to.be.gt(0);

    f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
    f.underlyingToken.transfer.returns(true);

    await expect(f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address)).to.emit(
      f.primeV2,
      "InterestClaimed",
    );
  });

  it("should allow claiming residual accrued interest after market removal", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestBefore.accrued).to.be.gt(0);

    await f.primeV2.burn(user1Address);
    expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.false;

    const interestAfterBurn = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestAfterBurn.accrued).to.be.gt(0);

    await f.primeV2.removeMarket(f.vToken.address);

    const market = await f.primeV2.markets(f.vToken.address);
    expect(market.exists).to.equal(false);

    f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
    f.underlyingToken.transfer.returns(true);

    await expect(f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address)).to.emit(
      f.primeV2,
      "InterestClaimed",
    );

    const interestAfterClaim = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestAfterClaim.accrued).to.equal(0);
  });

  it("should revert claimInterest on removed market when user has no accrued interest", async () => {
    await f.primeV2.burn(user1Address);
    await f.primeV2.removeMarket(f.vToken.address);

    await expect(f.primeV2.connect(f.user2)["claimInterest(address)"](f.vToken.address)).to.be.revertedWithCustomError(
      f.primeV2,
      "MarketNotSupported",
    );

    const fakeMarket = ethers.Wallet.createRandom().address;
    await expect(f.primeV2.connect(f.user2)["claimInterest(address)"](fakeMarket)).to.be.revertedWithCustomError(
      f.primeV2,
      "MarketNotSupported",
    );
  });

  it("should accrue interest and update score for a single market", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

    const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestBefore.accrued).to.equal(0);

    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestAfter.accrued).to.be.gt(0);
  });

  it("should accrue interest and update score across all markets", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

    await setBalance(f.primeLeaderboard.address, ethers.utils.parseEther("1"));
    await f.primeV2.connect(f.primeLeaderboard.wallet)["accrueInterestAndUpdateScore(address)"](user1Address);

    const interest = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interest.accrued).to.be.gt(0);
  });

  it("should revert OnlyPrimeLeaderboard when single-arg accrueInterestAndUpdateScore is called by non-leaderboard", async () => {
    await expect(
      f.primeV2.connect(f.user1)["accrueInterestAndUpdateScore(address)"](user1Address),
    ).to.be.revertedWithCustomError(f.primeV2, "OnlyPrimeLeaderboard");
  });

  it("should return pending rewards via getPendingRewardsStatic", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

    await f.primeV2.accrueInterest(f.vToken.address);

    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const interest = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interest.accrued).to.be.gt(0);

    const rewards = await f.primeV2.getPendingRewardsStatic(user1Address);
    expect(rewards.length).to.equal(1);
    expect(rewards[0].vToken).to.equal(f.vToken.address);
    expect(rewards[0].rewardToken).to.equal(f.underlyingAddress);
    expect(rewards[0].amount).to.be.gt(0);
  });

  describe("lifetimeAccrued tracking", () => {
    it("grows by the same delta as interests.accrued on accrual", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

      const before = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
      expect(before).to.equal(0);

      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

      const after = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(after.accrued).to.be.gt(0);
      expect(after.lifetimeAccrued).to.equal(after.accrued);
    });

    it("does not change when the user claims interest", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

      const lifetimeBefore = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
      expect(lifetimeBefore).to.be.gt(0);

      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);
      await f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);

      const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
      expect(interestAfter.accrued).to.equal(0);
      expect(interestAfter.lifetimeAccrued).to.equal(lifetimeBefore);
    });

    it("grows when claimInterest accrues a fresh delta without a prior accrueInterestAndUpdateScore", async () => {
      // Skip the explicit accrue-and-update step entirely; let _claimInterest do its own accrual.
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
      f.underlyingToken.transfer.returns(true);

      const before = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
      expect(before).to.equal(0);

      const tx = f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);
      await expect(tx).to.emit(f.primeV2, "InterestClaimed");

      const after = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
      expect(after).to.be.gt(0);
    });

    it("keeps growing across accrue → claim → accrue cycles (monotonic)", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);
      const afterFirst = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;

      f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(500, 18));
      f.underlyingToken.transfer.returns(true);
      await f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);

      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(250, 18));
      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

      const afterSecond = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
      expect(afterSecond).to.be.gt(afterFirst);
    });

    it("getLifetimeAccruedByMarket returns per-user values, zero for non-holders", async () => {
      const user2Address = await f.user2.getAddress();

      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

      const expected = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;

      const amounts = await f.primeV2.getLifetimeAccruedByMarket(f.vToken.address, [user1Address, user2Address]);
      expect(amounts.length).to.equal(2);
      expect(amounts[0]).to.equal(expected);
      expect(amounts[1]).to.equal(0);
    });

    it("getLifetimeAccruedByUser returns per-market values across single market input", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

      const expected = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;

      const amounts = await f.primeV2.getLifetimeAccruedByUser(user1Address, [f.vToken.address]);
      expect(amounts.length).to.equal(1);
      expect(amounts[0]).to.equal(expected);
    });

    it("batch getters return empty arrays for empty inputs", async () => {
      const byMarket = await f.primeV2.getLifetimeAccruedByMarket(f.vToken.address, []);
      const byUser = await f.primeV2.getLifetimeAccruedByUser(user1Address, []);
      expect(byMarket.length).to.equal(0);
      expect(byUser.length).to.equal(0);
    });
  });
});

describe("PrimeV2 - Undistributed reward sweep", () => {
  let f: PrimeV2Fixture;
  let adminAddress: string;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeV2Fixture);
    f.accessControlManager.isAllowedToCall.returns(true);
    f.comptroller.markets.returns(true);
    adminAddress = await f.admin.getAddress();
  });

  it("records distributionIncome into undistributedReward when sumOfMembersScore is zero", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(0);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));

    await f.primeV2.accrueInterest(f.vToken.address);

    const market = await f.primeV2.markets(f.vToken.address);
    expect(market.rewardIndex).to.equal(0);
    expect(await f.primeV2.unreleasedPLPIncome(f.underlyingAddress)).to.equal(convertToUnit(100, 18));
    expect(await f.primeV2.undistributedReward(f.underlyingAddress)).to.equal(convertToUnit(100, 18));
  });

  it("does not record into undistributedReward once a scored member exists", async () => {
    const user1Address = await f.user1.getAddress();

    f.primeLiquidityProvider.tokenAmountAccrued.returns(0);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

    f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);
    await f.primeV2["issue(address)"](user1Address);

    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
    await f.primeV2.accrueInterest(f.vToken.address);

    const market = await f.primeV2.markets(f.vToken.address);
    expect(market.rewardIndex).to.be.gt(0);
    expect(await f.primeV2.undistributedReward(f.underlyingAddress)).to.equal(0);
  });

  it("sweepUndistributed transfers the recorded slice when Prime has the balance locally", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(0);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
    await f.primeV2.accrueInterest(f.vToken.address);

    f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(100, 18));
    f.underlyingToken.transfer.returns(true);

    const tx = f.primeV2.sweepUndistributed(f.vToken.address, adminAddress);
    await expect(tx)
      .to.emit(f.primeV2, "UndistributedSwept")
      .withArgs(f.underlyingAddress, adminAddress, convertToUnit(100, 18));

    expect(await f.primeV2.undistributedReward(f.underlyingAddress)).to.equal(0);
    expect(f.underlyingToken.transfer).to.have.been.calledWith(adminAddress, convertToUnit(100, 18));
    expect(f.primeLiquidityProvider.releaseFunds).to.not.have.been.called;
  });

  it("sweepUndistributed pulls from PLP via releaseFunds when local balance is short", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(0);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
    await f.primeV2.accrueInterest(f.vToken.address);

    f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(0, 18));
    f.underlyingToken.transfer.returns(true);

    await f.primeV2.sweepUndistributed(f.vToken.address, adminAddress);

    expect(f.primeLiquidityProvider.releaseFunds).to.have.been.calledWith(f.underlyingAddress);
    expect(await f.primeV2.unreleasedPLPIncome(f.underlyingAddress)).to.equal(0);
    expect(await f.primeV2.undistributedReward(f.underlyingAddress)).to.equal(0);
  });

  it("sweepUndistributed is a no-op when undistributedReward is zero", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(0);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

    const tx = f.primeV2.sweepUndistributed(f.vToken.address, adminAddress);
    await expect(tx).to.not.emit(f.primeV2, "UndistributedSwept");
    expect(await f.primeV2.undistributedReward(f.underlyingAddress)).to.equal(0);
  });

  it("sweepUndistributed reverts on zero recipient", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(0);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

    await expect(
      f.primeV2.sweepUndistributed(f.vToken.address, ethers.constants.AddressZero),
    ).to.be.revertedWithCustomError(f.primeV2, "InvalidAddress");
  });
});
