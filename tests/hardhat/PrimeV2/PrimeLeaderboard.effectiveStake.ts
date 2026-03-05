import { smock } from "@defi-wonderland/smock";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";

import { convertToUnit } from "../../../helpers/utils";
import {
  DAY,
  PrimeLeaderboardFixture,
  deployPrimeLeaderboardFixture,
  expectApprox,
  simulateDeposit,
  simulateWithdrawal,
} from "./helpers/primeLeaderboardFixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeLeaderboard - Effective Stake Calculation", () => {
  let f: PrimeLeaderboardFixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should return zero for brand-new deposits (holdDays = 0)", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1000, 18));

    const effectiveStake = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expect(effectiveStake).to.equal(0);
  });

  it("should calculate base multiplier (1.0x) for deposits < 30 days", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1000, 18));
    await time.increase(10 * DAY);

    const effectiveStake = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expect(effectiveStake).to.equal(convertToUnit(864_000_000, 18));
  });

  it("should calculate 1.3x multiplier for deposits 30-60 days", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1000, 18));
    await time.increase(35 * DAY);

    const effectiveStake = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expect(effectiveStake).to.equal(convertToUnit(3_931_200_000, 18));
  });

  it("should calculate 1.6x multiplier for deposits 60-90 days", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1000, 18));
    await time.increase(65 * DAY);

    const effectiveStake = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expect(effectiveStake).to.equal(convertToUnit(8_985_600_000, 18));
  });

  it("should calculate 2.0x multiplier for deposits 90+ days (capped at 90d)", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1000, 18));
    await time.increase(95 * DAY);

    const effectiveStake = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expect(effectiveStake).to.equal(convertToUnit(15_552_000_000, 18));
  });

  it("should remain capped at 90 days for very long hold periods", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1000, 18));
    await time.increase(180 * DAY);

    const effectiveStake = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expect(effectiveStake).to.equal(convertToUnit(15_552_000_000, 18));
  });

  it("should sum effective stake across multiple deposits with different ages", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(500, 18));
    await time.increase(45 * DAY);

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(800, 18));
    await time.increase(10 * DAY);

    const effectiveStake = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expectApprox(effectiveStake, convertToUnit(3_348_000_000, 18));
  });

  it("should reduce effective stake after partial withdrawal", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1000, 18));
    await time.increase(35 * DAY);

    const stakeBefore = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expectApprox(stakeBefore, convertToUnit(3_931_200_000, 18));

    await simulateWithdrawal(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(500, 18));

    const stakeAfter = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expectApprox(stakeAfter, convertToUnit(1_965_600_000, 18));
  });

  it("should return zero effective stake after full withdrawal", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1000, 18));
    await time.increase(35 * DAY);

    await simulateWithdrawal(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, "0");

    const stakeAfter = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expect(stakeAfter).to.equal(0);
  });
});

describe("PrimeLeaderboard - Multiplier Tiers", () => {
  let f: PrimeLeaderboardFixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should return correct multiplier for exact thresholds", async () => {
    expect(await f.primeLeaderboard.getMultiplier(30 * DAY)).to.equal(convertToUnit("1.3", 18));
    expect(await f.primeLeaderboard.getMultiplier(60 * DAY)).to.equal(convertToUnit("1.6", 18));
    expect(await f.primeLeaderboard.getMultiplier(90 * DAY)).to.equal(convertToUnit("2", 18));
  });

  it("should return base multiplier for < 30 days", async () => {
    expect(await f.primeLeaderboard.getMultiplier(29 * DAY)).to.equal(convertToUnit("1", 18));
    expect(await f.primeLeaderboard.getMultiplier(0)).to.equal(convertToUnit("1", 18));
  });

  it("should return highest applicable multiplier for durations beyond max tier", async () => {
    expect(await f.primeLeaderboard.getMultiplier(120 * DAY)).to.equal(convertToUnit("2", 18));
  });
});

describe("PrimeLeaderboard - Batch Score Queries", () => {
  let f: PrimeLeaderboardFixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should return correct scores for multiple users", async () => {
    const user1Address = await f.user1.getAddress();
    const user2Address = await f.user2.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(10000, 18));
    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user2Address, convertToUnit(5000, 18));

    await time.increase(45 * DAY);

    const scores = await f.primeLeaderboard.getEffectiveStakeBatch([user1Address, user2Address]);
    expectApprox(scores[0], convertToUnit(50_544_000_000, 18));
    expectApprox(scores[1], convertToUnit(25_272_000_000, 18));
  });
});
