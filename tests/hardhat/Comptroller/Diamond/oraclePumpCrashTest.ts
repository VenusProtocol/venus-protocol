import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  BEP20Harness,
  BEP20Harness__factory,
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  IAccessControlManagerV5,
  IDeviationBoundedOracle,
  IProtocolShareReserve,
  InterestRateModel,
  PriceOracle,
  Unitroller,
  VBep20Harness,
  VBep20Harness__factory,
} from "../../../../typechain";
import { deployDiamond } from "./scripts/deploy";

const { expect } = chai;
chai.use(smock.matchers);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const NORMAL_PRICE = parseUnits("100", 18); // $100 per token
const CF = parseUnits("0.8", 18); // 80%
const LT = parseUnits("0.9", 18); // 90%
const CLOSE_FACTOR = parseUnits("0.5", 18);
const LIQUIDATION_INCENTIVE = parseUnits("1.1", 18);
const SUPPLY_CAP = parseUnits("10000000", 18);
const BORROW_CAP = parseUnits("5000000", 18);
const INITIAL_EXCHANGE_RATE = parseUnits("1", 18); // 1:1 for clean math
const COLLATERAL_AMOUNT = parseUnits("1000", 18); // 1000 underlying → 1000 vTokens at ER=1
const POOL_LIQUIDITY = parseUnits("100000", 18); // plenty of liquidity in borrow pool

/*
 * Math reference (at ER=1, 18 decimals):
 *
 * tokensToDenom = weightedFactor × exchangeRate × collateralPrice / 1e18 / 1e18
 * sumCollateral = tokensToDenom × vTokenBalance / 1e18
 * sumBorrow     = debtPrice × borrowBalance / 1e18
 *
 * At NORMAL ($100), CF=0.8, ER=1, vTokenBalance=1000e18:
 *   tokensToDenom = 0.8e18 × 1e18 × 100e18 / 1e18 / 1e18 = 80e18
 *   sumCollateral = 80e18 × 1000e18 / 1e18 = 80000e18
 *   maxBorrow at $100/token debt = 800e18 underlying
 *
 * At LT=0.9:
 *   sumCollateral = 90e18 × 1000e18 / 1e18 = 90000e18
 *   maxBorrow at $100/token debt = 900e18 underlying
 */

// ---------------------------------------------------------------------------
// Fixture type
// ---------------------------------------------------------------------------
type RealVTokenFixture = {
  admin: SignerWithAddress;
  user: SignerWithAddress;
  attacker: SignerWithAddress;
  liquidator: SignerWithAddress;
  comptroller: ComptrollerMock;
  unitroller: Unitroller;
  comptrollerLens: MockContract<ComptrollerLens>;
  oracle: FakeContract<PriceOracle>;
  dbo: FakeContract<IDeviationBoundedOracle>;
  accessControl: FakeContract<IAccessControlManagerV5>;
  interestRateModel: FakeContract<InterestRateModel>;
  protocolShareReserve: FakeContract<IProtocolShareReserve>;
  vTokenA: MockContract<VBep20Harness>; // collateral market
  vTokenB: MockContract<VBep20Harness>; // borrow market
  underlyingA: MockContract<BEP20Harness>;
  underlyingB: MockContract<BEP20Harness>;
};

// ---------------------------------------------------------------------------
// Fixture deploy
// ---------------------------------------------------------------------------
async function deployRealVTokenFixture(): Promise<RealVTokenFixture> {
  const [admin, user, attacker, liquidator] = await ethers.getSigners();

  // 1. Deploy diamond comptroller
  const result = await deployDiamond("");
  const unitroller = result.unitroller;
  const comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);

  // 2. Fakes: ACL, Oracle, DBO, InterestRateModel, ProtocolShareReserve
  const accessControl = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
  accessControl.isAllowedToCall.returns(true);

  const oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
  oracle.getUnderlyingPrice.returns(NORMAL_PRICE);

  const dbo = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
  dbo.getBoundedPricesView.returns([NORMAL_PRICE, NORMAL_PRICE]);

  const interestRateModel = await smock.fake<InterestRateModel>("InterestRateModel");
  interestRateModel.isInterestRateModel.returns(true);
  interestRateModel.getBorrowRate.returns(0);
  interestRateModel.getSupplyRate.returns(0);

  const protocolShareReserve = await smock.fake<IProtocolShareReserve>(
    "contracts/external/IProtocolShareReserve.sol:IProtocolShareReserve",
  );

  // 3. Real ComptrollerLens
  const LensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
  const comptrollerLens = await LensFactory.deploy();

  // 4. Configure comptroller
  await comptroller._setAccessControl(accessControl.address);
  await comptroller._setComptrollerLens(comptrollerLens.address);
  await comptroller._setPriceOracle(oracle.address);
  await comptroller.setDeviationBoundedOracle(dbo.address);
  await comptroller._setCloseFactor(CLOSE_FACTOR);

  // 5. Deploy real underlying tokens
  const underlyingFactory = await smock.mock<BEP20Harness__factory>("BEP20Harness");
  const underlyingA = await underlyingFactory.deploy(0, "Token A", 18, "TKNA");
  const underlyingB = await underlyingFactory.deploy(0, "Token B", 18, "TKNB");

  // 6. Deploy real vTokens
  const vTokenFactory = await smock.mock<VBep20Harness__factory>("VBep20Harness");
  const vTokenA = await vTokenFactory.deploy(
    underlyingA.address,
    comptroller.address,
    interestRateModel.address,
    INITIAL_EXCHANGE_RATE,
    "vToken A",
    "vTKNA",
    18,
    admin.address,
  );
  const vTokenB = await vTokenFactory.deploy(
    underlyingB.address,
    comptroller.address,
    interestRateModel.address,
    INITIAL_EXCHANGE_RATE,
    "vToken B",
    "vTKNB",
    18,
    admin.address,
  );

  // 7. Configure vTokens
  await vTokenA.setAccessControlManager(accessControl.address);
  await vTokenA.setProtocolShareReserve(protocolShareReserve.address);
  await vTokenB.setAccessControlManager(accessControl.address);
  await vTokenB.setProtocolShareReserve(protocolShareReserve.address);

  // 8. Support markets and configure
  await comptroller._supportMarket(vTokenA.address);
  await comptroller._supportMarket(vTokenB.address);
  await comptroller["setCollateralFactor(address,uint256,uint256)"](vTokenA.address, CF, LT);
  await comptroller["setCollateralFactor(address,uint256,uint256)"](vTokenB.address, CF, LT);
  await comptroller.setMarketSupplyCaps([vTokenA.address, vTokenB.address], [SUPPLY_CAP, SUPPLY_CAP]);
  await comptroller.setMarketBorrowCaps([vTokenA.address, vTokenB.address], [BORROW_CAP, BORROW_CAP]);
  await comptroller.setIsBorrowAllowed(0, vTokenA.address, true);
  await comptroller.setIsBorrowAllowed(0, vTokenB.address, true);
  await comptroller["setLiquidationIncentive(address,uint256)"](vTokenA.address, LIQUIDATION_INCENTIVE);
  await comptroller["setLiquidationIncentive(address,uint256)"](vTokenB.address, LIQUIDATION_INCENTIVE);

  // Pre-fund vTokenB pool with liquidity for borrows
  await underlyingB.harnessSetBalance(vTokenB.address, POOL_LIQUIDITY);
  await vTokenB.harnessSetInternalCash(POOL_LIQUIDITY);

  return {
    admin,
    user,
    attacker,
    liquidator,
    comptroller,
    unitroller,
    comptrollerLens,
    oracle,
    dbo,
    accessControl,
    interestRateModel,
    protocolShareReserve,
    vTokenA,
    vTokenB,
    underlyingA,
    underlyingB,
  };
}

// ---------------------------------------------------------------------------
// Helper: set up a user with collateral in vTokenA and optional borrow from vTokenB
// ---------------------------------------------------------------------------
async function setupPosition(
  fixture: RealVTokenFixture,
  signer: SignerWithAddress,
  collateralAmount: ReturnType<typeof parseUnits>,
  borrowAmount?: ReturnType<typeof parseUnits>,
): Promise<void> {
  const { comptroller, vTokenA, vTokenB, underlyingA } = fixture;

  // Supply collateral in vTokenA
  await underlyingA.harnessSetBalance(signer.address, collateralAmount);
  await underlyingA.connect(signer).approve(vTokenA.address, collateralAmount);
  await vTokenA.connect(signer).mint(collateralAmount);
  await comptroller.connect(signer).enterMarkets([vTokenA.address]);

  // Pool is pre-funded in fixture; just borrow if requested
  if (borrowAmount && borrowAmount.gt(0)) {
    await vTokenB.connect(signer).borrow(borrowAmount);
  }
}

// ---------------------------------------------------------------------------
// Reset smock fakes to default values (smock state is JS-side, not EVM-restored)
// ---------------------------------------------------------------------------
function resetFakes(f: RealVTokenFixture): void {
  // Oracle
  f.oracle.getUnderlyingPrice.reset();
  f.oracle.getUnderlyingPrice.returns(NORMAL_PRICE);

  // DBO
  f.dbo.updateProtectionState.reset();
  f.dbo.getBoundedPricesView.reset();
  f.dbo.getBoundedPricesView.returns([NORMAL_PRICE, NORMAL_PRICE]);

  // ACL
  f.accessControl.isAllowedToCall.reset();
  f.accessControl.isAllowedToCall.returns(true);

  // InterestRateModel
  f.interestRateModel.isInterestRateModel.reset();
  f.interestRateModel.isInterestRateModel.returns(true);
  f.interestRateModel.getBorrowRate.reset();
  f.interestRateModel.getBorrowRate.returns(0);
  f.interestRateModel.getSupplyRate.reset();
  f.interestRateModel.getSupplyRate.returns(0);
}

// ===========================================================================
// Tests
// ===========================================================================
describe("Oracle Pump/Crash — vToken Integration Tests", () => {
  // =========================================================================
  // Part 1.1: Normal Operation (no protection active)
  // =========================================================================
  describe("1. Normal Operation (DBO returns spot prices)", () => {
    let f: RealVTokenFixture;

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);
    });

    it("mint succeeds", async () => {
      await f.underlyingA.harnessSetBalance(f.user.address, COLLATERAL_AMOUNT);
      await f.underlyingA.connect(f.user).approve(f.vTokenA.address, COLLATERAL_AMOUNT);
      await expect(f.vTokenA.connect(f.user).mint(COLLATERAL_AMOUNT)).to.not.be.reverted;

      const vBalance = await f.vTokenA.balanceOf(f.user.address);
      expect(vBalance).to.be.gt(0);
    });

    it("borrow succeeds with sufficient collateral", async () => {
      await setupPosition(f, f.user, COLLATERAL_AMOUNT);

      // maxBorrow = 800e18 at $100; borrow 700e18 → solvent
      const borrowAmount = parseUnits("700", 18);
      await expect(f.vTokenB.connect(f.user).borrow(borrowAmount)).to.not.be.reverted;

      const received = await f.underlyingB.balanceOf(f.user.address);
      expect(received).to.equal(borrowAmount);
    });

    it("redeem succeeds when account stays solvent", async () => {
      const borrowAmount = parseUnits("300", 18);
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, borrowAmount);

      // Redeem 100 underlying → 900 vTokens remaining
      // sumCollateral = 0.8 × 100 × 900 = 72000e18 > sumBorrow = 100 × 300 = 30000e18
      const redeemAmount = parseUnits("100", 18);
      await expect(f.vTokenA.connect(f.user).redeemUnderlying(redeemAmount)).to.not.be.reverted;
    });

    it("repayBorrow succeeds", async () => {
      const borrowAmount = parseUnits("300", 18);
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, borrowAmount);

      const repayAmount = parseUnits("100", 18);
      await f.underlyingB.harnessSetBalance(f.user.address, repayAmount);
      await f.underlyingB.connect(f.user).approve(f.vTokenB.address, repayAmount);
      await expect(f.vTokenB.connect(f.user).repayBorrow(repayAmount)).to.not.be.reverted;
    });

    it("transfer succeeds when sender stays solvent", async () => {
      const borrowAmount = parseUnits("300", 18);
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, borrowAmount);

      // Transfer 100 vTokenA → 900 remaining → still solvent at normal prices
      const transferAmount = parseUnits("100", 18);
      await expect(f.vTokenA.connect(f.user).transfer(f.attacker.address, transferAmount)).to.not.be.reverted;

      const dstBalance = await f.vTokenA.balanceOf(f.attacker.address);
      expect(dstBalance).to.equal(transferAmount);
    });

    it("full lifecycle: mint → enter → borrow → repay → redeem", async () => {
      // Mint collateral
      await f.underlyingA.harnessSetBalance(f.user.address, COLLATERAL_AMOUNT);
      await f.underlyingA.connect(f.user).approve(f.vTokenA.address, COLLATERAL_AMOUNT);
      await f.vTokenA.connect(f.user).mint(COLLATERAL_AMOUNT);
      await f.comptroller.connect(f.user).enterMarkets([f.vTokenA.address]);

      // Fund pool and borrow
      await f.underlyingB.harnessSetBalance(f.vTokenB.address, POOL_LIQUIDITY);
      await f.vTokenB.harnessSetInternalCash(POOL_LIQUIDITY);
      const borrowAmount = parseUnits("500", 18);
      await f.vTokenB.connect(f.user).borrow(borrowAmount);

      // Repay full borrow
      const debt = await f.vTokenB.borrowBalanceStored(f.user.address);
      await f.underlyingB.harnessSetBalance(f.user.address, debt);
      await f.underlyingB.connect(f.user).approve(f.vTokenB.address, debt);
      await f.vTokenB.connect(f.user).repayBorrow(debt);

      // Redeem all collateral (no borrows → no shortfall)
      const vBalance = await f.vTokenA.balanceOf(f.user.address);
      await expect(f.vTokenA.connect(f.user).redeem(vBalance)).to.not.be.reverted;
    });
  });

  // =========================================================================
  // Part 1.2: Oracle Pump — Collateral Price Inflated ($100 → $500)
  // =========================================================================
  describe("2. Oracle Pump — Collateral Price Inflated ($100 → $500)", () => {
    /*
     * Spot pumps from $100 to $500 for vTokenA.
     * DBO clamps collateral at $100 (window minimum).
     *
     * At bounded ($100), CF=0.8:
     *   sumCollateral = 0.8 × 1 × 100 × 1000 = 80000e18
     *   maxBorrow at $100 debt = 800e18
     */
    const PUMPED_SPOT = parseUnits("500", 18);

    let f: RealVTokenFixture;

    // Helper: apply pump prices to oracle and DBO
    function applyPumpPrices(): void {
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenA.address).returns(PUMPED_SPOT);
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenB.address).returns(NORMAL_PRICE);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([NORMAL_PRICE, NORMAL_PRICE]);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, NORMAL_PRICE]);
    }

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);

      // Set up collateral at NORMAL prices (no borrow yet)
      await setupPosition(f, f.user, COLLATERAL_AMOUNT);
    });

    it("mint still works during pump — no liquidity check", async () => {
      applyPumpPrices();
      const mintAmount = parseUnits("1000", 18);
      await f.underlyingA.harnessSetBalance(f.attacker.address, mintAmount);
      await f.underlyingA.connect(f.attacker).approve(f.vTokenA.address, mintAmount);
      await expect(f.vTokenA.connect(f.attacker).mint(mintAmount)).to.not.be.reverted;
    });

    it("borrow reverts — DBO caps collateral at $100 window min", async () => {
      applyPumpPrices();
      // At bounded $100: maxBorrow = 800e18; try 1500e18 → shortfall
      const excessBorrow = parseUnits("1500", 18);
      await expect(f.vTokenB.connect(f.user).borrow(excessBorrow)).to.be.revertedWith("math error");
    });

    it("borrow succeeds within bounded capacity despite pump", async () => {
      applyPumpPrices();
      // Borrow 700e18 at $100 debt = 70000e18 < 80000e18 sumCollateral
      const safeBorrow = parseUnits("700", 18);
      await expect(f.vTokenB.connect(f.user).borrow(safeBorrow)).to.not.be.reverted;
    });

    it("redeem reverts — bounded prices limit withdrawal", async () => {
      // Borrow at NORMAL prices first, then pump
      await f.vTokenB.connect(f.user).borrow(parseUnits("750", 18));
      applyPumpPrices();

      // Redeem 200 → 800 remaining: sumCollateral = 0.8 × 100 × 800 = 64000e18
      // sumBorrow = 100 × 750 = 75000e18 → shortfall
      await expect(f.vTokenA.connect(f.user).redeemUnderlying(parseUnits("200", 18))).to.be.revertedWith("math error");
    });

    it("repayBorrow succeeds during pump", async () => {
      // Borrow at NORMAL prices first, then pump
      await f.vTokenB.connect(f.user).borrow(parseUnits("500", 18));
      applyPumpPrices();

      const repayAmount = parseUnits("100", 18);
      await f.underlyingB.harnessSetBalance(f.user.address, repayAmount);
      await f.underlyingB.connect(f.user).approve(f.vTokenB.address, repayAmount);
      await expect(f.vTokenB.connect(f.user).repayBorrow(repayAmount)).to.not.be.reverted;
    });

    it("transfer blocked when bounded prices show shortfall for sender", async () => {
      // Borrow at NORMAL prices first, then pump
      await f.vTokenB.connect(f.user).borrow(parseUnits("750", 18));
      applyPumpPrices();

      // Transfer 200 vTokenA → 800 remaining → shortfall at bounded prices
      const transferAmount = parseUnits("200", 18);
      await expect(f.vTokenA.connect(f.user).transfer(f.attacker.address, transferAmount)).to.emit(
        f.vTokenA,
        "Failure",
      );
    });

    it("liquidation: borrower solvent at pumped spot LT → INSUFFICIENT_SHORTFALL", async () => {
      // Borrow at NORMAL prices first, then pump
      await f.vTokenB.connect(f.user).borrow(parseUnits("700", 18));
      applyPumpPrices();

      // LT path uses spot: sumCollateral = 0.9 × 500 × 1000 = 450000e18 >> sumBorrow = 100 × 700 = 70000e18
      const repayAmount = parseUnits("350", 18);
      await f.underlyingB.harnessSetBalance(f.liquidator.address, repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);

      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "Failure");
    });
  });

  // =========================================================================
  // Part 1.3: Oracle Crash — Collateral Price Crashed ($100 → $20)
  // =========================================================================
  describe("3. Oracle Crash — Collateral Price Crashed ($100 → $20)", () => {
    /*
     * vTokenA spot crashes from $100 to $20.
     * DBO bounds: collateral at $20 (spot = new min), debt at $100 (window max).
     *
     * At bounded (collateral $20, debt $100), CF=0.8:
     *   sumCollateral = 0.8 × 20 × 1000 = 16000e18
     *   sumBorrow (100e18 borrow) = 100 × 100 = 10000e18
     *
     * At spot LT ($20 for vTokenA, $100 for vTokenB):
     *   sumCollateral = 0.9 × 20 × 1000 = 18000e18
     */
    const CRASHED_SPOT = parseUnits("20", 18);

    let f: RealVTokenFixture;

    // Helper: apply crash prices to oracle and DBO
    function applyCrashPrices(): void {
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenA.address).returns(CRASHED_SPOT);
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenB.address).returns(NORMAL_PRICE);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([CRASHED_SPOT, CRASHED_SPOT]);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, NORMAL_PRICE]);
    }

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);

      // Set up collateral at NORMAL prices (no borrow yet)
      await setupPosition(f, f.user, COLLATERAL_AMOUNT);
    });

    it("borrow reverts — crashed collateral + inflated debt", async () => {
      applyCrashPrices();
      // sumCollateral = 0.8 × 20 × 1000 = 16000e18
      // Borrow 200e18: sumBorrow = 100 × 200 = 20000e18 > 16000e18 → shortfall
      await expect(f.vTokenB.connect(f.user).borrow(parseUnits("200", 18))).to.be.revertedWith("math error");
    });

    it("redeem reverts — position deeply underwater at bounded prices", async () => {
      // Borrow at NORMAL prices first, then crash
      await f.vTokenB.connect(f.user).borrow(parseUnits("100", 18));
      applyCrashPrices();

      // Redeem 500 vTokens → 500 remaining: sumCollateral = 0.8 × 20 × 500 = 8000e18
      // sumBorrow = 100 × 100 = 10000e18 → shortfall
      await expect(f.vTokenA.connect(f.user).redeemUnderlying(parseUnits("500", 18))).to.be.revertedWith("math error");
    });

    it("liquidation: borrower solvent at LT with moderate borrow → INSUFFICIENT_SHORTFALL", async () => {
      // Borrow at NORMAL prices first, then crash
      await f.vTokenB.connect(f.user).borrow(parseUnits("100", 18));
      applyCrashPrices();

      // LT: sumCollateral = 0.9 × 20 × 1000 = 18000e18 > sumBorrow = 100 × 100 = 10000e18 → solvent
      const repayAmount = parseUnits("50", 18);
      await f.underlyingB.harnessSetBalance(f.liquidator.address, repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);

      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "Failure"); // INSUFFICIENT_SHORTFALL
    });

    it("liquidation succeeds when borrower underwater at LT", async () => {
      // Borrow at NORMAL prices first, then crash
      await f.vTokenB.connect(f.user).borrow(parseUnits("200", 18));
      applyCrashPrices();

      // LT: sumCollateral = 0.9 × 20 × 1000 = 18000e18 vs sumBorrow = 100 × 200 = 20000e18
      // Shortfall = 2000e18 → liquidation allowed
      const repayAmount = parseUnits("100", 18);
      await f.underlyingB.harnessSetBalance(f.liquidator.address, repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);

      const liquidatorVTokenBefore = await f.vTokenA.balanceOf(f.liquidator.address);
      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "LiquidateBorrow");

      const liquidatorVTokenAfter = await f.vTokenA.balanceOf(f.liquidator.address);
      expect(liquidatorVTokenAfter).to.be.gt(liquidatorVTokenBefore);
    });
  });

  // =========================================================================
  // Part 1.4: Borrow Token Crash — Debt Price Crashed ($100 → $10)
  // =========================================================================
  describe("4. Borrow Token Crash — Debt Price Crashed ($100 → $10)", () => {
    /*
     * vTokenB spot crashes from $100 to $10. DBO bounds debt at $100 (window max).
     * Collateral (vTokenA) unchanged at $100.
     *
     * At bounded: collateral $100, debt $100 (bounded)
     *   sumCollateral = 0.8 × 100 × 1000 = 80000e18
     *   sumBorrow (bounded) = 100 × borrowBalance
     *
     * At spot $10 debt:
     *   sumBorrow (spot) = 10 × borrowBalance
     */
    const CRASHED_BORROW_SPOT = parseUnits("10", 18);
    const BOUNDED_DEBT_AT_MAX = NORMAL_PRICE; // window max $100

    let f: RealVTokenFixture;

    // Helper: apply borrow token crash prices
    function applyBorrowCrashPrices(): void {
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenA.address).returns(NORMAL_PRICE);
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenB.address).returns(CRASHED_BORROW_SPOT);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([NORMAL_PRICE, NORMAL_PRICE]);
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenB.address)
        .returns([CRASHED_BORROW_SPOT, BOUNDED_DEBT_AT_MAX]);
    }

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);

      // Set up collateral at NORMAL prices (no borrow yet)
      await setupPosition(f, f.user, COLLATERAL_AMOUNT);
    });

    it("borrow reverts — bounded debt at $100 blocks over-borrowing cheap tokens", async () => {
      applyBorrowCrashPrices();
      // At spot $10: 5000 × 10 = 50000e18 < 80000e18 → would succeed
      // At bounded $100: 5000 × 100 = 500000e18 >> 80000e18 → blocked
      const excessBorrow = parseUnits("5000", 18);
      await expect(f.vTokenB.connect(f.user).borrow(excessBorrow)).to.be.revertedWith("math error");
    });

    it("borrow succeeds within bounded capacity", async () => {
      applyBorrowCrashPrices();
      // 700 × 100 = 70000e18 < 80000e18 → OK
      const safeBorrow = parseUnits("700", 18);
      await expect(f.vTokenB.connect(f.user).borrow(safeBorrow)).to.not.be.reverted;
    });

    it("liquidation uses spot $10 for debt — borrower very solvent", async () => {
      // Borrow at NORMAL prices first, then crash borrow token
      await f.vTokenB.connect(f.user).borrow(parseUnits("700", 18));
      applyBorrowCrashPrices();

      // LT: sumCollateral = 0.9 × 100 × 1000 = 90000e18
      // sumBorrow = 10 × 700 = 7000e18 → very solvent
      const repayAmount = parseUnits("350", 18);
      await f.underlyingB.harnessSetBalance(f.liquidator.address, repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);

      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "Failure"); // INSUFFICIENT_SHORTFALL
    });
  });

  // =========================================================================
  // Part 1.5: Multi-Step Attack via vToken
  // =========================================================================
  describe("5. Multi-Step Attack Scenarios", () => {
    let f: RealVTokenFixture;

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);
    });

    it("pump-borrow-dump: borrow blocked at pump, safe after dump", async () => {
      // Set up position at normal prices
      await setupPosition(f, f.user, COLLATERAL_AMOUNT);

      // Step 1: Normal — borrow 700e18 succeeds
      await expect(f.vTokenB.connect(f.user).borrow(parseUnits("700", 18))).to.not.be.reverted;

      // Repay so we can test pump blocking
      const debt = await f.vTokenB.borrowBalanceStored(f.user.address);
      await f.underlyingB.harnessSetBalance(f.user.address, debt);
      await f.underlyingB.connect(f.user).approve(f.vTokenB.address, debt);
      await f.vTokenB.connect(f.user).repayBorrow(debt);

      // Step 2: Pump — spot $500, DBO bounds at $100
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenA.address).returns(parseUnits("500", 18));
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([NORMAL_PRICE, NORMAL_PRICE]);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, NORMAL_PRICE]);

      // Try 2000e18 — at pumped spot would succeed but bounded blocks it
      await expect(f.vTokenB.connect(f.user).borrow(parseUnits("2000", 18))).to.be.revertedWith("math error");

      // Step 3: Dump — prices return to normal
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenA.address).returns(NORMAL_PRICE);

      // Borrow 700e18 works again
      await expect(f.vTokenB.connect(f.user).borrow(parseUnits("700", 18))).to.not.be.reverted;
    });

    it("borrow at spot → protection activates → redeem blocked", async () => {
      await setupPosition(f, f.user, COLLATERAL_AMOUNT);

      // Step 1: DBO returns spot → borrow near max (790e18)
      await f.vTokenB.connect(f.user).borrow(parseUnits("790", 18));

      // Step 2: Protection activates — DBO returns conservative bounded prices
      const CONSERVATIVE_COLLATERAL = parseUnits("80", 18); // collateral bounded down
      const CONSERVATIVE_DEBT = parseUnits("120", 18); // debt bounded up
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenA.address)
        .returns([CONSERVATIVE_COLLATERAL, CONSERVATIVE_DEBT]);
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenB.address)
        .returns([NORMAL_PRICE, CONSERVATIVE_DEBT]);

      // sumCollateral = 0.8 × 80 × 1000 = 64000e18
      // sumBorrow = 120 × 790 = 94800e18 → shortfall = 30800e18
      // Any redeem should fail
      await expect(f.vTokenA.connect(f.user).redeemUnderlying(parseUnits("1", 18))).to.be.revertedWith("math error");
    });
  });

  // =========================================================================
  // Part 1.6: Full Liquidation End-to-End
  // =========================================================================
  describe("6. Full Liquidation End-to-End", () => {
    let f: RealVTokenFixture;

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);
    });

    it("full liquidation: liquidator repays debt, seizes collateral", async () => {
      // Set up user with collateral and borrow at normal prices
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, parseUnits("800", 18));

      // Crash collateral to make user liquidatable at LT
      const CRASHED = parseUnits("50", 18);
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenA.address).returns(CRASHED);
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenB.address).returns(NORMAL_PRICE);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([CRASHED, CRASHED]);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, NORMAL_PRICE]);

      // LT: sumCollateral = 0.9 × 50 × 1000 = 45000e18
      // sumBorrow = 100 × 800 = 80000e18 → shortfall = 35000e18

      // Liquidator repays 50% of 800 = 400e18
      const repayAmount = parseUnits("400", 18);
      await f.underlyingB.harnessSetBalance(f.liquidator.address, repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);

      const borrowerDebtBefore = await f.vTokenB.borrowBalanceStored(f.user.address);
      const liquidatorCollBefore = await f.vTokenA.balanceOf(f.liquidator.address);

      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "LiquidateBorrow");

      // Verify borrower debt decreased
      const borrowerDebtAfter = await f.vTokenB.borrowBalanceStored(f.user.address);
      expect(borrowerDebtAfter).to.be.lt(borrowerDebtBefore);

      // Verify liquidator received seized vTokenA
      const liquidatorCollAfter = await f.vTokenA.balanceOf(f.liquidator.address);
      expect(liquidatorCollAfter).to.be.gt(liquidatorCollBefore);
    });

    it("liquidation blocked when borrower solvent at spot LT", async () => {
      // User borrows moderately
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, parseUnits("500", 18));

      // DBO returns conservative prices (irrelevant for liquidation)
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenA.address)
        .returns([parseUnits("50", 18), parseUnits("150", 18)]);
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenB.address)
        .returns([NORMAL_PRICE, parseUnits("150", 18)]);

      // Spot prices normal → LT: 0.9 × 100 × 1000 = 90000 > 100 × 500 = 50000 → solvent
      const repayAmount = parseUnits("250", 18);
      await f.underlyingB.harnessSetBalance(f.liquidator.address, repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);

      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "Failure"); // INSUFFICIENT_SHORTFALL
    });
  });

  // =========================================================================
  // Part 2: Comptroller-Level Tests
  // =========================================================================

  // =========================================================================
  // Part 2.1: exitMarket with DBO
  // =========================================================================
  describe("7. exitMarket with DBO protection", () => {
    let f: RealVTokenFixture;

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);
    });

    it("exitMarket succeeds with no borrows", async () => {
      // Supply collateral only, no borrows
      await f.underlyingA.harnessSetBalance(f.user.address, COLLATERAL_AMOUNT);
      await f.underlyingA.connect(f.user).approve(f.vTokenA.address, COLLATERAL_AMOUNT);
      await f.vTokenA.connect(f.user).mint(COLLATERAL_AMOUNT);
      await f.comptroller.connect(f.user).enterMarkets([f.vTokenA.address]);

      // Even with conservative DBO prices, exit works (no borrows = no shortfall)
      f.dbo.getBoundedPricesView.returns([parseUnits("50", 18), parseUnits("150", 18)]);

      const errCode = await f.comptroller.connect(f.user).callStatic.exitMarket(f.vTokenA.address);
      expect(errCode).to.equal(0); // NO_ERROR
    });

    it("exitMarket blocked — bounded prices show shortfall", async () => {
      // Supply collateral and borrow
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, parseUnits("750", 18));
      await f.comptroller.connect(f.user).enterMarkets([f.vTokenB.address]);

      // DBO bounds conservatively
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenA.address)
        .returns([parseUnits("80", 18), parseUnits("120", 18)]);
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenB.address)
        .returns([NORMAL_PRICE, parseUnits("120", 18)]);

      // Exiting vTokenA → all collateral removed → sumCollateral = 0
      // sumBorrow = 120 × 750 = 90000e18 → massive shortfall → REJECTION
      const errCode = await f.comptroller.connect(f.user).callStatic.exitMarket(f.vTokenA.address);
      expect(errCode).to.not.equal(0); // REJECTION
    });

    it("exitMarket blocked at bounded CF but would be fine at spot LT", async () => {
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, parseUnits("750", 18));
      await f.comptroller.connect(f.user).enterMarkets([f.vTokenB.address]);

      // DBO returns conservative bounded: collateral $80, debt $120
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenA.address)
        .returns([parseUnits("80", 18), parseUnits("120", 18)]);
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenB.address)
        .returns([NORMAL_PRICE, parseUnits("120", 18)]);

      // Exit uses CF path (redeemAllowedInternal) → bounded prices → shortfall
      const exitErrCode = await f.comptroller.connect(f.user).callStatic.exitMarket(f.vTokenA.address);
      expect(exitErrCode).to.not.equal(0);

      // But account is solvent at LT/spot (getAccountLiquidity uses LT path)
      const [ltErr, ltLiquidity, ltShortfall] = await f.comptroller.getAccountLiquidity(f.user.address);
      expect(ltErr).to.equal(0);
      expect(ltLiquidity).to.be.gt(0);
      expect(ltShortfall).to.equal(0);
    });
  });

  // =========================================================================
  // Part 2.2: View Function Divergence (CF vs LT path)
  // =========================================================================
  describe("8. View Function Divergence — CF vs LT path", () => {
    let f: RealVTokenFixture;

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);

      // Set up position with borrow
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, parseUnits("750", 18));

      // DBO bounds conservatively: collateral $80, debt $120
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenA.address)
        .returns([parseUnits("80", 18), parseUnits("120", 18)]);
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenB.address)
        .returns([NORMAL_PRICE, parseUnits("120", 18)]);
    });

    it("getBorrowingPower uses bounded prices (CF) → shortfall", async () => {
      // CF path: sumCollateral = 0.8 × 80 × 1000 = 64000e18
      // sumBorrow = 120 × 750 = 90000e18 → shortfall = 26000e18
      const [err, liquidity, shortfall] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.be.gt(0);
    });

    it("getAccountLiquidity uses spot prices (LT) → solvent", async () => {
      // LT path: sumCollateral = 0.9 × 100 × 1000 = 90000e18
      // sumBorrow = 100 × 750 = 75000e18 → liquidity = 15000e18
      const [err, liquidity, shortfall] = await f.comptroller.getAccountLiquidity(f.user.address);
      expect(err).to.equal(0);
      expect(liquidity).to.be.gt(0);
      expect(shortfall).to.equal(0);
    });

    it("same account: underwater at CF bounded, solvent at LT spot — no premature liquidation", async () => {
      // CF path shows shortfall
      const [, cfLiquidity, cfShortfall] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(cfLiquidity).to.equal(0);
      expect(cfShortfall).to.be.gt(0);

      // LT path shows solvency
      const [, ltLiquidity, ltShortfall] = await f.comptroller.getAccountLiquidity(f.user.address);
      expect(ltLiquidity).to.be.gt(0);
      expect(ltShortfall).to.equal(0);

      // Liquidation uses LT path → NOT allowed (solvent at spot)
      const repayAmount = parseUnits("375", 18);
      await f.underlyingB.harnessSetBalance(f.liquidator.address, repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);
      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "Failure"); // INSUFFICIENT_SHORTFALL
    });
  });

  // =========================================================================
  // Part 2.3: Cross-Path — DBO blocks borrowing but doesn't trigger liquidation
  // =========================================================================
  describe("9. Cross-Path: DBO blocks borrowing but does NOT trigger liquidation", () => {
    let f: RealVTokenFixture;

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);
    });

    it("borrow reverts (CF bounded) but liquidation returns INSUFFICIENT_SHORTFALL (LT spot)", async () => {
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, parseUnits("600", 18));

      // DBO conservative: collateral $70, debt $130
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenA.address)
        .returns([parseUnits("70", 18), parseUnits("130", 18)]);
      f.dbo.getBoundedPricesView
        .whenCalledWith(f.vTokenB.address)
        .returns([NORMAL_PRICE, parseUnits("130", 18)]);

      // CF: sumCollateral = 0.8 × 70 × 1000 = 56000e18
      // sumBorrow = 130 × 600 = 78000e18 → shortfall → cannot borrow more
      await expect(f.vTokenB.connect(f.user).borrow(parseUnits("1", 18))).to.be.revertedWith("math error");

      // LT: sumCollateral = 0.9 × 100 × 1000 = 90000e18
      // sumBorrow = 100 × 600 = 60000e18 → solvent → no liquidation
      const repayAmount = parseUnits("300", 18);
      await f.underlyingB.harnessSetBalance(f.liquidator.address, repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);

      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "Failure"); // INSUFFICIENT_SHORTFALL
    });
  });

  // =========================================================================
  // Part 2.4: claimVenus with DBO
  // =========================================================================
  describe("10. claimVenus with DBO (integration verification)", () => {
    let f: RealVTokenFixture;

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, parseUnits("500", 18));
    });

    it("claimVenus calls updateProtectionState for each entered asset", async () => {
      f.dbo.updateProtectionState.reset();

      // claimVenus → _getAccountLiquidity(USE_COLLATERAL_FACTOR) → _updateProtectionStates
      await f.comptroller.connect(f.user)["claimVenus(address)"](f.user.address);

      // updateProtectionState should have been called for vTokenA (entered market)
      expect(f.dbo.updateProtectionState).to.have.been.calledWith(f.vTokenA.address);
    });
  });
});
