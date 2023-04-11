import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { InterestRateModel, StableRateModel, VBep20Harness } from "../../../typechain";
import { VTokenTestFixture, vTokenTestFixture } from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const borrowAmount = convertToUnit("1000", 18);

async function preBorrow(
  contracts: VTokenTestFixture,
  borrower: Signer,
  borrowAmount: BigNumberish,
  stableRateMantissa: BigNumberish = 0,
) {
  const { comptroller, interestRateModel, underlying, vToken, stableInterestRateModel } = contracts;
  comptroller.borrowAllowed.reset();

  interestRateModel.getBorrowRate.reset();
  stableInterestRateModel.getBorrowRate.returns(stableRateMantissa);

  const borrowerAddress = await borrower.getAddress();
  await underlying.harnessSetBalance(vToken.address, borrowAmount);
  await vToken.harnessSetFailTransferToAddress(borrowerAddress, false);
  await vToken.harnessSetAccountBorrows(borrowerAddress, 0, 0);
  await vToken.harnessSetTotalBorrows(0);
}

async function borrowStable(vToken: MockContract<VBep20Harness>, borrower: Signer, borrowAmount: BigNumberish) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(borrower).borrowStable(borrowAmount);
}

describe("VToken", function () {
  let contracts: VTokenTestFixture;
  let vToken: MockContract<VBep20Harness>;
  let interestRateModel: FakeContract<InterestRateModel>;
  let stableInterestRateModel: FakeContract<StableRateModel>;
  let _root: Signer;
  let borrower: Signer;

  beforeEach(async () => {
    [_root, borrower] = await ethers.getSigners();
    contracts = await loadFixture(vTokenTestFixture);
    ({ vToken, interestRateModel, stableInterestRateModel } = contracts);
  });

  describe("Rebalance Stable rate", () => {
    it("Revert on rebalanceUtilizationRateThreshold not set", async () => {
      await expect(vToken.validateRebalanceStableBorrowRate()).to.be.revertedWith(
        "vToken: rebalanceUtilizationRateThreshold is not set.",
      );
    });

    it("Revert on rebalanceRateFractionThreshold not set", async () => {
      await vToken.setRebalanceUtilizationRateThreshold(convertToUnit(70, 18));
      await expect(vToken.validateRebalanceStableBorrowRate()).to.be.revertedWith(
        "vToken: rebalanceRateFractionThreshold is not set.",
      );
    });

    it("Revert on low utilization rate", async () => {
      await vToken.setRebalanceUtilizationRateThreshold(convertToUnit(70, 17));
      await vToken.setRebalanceRateFractionThreshold(convertToUnit(50, 17));
      await expect(vToken.validateRebalanceStableBorrowRate()).to.be.revertedWith(
        "vToken: low utilization rate for rebalacing.",
      );
    });

    it("Revert on average borrow rate higher than variable rate threshold", async () => {
      await vToken.setRebalanceUtilizationRateThreshold(convertToUnit(7, 17));
      await vToken.setRebalanceRateFractionThreshold(convertToUnit(50, 17));
      await preBorrow(contracts, borrower, borrowAmount);
      await borrowStable(vToken, borrower, convertToUnit(900, 18));
      await expect(vToken.validateRebalanceStableBorrowRate()).to.be.revertedWith(
        "vToken: average borrow rate higher than variable rate threshold.",
      );
    });

    it("Satisfy both conditions", async () => {
      await vToken.setRebalanceUtilizationRateThreshold(convertToUnit(7, 17));
      await vToken.setRebalanceRateFractionThreshold(convertToUnit(50, 17));
      await preBorrow(contracts, borrower, borrowAmount);
      await borrowStable(vToken, borrower, convertToUnit(900, 18));
      await interestRateModel.getBorrowRate.returns(convertToUnit(5, 8));
      expect(await vToken.validateRebalanceStableBorrowRate()).equal(true);
    });

    it("Rebalacing the stable rate for a user", async () => {
      await vToken.setRebalanceUtilizationRateThreshold(convertToUnit(7, 17));
      await vToken.setRebalanceRateFractionThreshold(convertToUnit(50, 17));
      await preBorrow(contracts, borrower, borrowAmount, convertToUnit(5, 6));
      await borrowStable(vToken, borrower, convertToUnit(900, 18));

      let accountBorrows = await vToken.harnessAccountStableBorrows(borrower.getAddress());
      expect(accountBorrows.stableRateMantissa).to.equal(convertToUnit(5, 6));

      interestRateModel.getBorrowRate.returns(convertToUnit(5, 8));
      stableInterestRateModel.getBorrowRate.returns(convertToUnit(8, 8));
      await vToken.rebalanceStableBorrowRate(borrower.getAddress());

      accountBorrows = await vToken.harnessAccountStableBorrows(borrower.getAddress());
      expect(accountBorrows.stableRateMantissa).to.equal(convertToUnit(8, 8));
    });
  });
});
