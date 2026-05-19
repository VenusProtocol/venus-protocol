import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  IAccessControlManagerV8,
  IDeviationBoundedOracle,
  PriceOracle,
  Unitroller,
  VAIController,
  VToken,
} from "../../../../typechain";
import { ComptrollerErrorReporter } from "../../util/Errors";
import { deployDiamond } from "./scripts/deploy";

const { expect } = chai;
chai.use(smock.matchers);

const { Error } = ComptrollerErrorReporter;

// ---------------------------------------------------------------------------
// Constants used throughout the test suite
// ---------------------------------------------------------------------------
const SPOT_PRICE = parseUnits("1", 18); // $1
const BOUNDED_COLLATERAL_PRICE = parseUnits("0.8", 18); // $0.80
const BOUNDED_DEBT_PRICE = parseUnits("1.2", 18); // $1.20
const CF = parseUnits("0.8", 18); // 80 %
const LT = parseUnits("0.9", 18); // 90 %
const EXCHANGE_RATE = parseUnits("1", 18); // 1:1
const COLLATERAL_BALANCE = parseUnits("1000", 8); // 1 000 vTokens (8 decimals)
const LIQUIDATION_INCENTIVE = parseUnits("1.1", 18);
const CLOSE_FACTOR = parseUnits("0.5", 18);

/*
 * Math reference (all Exp mantissa arithmetic, truncated to uint):
 *
 * tokensToDenom = CF * exchangeRate * collateralPrice
 * sumCollateral = tokensToDenom.mantissa * vTokenBalance / 1e18
 *
 * At SPOT ($1):
 *   tokensToDenom = 0.8 * 1 * 1 = 0.8e18
 *   sumCollateral = 0.8e18 * 1000e8 / 1e18 = 800e8
 *   sumBorrow     = 1 * borrowBalance
 *
 * At BOUNDED (collateral $0.80, debt $1.20):
 *   tokensToDenom = 0.8 * 1 * 0.8 = 0.64e18
 *   sumCollateral = 0.64e18 * 1000e8 / 1e18 = 640e8
 *   sumBorrow     = 1.2 * borrowBalance
 *
 * At LT path (spot prices always, LT=0.9):
 *   tokensToDenom = 0.9 * 1 * 1 = 0.9e18
 *   sumCollateral = 0.9e18 * 1000e8 / 1e18 = 900e8
 *   sumBorrow     = 1 * borrowBalance
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type DboFixture = {
  comptroller: ComptrollerMock;
  unitroller: Unitroller;
  comptrollerLens: MockContract<ComptrollerLens>;
  oracle: FakeContract<PriceOracle>;
  dbo: FakeContract<IDeviationBoundedOracle>;
  accessControl: FakeContract<IAccessControlManagerV8>;
  vTokenA: FakeContract<VToken>; // collateral token
  vTokenB: FakeContract<VToken>; // borrow token
  vaiController: FakeContract<VAIController>;
  root: Signer;
  user: Signer;
  liquidator: Signer;
};

// ---------------------------------------------------------------------------
// Shared fixture — only does EVM-state setup (deploy, support markets, etc.)
// The .returns() calls on fakes are done in configureFakes() below.
// ---------------------------------------------------------------------------
async function deployDboFixture(): Promise<DboFixture> {
  const [root, user, liquidator] = await ethers.getSigners();

  // --- Deploy Diamond Comptroller ---
  const result = await deployDiamond("");
  const unitroller = result.unitroller;
  const comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);

  // --- Access control ---
  const accessControl = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
  accessControl.isAllowedToCall.returns(true);
  await comptroller._setAccessControl(accessControl.address);

  // --- Real ComptrollerLens via smock.mock (so we can spy) ---
  const LensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
  const comptrollerLens = await LensFactory.deploy();
  await comptroller._setComptrollerLens(comptrollerLens.address);

  // --- Spot oracle ---
  const oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
  oracle.getUnderlyingPrice.returns(SPOT_PRICE);
  await comptroller._setPriceOracle(oracle.address);

  // --- DBO fake ---
  const dbo = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
  dbo.getBoundedCollateralPriceView.returns(BOUNDED_COLLATERAL_PRICE);
  dbo.getBoundedDebtPriceView.returns(BOUNDED_DEBT_PRICE);
  dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, BOUNDED_DEBT_PRICE]);
  await comptroller.setDeviationBoundedOracle(dbo.address);

  // --- VAI controller fake ---
  const vaiController = await smock.fake<VAIController>("VAIController");
  vaiController.getVAIRepayAmount.returns(0);
  await comptroller._setVAIController(vaiController.address);

  // --- Close factor ---
  await comptroller._setCloseFactor(CLOSE_FACTOR);

  // --- vTokenA (collateral) ---
  const vTokenA = await smock.fake<VToken>("VToken");
  vTokenA.isVToken.returns(true);
  vTokenA.comptroller.returns(comptroller.address);
  vTokenA.exchangeRateStored.returns(EXCHANGE_RATE);
  vTokenA.totalSupply.returns(parseUnits("1000000", 8));
  vTokenA.totalBorrows.returns(0);
  vTokenA.borrowIndex.returns(parseUnits("1", 18));
  vTokenA.borrowBalanceStored.returns(0);
  vTokenA.getAccountSnapshot.returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);

  await comptroller._supportMarket(vTokenA.address);
  await comptroller._setMarketSupplyCaps([vTokenA.address], [parseUnits("1000000", 18)]);
  await comptroller._setMarketBorrowCaps([vTokenA.address], [parseUnits("1000000", 18)]);
  await comptroller["setCollateralFactor(address,uint256,uint256)"](vTokenA.address, CF, LT);
  await comptroller["setLiquidationIncentive(address,uint256)"](vTokenA.address, LIQUIDATION_INCENTIVE);

  // --- vTokenB (borrow market) ---
  const vTokenB = await smock.fake<VToken>("VToken");
  vTokenB.isVToken.returns(true);
  vTokenB.comptroller.returns(comptroller.address);
  vTokenB.exchangeRateStored.returns(EXCHANGE_RATE);
  vTokenB.totalSupply.returns(parseUnits("1000000", 8));
  vTokenB.totalBorrows.returns(0);
  vTokenB.borrowIndex.returns(parseUnits("1", 18));
  vTokenB.borrowBalanceStored.returns(0);
  vTokenB.getAccountSnapshot.returns([0, 0, 0, EXCHANGE_RATE]);

  await comptroller._supportMarket(vTokenB.address);
  await comptroller._setMarketSupplyCaps([vTokenB.address], [parseUnits("1000000", 18)]);
  await comptroller._setMarketBorrowCaps([vTokenB.address], [parseUnits("1000000", 18)]);
  await comptroller["setCollateralFactor(address,uint256,uint256)"](vTokenB.address, CF, LT);
  await comptroller["setLiquidationIncentive(address,uint256)"](vTokenB.address, LIQUIDATION_INCENTIVE);
  await comptroller.setIsBorrowAllowed(0, vTokenB.address, true);
  await comptroller.setIsBorrowAllowed(0, vTokenA.address, true);

  // --- Fund vToken wallets so they can call the comptroller ---
  await setBalance(await vTokenA.wallet.getAddress(), 10n ** 18n);
  await setBalance(await vTokenB.wallet.getAddress(), 10n ** 18n);

  return {
    comptroller,
    unitroller,
    comptrollerLens,
    oracle,
    dbo,
    accessControl,
    vTokenA,
    vTokenB,
    vaiController,
    root,
    user,
    liquidator,
  };
}

// ---------------------------------------------------------------------------
// configureFakes — reconfigure ALL fake return values after loadFixture
// ---------------------------------------------------------------------------
function configureFakes(fixture: DboFixture): void {
  const { oracle, dbo, accessControl, vTokenA, vTokenB, vaiController, comptroller } = fixture;

  // Access control — reset clears any whenCalledWith overrides from prior tests
  accessControl.isAllowedToCall.reset();
  accessControl.isAllowedToCall.returns(true);

  // Spot oracle
  oracle.getUnderlyingPrice.reset();
  oracle.getUnderlyingPrice.returns(SPOT_PRICE);

  // DBO
  dbo.getBoundedCollateralPriceView.reset();
  dbo.getBoundedCollateralPriceView.returns(BOUNDED_COLLATERAL_PRICE);
  dbo.getBoundedDebtPriceView.reset();
  dbo.getBoundedDebtPriceView.returns(BOUNDED_DEBT_PRICE);
  dbo.getBoundedPricesView.reset();
  dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, BOUNDED_DEBT_PRICE]);
  dbo.updateProtectionState.reset();

  // VAI controller
  vaiController.getVAIRepayAmount.reset();
  vaiController.getVAIRepayAmount.returns(0);

  // vTokenA (collateral)
  vTokenA.isVToken.reset();
  vTokenA.isVToken.returns(true);
  vTokenA.comptroller.reset();
  vTokenA.comptroller.returns(comptroller.address);
  vTokenA.exchangeRateStored.reset();
  vTokenA.exchangeRateStored.returns(EXCHANGE_RATE);
  vTokenA.totalSupply.reset();
  vTokenA.totalSupply.returns(parseUnits("1000000", 8));
  vTokenA.totalBorrows.reset();
  vTokenA.totalBorrows.returns(0);
  vTokenA.borrowIndex.reset();
  vTokenA.borrowIndex.returns(parseUnits("1", 18));
  vTokenA.borrowBalanceStored.reset();
  vTokenA.borrowBalanceStored.returns(0);
  vTokenA.getAccountSnapshot.reset();
  vTokenA.getAccountSnapshot.returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);

  // vTokenB (borrow market)
  vTokenB.isVToken.reset();
  vTokenB.isVToken.returns(true);
  vTokenB.comptroller.reset();
  vTokenB.comptroller.returns(comptroller.address);
  vTokenB.exchangeRateStored.reset();
  vTokenB.exchangeRateStored.returns(EXCHANGE_RATE);
  vTokenB.totalSupply.reset();
  vTokenB.totalSupply.returns(parseUnits("1000000", 8));
  vTokenB.totalBorrows.reset();
  vTokenB.totalBorrows.returns(0);
  vTokenB.borrowIndex.reset();
  vTokenB.borrowIndex.returns(parseUnits("1", 18));
  vTokenB.borrowBalanceStored.reset();
  vTokenB.borrowBalanceStored.returns(0);
  vTokenB.getAccountSnapshot.reset();
  vTokenB.getAccountSnapshot.returns([0, 0, 0, EXCHANGE_RATE]);
}

// ---------------------------------------------------------------------------
// Helper: enter user into vTokenA market
// ---------------------------------------------------------------------------
async function enterCollateralMarket(
  comptroller: ComptrollerMock,
  vToken: FakeContract<VToken>,
  user: Signer,
): Promise<void> {
  await comptroller.connect(user).enterMarkets([vToken.address]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("DeviationBoundedOracle Integration", () => {
  // =========================================================================
  // Section A: Setup & DBO Configuration
  // =========================================================================
  describe("A. Setup and DBO configuration", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("A.1 - setDeviationBoundedOracle stores the new DBO address", async () => {
      const { comptroller } = fixture;
      const dbo = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
      await comptroller.setDeviationBoundedOracle(dbo.address);
      expect(await comptroller.deviationBoundedOracle()).to.equal(dbo.address);
    });

    it("A.2 - setDeviationBoundedOracle rejects zero address", async () => {
      const { comptroller } = fixture;
      await expect(comptroller.setDeviationBoundedOracle(ethers.constants.AddressZero)).to.be.revertedWith(
        "can't be zero address",
      );
    });

    it("A.3 - setDeviationBoundedOracle reverts when called by non-admin", async () => {
      const { comptroller, user, accessControl } = fixture;
      accessControl.isAllowedToCall.returns(false);
      const dbo = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
      await expect(comptroller.connect(user).setDeviationBoundedOracle(dbo.address)).to.be.reverted;
    });

    it("A.4 - fixture deploys two supported markets with correct CF and LT", async () => {
      const { comptroller, vTokenA, vTokenB } = fixture;
      const marketA = await comptroller.markets(vTokenA.address);
      expect(marketA.collateralFactorMantissa).to.equal(CF);
      expect(marketA.liquidationThresholdMantissa).to.equal(LT);
      const marketB = await comptroller.markets(vTokenB.address);
      expect(marketB.collateralFactorMantissa).to.equal(CF);
      expect(marketB.liquidationThresholdMantissa).to.equal(LT);
    });

    it("A.5 - DBO fake returns expected bounded prices", async () => {
      const { dbo, vTokenA } = fixture;
      expect(await dbo.getBoundedCollateralPriceView(vTokenA.address)).to.equal(BOUNDED_COLLATERAL_PRICE);
      expect(await dbo.getBoundedDebtPriceView(vTokenA.address)).to.equal(BOUNDED_DEBT_PRICE);
    });
  });

  // =========================================================================
  // Section B: borrowAllowed — CF path (state-changing)
  // =========================================================================
  describe("B. borrowAllowed (CF path)", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("B.1 - allows borrow when solvent at bounded prices", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // At bounded: sumCollateral = 640e8, sumBorrow = 1.2 * borrow
      // Borrow 100e8 underlying: sumBorrow = 120e8 < 640e8 => solvent
      const borrowAmount = parseUnits("100", 8);
      vTokenB.totalBorrows.returns(0);
      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), borrowAmount);
      expect(errCode).to.equal(Error.NO_ERROR);
    });

    it("B.2 - rejects borrow that would cause shortfall at bounded prices", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // At bounded: sumCollateral = 640e8
      // Borrow 600e8: sumBorrow = 1.2 * 600e8 = 720e8 > 640e8 => shortfall
      const borrowAmount = parseUnits("600", 8);
      vTokenB.totalBorrows.returns(0);
      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), borrowAmount);
      expect(errCode).to.equal(Error.INSUFFICIENT_LIQUIDITY);
    });

    it("B.3 - calls _updateProtectionStates (dbo.updateProtectionState for each asset)", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.updateProtectionState.reset();
      const borrowAmount = parseUnits("10", 8);
      vTokenB.totalBorrows.returns(0);
      await comptroller.connect(vTokenB.wallet).borrowAllowed(vTokenB.address, await user.getAddress(), borrowAmount);
      expect(dbo.updateProtectionState).to.have.been.calledWith(vTokenA.address);
    });

    it("B.4 - uses getBoundedPricesView for collateral valuation", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.getBoundedPricesView.reset();
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, BOUNDED_DEBT_PRICE]);
      const borrowAmount = parseUnits("10", 8);
      vTokenB.totalBorrows.returns(0);
      await comptroller.connect(vTokenB.wallet).borrowAllowed(vTokenB.address, await user.getAddress(), borrowAmount);
      expect(dbo.getBoundedPricesView).to.have.been.calledWith(vTokenA.address);
    });

    it("B.5 - uses getBoundedPricesView for debt valuation", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.getBoundedPricesView.reset();
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, BOUNDED_DEBT_PRICE]);
      const borrowAmount = parseUnits("10", 8);
      vTokenB.totalBorrows.returns(0);
      await comptroller.connect(vTokenB.wallet).borrowAllowed(vTokenB.address, await user.getAddress(), borrowAmount);
      expect(dbo.getBoundedPricesView).to.have.been.calledWith(vTokenA.address);
    });

    it("B.6 - auto-enters borrower into market when called from vToken", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      // User enters A as collateral but NOT B
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();
      expect(await comptroller.checkMembership(userAddr, vTokenB.address)).to.be.false;

      vTokenB.totalBorrows.returns(0);
      await comptroller.connect(vTokenB.wallet).borrowAllowed(vTokenB.address, userAddr, parseUnits("10", 8));

      expect(await comptroller.checkMembership(userAddr, vTokenB.address)).to.be.true;
    });

    it("B.7 - reverts if oracle price is 0 (PRICE_ERROR)", async () => {
      const { comptroller, vTokenA, vTokenB, user, oracle, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      oracle.getUnderlyingPrice.whenCalledWith(vTokenB.address).returns(0);
      dbo.getBoundedPricesView.whenCalledWith(vTokenB.address).returns([0, 0]);
      vTokenB.totalBorrows.returns(0);

      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), parseUnits("10", 8));
      expect(errCode).to.equal(Error.PRICE_ERROR);
    });

    it("B.8 - reverts with borrow cap exceeded", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      vTokenB.totalBorrows.returns(parseUnits("1000000", 18));

      await expect(
        comptroller
          .connect(vTokenB.wallet)
          .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), parseUnits("1", 8)),
      ).to.be.revertedWith("market borrow cap reached");
    });

    it("B.9 - updates protection state for all entered assets (two markets)", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      // Also enter B
      await enterCollateralMarket(comptroller, vTokenB, user);

      dbo.updateProtectionState.reset();
      vTokenB.totalBorrows.returns(0);
      await comptroller
        .connect(vTokenB.wallet)
        .borrowAllowed(vTokenB.address, await user.getAddress(), parseUnits("10", 8));

      expect(dbo.updateProtectionState).to.have.been.calledWith(vTokenA.address);
      expect(dbo.updateProtectionState).to.have.been.calledWith(vTokenB.address);
    });

    it("B.10 - borrow that would succeed at spot but fails at bounded prices", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // At spot: sumCollateral = 800e8, borrow 700e8 => sumBorrow = 700e8 < 800e8 => solvent
      // At bounded: sumCollateral = 640e8, sumBorrow = 1.2 * 700e8 = 840e8 > 640e8 => shortfall
      const borrowAmount = parseUnits("700", 8);
      vTokenB.totalBorrows.returns(0);
      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), borrowAmount);
      expect(errCode).to.equal(Error.INSUFFICIENT_LIQUIDITY);
    });

    it("B.11 - borrow exactly at bounded capacity succeeds", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // sumCollateral = 640e8, need sumBorrow <= 640e8
      // sumBorrow = 1.2 * borrowAmount => borrowAmount = 640e8 / 1.2 = 533.333...e8
      // Use 533e8 which gives 1.2 * 533e8 = 639.6e8 < 640e8 => solvent
      const borrowAmount = parseUnits("533", 8);
      vTokenB.totalBorrows.returns(0);
      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), borrowAmount);
      expect(errCode).to.equal(Error.NO_ERROR);
    });

    it("B.12 - returns PRICE_ERROR if bounded collateral price is 0", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.getBoundedCollateralPriceView.returns(0);
      dbo.getBoundedPricesView.returns([0, BOUNDED_DEBT_PRICE]);
      vTokenB.totalBorrows.returns(0);
      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), parseUnits("10", 8));
      expect(errCode).to.equal(Error.PRICE_ERROR);
    });

    it("B.13 - returns PRICE_ERROR if bounded debt price is 0", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.getBoundedDebtPriceView.returns(0);
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, 0]);
      vTokenB.totalBorrows.returns(0);
      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), parseUnits("10", 8));
      expect(errCode).to.equal(Error.PRICE_ERROR);
    });
  });

  // =========================================================================
  // Section C: redeemAllowed — CF path (state-changing)
  // =========================================================================
  describe("C. redeemAllowed (CF path)", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("C.1 - allows redeem when remaining collateral covers borrows at bounded prices", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // User has borrow of 100e8 on B
      // After redeeming 100 vTokens, remaining vToken balance = 900e8
      // sumCollateral = 0.8 * 1 * 0.8 * 900e8 = 576e8
      // sumBorrow = 1.2 * 100e8 = 120e8 => solvent
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("100", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const redeemTokens = parseUnits("100", 8);
      const errCode = await comptroller.callStatic.redeemAllowed(vTokenA.address, userAddr, redeemTokens);
      expect(errCode).to.equal(Error.NO_ERROR);
    });

    it("C.2 - rejects redeem that causes shortfall at bounded prices", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // User has 500e8 borrow on B
      // sumCollateral = 0.8 * 1 * 0.8 * 1000e8 = 640e8
      // sumBorrow = 1.2 * 500e8 = 600e8
      // Redeem 200 vTokens: hypothetical adds tokensToDenom * 200e8 to borrows
      // tokensToDenom = 0.64e18, add = 0.64 * 200e8 = 128e8
      // total borrows = 600e8 + 128e8 = 728e8 > 640e8 => shortfall
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("500", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const redeemTokens = parseUnits("200", 8);
      const errCode = await comptroller.callStatic.redeemAllowed(vTokenA.address, userAddr, redeemTokens);
      expect(errCode).to.equal(Error.INSUFFICIENT_LIQUIDITY);
    });

    it("C.3 - calls updateProtectionState during redeemAllowed", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      dbo.updateProtectionState.reset();
      await comptroller.redeemAllowed(vTokenA.address, userAddr, parseUnits("10", 8));
      expect(dbo.updateProtectionState).to.have.been.calledWith(vTokenA.address);
    });

    it("C.4 - allows full redeem when no borrows exist", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      const errCode = await comptroller.callStatic.redeemAllowed(vTokenA.address, userAddr, COLLATERAL_BALANCE);
      expect(errCode).to.equal(Error.NO_ERROR);
    });

    it("C.5 - skips liquidity check if user is not in the market", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      // Do NOT enter market
      const userAddr = await user.getAddress();

      dbo.updateProtectionState.reset();
      const errCode = await comptroller.callStatic.redeemAllowed(vTokenA.address, userAddr, COLLATERAL_BALANCE);
      expect(errCode).to.equal(Error.NO_ERROR);
      // Since user is not in market, DBO should not be called
      expect(dbo.updateProtectionState).to.not.have.been.called;
    });

    it("C.6 - uses bounded prices not spot for redeem liquidity check", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Borrow 600e8 on B
      // At spot: sumCollateral=800e8, sumBorrow=600e8, redeem 100 adds 0.8*100e8=80e8 => 680e8 < 800e8 => OK
      // At bounded: sumCollateral=640e8, sumBorrow=720e8, redeem 100 adds 0.64*100e8=64e8 => 784e8 > 640e8 => fail
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("600", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const errCode = await comptroller.callStatic.redeemAllowed(vTokenA.address, userAddr, parseUnits("100", 8));
      expect(errCode).to.equal(Error.INSUFFICIENT_LIQUIDITY);
    });

    it("C.7 - allows zero-amount redeem", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      const errCode = await comptroller.callStatic.redeemAllowed(vTokenA.address, userAddr, 0);
      expect(errCode).to.equal(Error.NO_ERROR);
    });
  });

  // =========================================================================
  // Section D: transferAllowed — CF path (state-changing)
  // =========================================================================
  describe("D. transferAllowed (CF path)", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("D.1 - allows transfer when remaining collateral covers borrows at bounded prices", async () => {
      const { comptroller, vTokenA, vTokenB, user, root } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // User has borrow of 100e8 on B
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("100", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // Transfer 100 vTokens => same as redeeming 100 vTokens from src
      const errCode = await comptroller.callStatic.transferAllowed(
        vTokenA.address,
        userAddr,
        await root.getAddress(),
        parseUnits("100", 8),
      );
      expect(errCode).to.equal(Error.NO_ERROR);
    });

    it("D.2 - rejects transfer that causes shortfall at bounded prices", async () => {
      const { comptroller, vTokenA, vTokenB, user, root } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("500", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const errCode = await comptroller.callStatic.transferAllowed(
        vTokenA.address,
        userAddr,
        await root.getAddress(),
        parseUnits("200", 8),
      );
      expect(errCode).to.equal(Error.INSUFFICIENT_LIQUIDITY);
    });

    it("D.3 - calls updateProtectionState during transferAllowed", async () => {
      const { comptroller, vTokenA, user, root, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      dbo.updateProtectionState.reset();
      await comptroller.transferAllowed(vTokenA.address, userAddr, await root.getAddress(), parseUnits("10", 8));
      expect(dbo.updateProtectionState).to.have.been.calledWith(vTokenA.address);
    });

    it("D.4 - allows transfer if src is not in the market", async () => {
      const { comptroller, vTokenA, user, root, dbo } = fixture;
      // Do NOT enter market
      const userAddr = await user.getAddress();

      dbo.updateProtectionState.reset();
      const errCode = await comptroller.callStatic.transferAllowed(
        vTokenA.address,
        userAddr,
        await root.getAddress(),
        COLLATERAL_BALANCE,
      );
      expect(errCode).to.equal(Error.NO_ERROR);
      expect(dbo.updateProtectionState).to.not.have.been.called;
    });

    it("D.5 - transfer that would succeed at spot but fails at bounded prices", async () => {
      const { comptroller, vTokenA, vTokenB, user, root } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Borrow 500e8
      // At spot: sumCollateral=800e8, sumBorrow=500e8. Transfer 300: adds 0.8*300e8=240e8 => 740e8 < 800e8 OK
      // At bounded: sumCollateral=640e8, sumBorrow=600e8. Transfer 300: adds 0.64*300e8=192e8 => 792e8 > 640e8 FAIL
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("500", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const errCode = await comptroller.callStatic.transferAllowed(
        vTokenA.address,
        userAddr,
        await root.getAddress(),
        parseUnits("300", 8),
      );
      expect(errCode).to.equal(Error.INSUFFICIENT_LIQUIDITY);
    });
  });

  // =========================================================================
  // Section E: liquidateBorrowAllowed — LT path (view, no DBO)
  // =========================================================================
  describe("E. liquidateBorrowAllowed (LT path, spot prices)", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("E.1 - uses spot prices and LT, not bounded prices", async () => {
      const { comptroller, vTokenA, vTokenB, user, liquidator, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();
      const liquidatorAddr = await liquidator.getAddress();

      // At LT(0.9) and spot($1): sumCollateral = 0.9 * 1 * 1 * 1000e8 = 900e8
      // Borrow 950e8 => shortfall at LT
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("950", 8), EXCHANGE_RATE]);
      vTokenB.borrowBalanceStored.whenCalledWith(userAddr).returns(parseUnits("950", 8));
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      dbo.getBoundedCollateralPriceView.reset();
      dbo.getBoundedDebtPriceView.reset();
      dbo.getBoundedPricesView.reset();

      const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
        vTokenB.address,
        vTokenA.address,
        liquidatorAddr,
        userAddr,
        parseUnits("100", 8),
      );
      expect(errCode).to.equal(Error.NO_ERROR);
      // DBO bounded prices should NOT be called for LT path
      expect(dbo.getBoundedCollateralPriceView).to.not.have.been.called;
      expect(dbo.getBoundedDebtPriceView).to.not.have.been.called;
      expect(dbo.getBoundedPricesView).to.not.have.been.called;
    });

    it("E.2 - does not call updateProtectionState", async () => {
      const { comptroller, vTokenA, vTokenB, user, liquidator, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("950", 8), EXCHANGE_RATE]);
      vTokenB.borrowBalanceStored.whenCalledWith(userAddr).returns(parseUnits("950", 8));
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      dbo.updateProtectionState.reset();

      await comptroller.callStatic.liquidateBorrowAllowed(
        vTokenB.address,
        vTokenA.address,
        await liquidator.getAddress(),
        userAddr,
        parseUnits("100", 8),
      );
      expect(dbo.updateProtectionState).to.not.have.been.called;
    });

    it("E.3 - fails with INSUFFICIENT_SHORTFALL when borrower has no LT shortfall", async () => {
      const { comptroller, vTokenA, vTokenB, user, liquidator } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // At LT: sumCollateral = 900e8, borrow 700e8 => liquidity = 200e8, no shortfall
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("700", 8), EXCHANGE_RATE]);
      vTokenB.borrowBalanceStored.whenCalledWith(userAddr).returns(parseUnits("700", 8));
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
        vTokenB.address,
        vTokenA.address,
        await liquidator.getAddress(),
        userAddr,
        parseUnits("100", 8),
      );
      expect(errCode).to.equal(Error.INSUFFICIENT_SHORTFALL);
    });

    it("E.4 - allows liquidation when borrower has LT shortfall", async () => {
      const { comptroller, vTokenA, vTokenB, user, liquidator } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // At LT: sumCollateral = 900e8, borrow 950e8 => shortfall = 50e8
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("950", 8), EXCHANGE_RATE]);
      vTokenB.borrowBalanceStored.whenCalledWith(userAddr).returns(parseUnits("950", 8));
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // closeFactor = 0.5, maxRepay = 0.5 * 950e8 = 475e8
      const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
        vTokenB.address,
        vTokenA.address,
        await liquidator.getAddress(),
        userAddr,
        parseUnits("100", 8),
      );
      expect(errCode).to.equal(Error.NO_ERROR);
    });

    it("E.5 - fails with TOO_MUCH_REPAY when repayAmount exceeds closeFactor * borrowBalance", async () => {
      const { comptroller, vTokenA, vTokenB, user, liquidator } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("950", 8), EXCHANGE_RATE]);
      vTokenB.borrowBalanceStored.whenCalledWith(userAddr).returns(parseUnits("950", 8));
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // closeFactor * 950e8 = 475e8, try repaying 476e8 => TOO_MUCH_REPAY
      const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
        vTokenB.address,
        vTokenA.address,
        await liquidator.getAddress(),
        userAddr,
        parseUnits("476", 8),
      );
      expect(errCode).to.equal(17); // TOO_MUCH_REPAY
    });

    it("E.6 - forced liquidation bypasses LT shortfall check", async () => {
      const { comptroller, vTokenA, vTokenB, user, liquidator } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // No shortfall at LT
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("700", 8), EXCHANGE_RATE]);
      vTokenB.borrowBalanceStored.whenCalledWith(userAddr).returns(parseUnits("700", 8));
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      await comptroller._setForcedLiquidation(vTokenB.address, true);
      const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
        vTokenB.address,
        vTokenA.address,
        await liquidator.getAddress(),
        userAddr,
        parseUnits("100", 8),
      );
      expect(errCode).to.equal(Error.NO_ERROR);
    });

    it("E.7 - forced liquidation does not call DBO", async () => {
      const { comptroller, vTokenA, vTokenB, user, liquidator, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenB.borrowBalanceStored.whenCalledWith(userAddr).returns(parseUnits("100", 8));
      await comptroller._setForcedLiquidation(vTokenB.address, true);

      dbo.updateProtectionState.reset();
      dbo.getBoundedCollateralPriceView.reset();
      dbo.getBoundedDebtPriceView.reset();
      dbo.getBoundedPricesView.reset();

      await comptroller.callStatic.liquidateBorrowAllowed(
        vTokenB.address,
        vTokenA.address,
        await liquidator.getAddress(),
        userAddr,
        parseUnits("50", 8),
      );

      expect(dbo.updateProtectionState).to.not.have.been.called;
      expect(dbo.getBoundedCollateralPriceView).to.not.have.been.called;
      expect(dbo.getBoundedDebtPriceView).to.not.have.been.called;
      expect(dbo.getBoundedPricesView).to.not.have.been.called;
    });
  });

  // =========================================================================
  // Section F: exitMarket — CF path (state-changing)
  // =========================================================================
  describe("F. exitMarket (CF path)", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("F.1 - allows exit when user has no borrows", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // Ensure getAccountSnapshot returns 0 borrow balance for the exiting token
      vTokenA.getAccountSnapshot
        .whenCalledWith(await user.getAddress())
        .returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);

      const errCode = await comptroller.connect(user).callStatic.exitMarket(vTokenA.address);
      expect(errCode).to.equal(Error.NO_ERROR);
    });

    it("F.2 - rejects exit when user has nonzero borrow balance on the exiting token", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // User has borrow on vTokenA itself
      vTokenA.getAccountSnapshot
        .whenCalledWith(userAddr)
        .returns([0, COLLATERAL_BALANCE, parseUnits("100", 8), EXCHANGE_RATE]);

      const errCode = await comptroller.connect(user).callStatic.exitMarket(vTokenA.address);
      expect(errCode).to.equal(Error.NONZERO_BORROW_BALANCE);
    });

    it("F.3 - rejects exit when redeeming full balance causes shortfall at bounded prices", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // User has borrows on B, trying to exit A (which is collateral)
      // exitMarket calls redeemAllowedInternal(vTokenA, user, tokensHeld)
      // This will check if redeeming ALL tokens causes shortfall
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("100", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // At bounded: sumCollateral=640e8, sumBorrow=120e8
      // Redeem all 1000e8 tokens: adds 0.64*1000e8=640e8 to borrows
      // total borrows = 120e8 + 640e8 = 760e8 > 640e8 => shortfall
      const errCode = await comptroller.connect(user).callStatic.exitMarket(vTokenA.address);
      // exitMarket returns REJECTION when redeemAllowedInternal fails
      expect(errCode).to.not.equal(Error.NO_ERROR);
    });

    it("F.4 - calls updateProtectionState during exit liquidity check", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("10", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      dbo.updateProtectionState.reset();
      await comptroller.connect(user).exitMarket(vTokenA.address);
      // Should have been called because exitMarket uses CF path
      expect(dbo.updateProtectionState).to.have.been.called;
    });

    it("F.5 - succeeds if user is not in the market", async () => {
      const { comptroller, vTokenA, user } = fixture;
      // Do NOT enter
      const errCode = await comptroller.connect(user).callStatic.exitMarket(vTokenA.address);
      expect(errCode).to.equal(Error.NO_ERROR);
    });
  });

  // =========================================================================
  // Section G: getBorrowingPower — CF view path (no updateProtectionState)
  // =========================================================================
  describe("G. getBorrowingPower (CF view path)", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("G.1 - returns liquidity based on bounded prices", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // No borrows: sumCollateral = 640e8
      const [err, liquidity, shortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("640", 8));
      expect(shortfall).to.equal(0);
    });

    it("G.2 - returns shortfall when borrows exceed bounded collateral", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("700", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // sumCollateral = 640e8, sumBorrow = 1.2 * 700e8 = 840e8
      // shortfall = 840e8 - 640e8 = 200e8
      const [err, liquidity, shortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(parseUnits("200", 8));
    });

    it("G.3 - does not call updateProtectionState (view function)", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.updateProtectionState.reset();
      await comptroller.getBorrowingPower(await user.getAddress());
      expect(dbo.updateProtectionState).to.not.have.been.called;
    });

    it("G.4 - reads DBO bounded price views", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.getBoundedPricesView.reset();
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, BOUNDED_DEBT_PRICE]);
      await comptroller.getBorrowingPower(await user.getAddress());
      expect(dbo.getBoundedPricesView).to.have.been.calledWith(vTokenA.address);
    });

    it("G.5 - accounts for VAI debt", async () => {
      const { comptroller, vTokenA, user, vaiController } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // VAI debt of 100e18 is added to sumBorrows
      vaiController.getVAIRepayAmount.whenCalledWith(userAddr).returns(parseUnits("100", 18));

      // sumCollateral = 640e8, sumBorrow = 0 (no token borrows) + 100e18 (VAI)
      // But 640e8 vs 100e18: VAI is in 18 decimals = 100e18 which is huge compared to 640e8
      // so there will be shortfall
      const [err, , shortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(shortfall).to.be.gt(0);
    });

    it("G.6 - returns zero values for account with no positions", async () => {
      const { comptroller, user } = fixture;
      const userAddr = await user.getAddress();

      const [err, liquidity, shortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(0);
    });
  });

  // =========================================================================
  // Section H: getAccountLiquidity — LT view path (spot prices, no DBO)
  // =========================================================================
  describe("H. getAccountLiquidity (LT view path)", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("H.1 - uses spot prices with LT, not bounded prices", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      dbo.getBoundedCollateralPriceView.reset();
      dbo.getBoundedDebtPriceView.reset();
      dbo.getBoundedPricesView.reset();

      // LT = 0.9, spot = $1, balance = 1000e8
      // sumCollateral = 0.9 * 1 * 1 * 1000e8 = 900e8
      const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("900", 8));
      expect(shortfall).to.equal(0);

      // DBO bounded prices should NOT be called
      expect(dbo.getBoundedCollateralPriceView).to.not.have.been.called;
      expect(dbo.getBoundedDebtPriceView).to.not.have.been.called;
      expect(dbo.getBoundedPricesView).to.not.have.been.called;
    });

    it("H.2 - returns shortfall at LT path when deeply underwater", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("950", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // sumCollateral_LT = 900e8, sumBorrow = 950e8
      // shortfall = 50e8
      const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(parseUnits("50", 8));
    });

    it("H.3 - does not call updateProtectionState", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.updateProtectionState.reset();
      await comptroller.getAccountLiquidity(await user.getAddress());
      expect(dbo.updateProtectionState).to.not.have.been.called;
    });

    it("H.4 - solvent at LT but underwater at bounded CF", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Borrow 700e8: at LT(0.9, spot) collateral = 900e8 > 700e8 => solvent
      // But at bounded CF: 640e8 < 840e8 => shortfall
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("700", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.be.gt(0); // Solvent at LT
      expect(shortfall).to.equal(0);

      // But borrowing power (CF path) shows shortfall
      const [, , bpShortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(bpShortfall).to.be.gt(0);
    });

    it("H.5 - returns zero for empty account", async () => {
      const { comptroller, user } = fixture;
      const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(await user.getAddress());
      expect(err).to.equal(0);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(0);
    });
  });

  // =========================================================================
  // Section I: getHypotheticalAccountLiquidity — CF view path
  // =========================================================================
  describe("I. getHypotheticalAccountLiquidity (CF view path)", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("I.1 - hypothetical borrow uses bounded prices", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);
      const userAddr = await user.getAddress();

      // Hypothetical borrow of 600e8
      // sumCollateral = 640e8 (bounded CF)
      // hypothetical sumBorrow = 1.2 * 600e8 = 720e8
      // shortfall = 80e8
      const [err, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        userAddr,
        vTokenB.address,
        0,
        parseUnits("600", 8),
      );
      expect(err).to.equal(0);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(parseUnits("80", 8));
    });

    it("I.2 - hypothetical redeem uses bounded prices", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Hypothetical redeem of 500 vTokens from A
      // sumCollateral = 640e8
      // Redeem 500e8: adds tokensToDenom * 500e8 to borrows = 0.64 * 500e8 = 320e8
      // total borrows = 0 + 320e8 = 320e8 < 640e8 => solvent
      const [err, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        userAddr,
        vTokenA.address,
        parseUnits("500", 8),
        0,
      );
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("320", 8)); // 640e8 - 320e8
      expect(shortfall).to.equal(0);
    });

    it("I.3 - does not call updateProtectionState", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.updateProtectionState.reset();
      await comptroller.getHypotheticalAccountLiquidity(
        await user.getAddress(),
        vTokenB.address,
        0,
        parseUnits("100", 8),
      );
      expect(dbo.updateProtectionState).to.not.have.been.called;
    });

    it("I.4 - reads DBO bounded price views for CF weighting", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.getBoundedPricesView.reset();
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, BOUNDED_DEBT_PRICE]);

      await comptroller.getHypotheticalAccountLiquidity(
        await user.getAddress(),
        vTokenB.address,
        0,
        parseUnits("100", 8),
      );
      expect(dbo.getBoundedPricesView).to.have.been.calledWith(vTokenA.address);
    });

    it("I.5 - returns correct liquidity with no hypothetical changes", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      const [err, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        userAddr,
        ethers.constants.AddressZero,
        0,
        0,
      );
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("640", 8));
      expect(shortfall).to.equal(0);
    });
  });

  // =========================================================================
  // Section J: DBO disabled (zero address)
  // =========================================================================
  describe("J. DBO returning zero prices (error handling)", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("J.1 - getBorrowingPower returns PRICE_ERROR when DBO returns 0 for collateral", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.getBoundedCollateralPriceView.returns(0);
      dbo.getBoundedPricesView.returns([0, BOUNDED_DEBT_PRICE]);
      const [err] = await comptroller.getBorrowingPower(await user.getAddress());
      expect(err).to.equal(Error.PRICE_ERROR);
    });

    it("J.2 - getBorrowingPower returns PRICE_ERROR when DBO returns 0 for debt", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.getBoundedDebtPriceView.returns(0);
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, 0]);
      const [err] = await comptroller.getBorrowingPower(await user.getAddress());
      expect(err).to.equal(Error.PRICE_ERROR);
    });

    it("J.3 - getAccountLiquidity still works with spot oracle (LT path) regardless of DBO prices", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // Even if DBO returns 0, LT path doesn't use DBO at all
      dbo.getBoundedCollateralPriceView.returns(0);
      dbo.getBoundedDebtPriceView.returns(0);
      dbo.getBoundedPricesView.returns([0, 0]);
      const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(await user.getAddress());
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("900", 8));
      expect(shortfall).to.equal(0);
    });

    it("J.4 - liquidateBorrowAllowed still works with LT path regardless of DBO prices", async () => {
      const { comptroller, vTokenA, vTokenB, user, liquidator, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      dbo.getBoundedCollateralPriceView.returns(0);
      dbo.getBoundedDebtPriceView.returns(0);
      dbo.getBoundedPricesView.returns([0, 0]);

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("950", 8), EXCHANGE_RATE]);
      vTokenB.borrowBalanceStored.whenCalledWith(userAddr).returns(parseUnits("950", 8));
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
        vTokenB.address,
        vTokenA.address,
        await liquidator.getAddress(),
        userAddr,
        parseUnits("100", 8),
      );
      expect(errCode).to.equal(Error.NO_ERROR);
    });
  });

  // =========================================================================
  // Section K: Bounded price equals spot (DBO is pass-through)
  // =========================================================================
  describe("K. Bounded prices equal spot prices (DBO pass-through)", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
      // Override DBO to return spot prices => same as no deviation
      fixture.dbo.getBoundedCollateralPriceView.returns(SPOT_PRICE);
      fixture.dbo.getBoundedDebtPriceView.returns(SPOT_PRICE);
      fixture.dbo.getBoundedPricesView.returns([SPOT_PRICE, SPOT_PRICE]);
    });

    it("K.1 - getBorrowingPower matches spot-based CF calculation", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // At spot with CF=0.8: sumCollateral = 0.8 * 1 * 1 * 1000e8 = 800e8
      const [err, liquidity, shortfall] = await comptroller.getBorrowingPower(await user.getAddress());
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("800", 8));
      expect(shortfall).to.equal(0);
    });

    it("K.2 - borrowAllowed accepts borrow up to spot CF capacity", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // At spot: capacity = 800e8, borrow 799e8 => solvent
      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), parseUnits("799", 8));
      expect(errCode).to.equal(Error.NO_ERROR);
    });

    it("K.3 - borrowAllowed rejects borrow beyond spot CF capacity", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // borrow 801e8 > 800e8 => shortfall
      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), parseUnits("801", 8));
      expect(errCode).to.equal(Error.INSUFFICIENT_LIQUIDITY);
    });
  });

  // =========================================================================
  // Section L: Asymmetric bounded prices
  // =========================================================================
  describe("L. Asymmetric bounded prices", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("L.1 - collateral price below spot reduces borrowing power", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // Lower collateral price => lower collateral value
      dbo.getBoundedCollateralPriceView.returns(parseUnits("0.5", 18)); // $0.50
      dbo.getBoundedDebtPriceView.returns(SPOT_PRICE); // $1 (same as spot)
      dbo.getBoundedPricesView.returns([parseUnits("0.5", 18), SPOT_PRICE]);

      // sumCollateral = 0.8 * 1 * 0.5 * 1000e8 = 400e8
      const [err, liquidity] = await comptroller.getBorrowingPower(await user.getAddress());
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("400", 8));
    });

    it("L.2 - debt price above spot increases borrow cost", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      dbo.getBoundedCollateralPriceView.returns(SPOT_PRICE); // $1
      dbo.getBoundedDebtPriceView.returns(parseUnits("2", 18)); // $2
      dbo.getBoundedPricesView.returns([SPOT_PRICE, parseUnits("2", 18)]);

      // sumCollateral = 0.8 * 1 * 1 * 1000e8 = 800e8
      // Borrow 500e8: sumBorrow = 2 * 500e8 = 1000e8 > 800e8 => shortfall
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("500", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const [err, , shortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(shortfall).to.equal(parseUnits("200", 8)); // 1000e8 - 800e8
    });

    it("L.3 - both bounded prices more conservative => strictly tighter position", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Check with spot-like bounded prices first
      dbo.getBoundedCollateralPriceView.returns(SPOT_PRICE);
      dbo.getBoundedDebtPriceView.returns(SPOT_PRICE);
      dbo.getBoundedPricesView.returns([SPOT_PRICE, SPOT_PRICE]);

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("500", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const [, liquiditySpot] = await comptroller.getBorrowingPower(userAddr);

      // Now with conservative bounded prices
      dbo.getBoundedCollateralPriceView.returns(BOUNDED_COLLATERAL_PRICE); // lower
      dbo.getBoundedDebtPriceView.returns(BOUNDED_DEBT_PRICE); // higher
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, BOUNDED_DEBT_PRICE]);

      const [, liquidityBounded] = await comptroller.getBorrowingPower(userAddr);

      expect(liquidityBounded).to.be.lt(liquiditySpot);
    });
  });

  // =========================================================================
  // Section M: Multi-asset scenarios
  // =========================================================================
  describe("M. Multi-asset scenarios", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("M.1 - DBO calls are made for each entered asset", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // Give vTokenB a non-zero supply so it is not skipped by the zero-balance
      // short-circuit in `_calculateAccountPosition` (entered markets with no supply
      // and no debt contribute zero to both sums and skip the oracle fetch).
      const userAddr = await user.getAddress();
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);

      dbo.getBoundedPricesView.reset();
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, BOUNDED_DEBT_PRICE]);

      await comptroller.getBorrowingPower(userAddr);

      expect(dbo.getBoundedPricesView).to.have.been.calledWith(vTokenA.address);
      expect(dbo.getBoundedPricesView).to.have.been.calledWith(vTokenB.address);
    });

    it("M.2 - updateProtectionState is called for each entered asset on borrow", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      dbo.updateProtectionState.reset();
      vTokenB.totalBorrows.returns(0);
      await comptroller
        .connect(vTokenB.wallet)
        .borrowAllowed(vTokenB.address, await user.getAddress(), parseUnits("10", 8));

      expect(dbo.updateProtectionState).to.have.been.calledWith(vTokenA.address);
      expect(dbo.updateProtectionState).to.have.been.calledWith(vTokenB.address);
    });

    it("M.3 - different bounded prices per asset are respected", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);
      const userAddr = await user.getAddress();

      // vTokenA collateral: balance=1000e8, no borrows
      // vTokenB: balance=500e8, borrow=200e8
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot
        .whenCalledWith(userAddr)
        .returns([0, parseUnits("500", 8), parseUnits("200", 8), EXCHANGE_RATE]);

      // Different prices per asset
      dbo.getBoundedCollateralPriceView.whenCalledWith(vTokenA.address).returns(parseUnits("0.8", 18));
      dbo.getBoundedCollateralPriceView.whenCalledWith(vTokenB.address).returns(parseUnits("0.5", 18));
      dbo.getBoundedDebtPriceView.whenCalledWith(vTokenA.address).returns(parseUnits("1.2", 18));
      dbo.getBoundedDebtPriceView.whenCalledWith(vTokenB.address).returns(parseUnits("1.5", 18));
      dbo.getBoundedPricesView.whenCalledWith(vTokenA.address).returns([parseUnits("0.8", 18), parseUnits("1.2", 18)]);
      dbo.getBoundedPricesView.whenCalledWith(vTokenB.address).returns([parseUnits("0.5", 18), parseUnits("1.5", 18)]);

      // vTokenA: tokensToDenom = 0.8 * 1 * 0.8 = 0.64 => sumCollateral += 0.64 * 1000e8 = 640e8
      // vTokenB: tokensToDenom = 0.8 * 1 * 0.5 = 0.40 => sumCollateral += 0.40 * 500e8 = 200e8
      // total collateral = 840e8
      //
      // vTokenA borrows: debtPrice * 0 = 0
      // vTokenB borrows: debtPrice * 200e8 = 1.5 * 200e8 = 300e8
      // total borrows = 300e8
      //
      // liquidity = 840e8 - 300e8 = 540e8
      const [err, liquidity, shortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("540", 8));
      expect(shortfall).to.equal(0);
    });
  });

  // =========================================================================
  // Section N: Edge cases and error handling
  // =========================================================================
  describe("N. Edge cases and error handling", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("N.1 - SNAPSHOT_ERROR propagates correctly", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Return error from getAccountSnapshot
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([1, 0, 0, 0]);

      const [err] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(Error.SNAPSHOT_ERROR);
    });

    it("N.2 - zero vToken balance yields zero collateral", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, 0, EXCHANGE_RATE]);

      const [err, liquidity, shortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(0);
    });

    it("N.3 - very large bounded prices do not overflow", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // Large price but within reasonable uint256 range
      dbo.getBoundedCollateralPriceView.returns(parseUnits("1000000", 18));
      dbo.getBoundedDebtPriceView.returns(parseUnits("1000000", 18));
      dbo.getBoundedPricesView.returns([parseUnits("1000000", 18), parseUnits("1000000", 18)]);

      const [err, liquidity] = await comptroller.getBorrowingPower(await user.getAddress());
      expect(err).to.equal(0);
      expect(liquidity).to.be.gt(0);
    });

    it("N.4 - very small bounded collateral price (near zero) results in minimal collateral", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.getBoundedCollateralPriceView.returns(1); // 1 wei
      dbo.getBoundedDebtPriceView.returns(SPOT_PRICE);
      dbo.getBoundedPricesView.returns([1, SPOT_PRICE]);

      const [err, liquidity] = await comptroller.getBorrowingPower(await user.getAddress());
      expect(err).to.equal(0);
      // CF * ER * 1_wei * 1000e8 / 1e18 ≈ 0 (truncated)
      expect(liquidity).to.equal(0);
    });

    it("N.5 - zero exchange rate results in zero collateral", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, 0]); // zero ER

      const [err, liquidity] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(0);
    });

    it("N.6 - oracle returning 0 for spot price causes PRICE_ERROR on borrow", async () => {
      const { comptroller, vTokenA, vTokenB, user, oracle, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      oracle.getUnderlyingPrice.whenCalledWith(vTokenB.address).returns(0);
      dbo.getBoundedPricesView.whenCalledWith(vTokenB.address).returns([0, 0]);
      vTokenB.totalBorrows.returns(0);

      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), parseUnits("10", 8));
      expect(errCode).to.equal(Error.PRICE_ERROR);
    });

    it("N.7 - getAccountLiquidity returns PRICE_ERROR when spot oracle returns 0", async () => {
      const { comptroller, vTokenA, user, oracle } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      oracle.getUnderlyingPrice.returns(0);

      const [err] = await comptroller.getAccountLiquidity(await user.getAddress());
      expect(err).to.equal(Error.PRICE_ERROR);
    });
  });

  // =========================================================================
  // Section O: VAI debt interaction
  // =========================================================================
  describe("O. VAI debt interaction with bounded prices", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("O.1 - VAI debt is added to sumBorrows in CF path", async () => {
      const { comptroller, vTokenA, user, vaiController } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // sumCollateral = 640e8 at bounded
      // VAI debt = 640e8 (exactly equal => 0 liquidity)
      vaiController.getVAIRepayAmount.whenCalledWith(userAddr).returns(parseUnits("640", 8));

      const [err, liquidity, shortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(0);
    });

    it("O.2 - VAI debt exceeding bounded collateral causes shortfall", async () => {
      const { comptroller, vTokenA, user, vaiController } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // sumCollateral = 640e8
      // VAI debt = 700e8 => shortfall = 60e8
      vaiController.getVAIRepayAmount.whenCalledWith(userAddr).returns(parseUnits("700", 8));

      const [err, , shortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(shortfall).to.equal(parseUnits("60", 8));
    });

    it("O.3 - VAI debt is also added in LT path", async () => {
      const { comptroller, vTokenA, user, vaiController } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // sumCollateral_LT = 900e8
      // VAI debt = 950e8 => shortfall = 50e8
      vaiController.getVAIRepayAmount.whenCalledWith(userAddr).returns(parseUnits("950", 8));

      const [err, , shortfall] = await comptroller.getAccountLiquidity(userAddr);
      expect(err).to.equal(0);
      expect(shortfall).to.equal(parseUnits("50", 8));
    });

    it("O.4 - VAI + token borrows combined in bounded CF path", async () => {
      const { comptroller, vTokenA, vTokenB, user, vaiController } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("200", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // VAI debt = 100e8
      vaiController.getVAIRepayAmount.whenCalledWith(userAddr).returns(parseUnits("100", 8));

      // sumCollateral = 640e8
      // sumBorrow = 1.2 * 200e8 + 100e8 = 240e8 + 100e8 = 340e8
      // liquidity = 640e8 - 340e8 = 300e8
      const [err, liquidity, shortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("300", 8));
      expect(shortfall).to.equal(0);
    });
  });

  // =========================================================================
  // Section P: CF vs LT path divergence
  // =========================================================================
  describe("P. CF vs LT path divergence", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("P.1 - account can be solvent at LT but in shortfall at bounded CF", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Borrow 700e8
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("700", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // LT path: sumCollateral = 900e8, sumBorrow = 700e8 => liquidity = 200e8
      const [errLT, liquidityLT, shortfallLT] = await comptroller.getAccountLiquidity(userAddr);
      expect(errLT).to.equal(0);
      expect(liquidityLT).to.equal(parseUnits("200", 8));
      expect(shortfallLT).to.equal(0);

      // CF path (bounded): sumCollateral = 640e8, sumBorrow = 840e8 => shortfall = 200e8
      const [errCF, liquidityCF, shortfallCF] = await comptroller.getBorrowingPower(userAddr);
      expect(errCF).to.equal(0);
      expect(liquidityCF).to.equal(0);
      expect(shortfallCF).to.equal(parseUnits("200", 8));
    });

    it("P.2 - liquidation not allowed when solvent at LT even if shortfall at CF", async () => {
      const { comptroller, vTokenA, vTokenB, user, liquidator } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Borrow 700e8 => solvent at LT, shortfall at CF
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("700", 8), EXCHANGE_RATE]);
      vTokenB.borrowBalanceStored.whenCalledWith(userAddr).returns(parseUnits("700", 8));
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
        vTokenB.address,
        vTokenA.address,
        await liquidator.getAddress(),
        userAddr,
        parseUnits("100", 8),
      );
      expect(errCode).to.equal(Error.INSUFFICIENT_SHORTFALL);
    });

    it("P.3 - borrow blocked by CF bounded path even though LT shows liquidity", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Existing borrow of 500e8
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("500", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // Additional borrow of 100e8: at bounded, total borrow effect = 1.2 * (500+100)e8 = 720e8 > 640e8
      vTokenB.totalBorrows.returns(parseUnits("500", 8));
      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, userAddr, parseUnits("100", 8));
      expect(errCode).to.equal(Error.INSUFFICIENT_LIQUIDITY);
    });

    it("P.4 - redeem blocked by CF bounded path even though LT shows sufficient collateral", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Borrow 500e8
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("500", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // At bounded: sumCollateral=640e8, sumBorrow=600e8. Redeem 100 adds 64e8 => 664e8 > 640e8
      // At LT: sumCollateral=900e8, sumBorrow=500e8. Redeem 100 adds 90e8 => 590e8 < 900e8 (OK at LT)
      const errCode = await comptroller.callStatic.redeemAllowed(vTokenA.address, userAddr, parseUnits("100", 8));
      expect(errCode).to.equal(Error.INSUFFICIENT_LIQUIDITY);
    });
  });

  // =========================================================================
  // Section Q: enterPool (CF path, state-changing)
  // =========================================================================
  describe("Q. enterPool (CF path)", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("Q.1 - enterPool calls _updateProtectionStates via _getAccountLiquidity", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // Create a pool
      await comptroller.createPool("test-pool");
      const poolId = await comptroller.lastPoolId();
      await comptroller.addPoolMarkets([poolId], [vTokenA.address]);

      dbo.updateProtectionState.reset();

      // enterPool triggers _getAccountLiquidity with CF weighting
      await comptroller.connect(user).enterPool(poolId);
      expect(dbo.updateProtectionState).to.have.been.calledWith(vTokenA.address);
    });

    it("Q.2 - enterPool reverts if bounded-price liquidity check fails", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Enter B with borrows
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("700", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // At bounded: shortfall exists (640e8 < 840e8)
      await comptroller.createPool("test-pool-2");
      const poolId = await comptroller.lastPoolId();
      await comptroller.addPoolMarkets([poolId], [vTokenA.address]);
      await comptroller.addPoolMarkets([poolId], [vTokenB.address]);
      await comptroller.setIsBorrowAllowed(poolId, vTokenB.address, true);

      await expect(comptroller.connect(user).enterPool(poolId)).to.be.revertedWithCustomError(
        comptroller,
        "LiquidityCheckFailed",
      );
    });
  });

  // =========================================================================
  // Section R: DBO reconfiguration
  // =========================================================================
  describe("R. DBO reconfiguration", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("R.1 - changing DBO address affects subsequent liquidity checks", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Current bounded: liquidity = 640e8
      const [, liquidity1] = await comptroller.getBorrowingPower(userAddr);
      expect(liquidity1).to.equal(parseUnits("640", 8));

      // Deploy a new DBO with different prices
      const dbo2 = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
      dbo2.getBoundedCollateralPriceView.returns(parseUnits("0.5", 18)); // $0.50
      dbo2.getBoundedDebtPriceView.returns(parseUnits("1.5", 18)); // $1.50
      dbo2.getBoundedPricesView.returns([parseUnits("0.5", 18), parseUnits("1.5", 18)]);
      await comptroller.setDeviationBoundedOracle(dbo2.address);

      // New liquidity = 0.8 * 1 * 0.5 * 1000e8 = 400e8
      const [, liquidity2] = await comptroller.getBorrowingPower(userAddr);
      expect(liquidity2).to.equal(parseUnits("400", 8));
    });

    it("R.2 - swapping DBO to a different instance works", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Replace with a new DBO that returns different prices
      const newDbo = await smock.fake<IDeviationBoundedOracle>("IDeviationBoundedOracle");
      newDbo.getBoundedCollateralPriceView.returns(parseUnits("0.5", 18));
      newDbo.getBoundedDebtPriceView.returns(parseUnits("1.5", 18));
      newDbo.getBoundedPricesView.returns([parseUnits("0.5", 18), parseUnits("1.5", 18)]);
      await comptroller.setDeviationBoundedOracle(newDbo.address);
      expect(await comptroller.deviationBoundedOracle()).to.equal(newDbo.address);

      // sumCollateral = 0.8 * 1 * 0.5 * 1000e8 = 400e8
      const [err, liquidity] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("400", 8));
    });

    it("R.3 - changing bounded prices on existing DBO takes effect immediately", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      const [, liquidity1] = await comptroller.getBorrowingPower(userAddr);
      expect(liquidity1).to.equal(parseUnits("640", 8));

      // Change DBO return values
      dbo.getBoundedCollateralPriceView.returns(parseUnits("0.6", 18));
      dbo.getBoundedPricesView.returns([parseUnits("0.6", 18), BOUNDED_DEBT_PRICE]);
      // sumCollateral = 0.8 * 1 * 0.6 * 1000e8 = 480e8
      const [, liquidity2] = await comptroller.getBorrowingPower(userAddr);
      expect(liquidity2).to.equal(parseUnits("480", 8));
    });
  });

  // =========================================================================
  // Section S: Consistency and regression tests
  // =========================================================================
  describe("S. Consistency and regression tests", () => {
    let fixture: DboFixture;

    beforeEach(async () => {
      fixture = await loadFixture(deployDboFixture);
      configureFakes(fixture);
    });

    it("S.1 - getBorrowingPower and getHypotheticalAccountLiquidity(0,0) return same values", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("300", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const bp = await comptroller.getBorrowingPower(userAddr);
      const hl = await comptroller.getHypotheticalAccountLiquidity(userAddr, ethers.constants.AddressZero, 0, 0);

      expect(bp[0]).to.equal(hl[0]);
      expect(bp[1]).to.equal(hl[1]);
      expect(bp[2]).to.equal(hl[2]);
    });

    it("S.2 - hypothetical borrow of 0 returns same as no-modification call", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      const noMod = await comptroller.getHypotheticalAccountLiquidity(userAddr, ethers.constants.AddressZero, 0, 0);
      const zeroBorrow = await comptroller.getHypotheticalAccountLiquidity(userAddr, vTokenB.address, 0, 0);

      expect(noMod[0]).to.equal(zeroBorrow[0]);
      expect(noMod[1]).to.equal(zeroBorrow[1]);
      expect(noMod[2]).to.equal(zeroBorrow[2]);
    });

    it("S.3 - increasing borrow amount monotonically decreases liquidity", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);
      const userAddr = await user.getAddress();

      const [, liq100] = await comptroller.getHypotheticalAccountLiquidity(
        userAddr,
        vTokenB.address,
        0,
        parseUnits("100", 8),
      );
      const [, liq200] = await comptroller.getHypotheticalAccountLiquidity(
        userAddr,
        vTokenB.address,
        0,
        parseUnits("200", 8),
      );
      const [, liq300] = await comptroller.getHypotheticalAccountLiquidity(
        userAddr,
        vTokenB.address,
        0,
        parseUnits("300", 8),
      );

      expect(liq100).to.be.gt(liq200);
      expect(liq200).to.be.gt(liq300);
    });

    it("S.4 - increasing redeem amount monotonically decreases liquidity", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      const [, liq100] = await comptroller.getHypotheticalAccountLiquidity(
        userAddr,
        vTokenA.address,
        parseUnits("100", 8),
        0,
      );
      const [, liq200] = await comptroller.getHypotheticalAccountLiquidity(
        userAddr,
        vTokenA.address,
        parseUnits("200", 8),
        0,
      );
      const [, liq500] = await comptroller.getHypotheticalAccountLiquidity(
        userAddr,
        vTokenA.address,
        parseUnits("500", 8),
        0,
      );

      expect(liq100).to.be.gt(liq200);
      expect(liq200).to.be.gt(liq500);
    });

    it("S.5 - lowering bounded collateral price reduces borrowing power", async () => {
      const { comptroller, vTokenA, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      dbo.getBoundedCollateralPriceView.returns(parseUnits("0.9", 18));
      dbo.getBoundedPricesView.returns([parseUnits("0.9", 18), BOUNDED_DEBT_PRICE]);
      const [, liq1] = await comptroller.getBorrowingPower(userAddr);

      dbo.getBoundedCollateralPriceView.returns(parseUnits("0.7", 18));
      dbo.getBoundedPricesView.returns([parseUnits("0.7", 18), BOUNDED_DEBT_PRICE]);
      const [, liq2] = await comptroller.getBorrowingPower(userAddr);

      expect(liq1).to.be.gt(liq2);
    });

    it("S.6 - raising bounded debt price reduces liquidity", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("300", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      dbo.getBoundedDebtPriceView.returns(parseUnits("1.0", 18));
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, parseUnits("1.0", 18)]);
      const [, liq1] = await comptroller.getBorrowingPower(userAddr);

      dbo.getBoundedDebtPriceView.returns(parseUnits("1.5", 18));
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, parseUnits("1.5", 18)]);
      const [, liq2, shortfall2] = await comptroller.getBorrowingPower(userAddr);

      // liq1 should be higher (or liq2 should be lower / have shortfall)
      if (shortfall2.gt(0)) {
        expect(liq1).to.be.gt(0);
      } else {
        expect(liq1).to.be.gt(liq2);
      }
    });

    it("S.7 - redeemAllowed and transferAllowed behave identically for same tokens", async () => {
      const { comptroller, vTokenA, vTokenB, user, root } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("400", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      const redeemResult = await comptroller.callStatic.redeemAllowed(vTokenA.address, userAddr, parseUnits("50", 8));
      const transferResult = await comptroller.callStatic.transferAllowed(
        vTokenA.address,
        userAddr,
        await root.getAddress(),
        parseUnits("50", 8),
      );

      expect(redeemResult).to.equal(transferResult);
    });

    it("S.8 - multiple sequential borrows each update protection state", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      vTokenB.totalBorrows.returns(0);

      // First borrow
      dbo.updateProtectionState.reset();
      await comptroller
        .connect(vTokenB.wallet)
        .borrowAllowed(vTokenB.address, await user.getAddress(), parseUnits("10", 8));
      expect(dbo.updateProtectionState).to.have.been.calledWith(vTokenA.address);

      // Second borrow — reset and verify it's called again
      dbo.updateProtectionState.reset();
      await comptroller
        .connect(vTokenB.wallet)
        .borrowAllowed(vTokenB.address, await user.getAddress(), parseUnits("10", 8));
      expect(dbo.updateProtectionState).to.have.been.calledWith(vTokenA.address);
    });

    it("S.9 - exact boundary: borrow that exactly equals bounded capacity", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      // Make debt price exactly $1 so borrow amount = sumCollateral
      dbo.getBoundedDebtPriceView.returns(SPOT_PRICE);
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, SPOT_PRICE]);
      // sumCollateral = 0.8 * 1 * 0.8 * 1000e8 = 640e8
      // borrow exactly 640e8 at debt price $1 => sumBorrow = 640e8 = sumCollateral => no shortfall
      const borrowAmount = parseUnits("640", 8);
      vTokenB.totalBorrows.returns(0);
      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), borrowAmount);
      expect(errCode).to.equal(Error.NO_ERROR);
    });

    it("S.10 - exact boundary: borrow 1 wei over bounded capacity fails", async () => {
      const { comptroller, vTokenA, vTokenB, user, dbo } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);

      dbo.getBoundedDebtPriceView.returns(SPOT_PRICE);
      dbo.getBoundedPricesView.returns([BOUNDED_COLLATERAL_PRICE, SPOT_PRICE]);
      // borrow 641e8 at debt price $1 => sumBorrow = 641e8 > 640e8 => shortfall
      const borrowAmount = parseUnits("641", 8);
      vTokenB.totalBorrows.returns(0);
      const errCode = await comptroller
        .connect(vTokenB.wallet)
        .callStatic.borrowAllowed(vTokenB.address, await user.getAddress(), borrowAmount);
      expect(errCode).to.equal(Error.INSUFFICIENT_LIQUIDITY);
    });

    it("S.11 - CF path divergence: verify exact bounded liquidity math", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Borrow 300e8 on B
      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("300", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // sumCollateral = 0.8 * 1 * 0.8 * 1000e8 = 640e8
      // sumBorrow = 1.2 * 300e8 = 360e8
      // liquidity = 640e8 - 360e8 = 280e8
      const [err, liquidity, shortfall] = await comptroller.getBorrowingPower(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("280", 8));
      expect(shortfall).to.equal(0);
    });

    it("S.12 - LT path: verify exact spot liquidity math", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      vTokenA.getAccountSnapshot.whenCalledWith(userAddr).returns([0, COLLATERAL_BALANCE, 0, EXCHANGE_RATE]);
      vTokenB.getAccountSnapshot.whenCalledWith(userAddr).returns([0, 0, parseUnits("300", 8), EXCHANGE_RATE]);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);

      // sumCollateral_LT = 0.9 * 1 * 1 * 1000e8 = 900e8
      // sumBorrow = 1 * 300e8 = 300e8
      // liquidity = 900e8 - 300e8 = 600e8
      const [err, liquidity, shortfall] = await comptroller.getAccountLiquidity(userAddr);
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("600", 8));
      expect(shortfall).to.equal(0);
    });

    it("S.13 - hypothetical borrow at bounded: exact shortfall calculation", async () => {
      const { comptroller, vTokenA, vTokenB, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      await comptroller.connect(user).enterMarkets([vTokenB.address]);
      const userAddr = await user.getAddress();

      // Hypothetical borrow 600e8 on B
      // sumCollateral = 640e8
      // hypothetical sumBorrow = 1.2 * 600e8 = 720e8
      // shortfall = 720e8 - 640e8 = 80e8
      const [err, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        userAddr,
        vTokenB.address,
        0,
        parseUnits("600", 8),
      );
      expect(err).to.equal(0);
      expect(liquidity).to.equal(0);
      expect(shortfall).to.equal(parseUnits("80", 8));
    });

    it("S.14 - hypothetical redeem at bounded: exact liquidity calculation", async () => {
      const { comptroller, vTokenA, user } = fixture;
      await enterCollateralMarket(comptroller, vTokenA, user);
      const userAddr = await user.getAddress();

      // Hypothetical redeem 200 vTokens from A
      // sumCollateral = 640e8
      // hypothetical adds tokensToDenom * 200e8 = 0.64 * 200e8 = 128e8 to borrows
      // liquidity = 640e8 - 128e8 = 512e8
      const [err, liquidity, shortfall] = await comptroller.getHypotheticalAccountLiquidity(
        userAddr,
        vTokenA.address,
        parseUnits("200", 8),
        0,
      );
      expect(err).to.equal(0);
      expect(liquidity).to.equal(parseUnits("512", 8));
      expect(shortfall).to.equal(0);
    });

    it("S.15 - CF and LT paths both handle zero-collateral zero-borrow correctly", async () => {
      const { comptroller, user } = fixture;
      const userAddr = await user.getAddress();

      const bp = await comptroller.getBorrowingPower(userAddr);
      const al = await comptroller.getAccountLiquidity(userAddr);

      expect(bp[0]).to.equal(0);
      expect(bp[1]).to.equal(0);
      expect(bp[2]).to.equal(0);
      expect(al[0]).to.equal(0);
      expect(al[1]).to.equal(0);
      expect(al[2]).to.equal(0);
    });
  });
});
