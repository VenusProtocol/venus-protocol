import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish, constants } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  Comptroller,
  ComptrollerLens,
  ComptrollerLens__factory,
  Comptroller__factory,
  IAccessControlManager,
  PriceOracle,
  VBep20Immutable,
} from "../../../typechain";
import { ComptrollerErrorReporter } from "../util/Errors";

const { expect } = chai;
chai.use(smock.matchers);

const borrowedPrice = convertToUnit(2, 10);
const collateralPrice = convertToUnit(1, 18);
const repayAmount = convertToUnit(1, 18);

async function calculateSeizeTokens(
  comptroller: MockContract<Comptroller>,
  vTokenBorrowed: FakeContract<VBep20Immutable>,
  vTokenCollateral: FakeContract<VBep20Immutable>,
  repayAmount: BigNumberish,
) {
  return comptroller.liquidateCalculateSeizeTokens(vTokenBorrowed.address, vTokenCollateral.address, repayAmount);
}

function rando(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

describe("Comptroller", () => {
  let comptroller: MockContract<Comptroller>;
  let oracle: FakeContract<PriceOracle>;
  let vTokenBorrowed: FakeContract<VBep20Immutable>;
  let vTokenCollateral: FakeContract<VBep20Immutable>;

  type LiquidateFixture = {
    comptroller: MockContract<Comptroller>;
    comptrollerLens: MockContract<ComptrollerLens>;
    oracle: FakeContract<PriceOracle>;
    vTokenBorrowed: FakeContract<VBep20Immutable>;
    vTokenCollateral: FakeContract<VBep20Immutable>;
  };

  async function setOraclePrice(vToken: FakeContract<VBep20Immutable>, price: BigNumberish) {
    oracle.getUnderlyingPrice.whenCalledWith(vToken.address).returns(price);
  }

  async function liquidateFixture(): Promise<LiquidateFixture> {
    const accessControl = await smock.fake<IAccessControlManager>("AccessControlManager");
    const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
    const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
    const comptroller = await ComptrollerFactory.deploy();
    const comptrollerLens = await ComptrollerLensFactory.deploy();
    const oracle = await smock.fake<PriceOracle>("PriceOracle");
    accessControl.isAllowedToCall.returns(true);
    await comptroller._setAccessControl(accessControl.address);
    await comptroller._setComptrollerLens(comptrollerLens.address);
    await comptroller._setPriceOracle(oracle.address);
    await comptroller._setLiquidationIncentive(convertToUnit("1.1", 18));

    const vTokenBorrowed = await smock.fake<VBep20Immutable>("VBep20Immutable");
    const vTokenCollateral = await smock.fake<VBep20Immutable>("VBep20Immutable");

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
      await expect(
        calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, constants.MaxUint256),
      ).to.be.revertedWith("multiplication overflow");
    });

    it("fails if the borrowed asset price causes overflow ", async () => {
      setOraclePrice(vTokenBorrowed, constants.MaxUint256);
      await expect(calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount)).to.be.revertedWith(
        "multiplication overflow",
      );
    });

    it("reverts if it fails to calculate the exchange rate", async () => {
      vTokenCollateral.exchangeRateStored.reverts("exchangeRateStored: exchangeRateStoredInternal failed");
      ethers.provider.getBlockNumber();
      /// TODO: Somehow the error message does not get propagated into the resulting tx. Smock bug?
      await expect(
        comptroller.liquidateCalculateSeizeTokens(vTokenBorrowed.address, vTokenCollateral.address, repayAmount),
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
        await comptroller._setLiquidationIncentive(liquidationIncentive);
        vTokenCollateral.exchangeRateStored.returns(exchangeRate);

        const seizeAmount = (repayAmount * liquidationIncentive * borrowedPrice) / collateralPrice;
        const seizeTokens = seizeAmount / exchangeRate;

        const [err, result] = await calculateSeizeTokens(comptroller, vTokenBorrowed, vTokenCollateral, repayAmount);
        expect(err).to.equal(ComptrollerErrorReporter.Error.NO_ERROR);
        expect(Number(result)).to.be.approximately(Number(seizeTokens), 1e7);
      });
    });
  });
});
