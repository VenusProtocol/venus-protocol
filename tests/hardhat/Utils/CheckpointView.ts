import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { CheckpointView, WhitePaperInterestRateModel } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("CheckpointView tests (using interest rate models as data sources)", () => {
  let checkpointView: CheckpointView;
  let checkpointRateModel: WhitePaperInterestRateModel;
  let oldRateModel: FakeContract<WhitePaperInterestRateModel>;
  let newRateModel: FakeContract<WhitePaperInterestRateModel>;
  let checkpointTimestamp: number;
  const cash = parseUnits("10", 18);
  const borrows = parseUnits("4", 18);
  const reserves = parseUnits("2", 18);
  const reserveFactorMantissa = parseUnits("0.1", 18);

  const fixture = async () => {
    const interestRateModelFactory = await ethers.getContractFactory("WhitePaperInterestRateModel");
    oldRateModel = await smock.fake<WhitePaperInterestRateModel>(interestRateModelFactory.interface);
    newRateModel = await smock.fake<WhitePaperInterestRateModel>(interestRateModelFactory.interface);

    const checkpointViewFactory = await ethers.getContractFactory("CheckpointView");
    checkpointTimestamp = (await time.latest()) + 100; // 100 seconds in the future
    checkpointView = await checkpointViewFactory.deploy(
      oldRateModel.address,
      newRateModel.address,
      checkpointTimestamp,
    );
    await checkpointView.deployed();
    checkpointRateModel = await ethers.getContractAt("WhitePaperInterestRateModel", checkpointView.address);
  };

  beforeEach(async () => {
    await loadFixture(fixture);
  });

  it("should revert if dataSource1 address is zero", async () => {
    const checkpointViewFactory = await ethers.getContractFactory("CheckpointView");
    await expect(
      checkpointViewFactory.deploy(ethers.constants.AddressZero, newRateModel.address, checkpointTimestamp),
    ).to.be.revertedWithCustomError(checkpointViewFactory, "ZeroAddressNotAllowed");
  });

  it("should revert if dataSource2 address is zero", async () => {
    const checkpointViewFactory = await ethers.getContractFactory("CheckpointView");
    await expect(
      checkpointViewFactory.deploy(oldRateModel.address, ethers.constants.AddressZero, checkpointTimestamp),
    ).to.be.revertedWithCustomError(checkpointViewFactory, "ZeroAddressNotAllowed");
  });

  it("should use old rate model before checkpoint", async () => {
    await time.increaseTo(checkpointTimestamp - 1);

    oldRateModel.getBorrowRate.returns(100);
    oldRateModel.getSupplyRate.returns(50);
    oldRateModel.utilizationRate.returns(1234);

    expect(await checkpointRateModel.getBorrowRate(cash, borrows, reserves)).to.equal(100);
    expect(await checkpointRateModel.getSupplyRate(cash, borrows, reserves, reserveFactorMantissa)).to.equal(50);
    expect(await checkpointRateModel.utilizationRate(cash, borrows, reserves)).to.equal(1234);
  });

  it("should use new rate model after checkpoint", async () => {
    await time.increaseTo(checkpointTimestamp);

    newRateModel.getBorrowRate.returns(200);
    newRateModel.getSupplyRate.returns(100);
    newRateModel.utilizationRate.returns(4321);

    expect(await checkpointRateModel.getBorrowRate(cash, borrows, reserves)).to.equal(200);
    expect(await checkpointRateModel.getSupplyRate(cash, borrows, reserves, reserveFactorMantissa)).to.equal(100);
    expect(await checkpointRateModel.utilizationRate(cash, borrows, reserves)).to.equal(4321);
  });

  it("should return the correct current data source", async () => {
    expect(await checkpointView.currentDataSource()).to.equal(oldRateModel.address);
    await time.increaseTo(checkpointTimestamp);
    expect(await checkpointView.currentDataSource()).to.equal(newRateModel.address);
  });
});
