import { smock } from "@defi-wonderland/smock";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  DAY,
  PrimeLeaderboardFixture,
  deployPrimeLeaderboardFixture,
  simulateDeposit,
  simulateWithdrawal,
} from "./helpers/primeLeaderboardFixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeLeaderboard - Deposit Recording via xvsUpdated", () => {
  let f: PrimeLeaderboardFixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
  });

  it("should record deposit correctly", async () => {
    const user1Address = await f.user1.getAddress();
    const amount = convertToUnit(1000, 18);

    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([amount, 0, 0]);
    await expect(f.primeLeaderboard.connect(f.xvsVault.wallet).xvsUpdated(user1Address)).to.emit(
      f.primeLeaderboard,
      "DepositRecorded",
    );

    expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(amount);
    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
  });

  it("should revert xvsUpdated with zero address", async () => {
    await expect(
      f.primeLeaderboard.connect(f.xvsVault.wallet).xvsUpdated(ethers.constants.AddressZero),
    ).to.be.revertedWithCustomError(f.primeLeaderboard, "ZeroAddress");
  });

  it("should be no-op when vault balance unchanged", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1000, 18));
    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(1);

    await f.primeLeaderboard.connect(f.xvsVault.wallet).xvsUpdated(user1Address);
    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
    expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(1000, 18));
  });

  it("should track multiple deposits for a user", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(500, 18));
    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(800, 18));

    expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(800, 18));
    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(2);
  });

  it("should only allow xvsVault to call xvsUpdated", async () => {
    const user1Address = await f.user1.getAddress();

    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);
    await expect(f.primeLeaderboard.connect(f.user2).xvsUpdated(user1Address)).to.be.revertedWithCustomError(
      f.primeLeaderboard,
      "OnlyXVSVaultAllowed",
    );
  });

  it("should return deposits via getDeposits view function", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(500, 18));
    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(800, 18));

    const deposits = await f.primeLeaderboard.getDeposits(user1Address);
    expect(deposits.length).to.equal(2);
    expect(deposits[0].amount).to.equal(convertToUnit(500, 18));
    expect(deposits[1].amount).to.equal(convertToUnit(300, 18));
  });

  it("should return total staked via getTotalStaked view function", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(1000, 18));
    expect(await f.primeLeaderboard.getTotalStaked(user1Address)).to.equal(convertToUnit(1000, 18));
  });
});

describe("PrimeLeaderboard - Withdrawal Recording (LIFO)", () => {
  let f: PrimeLeaderboardFixture;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeLeaderboardFixture);
    f.accessControlManager.isAllowedToCall.returns(true);

    const user1Address = await f.user1.getAddress();
    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(500, 18));
    await time.increase(10 * DAY);
    await simulateDeposit(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(800, 18));
  });

  it("should process withdrawal using LIFO order", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateWithdrawal(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(600, 18));

    expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(600, 18));
    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(2);
  });

  it("should fully consume newest deposit first", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateWithdrawal(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, convertToUnit(400, 18));

    expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(convertToUnit(400, 18));
    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(1);
  });

  it("should emit WithdrawalRecorded event", async () => {
    const user1Address = await f.user1.getAddress();

    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(600, 18), 0, 0]);
    await expect(f.primeLeaderboard.connect(f.xvsVault.wallet).xvsUpdated(user1Address)).to.emit(
      f.primeLeaderboard,
      "WithdrawalRecorded",
    );
  });

  it("should handle full withdrawal to zero", async () => {
    const user1Address = await f.user1.getAddress();

    await simulateWithdrawal(f.primeLeaderboard, f.xvsVault, f.xvsAddress, user1Address, "0");

    expect(await f.primeLeaderboard.totalStaked(user1Address)).to.equal(0);
    expect(await f.primeLeaderboard.getDepositCount(user1Address)).to.equal(0);
  });
});
