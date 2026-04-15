import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import {
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  IAccessControlManagerV5,
  IDeviationBoundedOracle,
  IProtocolShareReserve,
  InterestRateModel,
  MockToken,
  MockToken__factory,
  PriceOracle,
  Unitroller,
  VBep20Delegator__factory,
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
  vTokenA: any; // collateral market (VBep20MockDelegate)
  vTokenB: any; // borrow market (VBep20MockDelegate)
  underlyingA: MockContract<MockToken>;
  underlyingB: MockContract<MockToken>;
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
  const underlyingFactory = await smock.mock<MockToken__factory>("MockToken");
  const underlyingA = await underlyingFactory.deploy("Token A", "TKNA", 18);
  const underlyingB = await underlyingFactory.deploy("Token B", "TKNB", 18);

  // 6. Deploy real vTokens (delegator + delegate pattern, like flashLoan.ts)
  const VBep20ImplFactory = await ethers.getContractFactory("VBep20MockDelegate");
  const vTokenImpl = await VBep20ImplFactory.deploy();
  await vTokenImpl.deployed();

  const vTokenAProxy = await new VBep20Delegator__factory(admin).deploy(
    underlyingA.address,
    comptroller.address,
    interestRateModel.address,
    INITIAL_EXCHANGE_RATE,
    "vToken A",
    "vTKNA",
    18,
    admin.address,
    vTokenImpl.address,
    "0x",
  );
  const vTokenA = await ethers.getContractAt("VBep20MockDelegate", vTokenAProxy.address);

  const vTokenBProxy = await new VBep20Delegator__factory(admin).deploy(
    underlyingB.address,
    comptroller.address,
    interestRateModel.address,
    INITIAL_EXCHANGE_RATE,
    "vToken B",
    "vTKNB",
    18,
    admin.address,
    vTokenImpl.address,
    "0x",
  );
  const vTokenB = await ethers.getContractAt("VBep20MockDelegate", vTokenBProxy.address);

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

  // Pre-fund vTokenB pool with liquidity for borrows (contract can't call faucet)
  await underlyingB.setVariable("_balances", { [vTokenB.address]: POOL_LIQUIDITY });
  await underlyingB.setVariable("_totalSupply", POOL_LIQUIDITY);
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
  await underlyingA.connect(signer).faucet(collateralAmount);
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
      await f.underlyingA.connect(f.user).faucet(COLLATERAL_AMOUNT);
      await f.underlyingA.connect(f.user).approve(f.vTokenA.address, COLLATERAL_AMOUNT);
      await expect(f.vTokenA.connect(f.user).mint(COLLATERAL_AMOUNT)).to.not.be.reverted;

      const vBalance = await f.vTokenA.balanceOf(f.user.address);
      expect(vBalance).to.be.equal(COLLATERAL_AMOUNT);
    });

    it("borrow succeeds with sufficient collateral", async () => {
      await setupPosition(f, f.user, COLLATERAL_AMOUNT);

      // maxBorrow = 800e18 at $100; borrow 700e18 → solvent
      const borrowAmount = parseUnits("700", 18);
      const uBalBefore = await f.underlyingB.balanceOf(f.user.address);
      const borrowBefore = await f.vTokenB.borrowBalanceStored(f.user.address);
      await expect(f.vTokenB.connect(f.user).borrow(borrowAmount)).to.emit(f.vTokenB, "Borrow");

      expect(await f.underlyingB.balanceOf(f.user.address)).to.equal(uBalBefore.add(borrowAmount));
      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.equal(borrowBefore.add(borrowAmount));
    });

    it("redeem succeeds when account stays solvent", async () => {
      const borrowAmount = parseUnits("300", 18);
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, borrowAmount);

      // Redeem 100 underlying → 900 vTokens remaining
      // sumCollateral = 0.8 × 100 × 900 = 72000e18 > sumBorrow = 100 × 300 = 30000e18
      const redeemAmount = parseUnits("100", 18);
      const vBalBefore = await f.vTokenA.balanceOf(f.user.address);
      const uBalBefore = await f.underlyingA.balanceOf(f.user.address);
      await expect(f.vTokenA.connect(f.user).redeemUnderlying(redeemAmount)).to.emit(f.vTokenA, "Redeem");

      // ER=1 → vTokens burned = underlying redeemed
      expect(await f.vTokenA.balanceOf(f.user.address)).to.equal(vBalBefore.sub(redeemAmount));
      expect(await f.underlyingA.balanceOf(f.user.address)).to.equal(uBalBefore.add(redeemAmount));
    });

    it("repayBorrow succeeds", async () => {
      const borrowAmount = parseUnits("300", 18);
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, borrowAmount);

      const repayAmount = parseUnits("100", 18);
      await f.underlyingB.connect(f.user).faucet(repayAmount);
      await f.underlyingB.connect(f.user).approve(f.vTokenB.address, repayAmount);

      const borrowBefore = await f.vTokenB.borrowBalanceStored(f.user.address);
      const uBalBefore = await f.underlyingB.balanceOf(f.user.address);
      await expect(f.vTokenB.connect(f.user).repayBorrow(repayAmount)).to.emit(f.vTokenB, "RepayBorrow");

      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.equal(borrowBefore.sub(repayAmount));
      expect(await f.underlyingB.balanceOf(f.user.address)).to.equal(uBalBefore.sub(repayAmount));
    });

    it("transfer succeeds when sender stays solvent", async () => {
      const borrowAmount = parseUnits("300", 18);
      await setupPosition(f, f.user, COLLATERAL_AMOUNT, borrowAmount);

      // Transfer 100 vTokenA → 900 remaining → still solvent at normal prices
      const transferAmount = parseUnits("100", 18);
      const srcBefore = await f.vTokenA.balanceOf(f.user.address);
      const dstBefore = await f.vTokenA.balanceOf(f.attacker.address);
      await expect(f.vTokenA.connect(f.user).transfer(f.attacker.address, transferAmount)).to.emit(
        f.vTokenA,
        "Transfer",
      );

      expect(await f.vTokenA.balanceOf(f.user.address)).to.equal(srcBefore.sub(transferAmount));
      expect(await f.vTokenA.balanceOf(f.attacker.address)).to.equal(dstBefore.add(transferAmount));
    });

    it("full lifecycle: mint → enter → borrow → repay → redeem", async () => {
      // Mint collateral
      await f.underlyingA.connect(f.user).faucet(COLLATERAL_AMOUNT);
      await f.underlyingA.connect(f.user).approve(f.vTokenA.address, COLLATERAL_AMOUNT);
      await f.vTokenA.connect(f.user).mint(COLLATERAL_AMOUNT);
      await f.comptroller.connect(f.user).enterMarkets([f.vTokenA.address]);

      // Verify post-mint: user has vTokens (ER=1)
      expect(await f.vTokenA.balanceOf(f.user.address)).to.equal(COLLATERAL_AMOUNT);

      // Fund pool and borrow
      await f.underlyingB.setVariable("_balances", { [f.vTokenB.address]: POOL_LIQUIDITY });
      await f.vTokenB.harnessSetInternalCash(POOL_LIQUIDITY);
      const borrowAmount = parseUnits("500", 18);
      await f.vTokenB.connect(f.user).borrow(borrowAmount);

      // Verify post-borrow: user received underlying, debt recorded
      expect(await f.underlyingB.balanceOf(f.user.address)).to.equal(borrowAmount);
      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.equal(borrowAmount);

      // Repay full borrow
      const debt = await f.vTokenB.borrowBalanceStored(f.user.address);
      await f.underlyingB.connect(f.user).faucet(debt);
      await f.underlyingB.connect(f.user).approve(f.vTokenB.address, debt);
      await f.vTokenB.connect(f.user).repayBorrow(debt);

      // Verify post-repay: debt cleared
      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.equal(0);

      // Redeem all collateral (no borrows → no shortfall)
      const vBalance = await f.vTokenA.balanceOf(f.user.address);
      await expect(f.vTokenA.connect(f.user).redeem(vBalance)).to.emit(f.vTokenA, "Redeem");

      // Verify post-redeem: no vTokens remaining, underlying returned
      expect(await f.vTokenA.balanceOf(f.user.address)).to.equal(0);
      expect(await f.underlyingA.balanceOf(f.user.address)).to.equal(COLLATERAL_AMOUNT);
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
      await f.underlyingA.connect(f.attacker).faucet(mintAmount);
      await f.underlyingA.connect(f.attacker).approve(f.vTokenA.address, mintAmount);

      const vBalBefore = await f.vTokenA.balanceOf(f.attacker.address);
      const uBalBefore = await f.underlyingA.balanceOf(f.attacker.address);
      await expect(f.vTokenA.connect(f.attacker).mint(mintAmount)).to.emit(f.vTokenA, "Mint");

      expect(await f.vTokenA.balanceOf(f.attacker.address)).to.equal(vBalBefore.add(mintAmount));
      expect(await f.underlyingA.balanceOf(f.attacker.address)).to.equal(uBalBefore.sub(mintAmount));
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
      const uBalBefore = await f.underlyingB.balanceOf(f.user.address);
      const borrowBefore = await f.vTokenB.borrowBalanceStored(f.user.address);
      await expect(f.vTokenB.connect(f.user).borrow(safeBorrow)).to.emit(f.vTokenB, "Borrow");

      expect(await f.underlyingB.balanceOf(f.user.address)).to.equal(uBalBefore.add(safeBorrow));
      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.equal(borrowBefore.add(safeBorrow));
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
      await f.underlyingB.connect(f.user).faucet(repayAmount);
      await f.underlyingB.connect(f.user).approve(f.vTokenB.address, repayAmount);

      const borrowBefore = await f.vTokenB.borrowBalanceStored(f.user.address);
      const uBalBefore = await f.underlyingB.balanceOf(f.user.address);
      await expect(f.vTokenB.connect(f.user).repayBorrow(repayAmount)).to.emit(f.vTokenB, "RepayBorrow");

      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.equal(borrowBefore.sub(repayAmount));
      expect(await f.underlyingB.balanceOf(f.user.address)).to.equal(uBalBefore.sub(repayAmount));
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
      await f.underlyingB.connect(f.liquidator).faucet(repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);

      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "Failure");
    });

    it("getBorrowingPower at bounded $100 unchanged by pump — diverges from LT spot", async () => {
      // Before pump: CF path uses DBO [$100,$100], LT path uses spot $100
      const [errBefore, liquidityBefore] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(errBefore).to.equal(0);
      expect(liquidityBefore).to.equal(parseUnits("80000", 18));

      // After pump: DBO still returns [$100,$100] → CF path unchanged
      applyPumpPrices();
      const [errAfter, liquidityAfter] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(errAfter).to.equal(0);
      expect(liquidityAfter).to.equal(parseUnits("80000", 18));

      // LT path sees pumped $500 spot → much higher collateral value
      const [ltErr, ltLiquidity] = await f.comptroller.getAccountLiquidity(f.user.address);
      expect(ltErr).to.equal(0);
      expect(ltLiquidity).to.equal(parseUnits("450000", 18));
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
      await f.underlyingB.connect(f.liquidator).faucet(repayAmount);
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
      await f.underlyingB.connect(f.liquidator).faucet(repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);

      const liquidatorVTokenBefore = await f.vTokenA.balanceOf(f.liquidator.address);
      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "LiquidateBorrow");

      const liquidatorVTokenAfter = await f.vTokenA.balanceOf(f.liquidator.address);
      expect(liquidatorVTokenAfter).to.be.gt(liquidatorVTokenBefore);
    });

    it("getBorrowingPower exact values after crash with 100e18 borrow", async () => {
      await f.vTokenB.connect(f.user).borrow(parseUnits("100", 18));
      applyCrashPrices();

      // CF path: sumCollateral = 0.8 × 20 × 1000 = 16000e18, sumBorrow = 100 × 100 = 10000e18
      const [err, liquidity, shortfall] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("6000", 18));
      expect(shortfall).to.equal(0);
    });

    it("getBorrowingPower before vs after crash — DBO bounds reduce capacity", async () => {
      // Before crash (no borrow): sumCollateral = 0.8 × 100 × 1000 = 80000e18
      const [errBefore, liquidityBefore, shortfallBefore] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(errBefore).to.equal(0);
      expect(liquidityBefore).to.equal(parseUnits("80000", 18));
      expect(shortfallBefore).to.equal(0);

      // After crash: DBO returns collateral at $20 → sumCollateral = 0.8 × 20 × 1000 = 16000e18
      applyCrashPrices();
      const [errAfter, liquidityAfter, shortfallAfter] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(errAfter).to.equal(0);
      expect(liquidityAfter).to.equal(parseUnits("16000", 18));
      expect(shortfallAfter).to.equal(0);

      // Capacity dropped by 64000e18 (80% reduction matching 80% price drop from $100 → $20)
      expect(liquidityBefore).to.be.gt(liquidityAfter);
      expect(liquidityBefore.sub(liquidityAfter)).to.equal(parseUnits("64000", 18));
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
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([CRASHED_BORROW_SPOT, BOUNDED_DEBT_AT_MAX]);
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
      const uBalBefore = await f.underlyingB.balanceOf(f.user.address);
      const borrowBefore = await f.vTokenB.borrowBalanceStored(f.user.address);
      await expect(f.vTokenB.connect(f.user).borrow(safeBorrow)).to.emit(f.vTokenB, "Borrow");

      expect(await f.underlyingB.balanceOf(f.user.address)).to.equal(uBalBefore.add(safeBorrow));
      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.equal(borrowBefore.add(safeBorrow));
    });

    it("liquidation uses spot $10 for debt — borrower very solvent", async () => {
      // Borrow at NORMAL prices first, then crash borrow token
      await f.vTokenB.connect(f.user).borrow(parseUnits("700", 18));
      applyBorrowCrashPrices();

      // LT: sumCollateral = 0.9 × 100 × 1000 = 90000e18
      // sumBorrow = 10 × 700 = 7000e18 → very solvent
      const repayAmount = parseUnits("350", 18);
      await f.underlyingB.connect(f.liquidator).faucet(repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);

      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "Failure"); // INSUFFICIENT_SHORTFALL
    });

    it("getBorrowingPower unchanged — bounded debt at $100 same as pre-crash", async () => {
      await f.vTokenB.connect(f.user).borrow(parseUnits("700", 18));

      // Before crash: sumCollateral = 0.8 × 100 × 1000 = 80000e18, sumBorrow = 100 × 700 = 70000e18
      const [errBefore, liquidityBefore, shortfallBefore] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(errBefore).to.equal(0);
      expect(liquidityBefore).to.equal(parseUnits("10000", 18));
      expect(shortfallBefore).to.equal(0);

      // After crash: DBO bounds debt at $100 (window max) → same as before
      applyBorrowCrashPrices();
      const [errAfter, liquidityAfter, shortfallAfter] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(errAfter).to.equal(0);
      expect(liquidityAfter).to.equal(parseUnits("10000", 18));
      expect(shortfallAfter).to.equal(0);
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
      const borrow1 = parseUnits("700", 18);
      const uBalBefore1 = await f.underlyingB.balanceOf(f.user.address);
      await expect(f.vTokenB.connect(f.user).borrow(borrow1)).to.emit(f.vTokenB, "Borrow");
      expect(await f.underlyingB.balanceOf(f.user.address)).to.equal(uBalBefore1.add(borrow1));

      // Repay so we can test pump blocking
      const debt = await f.vTokenB.borrowBalanceStored(f.user.address);
      await f.underlyingB.connect(f.user).faucet(debt);
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
      const borrow3 = parseUnits("700", 18);
      const uBalBefore3 = await f.underlyingB.balanceOf(f.user.address);
      const borrowBefore3 = await f.vTokenB.borrowBalanceStored(f.user.address);
      await expect(f.vTokenB.connect(f.user).borrow(borrow3)).to.emit(f.vTokenB, "Borrow");
      expect(await f.underlyingB.balanceOf(f.user.address)).to.equal(uBalBefore3.add(borrow3));
      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.equal(borrowBefore3.add(borrow3));
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
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, CONSERVATIVE_DEBT]);

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
      await f.underlyingB.connect(f.liquidator).faucet(repayAmount);
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
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, parseUnits("150", 18)]);

      // Spot prices normal → LT: 0.9 × 100 × 1000 = 90000 > 100 × 500 = 50000 → solvent
      const repayAmount = parseUnits("250", 18);
      await f.underlyingB.connect(f.liquidator).faucet(repayAmount);
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
      await f.underlyingA.connect(f.user).faucet(COLLATERAL_AMOUNT);
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
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, parseUnits("120", 18)]);

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
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, parseUnits("120", 18)]);

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
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, parseUnits("120", 18)]);
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
      await f.underlyingB.connect(f.liquidator).faucet(repayAmount);
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
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, parseUnits("130", 18)]);

      // CF: sumCollateral = 0.8 × 70 × 1000 = 56000e18
      // sumBorrow = 130 × 600 = 78000e18 → shortfall → cannot borrow more
      await expect(f.vTokenB.connect(f.user).borrow(parseUnits("1", 18))).to.be.revertedWith("math error");

      // LT: sumCollateral = 0.9 × 100 × 1000 = 90000e18
      // sumBorrow = 100 × 600 = 60000e18 → solvent → no liquidation
      const repayAmount = parseUnits("300", 18);
      await f.underlyingB.connect(f.liquidator).faucet(repayAmount);
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

  // =========================================================================
  // Part 11: Oracle vs DBO Price Divergence Through Protection Lifecycle
  // =========================================================================
  describe("11. Oracle vs DBO price divergence through protection lifecycle", () => {
    let f: RealVTokenFixture;

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);
      await setupPosition(f, f.user, COLLATERAL_AMOUNT);
    });

    it("4-phase cycle: same → diverge (pump) → diverge (stale) → same (disabled)", async () => {
      // Phase 1 — Normal: oracle=$100, DBO=[$100,$100] → same
      const spotPhase1 = NORMAL_PRICE;
      const dboPhase1 = [NORMAL_PRICE, NORMAL_PRICE];
      expect(dboPhase1[0]).to.equal(spotPhase1);
      expect(dboPhase1[1]).to.equal(spotPhase1);

      const [, liquidityP1] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(liquidityP1).to.equal(parseUnits("80000", 18));

      // Phase 2 — Pump triggers protection: oracle=$500, DBO=[$100,$500]
      const PUMPED = parseUnits("500", 18);
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenA.address).returns(PUMPED);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([NORMAL_PRICE, PUMPED]);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, NORMAL_PRICE]);

      const [, liquidityP2] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(liquidityP2).to.equal(parseUnits("80000", 18));
      const [, ltLiqP2] = await f.comptroller.getAccountLiquidity(f.user.address);
      expect(ltLiqP2).to.equal(parseUnits("450000", 18));

      // Phase 3 — Spot normalizes, protection still active: oracle=$100, DBO=[$100,$500]
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenA.address).returns(NORMAL_PRICE);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([NORMAL_PRICE, PUMPED]);

      const [, liquidityP3] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(liquidityP3).to.equal(parseUnits("80000", 18));
      const [, ltLiqP3] = await f.comptroller.getAccountLiquidity(f.user.address);
      expect(ltLiqP3).to.equal(parseUnits("90000", 18));

      // Phase 4 — Protection disabled: DBO returns [$100,$100] again
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([NORMAL_PRICE, NORMAL_PRICE]);

      const [, liquidityP4] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(liquidityP4).to.equal(parseUnits("80000", 18));
      const [, ltLiqP4] = await f.comptroller.getAccountLiquidity(f.user.address);
      expect(ltLiqP4).to.equal(parseUnits("90000", 18));
    });
  });

  // =========================================================================
  // Part 12: Full Lifecycle — Normal → Protect → Block → Disable → Allow
  // =========================================================================
  describe("12. Full lifecycle: normal → protect → block → disable → allow", () => {
    let f: RealVTokenFixture;

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);
    });

    it("complete cycle with balance verification at each step", async () => {
      await setupPosition(f, f.user, COLLATERAL_AMOUNT);

      // Step 2: Borrow succeeds at normal prices
      const borrowAmount = parseUnits("700", 18);
      const uBalBefore = await f.underlyingB.balanceOf(f.user.address);
      const borrowBefore = await f.vTokenB.borrowBalanceStored(f.user.address);
      await expect(f.vTokenB.connect(f.user).borrow(borrowAmount)).to.emit(f.vTokenB, "Borrow");
      expect(await f.underlyingB.balanceOf(f.user.address)).to.equal(uBalBefore.add(borrowAmount));
      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.equal(borrowBefore.add(borrowAmount));

      // Step 3: Apply conservative DBO prices → actions blocked
      const BOUNDED_COLLATERAL = parseUnits("60", 18);
      const BOUNDED_DEBT = parseUnits("140", 18);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([BOUNDED_COLLATERAL, BOUNDED_DEBT]);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, BOUNDED_DEBT]);

      await expect(f.vTokenB.connect(f.user).borrow(parseUnits("1", 18))).to.be.revertedWith("math error");
      await expect(f.vTokenA.connect(f.user).redeemUnderlying(parseUnits("1", 18))).to.be.revertedWith("math error");
      await expect(f.vTokenA.connect(f.user).transfer(f.attacker.address, parseUnits("1", 18))).to.emit(
        f.vTokenA,
        "Failure",
      );

      // Step 4: Reset DBO to normal → actions allowed again
      resetFakes(f);

      const repayAmount = parseUnits("400", 18);
      await f.underlyingB.connect(f.user).faucet(repayAmount);
      await f.underlyingB.connect(f.user).approve(f.vTokenB.address, repayAmount);
      const borrowBeforeRepay = await f.vTokenB.borrowBalanceStored(f.user.address);
      await expect(f.vTokenB.connect(f.user).repayBorrow(repayAmount)).to.emit(f.vTokenB, "RepayBorrow");
      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.equal(borrowBeforeRepay.sub(repayAmount));

      const smallBorrow = parseUnits("100", 18);
      const uBal2 = await f.underlyingB.balanceOf(f.user.address);
      const borrow2 = await f.vTokenB.borrowBalanceStored(f.user.address);
      await expect(f.vTokenB.connect(f.user).borrow(smallBorrow)).to.emit(f.vTokenB, "Borrow");
      expect(await f.underlyingB.balanceOf(f.user.address)).to.equal(uBal2.add(smallBorrow));
      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.equal(borrow2.add(smallBorrow));

      const redeemAmt = parseUnits("50", 18);
      const vBal = await f.vTokenA.balanceOf(f.user.address);
      const uBalA = await f.underlyingA.balanceOf(f.user.address);
      await expect(f.vTokenA.connect(f.user).redeemUnderlying(redeemAmt)).to.emit(f.vTokenA, "Redeem");
      expect(await f.vTokenA.balanceOf(f.user.address)).to.equal(vBal.sub(redeemAmt));
      expect(await f.underlyingA.balanceOf(f.user.address)).to.equal(uBalA.add(redeemAmt));
    });
  });

  // =========================================================================
  // Part 13: Multi-Asset Protection Independence
  // =========================================================================
  describe("13. Multi-asset protection independence", () => {
    let f: RealVTokenFixture;

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);
    });

    it("conservative DBO on vTokenA blocks borrow, normal DBO on vTokenB allows borrow", async () => {
      await setupPosition(f, f.user, COLLATERAL_AMOUNT);

      // Conservative prices only for vTokenA
      const BOUNDED_COLLATERAL = parseUnits("50", 18);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([BOUNDED_COLLATERAL, NORMAL_PRICE]);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, NORMAL_PRICE]);

      // User: sumCollateral = 0.8 × 50 × 1000 = 40000e18. Borrow 500e18 = 50000e18 > 40000 → blocked
      await expect(f.vTokenB.connect(f.user).borrow(parseUnits("500", 18))).to.be.revertedWith("math error");

      // Attacker: collateral in vTokenB (normal prices), borrow from vTokenA
      await f.underlyingA.setVariable("_balances", { [f.vTokenA.address]: POOL_LIQUIDITY });
      await f.vTokenA.harnessSetInternalCash(POOL_LIQUIDITY);

      await f.underlyingB.connect(f.attacker).faucet(COLLATERAL_AMOUNT);
      await f.underlyingB.connect(f.attacker).approve(f.vTokenB.address, COLLATERAL_AMOUNT);
      await f.vTokenB.connect(f.attacker).mint(COLLATERAL_AMOUNT);
      await f.comptroller.connect(f.attacker).enterMarkets([f.vTokenB.address]);

      const attackerBorrow = parseUnits("700", 18);
      const uBalBefore = await f.underlyingA.balanceOf(f.attacker.address);
      const borrowBefore = await f.vTokenA.borrowBalanceStored(f.attacker.address);
      await expect(f.vTokenA.connect(f.attacker).borrow(attackerBorrow)).to.emit(f.vTokenA, "Borrow");
      expect(await f.underlyingA.balanceOf(f.attacker.address)).to.equal(uBalBefore.add(attackerBorrow));
      expect(await f.vTokenA.borrowBalanceStored(f.attacker.address)).to.equal(borrowBefore.add(attackerBorrow));
    });
  });

  // =========================================================================
  // Part 14: Extreme Volatility — Price Swings Past Max AND Below Min
  // =========================================================================
  describe("14. Extreme volatility — price swings past max and below min", () => {
    /*
     * Simulates a volatile market where price:
     *   1. Starts at $100
     *   2. Pumps to $300 → window max expands to $300, min stays $100
     *   3. Crashes to $10 → window min contracts to $10, max stays $300
     *   4. Window is now [$10, $300] — extremely wide
     *
     * DBO at extreme state:
     *   collateral = min(spot, windowMin) = min($10, $10) = $10
     *   debt = max(spot, windowMax) = max($10, $300) = $300
     */
    const PUMPED_EXTREME = parseUnits("300", 18);
    const CRASHED_EXTREME = parseUnits("10", 18);

    let f: RealVTokenFixture;

    // Helper: apply extreme volatility — price pumped then crashed
    // Both markets affected: vTokenA collateral crushed, vTokenB debt inflated
    function applyExtremeVolatility(): void {
      // vTokenA spot crashed to $10
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenA.address).returns(CRASHED_EXTREME);
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenB.address).returns(NORMAL_PRICE);
      // DBO: vTokenA window [$10, $300] → collateral=$10, debt=$300
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([CRASHED_EXTREME, PUMPED_EXTREME]);
      // DBO: vTokenB debt also inflated to $300 (simulates correlated volatility)
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, PUMPED_EXTREME]);
    }

    beforeEach(async () => {
      f = await loadFixture(deployRealVTokenFixture);
      resetFakes(f);
      await setupPosition(f, f.user, COLLATERAL_AMOUNT);
    });

    it("borrowing power collapses through volatility stages", async () => {
      // Stage 1 — Normal: liquidity = 0.8 × 100 × 1000 = 80000e18
      const [, liqNormal] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(liqNormal).to.equal(parseUnits("80000", 18));

      // Stage 2 — Pump to $300: DBO [$100,$300] → collateral still capped at $100
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenA.address).returns(PUMPED_EXTREME);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([NORMAL_PRICE, PUMPED_EXTREME]);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, NORMAL_PRICE]);

      const [, liqPump] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(liqPump).to.equal(parseUnits("80000", 18)); // unchanged — bounded at $100

      // Stage 3 — Crash to $10: DBO [$10,$300] → collateral at $10, debt at $300
      applyExtremeVolatility();

      const [, liqExtreme] = await f.comptroller.getBorrowingPower(f.user.address);
      // sumCollateral = 0.8 × 10 × 1000 = 8000e18, no borrow → liquidity = 8000e18
      expect(liqExtreme).to.equal(parseUnits("8000", 18));

      // Capacity collapsed: 80000 → 80000 → 8000 (90% drop from normal)
      expect(liqNormal.sub(liqExtreme)).to.equal(parseUnits("72000", 18));
    });

    it("borrow blocked — extreme collateral devaluation + debt inflation", async () => {
      applyExtremeVolatility();

      // sumCollateral = 0.8 × 10 × 1000 = 8000e18
      // Borrow 50e18: sumBorrow = 300 × 50 = 15000e18 > 8000e18 → shortfall (debt inflated at $300)
      await expect(f.vTokenB.connect(f.user).borrow(parseUnits("50", 18))).to.be.revertedWith("math error");

      // Even tiny borrow: 30e18 × $300 = 9000e18 > 8000e18 → still blocked
      await expect(f.vTokenB.connect(f.user).borrow(parseUnits("30", 18))).to.be.revertedWith("math error");

      // Only borrow < 8000/300 ≈ 26.67e18 would succeed
      const tinyBorrow = parseUnits("20", 18);
      const uBalBefore = await f.underlyingB.balanceOf(f.user.address);
      await expect(f.vTokenB.connect(f.user).borrow(tinyBorrow)).to.emit(f.vTokenB, "Borrow");
      expect(await f.underlyingB.balanceOf(f.user.address)).to.equal(uBalBefore.add(tinyBorrow));
    });

    it("redeem blocked — existing borrow + extreme volatility", async () => {
      // Borrow at normal prices first
      await f.vTokenB.connect(f.user).borrow(parseUnits("100", 18));

      // Apply extreme volatility
      applyExtremeVolatility();

      // sumCollateral = 0.8 × 10 × 1000 = 8000e18
      // sumBorrow = 300 × 100 = 30000e18 → deep shortfall = 22000e18
      // Any redeem makes it worse
      await expect(f.vTokenA.connect(f.user).redeemUnderlying(parseUnits("1", 18))).to.be.revertedWith("math error");
    });

    it("liquidation at spot — crash severe enough to make user underwater at LT", async () => {
      // Borrow at normal prices: 100e18 at $100 = $10000 debt
      await f.vTokenB.connect(f.user).borrow(parseUnits("100", 18));

      applyExtremeVolatility();

      // LT path uses spot: sumCollateral = 0.9 × 10 × 1000 = 9000e18
      // sumBorrow (spot $100 for vTokenB) = 100 × 100 = 10000e18 → shortfall = 1000e18
      // → liquidation should succeed
      const repayAmount = parseUnits("50", 18);
      await f.underlyingB.connect(f.liquidator).faucet(repayAmount);
      await f.underlyingB.connect(f.liquidator).approve(f.vTokenB.address, repayAmount);

      const debtBefore = await f.vTokenB.borrowBalanceStored(f.user.address);
      const seizedBefore = await f.vTokenA.balanceOf(f.liquidator.address);

      await expect(
        f.vTokenB.connect(f.liquidator).liquidateBorrow(f.user.address, repayAmount, f.vTokenA.address),
      ).to.emit(f.vTokenB, "LiquidateBorrow");

      expect(await f.vTokenB.borrowBalanceStored(f.user.address)).to.be.lt(debtBefore);
      expect(await f.vTokenA.balanceOf(f.liquidator.address)).to.be.gt(seizedBefore);
    });

    it("borrowing power comparison through full volatility cycle", async () => {
      // Borrow 50e18 at normal prices first
      await f.vTokenB.connect(f.user).borrow(parseUnits("50", 18));

      // Normal: sumCollateral = 80000, sumBorrow = 100 × 50 = 5000 → liquidity = 75000
      const [, liq1] = await f.comptroller.getBorrowingPower(f.user.address);
      expect(liq1).to.equal(parseUnits("75000", 18));

      // Pump to $300: DBO collateral capped at $100 → sumCollateral = 80000, sumBorrow = 100 × 50 = 5000
      f.oracle.getUnderlyingPrice.whenCalledWith(f.vTokenA.address).returns(PUMPED_EXTREME);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenA.address).returns([NORMAL_PRICE, PUMPED_EXTREME]);
      f.dbo.getBoundedPricesView.whenCalledWith(f.vTokenB.address).returns([NORMAL_PRICE, NORMAL_PRICE]);

      const [, liq2] = await f.comptroller.getBorrowingPower(f.user.address);
      // sumCollateral = 0.8 × 100 × 1000 = 80000, sumBorrow = 100 × 50 = 5000 → 75000
      expect(liq2).to.equal(parseUnits("75000", 18));

      // Extreme crash to $10: DBO [$10,$300] → collateral=$10, debt=$300
      applyExtremeVolatility();

      const [, liq3, shortfall3] = await f.comptroller.getBorrowingPower(f.user.address);
      // sumCollateral = 0.8 × 10 × 1000 = 8000, sumBorrow = 300 × 50 = 15000 → shortfall = 7000
      expect(liq3).to.equal(0);
      // Full cycle: 75000 → 75000 → shortfall 7000
      // Shows DBO caps upside during pump but amplifies downside during crash
      // because window max stays inflated ($300) while collateral tracks down ($10)
      expect(shortfall3).to.equal(parseUnits("7000", 18));
    });
  });
});
