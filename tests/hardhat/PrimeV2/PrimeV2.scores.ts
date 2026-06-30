import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";

import { convertToUnit } from "../../../helpers/utils";
import { PrimeV2Fixture, deployPrimeV2Fixture } from "./helpers/primeV2Fixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeV2 - Score Updates", () => {
  let f: PrimeV2Fixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeV2Fixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should queue score updates when alpha changes", async () => {
    await f.primeV2.issueBatch([await f.user1.getAddress()]);

    const roundBefore = await f.primeV2.nextScoreUpdateRoundId();
    await f.primeV2.updateAlpha(2, 3);
    const roundAfter = await f.primeV2.nextScoreUpdateRoundId();

    expect(roundAfter).to.equal(roundBefore.add(1));
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);
  });

  it("should revert updateScores if no pending updates", async () => {
    await expect(f.primeV2.updateScores([await f.user1.getAddress()])).to.be.revertedWithCustomError(
      f.primeV2,
      "NoScoreUpdatesRequired",
    );
  });

  it("should revert issue (single) when pendingScoreUpdates > 0", async () => {
    const user1Address = await f.user1.getAddress();
    const user2Address = await f.user2.getAddress();

    await f.primeV2["issue(address)"](user1Address);

    f.comptroller.markets.returns(true);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);

    await expect(f.primeV2["issue(address)"](user2Address)).to.be.revertedWithCustomError(
      f.primeV2,
      "ScoreUpdateInProgress",
    );
  });

  it("should revert issueBatch when pendingScoreUpdates > 0", async () => {
    const user1Address = await f.user1.getAddress();
    const user2Address = await f.user2.getAddress();

    await f.primeV2.issueBatch([user1Address]);

    f.comptroller.markets.returns(true);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);

    await expect(f.primeV2.issueBatch([user2Address])).to.be.revertedWithCustomError(
      f.primeV2,
      "ScoreUpdateInProgress",
    );
  });

  it("should revert burn when pendingScoreUpdates > 0", async () => {
    const user1Address = await f.user1.getAddress();

    await f.primeV2.issueBatch([user1Address]);

    f.comptroller.markets.returns(true);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);

    await expect(f.primeV2.burn(user1Address)).to.be.revertedWithCustomError(f.primeV2, "ScoreUpdateInProgress");
  });

  it("should revert burnBatch when pendingScoreUpdates > 0", async () => {
    const user1Address = await f.user1.getAddress();

    await f.primeV2.issueBatch([user1Address]);

    f.comptroller.markets.returns(true);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);

    await expect(f.primeV2.burnBatch([user1Address])).to.be.revertedWithCustomError(f.primeV2, "ScoreUpdateInProgress");
  });

  it("should complete a score update round", async () => {
    const user1Address = await f.user1.getAddress();
    const user2Address = await f.user2.getAddress();

    f.comptroller.markets.returns(true);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

    f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
    f.vToken.balanceOf.whenCalledWith(user2Address).returns(convertToUnit(500, 18));
    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);
    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user2Address).returns([convertToUnit(1000, 18), 0, 0]);

    await f.primeV2.issueBatch([user1Address, user2Address]);

    await f.primeV2.updateAlpha(2, 3);
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(2);

    await f.primeV2.updateScores([user1Address, user2Address]);
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(0);
  });

  it("should skip non-holders in updateScores", async () => {
    const user1Address = await f.user1.getAddress();
    const user2Address = await f.user2.getAddress();

    await f.primeV2["issue(address)"](user1Address);

    f.comptroller.markets.returns(true);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);

    await f.primeV2.updateScores([user2Address]);
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);

    await f.primeV2.updateScores([user1Address]);
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(0);
  });

  it("should skip already-updated users in the same round", async () => {
    const user1Address = await f.user1.getAddress();

    await f.primeV2["issue(address)"](user1Address);

    f.comptroller.markets.returns(true);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);

    await f.primeV2.updateScores([user1Address]);
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(0);

    await f.primeV2.updateAlpha(2, 3);
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);

    await f.primeV2.updateScores([user1Address]);
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(0);
  });

  it("should emit IncompleteRoundDiscarded when a new round starts before completion", async () => {
    const user1Address = await f.user1.getAddress();
    const user2Address = await f.user2.getAddress();

    f.comptroller.markets.returns(true);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));
    await f.primeV2.issueBatch([user1Address, user2Address]);

    await f.primeV2.updateAlpha(2, 3);
    const roundId = await f.primeV2.nextScoreUpdateRoundId();
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(2);

    await f.primeV2.updateScores([user1Address]);
    expect(await f.primeV2.pendingScoreUpdates()).to.equal(1);

    await expect(f.primeV2.updateMultipliers(f.vToken.address, convertToUnit(3, 18), convertToUnit(3, 18)))
      .to.emit(f.primeV2, "IncompleteRoundDiscarded")
      .withArgs(roundId, 1);
  });

  it("should update score values after updateScores", async () => {
    const user1Address = await f.user1.getAddress();

    f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

    f.comptroller.markets.returns(true);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

    f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(500, 18));
    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(2000, 18), 0, 0]);

    await f.primeV2["issue(address)"](user1Address);

    const interestBefore = await f.primeV2.interests(f.vToken.address, user1Address);
    const scoreBefore = interestBefore.score;
    expect(scoreBefore).to.be.gt(0);

    await f.primeV2.updateAlpha(1, 3);

    await f.primeV2.updateScores([user1Address]);

    const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestAfter.score).to.not.equal(scoreBefore);
  });
});
