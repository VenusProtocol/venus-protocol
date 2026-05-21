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
} from "./helpers/primeLeaderboardFixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeLeaderboard - Deposit Compaction", () => {
  let f: PrimeLeaderboardFixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should compact deposits when reaching MAX_DEPOSITS_PER_USER (30)", async () => {
    const user1Address = await f.user1.getAddress();

    for (let i = 1; i <= 30; i++) {
      await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(i * 10, 18));
    }

    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(30);

    await time.increase(91 * DAY);

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(310, 18));

    const countAfter = await f.primeLeaderboard.getDepositCount(user1Address);
    expect(countAfter).to.equal(2);

    expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(310, 18));
  });

  it("should reduce deposit count after compaction", async () => {
    const user1Address = await f.user1.getAddress();

    for (let i = 1; i <= 30; i++) {
      await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(i * 10, 18));
    }

    await time.increase(91 * DAY);

    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(310, 18), 0, 0]);

    const countBefore = await f.primeLeaderboard.getDepositCount(user1Address);
    await f.primeLeaderboard.connect(f.xvsVault.wallet).xvsUpdated(user1Address);
    const countAfter = await f.primeLeaderboard.getDepositCount(user1Address);

    expect(countAfter.lt(countBefore)).to.be.true;
  });

  it("should preserve effective stake after compaction", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(500, 18));
    await time.increase(91 * DAY);

    const stakeBefore = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expectApprox(stakeBefore, convertToUnit(7_776_000_000, 18));

    for (let i = 1; i <= 29; i++) {
      await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(500 + i, 18));
    }

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(530, 18));

    const stakeAfter = await f.primeLeaderboard.getEffectiveStake(user1Address);
    expect(stakeAfter.gte(stakeBefore)).to.be.true;
  });

  it("should fall back to tier-based compaction when all deposits are under max tier", async () => {
    const user1Address = await f.user1.getAddress();

    for (let i = 1; i <= 30; i++) {
      await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(i * 10, 18));
    }

    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(30);

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(310, 18));

    const countAfter = await f.primeLeaderboard.getDepositCount(user1Address);
    expect(countAfter).to.equal(2);

    expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(310, 18));
  });

  it("should compact into at most N+1 deposits where N = number of configured tiers", async () => {
    const user1Address = await f.user1.getAddress();

    for (let i = 1; i <= 10; i++) {
      await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(i * 10, 18));
    }
    await time.increase(60 * DAY);

    for (let i = 11; i <= 20; i++) {
      await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(i * 10, 18));
    }
    await time.increase(30 * DAY);

    for (let i = 21; i <= 30; i++) {
      await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(i * 10, 18));
    }

    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(30);

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(310, 18));

    const countAfter = await f.primeLeaderboard.getDepositCount(user1Address);
    expect(countAfter).to.be.lte(22);
    expect(countAfter).to.be.lt(30);
  });

  it("should handle tier-based fallback with deposits spread across all sub-max tiers", async () => {
    const user1Address = await f.user1.getAddress();

    for (let i = 1; i <= 15; i++) {
      await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(i * 10, 18));
    }
    await time.increase(30 * DAY);

    for (let i = 16; i <= 30; i++) {
      await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(i * 10, 18));
    }

    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(30);

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(310, 18));

    const countAfter = await f.primeLeaderboard.getDepositCount(user1Address);
    expect(countAfter).to.be.lte(5);
    expect(countAfter).to.be.lt(30);
  });
});

describe("PrimeLeaderboard - Weighted Average Timestamp Compaction", () => {
  let f: PrimeLeaderboardFixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should use amount-weighted timestamp, not earliest, when Pass 1 merges max-tier deposits", async () => {
    const user1Address = await f.user1.getAddress();
    const { ethers: ethersLib } = await import("hardhat");

    // Setup: 31 deposits, each 91 days apart, equal incremental amount.
    // At the time of compaction (triggered by the 31st), all 30 prior deposits
    // sit at >= 90d (max-tier duration), so Pass 1 merges them all. The
    // merged-entry timestamp must be the amount-weighted average of
    // constituents, not the earliest.
    const perDeposit = 100;
    const spacing = 91 * DAY;

    const firstDepositBlock = await ethersLib.provider.getBlock("latest");
    const t0 = firstDepositBlock.timestamp;

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(perDeposit, 18));

    for (let i = 2; i <= 30; i++) {
      await time.increase(spacing);
      await simulateDeposit(
        f.primeLeaderboard,
        f.xvsVault,
        f.xvsAddress,
        user1Address,
        convertToUnit(perDeposit * i, 18),
      );
    }

    // 31st deposit triggers compaction.
    await time.increase(spacing);
    await simulateDeposit(
      f.primeLeaderboard,
      f.xvsVault,
      f.xvsAddress,
      user1Address,
      convertToUnit(perDeposit * 31, 18),
    );

    const deposits = await f.primeLeaderboard.getDeposits(user1Address);
    expect(deposits.length).to.be.lessThan(30);

    const mergedTimestamp = deposits[0].timestamp.toNumber();

    // Earliest timestamp would be ~t0. Amount-weighted average across all 30
    // equal-sized deposits placed 91 days apart should land ~14.5 * 91 days
    // past t0. Assert at least 100 days past t0 to confirm we're not on the
    // earliest-timestamp path.
    expect(mergedTimestamp).to.be.greaterThan(t0 + 100 * DAY);
  });

  it("should use weighted average timestamp, not earliest, when compacting by tier", async () => {
    const user1Address = await f.user1.getAddress();
    const { ethers: ethersLib } = await import("hardhat");

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1, 18));

    await time.increase(29 * DAY);

    for (let i = 2; i <= 30; i++) {
      await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(i, 18));
    }

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(10465, 18));

    const deposits = await f.primeLeaderboard.getDeposits(user1Address);
    expect(deposits.length).to.equal(2);

    const mergedTimestamp = deposits[0].timestamp;
    const currentBlock = await ethersLib.provider.getBlock("latest");
    const currentTime = currentBlock.timestamp;

    const timeDiff = currentTime - mergedTimestamp.toNumber();
    expect(timeDiff).to.be.lt(2 * DAY);
  });
});
