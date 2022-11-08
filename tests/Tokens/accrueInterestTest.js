const { bnbMantissa, bnbUnsigned } = require("../Utils/BSC");
const { makeVToken, setBorrowRate } = require("../Utils/Venus");

const blockNumber = 2e7;
const borrowIndex = 1e18;
const borrowRate = 0.000001;

async function pretendBlock(vToken, accrualBlock, deltaBlocks = 1) {
  await send(vToken, "harnessSetAccrualBlockNumber", [bnbUnsigned(blockNumber)]);
  await send(vToken, "harnessSetBlockNumber", [bnbUnsigned(blockNumber + deltaBlocks)]);
  await send(vToken, "harnessSetBorrowIndex", [bnbUnsigned(borrowIndex)]);
}

async function preAccrue(vToken) {
  await setBorrowRate(vToken, borrowRate);
  await send(vToken.interestRateModel, "setFailBorrowRate", [false]);
  await send(vToken, "harnessExchangeRateDetails", [0, 0, 0]);
}

describe("VToken", () => {
  let vToken;
  beforeEach(async () => {
    vToken = await makeVToken({ comptrollerOpts: { kind: "bool" } });
  });

  beforeEach(async () => {
    await preAccrue(vToken);
  });

  describe("accrueInterest", () => {
    it("reverts if the interest rate is absurdly high", async () => {
      await pretendBlock(vToken, blockNumber, 1);
      expect(await call(vToken, "getBorrowRateMaxMantissa")).toEqualNumber(bnbMantissa(0.000005)); // 0.0005% per block
      await setBorrowRate(vToken, 0.001e-2); // 0.0010% per block
      await expect(send(vToken, "accrueInterest")).rejects.toRevert("revert borrow rate is absurdly high");
    });

    it("fails if new borrow rate calculation fails", async () => {
      await pretendBlock(vToken, blockNumber, 1);
      await send(vToken.interestRateModel, "setFailBorrowRate", [true]);
      await expect(send(vToken, "accrueInterest")).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("fails if simple interest factor calculation fails", async () => {
      await pretendBlock(vToken, blockNumber, 5e70);
      expect(await send(vToken, "accrueInterest")).toHaveTokenFailure(
        "MATH_ERROR",
        "ACCRUE_INTEREST_SIMPLE_INTEREST_FACTOR_CALCULATION_FAILED",
      );
    });

    it("fails if new borrow index calculation fails", async () => {
      await pretendBlock(vToken, blockNumber, 5e60);
      expect(await send(vToken, "accrueInterest")).toHaveTokenFailure(
        "MATH_ERROR",
        "ACCRUE_INTEREST_NEW_BORROW_INDEX_CALCULATION_FAILED",
      );
    });

    it("fails if new borrow interest index calculation fails", async () => {
      await pretendBlock(vToken);
      await send(vToken, "harnessSetBorrowIndex", [
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
      ]);
      expect(await send(vToken, "accrueInterest")).toHaveTokenFailure(
        "MATH_ERROR",
        "ACCRUE_INTEREST_NEW_BORROW_INDEX_CALCULATION_FAILED",
      );
    });

    it("fails if interest accumulated calculation fails", async () => {
      await send(vToken, "harnessExchangeRateDetails", [
        0,
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
        0,
      ]);
      await pretendBlock(vToken);
      expect(await send(vToken, "accrueInterest")).toHaveTokenFailure(
        "MATH_ERROR",
        "ACCRUE_INTEREST_ACCUMULATED_INTEREST_CALCULATION_FAILED",
      );
    });

    it("fails if new total borrows calculation fails", async () => {
      await setBorrowRate(vToken, 1e-18);
      await pretendBlock(vToken);
      await send(vToken, "harnessExchangeRateDetails", [
        0,
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
        0,
      ]);
      expect(await send(vToken, "accrueInterest")).toHaveTokenFailure(
        "MATH_ERROR",
        "ACCRUE_INTEREST_NEW_TOTAL_BORROWS_CALCULATION_FAILED",
      );
    });

    it("fails if interest accumulated for reserves calculation fails", async () => {
      await setBorrowRate(vToken, 0.000001);
      await send(vToken, "harnessExchangeRateDetails", [
        0,
        bnbUnsigned(1e30),
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
      ]);
      await send(vToken, "harnessSetReserveFactorFresh", [bnbUnsigned(1e10)]);
      await pretendBlock(vToken, blockNumber, 5e20);
      expect(await send(vToken, "accrueInterest")).toHaveTokenFailure(
        "MATH_ERROR",
        "ACCRUE_INTEREST_NEW_TOTAL_RESERVES_CALCULATION_FAILED",
      );
    });

    it("fails if new total reserves calculation fails", async () => {
      await setBorrowRate(vToken, 1e-18);
      await send(vToken, "harnessExchangeRateDetails", [
        0,
        bnbUnsigned(1e56),
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
      ]);
      await send(vToken, "harnessSetReserveFactorFresh", [bnbUnsigned(1e17)]);
      await pretendBlock(vToken);
      expect(await send(vToken, "accrueInterest")).toHaveTokenFailure(
        "MATH_ERROR",
        "ACCRUE_INTEREST_NEW_TOTAL_RESERVES_CALCULATION_FAILED",
      );
    });

    it("succeeds and saves updated values in storage on success", async () => {
      const startingTotalBorrows = 1e22;
      const startingTotalReserves = 1e20;
      const reserveFactor = 1e17;

      await send(vToken, "harnessExchangeRateDetails", [
        0,
        bnbUnsigned(startingTotalBorrows),
        bnbUnsigned(startingTotalReserves),
      ]);
      await send(vToken, "harnessSetReserveFactorFresh", [bnbUnsigned(reserveFactor)]);
      await pretendBlock(vToken);

      const expectedAccrualBlockNumber = blockNumber + 1;
      const expectedBorrowIndex = borrowIndex + borrowIndex * borrowRate;
      const expectedTotalBorrows = startingTotalBorrows + startingTotalBorrows * borrowRate;
      const expectedTotalReserves = startingTotalReserves + (startingTotalBorrows * borrowRate * reserveFactor) / 1e18;

      const receipt = await send(vToken, "accrueInterest");
      expect(receipt).toSucceed();
      expect(receipt).toHaveLog("AccrueInterest", {
        cashPrior: 0,
        interestAccumulated: bnbUnsigned(expectedTotalBorrows).sub(bnbUnsigned(startingTotalBorrows)).toFixed(),
        borrowIndex: bnbUnsigned(expectedBorrowIndex).toFixed(),
        totalBorrows: bnbUnsigned(expectedTotalBorrows).toFixed(),
      });
      expect(await call(vToken, "accrualBlockNumber")).toEqualNumber(expectedAccrualBlockNumber);
      expect(await call(vToken, "borrowIndex")).toEqualNumber(expectedBorrowIndex);
      expect(await call(vToken, "totalBorrows")).toEqualNumber(expectedTotalBorrows);
      expect(await call(vToken, "totalReserves")).toEqualNumber(expectedTotalReserves);
    });
  });
});
