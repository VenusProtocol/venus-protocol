import { FakeContract, MockContract, MockContractFactory, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { InterestRateModel, StableRateModel, StableRateModel__factory, VBep20Harness } from "../../../typechain";
import { vTokenTestFixture } from "../util/TokenTestHelpers";

let stableRateModelFactory: MockContractFactory<StableRateModel__factory>;
let stableRateModel: MockContract<StableRateModel>;
let vToken: MockContract<VBep20Harness>;
let interestRateModel: FakeContract<InterestRateModel>;

const fixture = async (): Promise<void> => {
  const [owner] = await ethers.getSigners();
  stableRateModelFactory = await smock.mock<StableRateModel__factory>(
    "contracts/InterestRateModels/StableRateModel.sol:StableRateModel",
  );
  stableRateModel = await stableRateModelFactory.deploy(
    convertToUnit(1, 10),
    convertToUnit(1, 12),
    convertToUnit(4, 17),
    owner.address,
  );
  await stableRateModel.deployed();

  const contracts = await loadFixture(vTokenTestFixture);
  ({ vToken, interestRateModel } = contracts);
};

describe("StableRateModel: Tests", function () {
  /**
   * Deploying required contracts along with the poolRegistry.
   */

  before(async function () {
    await loadFixture(fixture);
  });

  it("Update the stable rate model", async function () {
    let baseRate = await stableRateModel.baseRatePerBlock();
    let premiumRate = await stableRateModel.stableRatePremium();
    let optimalRate = await stableRateModel.optimalStableLoanRatio();

    expect(baseRate).equals(4756);
    expect(premiumRate).equals(convertToUnit(1, 12));
    expect(optimalRate).equals(convertToUnit(4, 17));

    await stableRateModel.updateStableRateModel(convertToUnit(1, 12), convertToUnit(1, 12), convertToUnit(4, 17));

    baseRate = await stableRateModel.baseRatePerBlock();
    premiumRate = await stableRateModel.stableRatePremium();
    optimalRate = await stableRateModel.optimalStableLoanRatio();

    expect(baseRate).equals(475646);
    expect(premiumRate).equals(convertToUnit(1, 12));
    expect(optimalRate).equals(convertToUnit(4, 17));
  });

  it("Return 0 as stableLoanRatio for borrows equal to zero", async function () {
    const loanRatio = await stableRateModel.stableLoanRatio(0, 0);
    expect(loanRatio).equals(0);
  });

  it("Stable loan Rate", async function () {
    const loanRatio = await stableRateModel.stableLoanRatio(convertToUnit(8, 20), convertToUnit(80, 20));
    expect(loanRatio).equals(convertToUnit(10, 16));
  });

  it("Calculate stable borrow rate when stable loan ratio below optimal ratio", async function () {
    const rate = await stableRateModel.getBorrowRate(convertToUnit(1, 20), convertToUnit(4, 20), convertToUnit(5, 12));
    expect(rate).to.be.closeTo(Number(convertToUnit(5, 12)), Number(convertToUnit(1, 10)));
  });

  it("Calculate stable borrow rate when stable loan ratio above optimal ratio", async function () {
    const rate = await stableRateModel.getBorrowRate(
      convertToUnit(2.5, 20),
      convertToUnit(4, 20),
      convertToUnit(5, 12),
    );
    expect(rate).to.be.closeTo(Number(convertToUnit(52, 11)), Number(convertToUnit(2, 11)));
  });

  it("Return 0 as TotalBorrows for supply equal to zero", async function () {
    const sr = await vToken.supplyRatePerBlock();
    expect(sr).equals(0);
  });

  it("Calculate Supply rate of the market", async function () {
    interestRateModel.getBorrowRate.returns(convertToUnit(3, 17));
    await vToken.harnessSetTotalBorrows(convertToUnit(2, 20));
    await vToken.harnessSetReserveFactorFresh(convertToUnit(1, 17));
    await vToken.harnessSetAvgStableBorrowRate(convertToUnit(4, 17));
    await vToken.harnessStableBorrows(convertToUnit(2, 18));

    expect((await vToken.supplyRatePerBlock()).toString()).to.equal("270900000000000000");
  });
});
