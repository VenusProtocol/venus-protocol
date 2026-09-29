import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../../helpers/utils";
import {
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  IAccessControlManagerV5,
  PriceOracle,
  VBep20Immutable,
} from "../../../../typechain";
import { ComptrollerErrorReporter } from "../../util/Errors";
import { deployDiamond } from "./scripts/deploy";

const { expect } = chai;
chai.use(smock.matchers);

const borrowedPrice = convertToUnit(2, 10);
const collateralPrice = convertToUnit(1, 18);
const repayAmount = convertToUnit(1, 18);

async function calculateSeizeTokens(
  comptroller: ComptrollerMock,
  vTokenBorrowed: FakeContract<VBep20Immutable>,
  vTokenCollateral: FakeContract<VBep20Immutable>,
  repayAmount: BigNumberish,
) {
  return comptroller["liquidateCalculateSeizeTokens(address,address,uint256)"](
    vTokenBorrowed.address,
    vTokenCollateral.address,
    repayAmount,
  );
}

function rando(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

const EXP_SCALE = 10n ** 18n;
const MAX_UINT256 = constants.MaxUint256.toBigInt();
const PANIC_ARITHMETIC_OVERFLOW = 0x11;

// Oracle convention: a token worth `usdMicros / 1e6` dollars is priced at usd * 10^(36 - decimals)
function priceMantissa(usdMicros: bigint, decimals: number): bigint {
  return (usdMicros * 10n ** BigInt(36 - decimals)) / 10n ** 6n;
}

// Exchange rate of an 8-decimal vToken worth `underlyingMicros / 1e6` underlying tokens
function exchangeRateMantissa(underlyingMicros: bigint, underlyingDecimals: number): bigint {
  return (underlyingMicros * 10n ** BigInt(18 + underlyingDecimals - 8)) / 10n ** 6n;
}

// floor(repay * incentive * borrowedPrice / (collateralPrice * exchangeRate)), truncated once
function exactSeizeTokens(
  repayAmount: bigint,
  liquidationIncentive: bigint,
  borrowedPrice: bigint,
  collateralPrice: bigint,
  exchangeRate: bigint,
): bigint {
  return (repayAmount * liquidationIncentive * borrowedPrice) / (collateralPrice * exchangeRate);
}

// Result of the previous implementation, which truncated the ratio to an 18-decimal mantissa
// before multiplying it by the repay amount
function truncatedSeizeTokens(
  repayAmount: bigint,
  liquidationIncentive: bigint,
  borrowedPrice: bigint,
  collateralPrice: bigint,
  exchangeRate: bigint,
): bigint {
  const numerator = (liquidationIncentive * borrowedPrice) / EXP_SCALE;
  const denominator = (collateralPrice * exchangeRate) / EXP_SCALE;
  return (((numerator * EXP_SCALE) / denominator) * repayAmount) / EXP_SCALE;
}

// Deterministic xorshift64 generator, so the random cases are the same on every run
function xorshift64(seed: bigint): () => bigint {
  const mask = (1n << 64n) - 1n;
  let state = seed;
  return () => {
    state ^= (state << 13n) & mask;
    state ^= state >> 7n;
    state ^= (state << 17n) & mask;
    return state;
  };
}

describe("Comptroller", () => {
  let comptroller: ComptrollerMock;
  let oracle: FakeContract<PriceOracle>;
  let vTokenBorrowed: FakeContract<VBep20Immutable>;
  let vTokenCollateral: FakeContract<VBep20Immutable>;

  type LiquidateFixture = {
    comptroller: ComptrollerMock;
    comptrollerLens: MockContract<ComptrollerLens>;
    oracle: FakeContract<PriceOracle>;
    vTokenBorrowed: FakeContract<VBep20Immutable>;
    vTokenCollateral: FakeContract<VBep20Immutable>;
  };

  async function setOraclePrice(vToken: FakeContract<VBep20Immutable>, price: BigNumberish) {
    oracle.getUnderlyingPrice.whenCalledWith(vToken.address).returns(price);
  }

  async function liquidateFixture(): Promise<LiquidateFixture> {
    const accessControl = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
    const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
    const result = await deployDiamond("");
    const unitroller = result.unitroller;
    comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
    const comptrollerLens = await ComptrollerLensFactory.deploy();
    const oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
    accessControl.isAllowedToCall.returns(true);
    await comptroller._setAccessControl(accessControl.address);
    await comptroller._setComptrollerLens(comptrollerLens.address);
    await comptroller._setPriceOracle(oracle.address);

    const vTokenBorrowed = await smock.fake<VBep20Immutable>(
      "contracts/Tokens/VTokens/VBep20Immutable.sol:VBep20Immutable",
    );
    const vTokenCollateral = await smock.fake<VBep20Immutable>(
      "contracts/Tokens/VTokens/VBep20Immutable.sol:VBep20Immutable",
    );

    await comptroller._supportMarket(vTokenBorrowed.address);
    await comptroller._supportMarket(vTokenCollateral.address);
    await comptroller["setLiquidationIncentive(address,uint256)"](vTokenBorrowed.address, convertToUnit("1.1", 18));
    await comptroller["setLiquidationIncentive(address,uint256)"](vTokenCollateral.address, convertToUnit("1.1", 18));

    return { comptroller, comptrollerLens, oracle, vTokenBorrowed, vTokenCollateral };
  }

  async function configure({ comptroller, vTokenCollateral, oracle, vTokenBorrowed }: LiquidateFixture) {
    oracle.getUnderlyingPrice.returns(0);
    for (const vToken of [vTokenBorrowed, vTokenCollateral]) {
      vToken.comptroller.returns(comptroller.address);
      vToken.isVToken.returns(true);
    }

    vTokenCollateral.exchangeRateStored.returns(5e9);
    oracle.getUnderlyingPrice.whenCalledWith(vTokenCollateral.address).returns(collateralPrice);
    oracle.getUnderlyingPrice.whenCalledWith(vTokenBorrowed.address).returns(borrowedPrice);
  }

  beforeEach(async () => {
    const contracts = await loadFixture(liquidateFixture);
    await configure(contracts);
    ({ comptroller, vTokenBorrowed, oracle, vTokenCollateral } = contracts);
  });

  describe("liquidateCalculateAmountSeize", () => {
    it("fails if borrowed asset price is 0", async () => {
      setOraclePrice(vTokenBorrowed, 0);
      const [err, result] = await calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount);
      expect(err).to.equal(ComptrollerErrorReporter.Error.PRICE_ERROR);
      expect(result).to.equal(0);
    });

    it("fails if collateral asset price is 0", async () => {
      setOraclePrice(vTokenCollateral, 0);
      const [err, result] = await calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount);
      expect(err).to.equal(ComptrollerErrorReporter.Error.PRICE_ERROR);
      expect(result).to.equal(0);
    });

    it("fails if the repayAmount causes overflow ", async () => {
      await expect(calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, constants.MaxUint256)).to.be
        .reverted;
    });

    it("fails if the borrowed asset price causes overflow ", async () => {
      setOraclePrice(vTokenBorrowed, constants.MaxUint256);
      await expect(calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount)).to.be.reverted;
    });

    it("reverts if it fails to calculate the exchange rate", async () => {
      vTokenCollateral.exchangeRateStored.reverts("exchangeRateStored: exchangeRateStoredInternal failed");
      ethers.provider.getBlockNumber();
      /// TODO: Somehow the error message does not get propagated into the resulting tx. Smock bug?
      await expect(
        comptroller["liquidateCalculateSeizeTokens(address,address,uint256)"](
          vTokenBorrowed.address,
          vTokenCollateral.address,
          repayAmount,
        ),
      ).to.be.reverted; // revertedWith("exchangeRateStored: exchangeRateStoredInternal failed");
    });

    [
      [1e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 2e18, 1.42e18, 1.3e18, 2.45e18],
      [2.789e18, 5.230480842e18, 771.32e18, 1.3e18, 10002.45e18],
      [7.009232529961056e24, 2.5278726317240445e24, 2.6177112093242585e23, 1179713989619784000, 7.790468414639561e24],
      [rando(0, 1e25), rando(0, 1e25), rando(1, 1e25), rando(1e18, 1.5e18), rando(0, 1e25)],
    ].forEach(testCase => {
      it(`returns the correct value for ${testCase}`, async () => {
        const [exchangeRate, borrowedPrice, collateralPrice, liquidationIncentive, repayAmount] = testCase.map(x =>
          BigInt(x),
        );

        setOraclePrice(vTokenCollateral, collateralPrice);
        setOraclePrice(vTokenBorrowed, borrowedPrice);
        await comptroller["setLiquidationIncentive(address,uint256)"](vTokenCollateral.address, liquidationIncentive);
        vTokenCollateral.exchangeRateStored.returns(exchangeRate);

        const seizeAmount = (repayAmount * liquidationIncentive * borrowedPrice) / collateralPrice;
        const seizeTokens = seizeAmount / exchangeRate;

        const [err, result] = await calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount);
        expect(err).to.equal(ComptrollerErrorReporter.Error.NO_ERROR);
        expect(Number(result)).to.be.approximately(Number(seizeTokens), 1e7);
      });
    });
  });

  describe("seizeTokens precision", () => {
    const LI = 11n * 10n ** 17n;
    const NO_ERROR = ComptrollerErrorReporter.Error.NO_ERROR;

    // Prices and exchange rates read from BSC mainnet at block 123190787
    const MAINNET = {
      vvhUSDT: { price: 1002688421751n, exchangeRate: 10000000000965159570736186032778069n },
      vvhUSDC: { price: 1003156702846n, exchangeRate: 10000000003460803135677889810649835n },
      vvhU: { price: 1002282746888n, exchangeRate: 10000000023650149282789953800701198n },
      vBTC: { price: 85004192215188000000000n, exchangeRate: 203840600755709788911212308n },
      vBNB: { price: 786806980000000000000n, exchangeRate: 249463027147727400224721052n },
      vUSDT: { price: 999675385150102100n, exchangeRate: 265060114206000976459302507n },
    };
    type MainnetMarket = keyof typeof MAINNET;

    function setMarkets(borrowedPrice: bigint, collateralPrice: bigint, exchangeRate: bigint) {
      oracle.getUnderlyingPrice.whenCalledWith(vTokenBorrowed.address).returns(borrowedPrice);
      oracle.getUnderlyingPrice.whenCalledWith(vTokenCollateral.address).returns(collateralPrice);
      vTokenCollateral.exchangeRateStored.returns(exchangeRate);
    }

    async function setCollateralIncentive(liquidationIncentive: bigint) {
      const current = await comptroller.getLiquidationIncentive(vTokenCollateral.address);
      if (!current.eq(liquidationIncentive)) {
        await comptroller["setLiquidationIncentive(address,uint256)"](vTokenCollateral.address, liquidationIncentive);
      }
    }

    async function seizeTokensFor(
      borrowedPrice: bigint,
      collateralPrice: bigint,
      exchangeRate: bigint,
      liquidationIncentive: bigint,
      repayAmount: bigint,
    ): Promise<bigint> {
      setMarkets(borrowedPrice, collateralPrice, exchangeRate);
      await setCollateralIncentive(liquidationIncentive);
      const [err, seizeTokens] = await calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount);
      expect(err).to.equal(NO_ERROR);
      return seizeTokens.toBigInt();
    }

    describe("BSC mainnet inputs", () => {
      const VH = 10n ** 24n;
      const TOKEN = 10n ** 18n;
      const cases: {
        borrowed: MainnetMarket;
        collateral: MainnetMarket;
        repay: bigint;
        expected: bigint;
        truncated: bigint;
      }[] = [
        { borrowed: "vvhUSDT", collateral: "vBTC", repay: 100n * VH, expected: 6365428n, truncated: 0n },
        { borrowed: "vvhUSDT", collateral: "vBNB", repay: 100n * VH, expected: 561932684n, truncated: 500000000n },
        {
          borrowed: "vvhUSDT",
          collateral: "vUSDT",
          repay: 100n * VH,
          expected: 416251015283n,
          truncated: 416200000000n,
        },
        { borrowed: "vvhU", collateral: "vvhUSDT", repay: 100n * VH, expected: 10995549540n, truncated: 10900000000n },
        {
          borrowed: "vvhUSDT",
          collateral: "vvhUSDC",
          repay: 100n * VH,
          expected: 10994865113n,
          truncated: 10900000000n,
        },
        { borrowed: "vvhUSDT", collateral: "vvhU", repay: 100n * VH, expected: 11004452234n, truncated: 11000000000n },
        {
          borrowed: "vUSDT",
          collateral: "vvhUSDT",
          repay: 1000n * TOKEN,
          expected: 109669454608n,
          truncated: 109669454000n,
        },
        { borrowed: "vUSDT", collateral: "vBNB", repay: 1000n * TOKEN, expected: 5602441001n, truncated: 5602441000n },
        { borrowed: "vBNB", collateral: "vBTC", repay: 1000n * TOKEN, expected: 49949351479n, truncated: 49949351000n },
      ];

      cases.forEach(({ borrowed, collateral, repay, expected, truncated }) => {
        it(`${borrowed} debt against ${collateral} collateral`, async () => {
          const { price: borrowedPrice } = MAINNET[borrowed];
          const { price: collateralPrice, exchangeRate } = MAINNET[collateral];

          expect(await seizeTokensFor(borrowedPrice, collateralPrice, exchangeRate, LI, repay)).to.equal(expected);
          expect(exactSeizeTokens(repay, LI, borrowedPrice, collateralPrice, exchangeRate)).to.equal(expected);
          // The previous formula dropped the fraction of the ratio, all of it for vvhUSDT against vBTC
          expect(truncatedSeizeTokens(repay, LI, borrowedPrice, collateralPrice, exchangeRate)).to.equal(truncated);
        });
      });
    });

    describe("does not depend on token decimals", () => {
      const DECIMALS = [6, 8, 18, 24];
      const ONE_DOLLAR = 1_000_000n;
      const BTC_DOLLARS = 85_000_000_000n;
      const UNDERLYING_PER_VTOKEN = 20_000n; // 0.02

      for (const borrowedDecimals of DECIMALS) {
        for (const collateralDecimals of DECIMALS) {
          // 100 tokens * $1 * 1.1 / $85,000 / 0.02 = 0.0647058... vTokens
          it(`$1 debt with ${borrowedDecimals} decimals against $85,000 collateral with ${collateralDecimals} decimals`, async () => {
            const seizeTokens = await seizeTokensFor(
              priceMantissa(ONE_DOLLAR, borrowedDecimals),
              priceMantissa(BTC_DOLLARS, collateralDecimals),
              exchangeRateMantissa(UNDERLYING_PER_VTOKEN, collateralDecimals),
              LI,
              100n * 10n ** BigInt(borrowedDecimals),
            );
            expect(seizeTokens).to.equal(6_470_588n);
          });

          // 100 tokens * $85,000 * 1.1 / $1 / 0.02 = 467,500,000 vTokens
          it(`$85,000 debt with ${borrowedDecimals} decimals against $1 collateral with ${collateralDecimals} decimals`, async () => {
            const seizeTokens = await seizeTokensFor(
              priceMantissa(BTC_DOLLARS, borrowedDecimals),
              priceMantissa(ONE_DOLLAR, collateralDecimals),
              exchangeRateMantissa(UNDERLYING_PER_VTOKEN, collateralDecimals),
              LI,
              100n * 10n ** BigInt(borrowedDecimals),
            );
            expect(seizeTokens).to.equal(467_500_000n * 10n ** 8n);
          });
        }
      }
    });

    describe("rounding", () => {
      // Equal prices, incentive 1 and 1 raw vToken = 3 raw underlying, so seizeTokens = floor(repay / 3)
      const cases: [bigint, bigint][] = [
        [2n, 0n],
        [3n, 1n],
        [5n, 1n],
        [6n, 2n],
        [3n * EXP_SCALE + 2n, EXP_SCALE],
      ];
      cases.forEach(([repay, expected]) => {
        it(`rounds ${repay} / 3 down to ${expected}`, async () => {
          expect(await seizeTokensFor(EXP_SCALE, EXP_SCALE, 3n * EXP_SCALE, EXP_SCALE, repay)).to.equal(expected);
        });
      });

      it("seizes one vToken from the smallest repay worth one vToken, and nothing below it", async () => {
        // One raw vBTC is worth ~$1.7e-5, so ~1.6e19 raw vhUSDT covers it once the incentive is applied
        const borrowedPrice = MAINNET.vvhUSDT.price;
        const { price: collateralPrice, exchangeRate } = MAINNET.vBTC;
        const perRepayUnit = LI * borrowedPrice;
        const perSeizedToken = collateralPrice * exchangeRate;
        const minRepay = (perSeizedToken + perRepayUnit - 1n) / perRepayUnit;

        expect(await seizeTokensFor(borrowedPrice, collateralPrice, exchangeRate, LI, minRepay)).to.equal(1n);
        expect(await seizeTokensFor(borrowedPrice, collateralPrice, exchangeRate, LI, minRepay - 1n)).to.equal(0n);
      });
    });

    describe("matches the exact formula on seeded random inputs", () => {
      const next = xorshift64(713n);
      const pick = <T>(values: T[]): T => values[Number(next() % BigInt(values.length))];
      // Between 1 and 9 * 10^maxExponent, spread across orders of magnitude
      const magnitude = (maxExponent: number): bigint =>
        (1n + (next() % 9n)) * 10n ** (next() % BigInt(maxExponent + 1));

      for (let i = 0; i < 40; i++) {
        const borrowedDecimals = pick([6, 8, 18, 24]);
        const collateralDecimals = pick([6, 8, 18, 24]);
        const borrowedPrice = priceMantissa(magnitude(11), borrowedDecimals); // $0.000001 to $900,000
        const collateralPrice = priceMantissa(magnitude(11), collateralDecimals);
        const exchangeRate = exchangeRateMantissa(magnitude(8), collateralDecimals); // 1e-6 to 900 underlying per vToken
        const liquidationIncentive = EXP_SCALE + (next() % (3n * 10n ** 17n));
        const repayAmount = magnitude(borrowedDecimals + 9); // 1 raw unit to 9e9 tokens

        it(`case ${i}: ${borrowedDecimals}-decimal debt against ${collateralDecimals}-decimal collateral`, async () => {
          const numerator = repayAmount * liquidationIncentive * borrowedPrice;
          const denominator = collateralPrice * exchangeRate;
          const seizeTokens = await seizeTokensFor(
            borrowedPrice,
            collateralPrice,
            exchangeRate,
            liquidationIncentive,
            repayAmount,
          );

          expect(seizeTokens).to.equal(numerator / denominator);
          expect(seizeTokens * denominator <= numerator).to.equal(true);
          expect((seizeTokens + 1n) * denominator > numerator).to.equal(true);
        });
      }
    });

    describe("reverts", () => {
      it("reverts once repay * incentive * borrowed price overflows, and not one unit below", async () => {
        const borrowedPrice = MAINNET.vvhUSDT.price;
        const { price: collateralPrice, exchangeRate } = MAINNET.vBTC;
        const maxRepay = MAX_UINT256 / (LI * borrowedPrice);

        expect(await seizeTokensFor(borrowedPrice, collateralPrice, exchangeRate, LI, maxRepay)).to.equal(
          exactSeizeTokens(maxRepay, LI, borrowedPrice, collateralPrice, exchangeRate),
        );
        await expect(
          calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, maxRepay + 1n),
        ).to.be.revertedWithPanic(PANIC_ARITHMETIC_OVERFLOW);
      });

      it("reverts when collateral price * exchange rate overflows", async () => {
        setMarkets(EXP_SCALE, 2n ** 128n, 2n ** 128n);
        await expect(
          calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, EXP_SCALE),
        ).to.be.revertedWithPanic(PANIC_ARITHMETIC_OVERFLOW);
      });

      it("reverts when the collateral exchange rate is zero", async () => {
        setMarkets(EXP_SCALE, EXP_SCALE, 0n);
        await expect(calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, EXP_SCALE)).to.be.revertedWith(
          "divide by zero",
        );
      });

      it("returns the exact value when collateral price * exchange rate is below 1e18", async () => {
        // The previous formula truncated this denominator to 0 and reverted with "divide by zero"
        const exchangeRate = 5n * 10n ** 17n;
        expect(await seizeTokensFor(EXP_SCALE, 1n, exchangeRate, LI, 1n)).to.equal(
          exactSeizeTokens(1n, LI, EXP_SCALE, 1n, exchangeRate),
        );
      });
    });

    describe("entry points", () => {
      const repayAmount = 100n * 10n ** 24n;
      const borrowedPrice = MAINNET.vvhUSDT.price;
      const { price: collateralPrice, exchangeRate } = MAINNET.vBTC;

      it("applies the core pool incentive for a borrower in the core pool", async () => {
        const [, borrower] = await ethers.getSigners();
        setMarkets(borrowedPrice, collateralPrice, exchangeRate);

        const [err, seizeTokens] = await comptroller["liquidateCalculateSeizeTokens(address,address,address,uint256)"](
          borrower.address,
          vTokenBorrowed.address,
          vTokenCollateral.address,
          repayAmount,
        );
        expect(err).to.equal(NO_ERROR);
        expect(seizeTokens).to.equal(exactSeizeTokens(repayAmount, LI, borrowedPrice, collateralPrice, exchangeRate));
      });

      it("applies the incentive of the borrower's pool", async () => {
        const [, borrower] = await ethers.getSigners();
        const poolIncentive = 105n * 10n ** 16n;
        await comptroller.createPool("e-mode");
        const poolId = await comptroller.lastPoolId();
        await comptroller.addPoolMarkets([poolId], [vTokenCollateral.address]);
        await comptroller["setLiquidationIncentive(uint96,address,uint256)"](
          poolId,
          vTokenCollateral.address,
          poolIncentive,
        );
        await comptroller.connect(borrower).enterPool(poolId);
        setMarkets(borrowedPrice, collateralPrice, exchangeRate);

        const [err, seizeTokens] = await comptroller["liquidateCalculateSeizeTokens(address,address,address,uint256)"](
          borrower.address,
          vTokenBorrowed.address,
          vTokenCollateral.address,
          repayAmount,
        );
        expect(err).to.equal(NO_ERROR);
        expect(seizeTokens).to.equal(
          exactSeizeTokens(repayAmount, poolIncentive, borrowedPrice, collateralPrice, exchangeRate),
        );
      });

      it("prices VAI at $1 in the VAI overload", async () => {
        const vaiRepayAmount = 100n * 10n ** 18n;
        const { price: vhPrice, exchangeRate: vhExchangeRate } = MAINNET.vvhUSDT;
        setMarkets(borrowedPrice, vhPrice, vhExchangeRate);

        const [err, seizeTokens] = await comptroller.liquidateVAICalculateSeizeTokens(
          vTokenCollateral.address,
          vaiRepayAmount,
        );
        expect(err).to.equal(NO_ERROR);
        expect(seizeTokens).to.equal(exactSeizeTokens(vaiRepayAmount, LI, EXP_SCALE, vhPrice, vhExchangeRate));
      });
    });
  });
});
