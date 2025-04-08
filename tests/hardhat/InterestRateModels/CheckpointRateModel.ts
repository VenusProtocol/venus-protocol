import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { CheckpointRateModel, IRateModelWithUtilization } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("CheckpointRateModel tests", () => {
  let checkpointRateModel: CheckpointRateModel;
  let oldRateModel: FakeContract<IRateModelWithUtilization>;
  let newRateModel: FakeContract<IRateModelWithUtilization>;
  let checkpointTimestamp: number;
  const cash = parseUnits("10", 18);
  const borrows = parseUnits("4", 18);
  const reserves = parseUnits("2", 18);
  const reserveFactorMantissa = parseUnits("0.1", 18);

  const fixture = async () => {
    const interestRateModelFactory = await ethers.getContractFactory("WhitePaperInterestRateModel");
    oldRateModel = await smock.fake<IRateModelWithUtilization>(interestRateModelFactory.interface);
    newRateModel = await smock.fake<IRateModelWithUtilization>(interestRateModelFactory.interface);

    const checkpointRateModelFactory = await ethers.getContractFactory("CheckpointRateModel");
    checkpointTimestamp = (await time.latest()) + 100; // 100 seconds in the future
    checkpointRateModel = await checkpointRateModelFactory.deploy(
      oldRateModel.address,
      newRateModel.address,
      checkpointTimestamp,
    );
    await checkpointRateModel.deployed();
  };

  beforeEach(async () => {
    await loadFixture(fixture);
  });

  it("should revert if oldRateModel address is zero", async () => {
    const checkpointRateModelFactory = await ethers.getContractFactory("CheckpointRateModel");
    await expect(
      checkpointRateModelFactory.deploy(ethers.constants.AddressZero, newRateModel.address, checkpointTimestamp),
    ).to.be.revertedWithCustomError(checkpointRateModelFactory, "ZeroAddressNotAllowed");
  });

  it("should revert if newRateModel address is zero", async () => {
    const checkpointRateModelFactory = await ethers.getContractFactory("CheckpointRateModel");
    await expect(
      checkpointRateModelFactory.deploy(oldRateModel.address, ethers.constants.AddressZero, checkpointTimestamp),
    ).to.be.revertedWithCustomError(checkpointRateModelFactory, "ZeroAddressNotAllowed");
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

  it("should return the correct current rate model", async () => {
    expect(await checkpointRateModel.currentRateModel()).to.equal(oldRateModel.address);

    await time.increaseTo(checkpointTimestamp);

    expect(await checkpointRateModel.currentRateModel()).to.equal(newRateModel.address);
  });
});
