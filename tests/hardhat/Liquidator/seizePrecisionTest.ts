import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { ethers } from "hardhat";

import {
  ComptrollerMock,
  FaucetToken,
  IDeviationBoundedOracle,
  Liquidator,
  PriceOracle,
  VBep20Harness,
} from "../../../typechain";
import {
  deployComptroller,
  deployFakeAccessControlManager,
  deployFakeDeviationBoundedOracle,
  deployFakeOracle,
  deployFakeProtocolShareReserve,
  deployFakeVAIController,
  deployJumpRateModel,
  deployLiquidatorContract,
  deployMockToken,
  deployVBNB,
  deployVToken,
} from "../fixtures/ComptrollerWithMarkets";

const { expect } = chai;
chai.use(smock.matchers);

const MANTISSA_ONE = 10n ** 18n;
const LIQUIDATION_INCENTIVE = 11n * 10n ** 17n;
const TREASURY_PERCENT = 5n * 10n ** 17n;
const COLLATERAL_FACTOR = 8n * 10n ** 17n;
const LIQUIDATION_THRESHOLD = 85n * 10n ** 16n;

// Oracle convention: usd * 10^(36 - decimals)
const USD_24 = 10n ** 12n;
const USD_18 = 10n ** 18n;

// One 8-decimal vToken is worth 1 unit of a 24-decimal underlying and 0.02 units of an 18-decimal one
const EXCHANGE_RATE_24 = 10n ** 34n;
const EXCHANGE_RATE_18 = 2n * 10n ** 26n;

type Fixture = {
  comptroller: ComptrollerMock;
  liquidator: Liquidator;
  oracle: FakeContract<PriceOracle>;
  deviationBoundedOracle: FakeContract<IDeviationBoundedOracle>;
  // Where the Liquidator sends the treasury share of seized collateral
  liquidatorReserve: string;
  vDebt24: VBep20Harness;
  vDebt18: VBep20Harness;
  vCollateral18: VBep20Harness;
  vCollateral24: VBep20Harness;
  underlying: Map<string, FaucetToken>;
};

describe("Liquidator: seize amount precision", () => {
  let supplier: SignerWithAddress;
  let borrower: SignerWithAddress;
  let liquidatorAccount: SignerWithAddress;
  let treasury: SignerWithAddress;
  let f: Fixture;

  async function deployFixture(): Promise<Fixture> {
    [, supplier, borrower, liquidatorAccount, treasury] = await ethers.getSigners();

    const accessControlManager = await deployFakeAccessControlManager();
    const oracle = await deployFakeOracle();
    const deviationBoundedOracle = await deployFakeDeviationBoundedOracle();
    const comptroller = await deployComptroller({ accessControlManager, oracle, deviationBoundedOracle });
    const vaiController = await deployFakeVAIController();
    await comptroller._setVAIController(vaiController.address);
    const protocolShareReserve = await deployFakeProtocolShareReserve();
    // Zero rates keep borrow balances and exchange rates constant across blocks
    const interestRateModel = await deployJumpRateModel({
      baseRatePerYear: 0,
      multiplierPerYear: 0,
      jumpMultiplierPerYear: 0,
      kink: 0,
    });

    const underlying = new Map<string, FaucetToken>();
    const deployMarket = async (symbol: string, decimals: number, exchangeRate: bigint) => {
      const token = await deployMockToken({ name: symbol, symbol, decimals });
      const vToken = await deployVToken({
        accessControlManager,
        underlying: token,
        comptroller,
        interestRateModel,
        initialExchangeRateMantissa: exchangeRate,
        symbol: `v${symbol}`,
        protocolShareReserve,
      });
      await comptroller._supportMarket(vToken.address);
      underlying.set(vToken.address, token);
      return vToken;
    };

    const vDebt24 = await deployMarket("DEBT24", 24, EXCHANGE_RATE_24);
    const vDebt18 = await deployMarket("DEBT18", 18, EXCHANGE_RATE_18);
    const vCollateral18 = await deployMarket("COLL18", 18, EXCHANGE_RATE_18);
    const vCollateral24 = await deployMarket("COLL24", 24, EXCHANGE_RATE_24);
    const markets = [vDebt24, vDebt18, vCollateral18, vCollateral24].map(vToken => vToken.address);

    await comptroller._setMarketSupplyCaps(
      markets,
      markets.map(() => constants.MaxUint256),
    );
    await comptroller._setMarketBorrowCaps(
      markets,
      markets.map(() => constants.MaxUint256),
    );
    await comptroller.setIsBorrowAllowed(0, vDebt24.address, true);
    await comptroller.setIsBorrowAllowed(0, vDebt18.address, true);

    const liquidator = await deployLiquidatorContract({
      comptroller,
      vBNB: await deployVBNB({ comptroller }),
      treasuryAddress: treasury.address,
      treasuryPercentMantissa: TREASURY_PERCENT,
    });
    const fixture = {
      comptroller,
      liquidator,
      liquidatorReserve: await liquidator.protocolShareReserve(),
      oracle,
      deviationBoundedOracle,
      vDebt24,
      vDebt18,
      vCollateral18,
      vCollateral24,
      underlying,
    };

    setDefaultPrices(fixture);
    for (const vCollateral of [vCollateral18, vCollateral24]) {
      await comptroller["setCollateralFactor(address,uint256,uint256)"](
        vCollateral.address,
        COLLATERAL_FACTOR,
        LIQUIDATION_THRESHOLD,
      );
      await comptroller["setLiquidationIncentive(address,uint256)"](vCollateral.address, LIQUIDATION_INCENTIVE);
    }

    // Liquidity to borrow from
    await supply(fixture, supplier, vDebt24, 10_000n * 10n ** 24n);
    await supply(fixture, supplier, vDebt18, 10_000n * 10n ** 18n);
    return fixture;
  }

  // smock fakes keep their behaviour across loadFixture snapshots, so every test starts from these prices
  function setDefaultPrices(fixture: Fixture) {
    setPrice(fixture, fixture.vDebt24, USD_24);
    setPrice(fixture, fixture.vDebt18, USD_18);
    setPrice(fixture, fixture.vCollateral18, 85_000n * USD_18);
    setPrice(fixture, fixture.vCollateral24, USD_24);
  }

  function underlyingOf(fixture: Fixture, vToken: VBep20Harness): FaucetToken {
    const token = fixture.underlying.get(vToken.address);
    if (!token) throw new Error(`no underlying registered for ${vToken.address}`);
    return token;
  }

  function setPrice(fixture: Fixture, vToken: VBep20Harness, price: bigint) {
    fixture.oracle.getUnderlyingPrice.whenCalledWith(vToken.address).returns(price);
    fixture.deviationBoundedOracle.getBoundedPricesView.whenCalledWith(vToken.address).returns([price, price]);
  }

  async function supply(fixture: Fixture, account: SignerWithAddress, vToken: VBep20Harness, amount: BigNumberish) {
    const token = underlyingOf(fixture, vToken);
    await token.allocateTo(account.address, amount);
    await token.connect(account).approve(vToken.address, amount);
    await vToken.connect(account).mint(amount);
  }

  async function openPosition(
    vCollateral: VBep20Harness,
    collateralAmount: bigint,
    vDebt: VBep20Harness,
    debtAmount: bigint,
  ) {
    await supply(f, borrower, vCollateral, collateralAmount);
    await f.comptroller.connect(borrower).enterMarkets([vCollateral.address]);
    await vDebt.connect(borrower).borrow(debtAmount);
  }

  async function liquidate(vDebt: VBep20Harness, repayAmount: bigint, vCollateral: VBep20Harness) {
    const token = underlyingOf(f, vDebt);
    await token.allocateTo(liquidatorAccount.address, repayAmount);
    await token.connect(liquidatorAccount).approve(f.liquidator.address, repayAmount);
    return f.liquidator
      .connect(liquidatorAccount)
      .liquidateBorrow(vDebt.address, borrower.address, repayAmount, vCollateral.address);
  }

  // Treasury cut the Liquidator takes out of the seized vTokens: its share of the bonus portion only
  function treasuryShare(seizeTokens: bigint): bigint {
    const bonus = (seizeTokens * (LIQUIDATION_INCENTIVE - MANTISSA_ONE)) / LIQUIDATION_INCENTIVE;
    return (bonus * TREASURY_PERCENT) / MANTISSA_ONE;
  }

  async function expectLiquidation({
    vDebt,
    vCollateral,
    repayAmount,
    debtBefore,
    collateralBefore,
    exchangeRate,
    seizeTokens,
  }: {
    vDebt: VBep20Harness;
    vCollateral: VBep20Harness;
    repayAmount: bigint;
    debtBefore: bigint;
    collateralBefore: bigint;
    exchangeRate: bigint;
    seizeTokens: bigint;
  }) {
    const ours = treasuryShare(seizeTokens);
    const theirs = seizeTokens - ours;
    const collateralToken = underlyingOf(f, vCollateral);

    const tx = await liquidate(vDebt, repayAmount, vCollateral);
    await expect(tx)
      .to.emit(vDebt, "LiquidateBorrow")
      .withArgs(f.liquidator.address, borrower.address, repayAmount, vCollateral.address, seizeTokens);
    await expect(tx)
      .to.emit(f.liquidator, "LiquidateBorrowedTokens")
      .withArgs(
        liquidatorAccount.address,
        borrower.address,
        repayAmount,
        vDebt.address,
        vCollateral.address,
        ours,
        theirs,
      );

    expect(await vDebt.borrowBalanceStored(borrower.address)).to.equal(debtBefore - repayAmount);
    expect(await vCollateral.balanceOf(borrower.address)).to.equal(collateralBefore - seizeTokens);
    expect(await vCollateral.balanceOf(liquidatorAccount.address)).to.equal(theirs);
    expect(await vCollateral.balanceOf(f.liquidator.address)).to.equal(0);
    // The treasury share is redeemed and its underlying forwarded to the protocol share reserve
    expect(await collateralToken.balanceOf(f.liquidatorReserve)).to.equal((ours * exchangeRate) / MANTISSA_ONE);
  }

  beforeEach(async () => {
    f = await loadFixture(deployFixture);
    setDefaultPrices(f);
  });

  it("seizes the exact amount for 24-decimal debt against 18-decimal collateral", async () => {
    // 0.02 collateral = 1 vToken, worth $1,700, against $1,000 of debt
    await openPosition(f.vCollateral18, 2n * 10n ** 16n, f.vDebt24, 1_000n * 10n ** 24n);
    // At $50,000 the position is under the liquidation threshold: 0.85 * $1,000 < $1,000
    setPrice(f, f.vCollateral18, 50_000n * USD_18);

    // Repaying $500 seizes $550 of collateral: 550 / 50,000 / 0.02 = 0.55 vTokens.
    // The previous formula rounded the ratio 0.11 down to 0 and seized nothing.
    await expectLiquidation({
      vDebt: f.vDebt24,
      vCollateral: f.vCollateral18,
      repayAmount: 500n * 10n ** 24n,
      debtBefore: 1_000n * 10n ** 24n,
      collateralBefore: 10n ** 8n,
      exchangeRate: EXCHANGE_RATE_18,
      seizeTokens: 55_000_000n,
    });
  });

  it("seizes the exact amount for 24-decimal debt against 24-decimal collateral", async () => {
    await openPosition(f.vCollateral24, 1_000n * 10n ** 24n, f.vDebt24, 700n * 10n ** 24n);
    setPrice(f, f.vCollateral24, (75n * USD_24) / 100n);

    // Repaying $350 seizes $385 of collateral at $0.75: 513.33333333 vTokens.
    // The previous formula rounded the ratio 146.67 down to 146 and seized 511 vTokens.
    await expectLiquidation({
      vDebt: f.vDebt24,
      vCollateral: f.vCollateral24,
      repayAmount: 350n * 10n ** 24n,
      debtBefore: 700n * 10n ** 24n,
      collateralBefore: 1_000n * 10n ** 8n,
      exchangeRate: EXCHANGE_RATE_24,
      seizeTokens: 51_333_333_333n,
    });
  });

  it("seizes the exact amount for 18-decimal debt against 18-decimal collateral", async () => {
    await openPosition(f.vCollateral18, 10n ** 17n, f.vDebt18, 3_000n * 10n ** 18n);
    setPrice(f, f.vCollateral18, 30_000n * USD_18);

    // Repaying $1,500 seizes $1,650 of collateral at $30,000: 2.75 vTokens.
    // The previous formula seized 2.74999500 vTokens.
    await expectLiquidation({
      vDebt: f.vDebt18,
      vCollateral: f.vCollateral18,
      repayAmount: 1_500n * 10n ** 18n,
      debtBefore: 3_000n * 10n ** 18n,
      collateralBefore: 5n * 10n ** 8n,
      exchangeRate: EXCHANGE_RATE_18,
      seizeTokens: 275_000_000n,
    });
  });

  it("seizes the whole collateral balance and reverts one repay unit past it", async () => {
    await openPosition(f.vCollateral18, 2n * 10n ** 16n, f.vDebt24, 1_000n * 10n ** 24n);
    setPrice(f, f.vCollateral18, 20_000n * USD_18);
    // Forced liquidation lifts the close factor, so the repay can reach the collateral balance
    await f.comptroller._setForcedLiquidation(f.vDebt24.address, true);

    // Largest repay whose seize still fits in the 1e8 vTokens the borrower holds
    const perRepayUnit = LIQUIDATION_INCENTIVE * USD_24;
    const perSeizedToken = 20_000n * USD_18 * EXCHANGE_RATE_18;
    const maxRepay = ((10n ** 8n + 1n) * perSeizedToken - 1n) / perRepayUnit;
    expect((maxRepay * perRepayUnit) / perSeizedToken).to.equal(10n ** 8n);

    await expect(liquidate(f.vDebt24, maxRepay + 1n, f.vCollateral18)).to.be.revertedWith("LIQUIDATE_SEIZE_TOO_MUCH");

    await expectLiquidation({
      vDebt: f.vDebt24,
      vCollateral: f.vCollateral18,
      repayAmount: maxRepay,
      debtBefore: 1_000n * 10n ** 24n,
      collateralBefore: 10n ** 8n,
      exchangeRate: EXCHANGE_RATE_18,
      seizeTokens: 10n ** 8n,
    });
    expect(await f.vCollateral18.balanceOf(borrower.address)).to.equal(0);
  });

  it("seizes nothing for a repay worth less than one collateral vToken, as before", async () => {
    await openPosition(f.vCollateral18, 2n * 10n ** 16n, f.vDebt24, 1_000n * 10n ** 24n);
    setPrice(f, f.vCollateral18, 50_000n * USD_18);

    // One raw vToken of this collateral is worth $1e-5, far above a 1e6 raw-unit repay ($1e-18)
    await expectLiquidation({
      vDebt: f.vDebt24,
      vCollateral: f.vCollateral18,
      repayAmount: 10n ** 6n,
      debtBefore: 1_000n * 10n ** 24n,
      collateralBefore: 10n ** 8n,
      exchangeRate: EXCHANGE_RATE_18,
      seizeTokens: 0n,
    });
  });
});
