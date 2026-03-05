import { smock } from "@defi-wonderland/smock";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";

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

describe("PrimeLeaderboard - Scenario: Large deposit-then-immediate-withdrawal", () => {
  let f: PrimeLeaderboardFixture;

  const ONE_MILLION_XVS = convertToUnit(1_000_000, 18);

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should immediately drop effective stake to zero after full withdrawal", async () => {
    const user1Address = await f.user1.getAddress();
    const user2Address = await f.user2.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, ONE_MILLION_XVS);
    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user2Address, convertToUnit(500_000, 18));

    await time.increase(1 * DAY);

    expectApprox(await f.primeLeaderboard.getEffectiveStake(user1Address), convertToUnit(86_400_000_000, 18));

    await simulateWithdrawal(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, "0");

    expect(await f.primeLeaderboard.getEffectiveStake(user1Address)).to.equal(0);
    expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(0);

    expectApprox(await f.primeLeaderboard.getEffectiveStake(user2Address), convertToUnit(43_200_000_000, 18));
  });

  it("should show getEffectiveStakeBatch() returns zero for withdrawn user (no phantom eligibility)", async () => {
    const user1Address = await f.user1.getAddress();
    const user2Address = await f.user2.getAddress();
    const user3Address = await f.user3.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, ONE_MILLION_XVS);
    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user2Address, convertToUnit(800_000, 18));
    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user3Address, convertToUnit(600_000, 18));

    await time.increase(1 * DAY);
    await simulateWithdrawal(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, "0");

    const allUsers = [user1Address, user2Address, user3Address];

    // Day 5
    await time.increase(3 * DAY);
    let scores = await f.primeLeaderboard.getEffectiveStakeBatch(allUsers);

    expect(scores[0]).to.equal(0);
    expectApprox(scores[1], convertToUnit(276_480_000_000, 18));
    expectApprox(scores[2], convertToUnit(207_360_000_000, 18));

    // Day 15
    await time.increase(10 * DAY);
    scores = await f.primeLeaderboard.getEffectiveStakeBatch(allUsers);

    expect(scores[0]).to.equal(0);
    expectApprox(scores[1], convertToUnit(967_680_000_000, 18));
    expectApprox(scores[2], convertToUnit(725_760_000_000, 18));

    // Day 30
    await time.increase(16 * DAY);
    scores = await f.primeLeaderboard.getEffectiveStakeBatch(allUsers);

    expect(scores[0]).to.equal(0);
    expectApprox(scores[1], convertToUnit(2_695_680_000_000, 18));
    expectApprox(scores[2], convertToUnit(2_021_760_000_000, 18));
  });

  it("should correctly handle partial withdrawal with 24-hour backend updates", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1000, 18));

    await time.increase(35 * DAY);

    expectApprox(await f.primeLeaderboard.getEffectiveStake(user1Address), convertToUnit(3_931_200_000, 18));

    await simulateWithdrawal(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(900, 18));

    expectApprox(await f.primeLeaderboard.getEffectiveStake(user1Address), convertToUnit(3_538_080_000, 18));

    // Day 36
    await time.increase(1 * DAY);

    expectApprox(await f.primeLeaderboard.getEffectiveStake(user1Address), convertToUnit(3_639_168_000, 18));
  });

  it("should show the complete 30-day lifecycle with backend-driven leaderboard", async () => {
    const user1Address = await f.user1.getAddress();
    const user2Address = await f.user2.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, ONE_MILLION_XVS);
    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user2Address, convertToUnit(500_000, 18));

    await time.increase(1 * DAY);
    await simulateWithdrawal(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, "0");

    const user1Scores: string[] = [];
    const user2Scores: string[] = [];

    // Day 2
    user1Scores.push((await f.primeLeaderboard.getEffectiveStake(user1Address)).toString());
    user2Scores.push((await f.primeLeaderboard.getEffectiveStake(user2Address)).toString());

    // Day 10
    await time.increase(8 * DAY);
    user1Scores.push((await f.primeLeaderboard.getEffectiveStake(user1Address)).toString());
    user2Scores.push((await f.primeLeaderboard.getEffectiveStake(user2Address)).toString());

    // Day 20
    await time.increase(10 * DAY);
    user1Scores.push((await f.primeLeaderboard.getEffectiveStake(user1Address)).toString());
    user2Scores.push((await f.primeLeaderboard.getEffectiveStake(user2Address)).toString());

    // Day 30
    await time.increase(10 * DAY);
    user1Scores.push((await f.primeLeaderboard.getEffectiveStake(user1Address)).toString());
    user2Scores.push((await f.primeLeaderboard.getEffectiveStake(user2Address)).toString());

    for (const score of user1Scores) {
      expect(score).to.equal("0");
    }

    for (let i = 1; i < user2Scores.length; i++) {
      expect(ethers.BigNumber.from(user2Scores[i])).to.be.gt(ethers.BigNumber.from(user2Scores[i - 1]));
    }
  });
});
