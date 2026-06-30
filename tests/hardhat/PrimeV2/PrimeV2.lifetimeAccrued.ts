import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";

import { convertToUnit } from "../../../helpers/utils";
import { PrimeV2Fixture, deployPrimeV2Fixture } from "./helpers/primeV2Fixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeV2 - Lifetime Accrued Tracking (extended)", () => {
  let f: PrimeV2Fixture;
  let user1Address: string;
  let user2Address: string;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeV2Fixture);
    f.accessControlManager.isAllowedToCall.returns(true);

    user1Address = await f.user1.getAddress();
    user2Address = await f.user2.getAddress();

    f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

    f.comptroller.markets.returns(true);
    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

    f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);

    await f.primeV2["issue(address)"](user1Address);
  });

  // ═══════════════════ BASELINE ═══════════════════

  it("should start at zero for a freshly issued holder", async () => {
    const interest = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interest.lifetimeAccrued).to.equal(0);
  });

  it("should start at zero for an address that has never been a Prime holder", async () => {
    const interest = await f.primeV2.interests(f.vToken.address, user2Address);
    expect(interest.lifetimeAccrued).to.equal(0);
  });

  // ═══════════════════ MONOTONICITY (extra) ═══════════════════

  it("should not increase when no fresh delta exists (idempotent checkpoint)", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const lifetimeBefore = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;

    // Re-call with no new PLP income — delta is 0
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const lifetimeAfter = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
    expect(lifetimeAfter).to.equal(lifetimeBefore);
  });

  // ═══════════════════ BURN / RE-ISSUE LIFECYCLE ═══════════════════

  it("should preserve lifetimeAccrued after burn", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const lifetimeBefore = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
    expect(lifetimeBefore).to.be.gt(0);

    await f.primeV2.burn(user1Address);

    const interestAfter = await f.primeV2.interests(f.vToken.address, user1Address);
    expect(interestAfter.score).to.equal(0);
    expect(interestAfter.rewardIndex).to.equal(0);
    expect(interestAfter.lifetimeAccrued).to.equal(lifetimeBefore);
  });

  it("should continue accumulating lifetimeAccrued after burn → re-issue", async () => {
    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const lifetimeBeforeBurn = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;

    await f.primeV2.burn(user1Address);
    await f.primeV2["issue(address)"](user1Address);

    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(300, 18));
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const lifetimeAfter = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
    expect(lifetimeAfter).to.be.gt(lifetimeBeforeBurn);
  });

  // ═══════════════════ CYCLE-DELTA MATH ═══════════════════

  it("should support cycle-delta arithmetic across snapshots", async () => {
    const cycleStartLifetime = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
    expect(cycleStartLifetime).to.equal(0);

    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const midCycle = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
    expect(midCycle.sub(cycleStartLifetime)).to.equal(midCycle);

    // User claims mid-cycle; lifetime must not change
    f.underlyingToken.balanceOf.whenCalledWith(f.primeV2.address).returns(convertToUnit(200, 18));
    f.underlyingToken.transfer.returns(true);
    await f.primeV2.connect(f.user1)["claimInterest(address)"](f.vToken.address);

    const afterClaim = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
    expect(afterClaim).to.equal(midCycle);

    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(400, 18));
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const endCycle = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
    expect(endCycle.sub(cycleStartLifetime)).to.equal(endCycle);
    expect(endCycle).to.be.gt(midCycle);
  });

  it("should compute per-cycle delta correctly across two simulated cycles", async () => {
    const c1Start = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;

    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(150, 18));
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const c1End = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
    const cycle1Reward = c1End.sub(c1Start);

    const c2Start = c1End;

    f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(500, 18));
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

    const c2End = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
    const cycle2Reward = c2End.sub(c2Start);

    expect(cycle1Reward).to.be.gt(0);
    expect(cycle2Reward).to.be.gt(0);
    expect(c2End).to.equal(c1End.add(cycle2Reward));
  });

  // ═══════════════════ MULTI-MARKET ISOLATION ═══════════════════

  it("should track lifetimeAccrued per (market, user) independently", async () => {
    const vToken2 = await smock.fake("contracts/Tokens/Prime/Interfaces/IVToken.sol:IVToken");
    const underlying2 = await smock.fake(
      "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol:IERC20MetadataUpgradeable",
    );
    underlying2.decimals.returns(18);
    vToken2.underlying.returns(underlying2.address);
    vToken2.borrowBalanceStored.returns(0);
    vToken2.exchangeRateStored.returns(convertToUnit(1, 18));
    vToken2.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));

    await f.primeV2.addMarket(vToken2.address, convertToUnit(2, 18), convertToUnit(2, 18));
    await f.primeV2.updateScores([user1Address]);

    f.primeLiquidityProvider.tokenAmountAccrued.whenCalledWith(f.underlyingAddress).returns(convertToUnit(100, 18));
    f.primeLiquidityProvider.tokenAmountAccrued.whenCalledWith(underlying2.address).returns(0);

    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);
    await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, vToken2.address);

    const m1 = (await f.primeV2.interests(f.vToken.address, user1Address)).lifetimeAccrued;
    const m2 = (await f.primeV2.interests(vToken2.address, user1Address)).lifetimeAccrued;

    expect(m1).to.be.gt(0);
    expect(m2).to.equal(0);
  });
});
