import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import hre, { ethers, upgrades } from "hardhat";

// ============================================================================================
// BStockLiquidator — ISOLATED (hub-funded spoke pool) mode
// ============================================================================================
//
// The Core suite (BStockLiquidator.ts) covers everything the contract did before dual-pool support.
// This file covers the branch that support added, against mocks ported from the real contracts:
// `MockSpokeComptroller` mirrors `SpokeComptroller`'s liquidation surface and `MockIsolatedVToken`
// mirrors the isolated-pools `VToken` repay/seize/redeem path with its exact seize arithmetic.
//
// Two properties the mocks are shaped to prove rather than assume:
//   1. The spoke pool has NO `liquidatorContract()` and NO `executeFlashLoan`. If the contract ever
//      took the Core branch for a spoke position, the call would revert instead of quietly working.
//   2. The isolated `VToken.liquidateBorrow` returns `uint256` (NO_ERROR). `IVBep20` declares that
//      return, so a market that returned nothing would make every isolated repay fail on ABI decode.

const U = (n: string) => ethers.utils.parseUnits(n, 18);
const ZERO = ethers.constants.AddressZero;
const ONE = U("1");

// Codeless sentinel for the native BNB market, as in the Core suite.
const VBNB = ethers.utils.getAddress("0x0000000000000000000000000000000000000b0b");

// Spoke parameters. The collateral gapped down to $50, which is what puts the account underwater.
const P_USDT = U("1");
const P_TSLAB = U("50");
const INCENTIVE = U("1.1"); // 10% liquidation discount
const SEIZE_SHARE = U("0.05"); // protocol's cut of the seize, withheld by the collateral market

describe("BStockLiquidator (spoke / isolated pool)", () => {
  let owner: any, operator: any, borrower: any, stranger: any;
  let usdt: Contract, tslab: Contract, wbnb: Contract;

  // Core side: the liquidator's immutable comptroller, the gate, and the flash source.
  let core: Contract, coreVUsdt: Contract, vWBNB: Contract, venusLiq: Contract;
  let coreVTslab: Contract; // a Core-pool collateral market, for the "Core still wins" tests

  // Spoke side.
  let spoke: Contract, spokeVUsdt: Contract, spokeVTslab: Contract, psr: Contract;

  let router: Contract;
  let liq: Contract;

  const REPAY = U("5000");
  const BORROW = U("20000");

  // seizeTokens = repay * (incentive * priceBorrowed) / (priceCollateral * exchangeRate)
  //             = 5000 * (1.1 * 1) / (50 * 1) = 110
  const SEIZE_V = U("110");
  // protocolSeizeTokens = (seize * share / 1e18) * 1e18 / incentive = (110 * 0.05) / 1.1 = 5
  const PROTOCOL_V = U("5");
  const LIQUIDATOR_V = SEIZE_V.sub(PROTOCOL_V); // 105 vTSLAB credited to the liquidator
  const REDEEMED = LIQUIDATOR_V; // exchangeRate 1:1 -> 105 TSLAB
  const OUT = REDEEMED.mul(P_TSLAB).div(ONE); // router sells at $50 -> 5250 USDT
  const MIN_OUT = U("5200");

  async function deploy() {
    [owner, operator, borrower, stranger] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockMintableERC20");
    usdt = await ERC20.deploy("Tether", "USDT", 18);
    tslab = await ERC20.deploy("Tesla bStock", "TSLAB", 18);
    wbnb = await (await ethers.getContractFactory("WBNB")).deploy();

    /* ---------------------------- Core (unchanged) --------------------------- */
    core = await (await ethers.getContractFactory("MockComptrollerLite")).deploy();
    coreVUsdt = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(usdt.address, core.address);
    coreVTslab = await (await ethers.getContractFactory("MockVTokenCollateral")).deploy(tslab.address, core.address);
    vWBNB = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(wbnb.address, core.address);
    venusLiq = await (await ethers.getContractFactory("MockVenusLiquidator")).deploy();
    await core.setLiquidatorContract(venusLiq.address);
    await venusLiq.setVBnb(VBNB);
    await core.setShortfall(U("800"));

    /* -------------------------------- Spoke --------------------------------- */
    psr = await (await ethers.getContractFactory("MockSpokeProtocolShareReserve")).deploy();
    spoke = await (await ethers.getContractFactory("MockSpokeComptroller")).deploy();
    spokeVUsdt = await (
      await ethers.getContractFactory("MockIsolatedVToken")
    ).deploy(usdt.address, spoke.address, psr.address);
    spokeVTslab = await (
      await ethers.getContractFactory("MockIsolatedVToken")
    ).deploy(tslab.address, spoke.address, psr.address);

    await spoke.setMarketListed(spokeVUsdt.address, true);
    await spoke.setMarketListed(spokeVTslab.address, true);
    await spoke.setPrice(spokeVUsdt.address, P_USDT);
    await spoke.setPrice(spokeVTslab.address, P_TSLAB);
    await spoke.setLiquidationIncentive(INCENTIVE);
    await spokeVTslab.setProtocolSeizeShare(SEIZE_SHARE);
    await spokeVUsdt.setProtocolSeizeShare(SEIZE_SHARE);

    // The borrower: 200 TSLAB of collateral (entered), 20k USDT borrowed, now in shortfall.
    await spokeVTslab.mintTo(borrower.address, U("200"));
    await spoke.enterMarket(spokeVTslab.address, borrower.address, true);
    await spokeVUsdt.setBorrow(borrower.address, BORROW);
    await spoke.setShortfall(borrower.address, U("800"));
    await spoke.setTotalCollateral(borrower.address, U("5500"));

    /* ------------------------------ plumbing -------------------------------- */
    router = await (await ethers.getContractFactory("MockNativeRouter")).deploy();
    await router.setRate(P_TSLAB); // 1 TSLAB -> 50 USDT

    liq = await deployLiquidator(core.address);
    await liq.connect(owner).setRouter(router.address, true);
    await liq.connect(owner).setAllowedComptroller(spoke.address, true);
    await liq.connect(owner).setCoreFlashSource(usdt.address, coreVUsdt.address);

    // Liquidity: the collateral market must cover the seize + redeem; the router pays the sale;
    // the Core flash market lends the principal; the liquidator holds inventory for INVENTORY mode.
    await tslab.mint(spokeVTslab.address, U("1000"));
    await usdt.mint(router.address, U("1000000"));
    await usdt.mint(coreVUsdt.address, U("1000000"));
    await usdt.mint(liq.address, REPAY);
  }

  async function deployLiquidator(comptrollerAddr: string) {
    const Factory = await ethers.getContractFactory("BStockLiquidator");
    return upgrades.deployProxy(Factory, [owner.address], {
      constructorArgs: [comptrollerAddr, VBNB, vWBNB.address, wbnb.address],
      unsafeAllow: ["constructor", "state-variable-immutable"],
    });
  }

  // swapAll pulls whatever the liquidator actually holds, so the calldata never has to encode a
  // seize amount the pool's arithmetic decides.
  function swapAllCalldata(to: string) {
    return router.interface.encodeFunctionData("swapAll", [tslab.address, usdt.address, to]);
  }

  function params(over: Partial<any> = {}) {
    return {
      borrower: borrower.address,
      vDebt: spokeVUsdt.address,
      vBStock: spokeVTslab.address,
      repayAmount: REPAY,
      router: router.address,
      swapCalldata: swapAllCalldata(liq.address),
      minOut: MIN_OUT,
      router2: ZERO,
      swapCalldata2: "0x",
      intermediateToken: ZERO,
      deadline: ethers.constants.MaxUint256,
      ...over,
    };
  }

  let pristine: SnapshotRestorer;
  before(async () => {
    pristine = await takeSnapshot();
  });
  after(async () => {
    await pristine.restore();
  });
  beforeEach(deploy);

  /* ====================================================================== */
  /*                        setAllowedComptroller                           */
  /* ====================================================================== */

  describe("setAllowedComptroller", () => {
    it("is owner-only", async () => {
      await expect(liq.connect(stranger).setAllowedComptroller(spoke.address, true)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      // An allowlisted operator is not an admin either.
      await liq.connect(owner).setOperator(operator.address, true);
      await expect(liq.connect(operator).setAllowedComptroller(spoke.address, true)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("rejects the zero address", async () => {
      await expect(liq.connect(owner).setAllowedComptroller(ZERO, true)).to.be.revertedWithCustomError(
        liq,
        "ZeroAddressNotAllowed",
      );
    });

    it("rejects the CORE comptroller in both directions — it is resolved by identity, never from the map", async () => {
      await expect(liq.connect(owner).setAllowedComptroller(core.address, true)).to.be.revertedWithCustomError(
        liq,
        "CoreComptrollerNotConfigurable",
      );
      await expect(liq.connect(owner).setAllowedComptroller(core.address, false)).to.be.revertedWithCustomError(
        liq,
        "CoreComptrollerNotConfigurable",
      );
      expect(await liq.isAllowedComptroller(core.address)).to.equal(false);
    });

    it("rejects a contract that answers isComptroller() with false", async () => {
      const notPool = await (await ethers.getContractFactory("MockNotAComptroller")).deploy();
      await expect(liq.connect(owner).setAllowedComptroller(notPool.address, true))
        .to.be.revertedWithCustomError(liq, "NotAComptroller")
        .withArgs(notPool.address);
    });

    it("rejects a codeless address (the staticcall itself reverts)", async () => {
      await expect(liq.connect(owner).setAllowedComptroller(stranger.address, true)).to.be.reverted;
    });

    it("allowlists and removes, emitting each time", async () => {
      await liq.connect(owner).setAllowedComptroller(spoke.address, false);
      expect(await liq.isAllowedComptroller(spoke.address)).to.equal(false);

      await expect(liq.connect(owner).setAllowedComptroller(spoke.address, true))
        .to.emit(liq, "AllowedComptrollerSet")
        .withArgs(spoke.address, true);
      expect(await liq.isAllowedComptroller(spoke.address)).to.equal(true);

      await expect(liq.connect(owner).setAllowedComptroller(spoke.address, false))
        .to.emit(liq, "AllowedComptrollerSet")
        .withArgs(spoke.address, false);
      expect(await liq.isAllowedComptroller(spoke.address)).to.equal(false);
    });

    it("can always REMOVE a pool that no longer answers isComptroller() — the check is inbound-only", async () => {
      // A pool that has been broken/replaced would fail the inbound check; removal must not depend on it.
      const notPool = await (await ethers.getContractFactory("MockNotAComptroller")).deploy();
      await expect(liq.connect(owner).setAllowedComptroller(notPool.address, true)).to.be.reverted;
      // Removal of any address is unconditional (other than Core), so a stuck entry can never brick.
      await expect(liq.connect(owner).setAllowedComptroller(notPool.address, false)).to.not.be.reverted;
    });

    it("defaults to false for an unknown pool", async () => {
      expect(await liq.isAllowedComptroller(stranger.address)).to.equal(false);
    });
  });

  /* ====================================================================== */
  /*                          setCoreFlashSource                            */
  /* ====================================================================== */

  describe("setCoreFlashSource", () => {
    it("is owner-only and rejects a zero debt token", async () => {
      await expect(liq.connect(stranger).setCoreFlashSource(usdt.address, coreVUsdt.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      await expect(liq.connect(owner).setCoreFlashSource(ZERO, coreVUsdt.address)).to.be.revertedWithCustomError(
        liq,
        "ZeroAddressNotAllowed",
      );
    });

    it("rejects a market whose underlying is not the debt token", async () => {
      await expect(liq.connect(owner).setCoreFlashSource(tslab.address, coreVUsdt.address))
        .to.be.revertedWithCustomError(liq, "FlashSourceMismatch")
        .withArgs(coreVUsdt.address, tslab.address);
    });

    it("sets and clears, emitting each time", async () => {
      await expect(liq.connect(owner).setCoreFlashSource(usdt.address, coreVUsdt.address))
        .to.emit(liq, "CoreFlashSourceSet")
        .withArgs(usdt.address, coreVUsdt.address);
      expect(await liq.coreFlashSource(usdt.address)).to.equal(coreVUsdt.address);

      await expect(liq.connect(owner).setCoreFlashSource(usdt.address, ZERO))
        .to.emit(liq, "CoreFlashSourceSet")
        .withArgs(usdt.address, ZERO);
      expect(await liq.coreFlashSource(usdt.address)).to.equal(ZERO);
    });

    it("defaults to the zero address for an unconfigured token", async () => {
      expect(await liq.coreFlashSource(tslab.address)).to.equal(ZERO);
    });
  });

  /* ====================================================================== */
  /*                       pool resolution + escalation                     */
  /* ====================================================================== */

  describe("pool resolution", () => {
    it("rejects a collateral market whose pool is not allowlisted", async () => {
      await liq.connect(owner).setAllowedComptroller(spoke.address, false);
      await expect(liq.connect(owner).liquidate(params()))
        .to.be.revertedWithCustomError(liq, "ComptrollerNotAllowed")
        .withArgs(spoke.address);
    });

    it("rejects a collateral market the allowlisted pool does not list", async () => {
      await spoke.setMarketListed(spokeVTslab.address, false);
      await expect(liq.connect(owner).liquidate(params()))
        .to.be.revertedWithCustomError(liq, "MarketNotInPool")
        .withArgs(spoke.address, spokeVTslab.address);
    });

    it("rejects a debt market the allowlisted pool does not list", async () => {
      await spoke.setMarketListed(spokeVUsdt.address, false);
      await expect(liq.connect(owner).liquidate(params()))
        .to.be.revertedWithCustomError(liq, "MarketNotInPool")
        .withArgs(spoke.address, spokeVUsdt.address);
    });

    it("rejects legs that belong to two DIFFERENT allowlisted pools", async () => {
      const spokeB = await (await ethers.getContractFactory("MockSpokeComptroller")).deploy();
      const otherVUsdt = await (
        await ethers.getContractFactory("MockIsolatedVToken")
      ).deploy(usdt.address, spokeB.address, psr.address);
      await spokeB.setMarketListed(otherVUsdt.address, true);
      await liq.connect(owner).setAllowedComptroller(spokeB.address, true);

      // Collateral is in `spoke`, debt is in `spokeB`. `spoke` does not list the debt leg.
      await expect(liq.connect(owner).liquidate(params({ vDebt: otherVUsdt.address })))
        .to.be.revertedWithCustomError(liq, "MarketNotInPool")
        .withArgs(spoke.address, otherVUsdt.address);
    });

    it("a CORE collateral leg resolves to Core even with a spoke debt leg — the gate then rejects it", async () => {
      // vBStock lives in Core, so `_resolvePool` returns true and the repay is routed to the gate,
      // which validates the borrowed market itself. Nothing is approved to the spoke market.
      await tslab.mint(coreVTslab.address, U("1000"));
      await expect(liq.connect(owner).liquidate(params({ vBStock: coreVTslab.address }))).to.be.reverted;
      expect(await usdt.allowance(liq.address, spokeVUsdt.address)).to.equal(0);
    });

    it("SECURITY: a hostile 'market' that forges comptroller() is never approved", async () => {
      // The contract reports the allowlisted pool and a real underlying, and would drain its whole
      // allowance if it were ever called. The pool has no entry for it, so the approval never happens.
      const hostile = await (
        await ethers.getContractFactory("MockHostileDebtMarket")
      ).deploy(usdt.address, spoke.address);

      const before = await usdt.balanceOf(liq.address);
      await expect(liq.connect(owner).liquidate(params({ vDebt: hostile.address })))
        .to.be.revertedWithCustomError(liq, "MarketNotInPool")
        .withArgs(spoke.address, hostile.address);

      expect(await hostile.stolen()).to.equal(0);
      expect(await usdt.allowance(liq.address, hostile.address)).to.equal(0);
      expect(await usdt.balanceOf(liq.address)).to.equal(before);
    });

    it("SECURITY: the same hostile contract as the COLLATERAL leg is rejected too", async () => {
      const hostile = await (
        await ethers.getContractFactory("MockHostileDebtMarket")
      ).deploy(tslab.address, spoke.address);
      await expect(liq.connect(owner).liquidate(params({ vBStock: hostile.address })))
        .to.be.revertedWithCustomError(liq, "MarketNotInPool")
        .withArgs(spoke.address, hostile.address);
    });
  });

  /* ====================================================================== */
  /*                          INVENTORY mode                                */
  /* ====================================================================== */

  describe("inventory mode", () => {
    it("settles end to end: repay -> seize -> redeem -> sell -> minOut", async () => {
      const borrowBefore = await spokeVUsdt.borrowBalanceStored(borrower.address);
      const collBefore = await spokeVTslab.balanceOf(borrower.address);

      await expect(liq.connect(owner).liquidate(params())).to.emit(liq, "Liquidated").withArgs(
        borrower.address,
        spokeVTslab.address,
        spokeVUsdt.address,
        REPAY,
        REDEEMED,
        OUT,
        false, // inventory
      );

      // Borrow paid down by exactly the repay; collateral reduced by the full seize.
      expect(await spokeVUsdt.borrowBalanceStored(borrower.address)).to.equal(borrowBefore.sub(REPAY));
      expect(await spokeVTslab.balanceOf(borrower.address)).to.equal(collBefore.sub(SEIZE_V));

      // The liquidator kept the proceeds and holds no leftovers of either leg.
      expect(await usdt.balanceOf(liq.address)).to.equal(OUT); // 5000 inventory spent, 5250 back
      expect(await tslab.balanceOf(liq.address)).to.equal(0);
      expect(await spokeVTslab.balanceOf(liq.address)).to.equal(0);
    });

    it("the protocol seize share goes to the ProtocolShareReserve and is excluded from the sale", async () => {
      await liq.connect(owner).liquidate(params());
      // The collateral market withheld 5 vTSLAB worth of underlying for the reserve...
      expect(await tslab.balanceOf(psr.address)).to.equal(PROTOCOL_V);
      // ...and the liquidator only ever redeemed and sold the 105 it was actually credited.
      expect(await usdt.balanceOf(liq.address)).to.equal(LIQUIDATOR_V.mul(P_TSLAB).div(ONE));
    });

    it("leaves no standing allowance on the debt market", async () => {
      await liq.connect(owner).liquidate(params());
      expect(await usdt.allowance(liq.address, spokeVUsdt.address)).to.equal(0);
    });

    it("an over-repay is REJECTED by the pool, never silently capped", async () => {
      // Worth pinning down: `_repayBorrowFresh` does cap the pull at the outstanding balance, but
      // `preLiquidateHook` bounds `repayAmount` first (maxClose normally, the balance under forced
      // liquidation), so that cap is unreachable through this contract. An over-repay reverts.
      await spokeVUsdt.setBorrow(borrower.address, U("3000"));
      await spoke.setCloseFactor(U("1"));
      await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(spoke, "TooMuchRepay");

      await spoke.setForcedLiquidation(spokeVUsdt.address, true);
      await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(spoke, "TooMuchRepay");
    });

    it("clears the borrow exactly when the repay equals the outstanding balance", async () => {
      await spokeVUsdt.setBorrow(borrower.address, REPAY);
      await spoke.setCloseFactor(U("1")); // maxClose == the full balance
      await liq.connect(owner).liquidate(params({ minOut: U("1") }));
      expect(await spokeVUsdt.borrowBalanceStored(borrower.address)).to.equal(0);
      expect(await usdt.allowance(liq.address, spokeVUsdt.address)).to.equal(0);
    });

    it("honours a non-1:1 exchange rate on the collateral market", async () => {
      await spokeVTslab.setExchangeRate(U("2"));
      // seizeTokens = 5000 * 1.1 / (50 * 2) = 55; protocol = (55*0.05)/1.1 = 2.5; liquidator = 52.5
      // redeem 52.5 vTSLAB at 2.0 -> 105 TSLAB -> 5250 USDT, same proceeds as the 1:1 case.
      await expect(liq.connect(owner).liquidate(params()))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, spokeVTslab.address, spokeVUsdt.address, REPAY, REDEEMED, OUT, false);
      expect(await tslab.balanceOf(psr.address)).to.equal(U("5")); // 2.5 vTokens * 2.0
    });

    it("uses the collateral market's OWN incentive when it overrides the pool default", async () => {
      await spoke.setMarketLiquidationIncentive(spokeVTslab.address, U("1.2"));
      // seizeTokens = 5000 * 1.2 / 50 = 120; protocol = (120*0.05)/1.2 = 5; liquidator = 115
      const expectedRedeem = U("115");
      await expect(liq.connect(owner).liquidate(params({ minOut: U("1") })))
        .to.emit(liq, "Liquidated")
        .withArgs(
          borrower.address,
          spokeVTslab.address,
          spokeVUsdt.address,
          REPAY,
          expectedRedeem,
          expectedRedeem.mul(P_TSLAB).div(ONE),
          false,
        );
    });

    it("enforces minOut and rolls the whole thing back", async () => {
      const usdtBefore = await usdt.balanceOf(liq.address);
      const borrowBefore = await spokeVUsdt.borrowBalanceStored(borrower.address);
      await expect(liq.connect(owner).liquidate(params({ minOut: U("6000") }))).to.be.revertedWithCustomError(
        liq,
        "InsufficientOut",
      );
      expect(await usdt.balanceOf(liq.address)).to.equal(usdtBefore);
      expect(await spokeVUsdt.borrowBalanceStored(borrower.address)).to.equal(borrowBefore);
      expect(await tslab.balanceOf(psr.address)).to.equal(0);
    });

    it("is operator-gated like the Core path", async () => {
      await expect(liq.connect(stranger).liquidate(params())).to.be.revertedWithCustomError(liq, "NotOperator");
      await liq.connect(owner).setOperator(operator.address, true);
      await expect(liq.connect(operator).liquidate(params())).to.not.be.reverted;
    });

    it("still enforces the router allowlist, minOut != 0 and the deadline", async () => {
      await expect(liq.connect(owner).liquidate(params({ router: stranger.address }))).to.be.revertedWithCustomError(
        liq,
        "RouterNotAllowed",
      );
      await expect(liq.connect(owner).liquidate(params({ minOut: 0 }))).to.be.revertedWithCustomError(
        liq,
        "ZeroMinOut",
      );
      await expect(liq.connect(owner).liquidate(params({ deadline: 1 }))).to.be.revertedWithCustomError(
        liq,
        "DeadlineExpired",
      );
    });
  });

  /* ====================================================================== */
  /*                             FLASH mode                                 */
  /* ====================================================================== */

  describe("flash mode", () => {
    beforeEach(async () => {
      // Prove the flash principal is what funds the repay: strip the liquidator's inventory first.
      await liq.connect(owner).sweep(usdt.address, owner.address, await usdt.balanceOf(liq.address));
      expect(await usdt.balanceOf(liq.address)).to.equal(0);
    });

    it("borrows the spoke's debt token from the CORE market and settles", async () => {
      await expect(liq.connect(owner).flashLiquidate(params()))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, spokeVTslab.address, spokeVUsdt.address, REPAY, REDEEMED, OUT, true);

      // Principal returned to Core; the profit stays here.
      expect(await usdt.balanceOf(liq.address)).to.equal(OUT.sub(REPAY));
      expect(await spokeVUsdt.borrowBalanceStored(borrower.address)).to.equal(BORROW.sub(REPAY));
    });

    it("pays the flash premium out of the swap proceeds", async () => {
      await core.setFlashPremium(U("0.001")); // 0.1%
      const premium = REPAY.mul(U("0.001")).div(ONE);
      await liq.connect(owner).flashLiquidate(params());
      expect(await usdt.balanceOf(liq.address)).to.equal(OUT.sub(REPAY).sub(premium));
    });

    it("reverts when the debt token has no configured Core flash source", async () => {
      await liq.connect(owner).setCoreFlashSource(usdt.address, ZERO);
      await expect(liq.connect(owner).flashLiquidate(params()))
        .to.be.revertedWithCustomError(liq, "FlashSourceNotSet")
        .withArgs(usdt.address);
    });

    it("re-checks the flash source's underlying at call time, not just in the setter", async () => {
      // Configure a valid source, then repoint its underlying behind the setter's back.
      const mutable = await (
        await ethers.getContractFactory("MockMutableFlashSource")
      ).deploy(usdt.address, core.address);
      await liq.connect(owner).setCoreFlashSource(usdt.address, mutable.address);
      await mutable.setUnderlying(tslab.address);

      await expect(liq.connect(owner).flashLiquidate(params()))
        .to.be.revertedWithCustomError(liq, "FlashSourceMismatch")
        .withArgs(mutable.address, usdt.address);
    });

    it("rejects a callback whose flashed asset is not the resolved source", async () => {
      const evil = await (await ethers.getContractFactory("MockMaliciousFlashComptroller")).deploy();
      await evil.setMode(1); // WrongAsset
      const evilLiq = await deployLiquidator(evil.address);
      await evilLiq.connect(owner).setRouter(router.address, true);
      // Collateral must resolve to the same evil pool, otherwise the call is (correctly) rejected as
      // an unknown pool before the callback is ever reached.
      const evilColl = await (
        await ethers.getContractFactory("MockVTokenCollateral")
      ).deploy(tslab.address, evil.address);
      await expect(
        evilLiq.connect(owner).flashLiquidate(params({ vBStock: evilColl.address, vDebt: coreVUsdt.address })),
      ).to.be.revertedWithCustomError(evilLiq, "WrongFlashAsset");
    });

    it("requires the swap proceeds ALONE to cover principal + premium", async () => {
      // Pre-fund inventory that could otherwise backfill an underwater swap, then make the sale short.
      await usdt.mint(liq.address, U("10000"));
      await router.setRate(U("40")); // 105 TSLAB -> 4200 USDT, below the 5000 principal
      await expect(liq.connect(owner).flashLiquidate(params({ minOut: U("1") }))).to.be.revertedWithCustomError(
        liq,
        "InsufficientOut",
      );
      // Full rollback: the inventory is untouched.
      expect(await usdt.balanceOf(liq.address)).to.equal(U("10000"));
    });

    it("rejects a VAI debt regardless of the pool", async () => {
      const vai = await (await ethers.getContractFactory("MockMintableERC20")).deploy("VAI", "VAI", 18);
      const vaiCtrl = await (await ethers.getContractFactory("MockVAIController")).deploy(vai.address);
      await core.setVaiController(vaiCtrl.address);
      await expect(liq.connect(owner).flashLiquidate(params({ vDebt: vaiCtrl.address }))).to.be.revertedWithCustomError(
        liq,
        "FlashNotSupportedForVai",
      );
    });

    it("still resolves the pool inside the callback — an unlisted debt leg cannot slip through", async () => {
      await spoke.setMarketListed(spokeVUsdt.address, false);
      await expect(liq.connect(owner).flashLiquidate(params()))
        .to.be.revertedWithCustomError(liq, "MarketNotInPool")
        .withArgs(spoke.address, spokeVUsdt.address);
    });
  });

  /* ====================================================================== */
  /*                         spoke-side guards                              */
  /* ====================================================================== */

  describe("guards enforced by the pool itself", () => {
    it("the liquidation allowlist binds THIS CONTRACT, not the operator", async () => {
      await spoke.setLiquidationAllowlistEnabled(true);
      await liq.connect(owner).setOperator(operator.address, true);

      // Allowlisting the operator EOA is not enough: the collateral lands on the contract.
      await spoke.setAllowedLiquidator(operator.address, true);
      await expect(liq.connect(operator).liquidate(params()))
        .to.be.revertedWithCustomError(spoke, "LiquidationNotAllowed")
        .withArgs(liq.address);

      await spoke.setAllowedLiquidator(liq.address, true);
      await expect(liq.connect(operator).liquidate(params())).to.not.be.reverted;
    });

    it("respects LIQUIDATE pause on the debt market", async () => {
      await spoke.setActionPaused(spokeVUsdt.address, 5 /* LIQUIDATE */, true);
      await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(spoke, "ActionPaused");
    });

    it("respects SEIZE pause on the collateral market", async () => {
      await spoke.setActionPaused(spokeVTslab.address, 4 /* SEIZE */, true);
      await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(spoke, "ActionPaused");
    });

    it("respects REDEEM pause on the collateral market — the seize is rolled back with it", async () => {
      await spoke.setActionPaused(spokeVTslab.address, 1 /* REDEEM */, true);
      await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(spoke, "ActionPaused");
      expect(await spokeVTslab.balanceOf(borrower.address)).to.equal(U("200"));
    });

    it("requires the borrower to have the collateral market as collateral", async () => {
      await spoke.enterMarket(spokeVTslab.address, borrower.address, false);
      await expect(liq.connect(owner).liquidate(params()))
        .to.be.revertedWithCustomError(spoke, "MarketNotCollateral")
        .withArgs(spokeVTslab.address, borrower.address);
    });

    it("requires shortfall unless forced liquidation is enabled", async () => {
      await spoke.setShortfall(borrower.address, 0);
      await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(
        spoke,
        "InsufficientShortfall",
      );

      await spoke.setForcedLiquidation(spokeVUsdt.address, true);
      await expect(liq.connect(owner).liquidate(params())).to.not.be.reverted;
    });

    it("respects the close factor", async () => {
      await spoke.setCloseFactor(U("0.1")); // maxClose = 2000 < 5000
      await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(spoke, "TooMuchRepay");
    });

    it("respects minLiquidatableCollateral", async () => {
      await spoke.setTotalCollateral(borrower.address, U("50")); // below the 100 floor
      await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(
        spoke,
        "MinimalCollateralViolated",
      );
    });
  });

  /* ====================================================================== */
  /*                    Core is unaffected by any of this                   */
  /* ====================================================================== */

  describe("Core non-regression with a spoke allowlisted", () => {
    it("a Core position still routes through the gate while a spoke pool is enabled", async () => {
      expect(await liq.isAllowedComptroller(spoke.address)).to.equal(true);

      const coreVDebt = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(usdt.address, core.address);
      await tslab.mint(coreVTslab.address, U("10000"));
      await usdt.mint(liq.address, REPAY);

      // Core's mock seizes repay * 1.1 = 5500 vTSLAB, redeemed 1:1, sold at $50.
      const coreSeized = REPAY.mul(INCENTIVE).div(ONE);
      await expect(
        liq.connect(owner).liquidate(
          params({
            vDebt: coreVDebt.address,
            vBStock: coreVTslab.address,
            minOut: U("1"),
          }),
        ),
      )
        .to.emit(liq, "Liquidated")
        .withArgs(
          borrower.address,
          coreVTslab.address,
          coreVDebt.address,
          REPAY,
          coreSeized,
          coreSeized.mul(P_TSLAB).div(ONE),
          false,
        );

      // The repay went to the GATE, never to the debt market directly.
      expect(await usdt.balanceOf(venusLiq.address)).to.equal(REPAY);
      expect(await usdt.allowance(liq.address, coreVDebt.address)).to.equal(0);
    });

    it("an unset Core gate still fails loudly, and the spoke allowlist does not paper over it", async () => {
      const coreVDebt = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(usdt.address, core.address);
      await tslab.mint(coreVTslab.address, U("1000"));
      await core.setLiquidatorContract(ZERO);
      await expect(
        liq.connect(owner).liquidate(params({ vDebt: coreVDebt.address, vBStock: coreVTslab.address })),
      ).to.be.revertedWithCustomError(liq, "ZeroAddressNotAllowed");
    });
  });
});

/* ------------------------------------------------------------------ */
/*        the mocks above, checked against the REAL contracts         */
/* ------------------------------------------------------------------ */

// Everything in this file is only worth as much as the mocks' fidelity. This block diffs every function
// the mocks share with the real `SpokeComptroller` and isolated `VToken` (artifacts vendored under
// tests/hardhat/Fork/vendor/spoke) and fails on any signature or return-type drift. It caught a real
// one: the ProtocolShareReserve interface was declared with a `uint256` income type where the real one
// uses an enum, i.e. `uint8` — a different selector, so the withheld-seize push would have reverted
// against the real market while passing here.
describe("BStockLiquidator — spoke mock fidelity", () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const REAL_COMPTROLLER = require("./Fork/vendor/spoke/SpokeComptroller.json");
  const REAL_VTOKEN = require("./Fork/vendor/spoke/VToken.json");
  /* eslint-enable @typescript-eslint/no-var-requires */

  type Fn = { sig: string; out: string };

  const index = (abi: any[]): Map<string, Fn> => {
    const m = new Map<string, Fn>();
    for (const e of abi) {
      if (e.type !== "function") continue;
      const sig = `${e.name}(${e.inputs.map((i: any) => i.type).join(",")})`;
      m.set(sig, { sig, out: e.outputs.map((o: any) => o.type).join(",") });
    }
    return m;
  };

  // A mock-only name is a test harness setter (setPrice, setBorrow, ...) and is fine. A name the real
  // contract HAS but under a different signature, or with a different return, is drift.
  const compare = (mockAbi: any[], realAbi: any[]) => {
    const real = index(realAbi);
    const realNames = new Set([...real.keys()].map(k => k.split("(")[0]));
    const drift: string[] = [];
    for (const [sig, fn] of index(mockAbi)) {
      const name = sig.split("(")[0];
      const r = real.get(sig);
      if (r) {
        if (r.out !== fn.out) drift.push(`${sig}: mock returns (${fn.out}), real returns (${r.out})`);
      } else if (realNames.has(name)) {
        const alts = [...real.values()].filter(v => v.sig.startsWith(`${name}(`)).map(v => v.sig);
        drift.push(`${sig}: real has ${alts.join(" / ")}`);
      }
    }
    return drift;
  };

  it("MockSpokeComptroller matches SpokeComptroller on every shared function", async () => {
    const mock = await hre.artifacts.readArtifact("MockSpokeComptroller");
    expect(compare(mock.abi as any[], REAL_COMPTROLLER.abi)).to.deep.equal([]);
  });

  it("MockIsolatedVToken matches the isolated VToken on every shared function", async () => {
    const mock = await hre.artifacts.readArtifact("MockIsolatedVToken");
    expect(compare(mock.abi as any[], REAL_VTOKEN.abi)).to.deep.equal([]);
  });

  it("MockSpokeProtocolShareReserve speaks the selector the real VToken calls", async () => {
    // VToken._seize -> IProtocolShareReserve.updateAssetsState(address,address,IncomeType); the enum
    // ABI-encodes as uint8, so a uint256 declaration is a different function entirely.
    const mock = await hre.artifacts.readArtifact("MockSpokeProtocolShareReserve");
    const iface = new ethers.utils.Interface(mock.abi);
    expect(Object.keys(iface.functions)).to.include("updateAssetsState(address,address,uint8)");
  });

  it("the mocks expose NO Core-only surface, so a wrong-branch call cannot quietly succeed", async () => {
    for (const name of ["MockSpokeComptroller", "MockIsolatedVToken"]) {
      const { abi } = await hre.artifacts.readArtifact(name);
      const fns = new Set(abi.filter((e: any) => e.type === "function").map((e: any) => e.name));
      for (const core of ["liquidatorContract", "executeFlashLoan", "vaiController"]) {
        expect(fns.has(core), `${name} must not expose ${core}`).to.equal(false);
      }
    }
  });
});
