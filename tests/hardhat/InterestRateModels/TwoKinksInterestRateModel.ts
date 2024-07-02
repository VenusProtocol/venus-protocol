import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import BigNumber from "bignumber.js";
import chai from "chai";
import { ethers } from "hardhat";

import { TwoKinksInterestRateModel } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const convertToUnit = (amount: string | number, decimals: number) => {
  return new BigNumber(amount).times(new BigNumber(10).pow(decimals)).toString();
};

let twoKinksInterestRateModel: TwoKinksInterestRateModel;

const baseRatePerYear = convertToUnit("0.2", 16);
const multiplierPerYear = convertToUnit("0.225", 18);
const kink1 = convertToUnit("0.2", 18);
const multiplier2PerYear = convertToUnit("0.625", 18);
const baseRate2PerYear = convertToUnit("0.6", 16);
const kink2 = convertToUnit("0.8", 18);
const jumpMultiplierPerYear = convertToUnit("6.8", 18);

const cash = convertToUnit("10", 19);
const borrows = convertToUnit("4", 19);
const reserves = convertToUnit("2", 19);
const expScale = convertToUnit("1", 18);

describe(`Two Kinks Interest Rate Model Tests`, async () => {
  const fixture = async () => {
    const TwoKinksInterestRateModelFactory = await ethers.getContractFactory("TwoKinksInterestRateModel");

    twoKinksInterestRateModel = await TwoKinksInterestRateModelFactory.deploy(
      baseRatePerYear,
      multiplierPerYear,
      kink1,
      multiplier2PerYear,
      baseRate2PerYear,
      kink2,
      jumpMultiplierPerYear,
    );
    await twoKinksInterestRateModel.deployed();
  };

  before(async () => {
    await loadFixture(fixture);
  });

  it("Utilization rate: borrows is zero", async () => {
    expect(await twoKinksInterestRateModel.utilizationRate(cash, 0, reserves)).equal(0);
  });

  it("Utilization rate", async () => {
    const utilizationRate = new BigNumber(Number(borrows))
      .multipliedBy(expScale)
      .dividedBy(Number(cash) + Number(borrows) - Number(reserves))
      .toFixed(0);

    expect(await twoKinksInterestRateModel.utilizationRate(cash, borrows, reserves)).equal(utilizationRate);
  });

  it("Borrow Rate: below kink1 utilization", async () => {
    const cash = convertToUnit("12", 19);
    const borrows = convertToUnit("1", 19);
    const reserves = convertToUnit("2", 19);

    const multiplierPerBlock = (await twoKinksInterestRateModel.multiplierPerBlock()).toString();
    const baseRatePerBlock = (await twoKinksInterestRateModel.baseRatePerBlock()).toString();
    const utilizationRate = (await twoKinksInterestRateModel.utilizationRate(cash, borrows, reserves)).toString();

    expect(new BigNumber(utilizationRate).toNumber()).to.be.lt(new BigNumber(kink1).toNumber());

    const value = new BigNumber(utilizationRate).multipliedBy(multiplierPerBlock).dividedBy(expScale).toFixed(0);

    expect(await twoKinksInterestRateModel.getBorrowRate(cash, borrows, reserves)).equal(
      Number(value) + Number(baseRatePerBlock),
    );
  });

  it("Borrow Rate: above kink1 and below kink2 utilization", async () => {
    const cash = convertToUnit("12", 19);
    const borrows = convertToUnit("3", 19);
    const reserves = convertToUnit("1", 19);

    const multiplierPerBlock = (await twoKinksInterestRateModel.multiplierPerBlock()).toString();
    const multiplier2PerBlock = (await twoKinksInterestRateModel.multiplier2PerBlock()).toString();
    const baseRatePerBlock = (await twoKinksInterestRateModel.baseRatePerBlock()).toString();
    const baseRate2PerBlock = (await twoKinksInterestRateModel.baseRate2PerBlock()).toString();
    const utilizationRate = (await twoKinksInterestRateModel.utilizationRate(cash, borrows, reserves)).toString();

    expect(new BigNumber(utilizationRate).toNumber()).to.be.gt(new BigNumber(kink1).toNumber());
    expect(new BigNumber(utilizationRate).toNumber()).to.be.lt(new BigNumber(kink2).toNumber());

    const rate1 = new BigNumber(kink1)
      .multipliedBy(multiplierPerBlock)
      .dividedBy(expScale)
      .plus(baseRatePerBlock)
      .toFixed(0);
    const rate2 = new BigNumber(new BigNumber(utilizationRate).minus(kink1))
      .multipliedBy(multiplier2PerBlock)
      .dividedBy(expScale)
      .plus(baseRate2PerBlock)
      .toFixed(0);

    expect(await twoKinksInterestRateModel.getBorrowRate(cash, borrows, reserves)).closeTo(
      Number(rate1) + Number(rate2),
      1,
    );
  });

  it("Borrow Rate: above kink2 utilization", async () => {
    const cash = convertToUnit("12", 19);
    const borrows = convertToUnit("80", 19);
    const reserves = convertToUnit("1", 19);

    const multiplierPerBlock = (await twoKinksInterestRateModel.multiplierPerBlock()).toString();
    const multiplier2PerBlock = (await twoKinksInterestRateModel.multiplier2PerBlock()).toString();
    const baseRatePerBlock = (await twoKinksInterestRateModel.baseRatePerBlock()).toString();
    const baseRate2PerBlock = (await twoKinksInterestRateModel.baseRate2PerBlock()).toString();
    const jumpMultiplierPerBlock = (await twoKinksInterestRateModel.jumpMultiplierPerBlock()).toString();
    const utilizationRate = (await twoKinksInterestRateModel.utilizationRate(cash, borrows, reserves)).toString();

    expect(new BigNumber(utilizationRate).toNumber()).to.be.gt(new BigNumber(kink2).toNumber());

    const rate1 = new BigNumber(kink1)
      .multipliedBy(multiplierPerBlock)
      .dividedBy(expScale)
      .plus(baseRatePerBlock)
      .toFixed(0);
    const rate2 = new BigNumber(new BigNumber(kink2).minus(kink1))
      .multipliedBy(multiplier2PerBlock)
      .dividedBy(expScale)
      .plus(baseRate2PerBlock)
      .toFixed(0);
    const rate3 = new BigNumber(new BigNumber(utilizationRate).minus(kink2))
      .multipliedBy(jumpMultiplierPerBlock)
      .dividedBy(expScale)
      .toFixed(0);

    expect(await twoKinksInterestRateModel.getBorrowRate(cash, borrows, reserves)).closeTo(
      new BigNumber(rate1).plus(rate2).plus(rate3).toNumber(),
      1,
    );
  });

  it("Borrow Rate: above kink2 utilization and negative multipliers", async () => {
    const multiplierPerYear = convertToUnit(-0.225, 18);
    const multiplier2PerYear = convertToUnit(-0.625, 18);
    const jumpMultiplierPerYear = convertToUnit(-6.8, 18);

    const TwoKinksInterestRateModelFactory = await ethers.getContractFactory("TwoKinksInterestRateModel");

    twoKinksInterestRateModel = await TwoKinksInterestRateModelFactory.deploy(
      baseRatePerYear,
      multiplierPerYear,
      kink1,
      multiplier2PerYear,
      baseRate2PerYear,
      kink2,
      jumpMultiplierPerYear,
    );
    await twoKinksInterestRateModel.deployed();

    const cash = convertToUnit("12", 19);
    const borrows = convertToUnit("45", 19);
    const reserves = convertToUnit("1", 19);

    const multiplierPerBlock = (await twoKinksInterestRateModel.multiplierPerBlock()).toString();
    const multiplier2PerBlock = (await twoKinksInterestRateModel.multiplier2PerBlock()).toString();
    const baseRatePerBlock = (await twoKinksInterestRateModel.baseRatePerBlock()).toString();
    const baseRate2PerBlock = (await twoKinksInterestRateModel.baseRate2PerBlock()).toString();
    const jumpMultiplierPerBlock = (await twoKinksInterestRateModel.jumpMultiplierPerBlock()).toString();
    const utilizationRate = (await twoKinksInterestRateModel.utilizationRate(cash, borrows, reserves)).toString();

    expect(new BigNumber(utilizationRate).toNumber()).to.be.gt(new BigNumber(kink2).toNumber());

    const rate1 = new BigNumber(kink1)
      .multipliedBy(multiplierPerBlock)
      .dividedBy(expScale)
      .plus(baseRatePerBlock)
      .toFixed(0);
    const rate2 = new BigNumber(new BigNumber(kink2).minus(kink1))
      .multipliedBy(multiplier2PerBlock)
      .dividedBy(expScale)
      .plus(baseRate2PerBlock)
      .toFixed(0);
    const rate3 = new BigNumber(new BigNumber(utilizationRate).minus(kink2))
      .multipliedBy(jumpMultiplierPerBlock)
      .dividedBy(expScale)
      .toFixed(0);

    let finalRate = new BigNumber(rate1).plus(rate2).plus(rate3).toNumber();
    if (finalRate < 0) {
      finalRate = 0;
    }

    expect(await twoKinksInterestRateModel.getBorrowRate(cash, borrows, reserves)).equal(finalRate);
  });

  it("Supply Rate", async () => {
    const reserveMantissa = convertToUnit("1", 17);
    const oneMinusReserveFactor = Number(expScale) - Number(reserveMantissa);
    const borrowRate = (await twoKinksInterestRateModel.getBorrowRate(cash, borrows, reserves)).toString();
    const rateToPool = new BigNumber(borrowRate).multipliedBy(oneMinusReserveFactor).dividedBy(expScale).toFixed(0);
    const rate = new BigNumber(borrows)
      .multipliedBy(expScale)
      .dividedBy(Number(cash) + Number(borrows) - Number(reserves));
    const supplyRate = new BigNumber(rateToPool).multipliedBy(rate).dividedBy(expScale).toFixed(0);

    expect(await twoKinksInterestRateModel.getSupplyRate(cash, borrows, reserves, reserveMantissa)).equal(supplyRate);
  });
});
