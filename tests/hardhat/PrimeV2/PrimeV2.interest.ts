import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";

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
    const fakeMarket = (await import("ethers")).ethers.Wallet.createRandom().address;
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
    const fakeMarket = (await import("ethers")).ethers.Wallet.createRandom().address;
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
    // Step 1: Accrue some interest so user has accrued balance
    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestBefore.accrued).to.be.gt(0);

    // Step 2: Burn user (score drops to 0, accrued preserved)
    await f.primeV2.burn(user1Address);
    expect(await f.primeV2.isUserPrimeHolder(user1Address)).to.be.false;

    const interestAfterBurn = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestAfterBurn.accrued).to.be.gt(0);

    // Step 3: Complete score update round so removeMarket doesn't conflict
    const pendingUpdates = await f.primeV2.pendingScoreUpdates();
    if (pendingUpdates.gt(0)) {
      // No holders left, just need to clear the round via updateScores with empty
      // Since there are 0 holders now, queue will be 0 after burn reduced totalTokens
    }

    // Step 4: Remove market (succeeds because sumOfMembersScore == 0)
    await f.primeV2.removeMarket(f.vToken.address);

    const market = await f.primeV2.markets(f.vToken.address);
    expect(market.exists).to.equal(false);

    // Step 5: User can still claim residual accrued interest
    f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
    f.underlyingToken.transfer.returns(true);

    await expect(f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address)).to.emit(
      f.primeV2,
      "InterestClaimed",
    );

    // Step 6: After claiming, accrued should be zero
    const interestAfterClaim = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestAfterClaim.accrued).to.equal(0);
  });

  it("should revert claimInterest on removed market when user has no accrued interest", async () => {

    // Remove market (no members, so sumOfMembersScore == 0 after burn)
    await f.primeV2.burn(user1Address);
    await f.primeV2.removeMarket(f.vToken.address);

    // user2 never had any interest — should revert
    await expect(
      f.primeV2.connect(f.user2)["claimInterest(address)"](f.vToken.address),
    ).to.be.revertedWithCustomError(f.primeV2, "MarketNotSupported");

    // Random address should also revert
    const fakeMarket = (await import("ethers")).ethers.Wallet.createRandom().address;
    await expect(
      f.primeV2.connect(f.user2)["claimInterest(address)"](fakeMarket),
    ).to.be.revertedWithCustomError(f.primeV2, "MarketNotSupported");
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

    await f.primeV2["accrueInterestAndUpdateScore(address)"](user1Address);

    const interest = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interest.accrued).to.be.gt(0);
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
});
