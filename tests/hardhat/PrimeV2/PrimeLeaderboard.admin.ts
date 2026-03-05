import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { DAY, PrimeLeaderboardFixture, deployPrimeLeaderboardFixture } from "./helpers/primeLeaderboardFixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeLeaderboard - Admin Functions", () => {
  let f: PrimeLeaderboardFixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should update multiplier tiers", async () => {
    const newDurations = [15 * DAY, 30 * DAY, 45 * DAY];
    const newMultipliers = [convertToUnit("1.2", 18), convertToUnit("1.5", 18), convertToUnit("1.8", 18)];

    await expect(f.primeLeaderboard.setMultiplierTiers(newDurations, newMultipliers)).to.emit(
      f.primeLeaderboard,
      "MultiplierTiersUpdated",
    );

    const [durations, multipliers] = await f.primeLeaderboard.getMultiplierTiers();
    expect(durations[0]).to.equal(newDurations[0]);
    expect(durations[1]).to.equal(newDurations[1]);
    expect(durations[2]).to.equal(newDurations[2]);
    expect(multipliers[0]).to.equal(newMultipliers[0]);
    expect(multipliers[1]).to.equal(newMultipliers[1]);
    expect(multipliers[2]).to.equal(newMultipliers[2]);
  });

  it("should revert on invalid multiplier tiers (non-ascending durations)", async () => {
    const invalidDurations = [30 * DAY, 20 * DAY];
    const multipliers = [convertToUnit("1.2", 18), convertToUnit("1.5", 18)];

    await expect(f.primeLeaderboard.setMultiplierTiers(invalidDurations, multipliers)).to.be.revertedWithCustomError(
      f.primeLeaderboard,
      "InvalidMultiplierTiers",
    );
  });

  it("should revert on invalid multiplier tiers (non-ascending multipliers)", async () => {
    const durations = [30 * DAY, 60 * DAY];
    const invalidMultipliers = [convertToUnit("1.5", 18), convertToUnit("1.2", 18)];

    await expect(f.primeLeaderboard.setMultiplierTiers(durations, invalidMultipliers)).to.be.revertedWithCustomError(
      f.primeLeaderboard,
      "InvalidMultiplierTiers",
    );
  });

  it("should revert on empty multiplier tiers", async () => {
    await expect(f.primeLeaderboard.setMultiplierTiers([], [])).to.be.revertedWithCustomError(
      f.primeLeaderboard,
      "InvalidValue",
    );
  });

  it("should revert on mismatched array lengths", async () => {
    await expect(
      f.primeLeaderboard.setMultiplierTiers([30 * DAY], [convertToUnit("1.2", 18), convertToUnit("1.5", 18)]),
    ).to.be.revertedWithCustomError(f.primeLeaderboard, "LengthMismatch");
  });

  it("should revert on multiplier below base (1.0x)", async () => {
    await expect(
      f.primeLeaderboard.setMultiplierTiers([30 * DAY], [convertToUnit("0.5", 18)]),
    ).to.be.revertedWithCustomError(f.primeLeaderboard, "InvalidMultiplierTiers");
  });

  it("should set PrimeV2 address", async () => {
    const primeV2Address = await f.user1.getAddress();

    await expect(f.primeLeaderboard.setPrimeV2(primeV2Address))
      .to.emit(f.primeLeaderboard, "PrimeV2Set")
      .withArgs(ethers.constants.AddressZero, primeV2Address);

    expect(await f.primeLeaderboard.primeV2()).to.equal(primeV2Address);
  });

  it("should revert when setting zero PrimeV2 address", async () => {
    await expect(f.primeLeaderboard.setPrimeV2(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
      f.primeLeaderboard,
      "ZeroAddress",
    );
  });
});

describe("PrimeLeaderboard - Access Control", () => {
  let f: PrimeLeaderboardFixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should revert admin functions when access denied", async () => {
    f.accessControlManager.isAllowedToCall.returns(false);

    await expect(f.primeLeaderboard.setMultiplierTiers([30 * DAY], [convertToUnit("1.3", 18)])).to.be.reverted;
    await expect(f.primeLeaderboard.setPrimeV2(await f.user1.getAddress())).to.be.reverted;
  });
});

describe("PrimeLeaderboard - Staker Initialization", () => {
  let f: PrimeLeaderboardFixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should seed staker data in batches", async () => {
    const user1Address = await f.user1.getAddress();
    const user2Address = await f.user2.getAddress();

    const amounts = [convertToUnit(1000, 18), convertToUnit(2000, 18)];
    const timestamps = [1700000000, 1700100000];

    await f.primeLeaderboard.initializeStakers([user1Address, user2Address], amounts, timestamps);

    expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(amounts[0]);
    expect(await f.primeLeaderboard.totalStaked(user2Address)).to.equal(amounts[1]);
    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
    expect(await f.primeLeaderboard.getDepositCount(user2Address)).to.equal(1);
  });

  it("should be idempotent (skip already seeded users)", async () => {
    const user1Address = await f.user1.getAddress();

    await f.primeLeaderboard.initializeStakers([user1Address], [convertToUnit(1000, 18)], [1700000000]);

    await f.primeLeaderboard.initializeStakers([user1Address], [convertToUnit(5000, 18)], [1700200000]);

    expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(1000, 18));
    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
  });

  it("should revert after finalization", async () => {
    await f.primeLeaderboard.finalizeInitialization();

    await expect(
      f.primeLeaderboard.initializeStakers([await f.user1.getAddress()], [convertToUnit(1000, 18)], [1700000000]),
    ).to.be.revertedWithCustomError(f.primeLeaderboard, "StakersAlreadyInitialized");
  });

  it("should revert finalizeInitialization if already finalized", async () => {
    await f.primeLeaderboard.finalizeInitialization();

    await expect(f.primeLeaderboard.finalizeInitialization()).to.be.revertedWithCustomError(
      f.primeLeaderboard,
      "StakersAlreadyInitialized",
    );
  });

  it("should revert with mismatched array lengths", async () => {
    await expect(
      f.primeLeaderboard.initializeStakers(
        [await f.user1.getAddress()],
        [convertToUnit(1000, 18), convertToUnit(2000, 18)],
        [1700000000],
      ),
    ).to.be.revertedWithCustomError(f.primeLeaderboard, "LengthMismatch");
  });

  it("should revert when caller not authorized", async () => {
    f.accessControlManager.isAllowedToCall.returns(false);

    await expect(
      f.primeLeaderboard.initializeStakers([await f.user1.getAddress()], [convertToUnit(1000, 18)], [1700000000]),
    ).to.be.reverted;
  });
});
