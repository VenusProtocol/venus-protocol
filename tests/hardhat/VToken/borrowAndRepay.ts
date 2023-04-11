import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
import { BigNumberish, Signer, constants } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { Comptroller, InterestRateModel, StableRateModel, VBep20Harness } from "../../../typechain";
import {
  VTokenTestFixture,
  preApprove,
  pretendBorrow,
  pretendStableBorrow,
  vTokenTestFixture,
} from "../util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const repayAmount = convertToUnit("100", 18);
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

async function borrowFresh(vToken: MockContract<VBep20Harness>, borrower: Signer, borrowAmount: BigNumberish) {
  return vToken.harnessBorrowFresh(await borrower.getAddress(), borrowAmount);
}

async function borrowStableFresh(vToken: MockContract<VBep20Harness>, borrower: Signer, borrowAmount: BigNumberish) {
  return vToken.harnessBorrowStableFresh(await borrower.getAddress(), borrowAmount);
}

async function borrow(vToken: MockContract<VBep20Harness>, borrower: Signer, borrowAmount: BigNumberish) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(borrower).borrow(borrowAmount);
}

async function borrowStable(vToken: MockContract<VBep20Harness>, borrower: Signer, borrowAmount: BigNumberish) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  // interestRateModel --> 1 for stabel rate model and 2 for varaible rate model
  return vToken.connect(borrower).borrowStable(borrowAmount);
}

async function preRepay(
  contracts: VTokenTestFixture,
  benefactor: Signer,
  borrower: Signer,
  repayAmount: BigNumberish,
  interestRateMode: number,
  stableRateMantissa: BigNumberish = 0,
) {
  const { comptroller, interestRateModel, underlying, vToken } = contracts;
  // setup either benefactor OR borrower for success in repaying
  comptroller.repayBorrowAllowed.reset();

  interestRateModel.getBorrowRate.reset();

  await underlying.harnessSetFailTransferFromAddress(await benefactor.getAddress(), false);
  await underlying.harnessSetFailTransferFromAddress(await borrower.getAddress(), false);
  if (interestRateMode == 1) {
    await pretendStableBorrow(vToken, borrower, 1, 1, repayAmount, stableRateMantissa);
  } else {
    await pretendBorrow(vToken, borrower, 1, 1, repayAmount);
  }
  await preApprove(underlying, vToken, benefactor, repayAmount, { faucet: true });
  await preApprove(underlying, vToken, borrower, repayAmount, { faucet: true });
}

async function repayBorrowFresh(
  vToken: MockContract<VBep20Harness>,
  payer: Signer,
  borrower: Signer,
  repayAmount: BigNumberish,
) {
  const payerAddress = await payer.getAddress();
  const borrowerAddress = await borrower.getAddress();
  return vToken.connect(payer).harnessRepayBorrowFresh(payerAddress, borrowerAddress, repayAmount);
}

async function repayBorrowStableFresh(
  vToken: MockContract<VBep20Harness>,
  payer: Signer,
  borrower: Signer,
  repayAmount: BigNumberish,
) {
  const payerAddress = await payer.getAddress();
  const borrowerAddress = await borrower.getAddress();
  return await vToken.connect(payer).harnessRepayBorrowStableFresh(payerAddress, borrowerAddress, repayAmount);
}

async function repayBorrow(vToken: MockContract<VBep20Harness>, borrower: Signer, repayAmount: BigNumberish) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(borrower).repayBorrow(repayAmount);
}

async function repayBorrowStable(vToken: MockContract<VBep20Harness>, borrower: Signer, repayAmount: BigNumberish) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(borrower).repayStableBorrow(repayAmount);
}

async function repayBorrowBehalf(
  vToken: MockContract<VBep20Harness>,
  payer: Signer,
  borrower: Signer,
  repayAmount: BigNumberish,
) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(payer).repayBorrowBehalf(await borrower.getAddress(), repayAmount);
}

async function repayBorrowStableBehalf(
  vToken: MockContract<VBep20Harness>,
  payer: Signer,
  borrower: Signer,
  repayAmount: BigNumberish,
) {
  // make sure to have a block delta so we accrue interest
  await vToken.harnessFastForward(1);
  return vToken.connect(payer).repayStableBorrowBehalf(await borrower.getAddress(), repayAmount);
}

describe("VToken", function () {
  let contracts: VTokenTestFixture;
  let comptroller: FakeContract<Comptroller>;
  let vToken: MockContract<VBep20Harness>;
  let underlying: MockContract<VBep20Harness>;
  let interestRateModel: FakeContract<InterestRateModel>;
  let stableInterestRateModel: FakeContract<StableRateModel>;
  let _root: Signer;
  let borrower: Signer;
  let benefactor: Signer;
  let borrowerAddress: string;

  beforeEach(async () => {
    [_root, borrower, benefactor] = await ethers.getSigners();
    borrowerAddress = await borrower.getAddress();
    contracts = await loadFixture(vTokenTestFixture);
    ({ comptroller, vToken, underlying, interestRateModel, stableInterestRateModel } = contracts);
    vToken.harnessSetStableBorrowIndex(convertToUnit(1.1, 18));
  });

  describe("borrowFresh", () => {
    beforeEach(async () => await preBorrow(contracts, borrower, borrowAmount));

    it("fails if comptroller tells it to", async () => {
      comptroller.borrowAllowed.reverts();
      await expect(borrowFresh(vToken, borrower, borrowAmount)).to.be.reverted;
    });

    it("proceeds if comptroller tells it to", async () => {
      //await expect(
      await borrowFresh(vToken, borrower, borrowAmount);
      //).toSucceed();
    });

    it("fails if market not fresh", async () => {
      await vToken.harnessFastForward(5);
      await expect(borrowFresh(vToken, borrower, borrowAmount)).to.be.reverted;
    });

    it("continues if fresh", async () => {
      //await expect(
      await vToken.accrueInterest();
      //).toSucceed();
      //await expect(
      await borrowFresh(vToken, borrower, borrowAmount);
      //).toSucceed();
    });

    it("fails if error if protocol has less than borrowAmount of underlying", async () => {
      await expect(borrowFresh(vToken, borrower, new BigNumber(borrowAmount).plus(1).toString())).to.be.revertedWith(
        "math error",
      );
    });

    it("fails if borrowBalanceStored fails (due to non-zero stored principal with zero account index)", async () => {
      await pretendBorrow(vToken, borrower, 0, 3, 5);
      expect(await borrowFresh(vToken, borrower, borrowAmount))
        .to.emit(vToken, "Failure")
        .withArgs(1, 8, 1);
    });

    // it("fails if calculating account new total borrow balance overflows", async () => {
    //   await pretendBorrow(vToken, borrower, 1e-18, 1e-18, constants.MaxUint256);
    //   await expect(borrowFresh(vToken, borrower, borrowAmount)).to.emit(vToken,"CalculationFailure").withArgs(1);
    // });

    // it("fails if calculation of new total borrow balance overflows", async () => {
    //   await vToken.harnessSetTotalBorrows(constants.MaxUint256);
    //   await expect(borrowFresh(vToken, borrower, borrowAmount)).to.emit(vToken,"CalculationFailure").withArgs(1)
    // });

    it("reverts if transfer out fails", async () => {
      await vToken.harnessSetFailTransferToAddress(borrowerAddress, true);
      await expect(borrowFresh(vToken, borrower, borrowAmount)).to.be.revertedWith("TOKEN_TRANSFER_OUT_FAILED");
    });

    it("transfers the underlying cash, tokens, and emits Transfer, Borrow events", async () => {
      const beforeProtocolCash = await underlying.balanceOf(vToken.address);
      const beforeProtocolBorrows = await vToken.totalBorrows();
      const beforeAccountCash = await underlying.balanceOf(borrowerAddress);
      const result = await borrowFresh(vToken, borrower, borrowAmount);
      //expect(result).toSucceed();
      expect(await underlying.balanceOf(borrowerAddress)).to.equal(beforeAccountCash.add(borrowAmount));
      expect(await underlying.balanceOf(vToken.address)).to.equal(beforeProtocolCash.sub(borrowAmount));
      expect(await vToken.totalBorrows()).to.equal(beforeProtocolBorrows.add(borrowAmount));
      await expect(result).to.emit(underlying, "Transfer").withArgs(vToken.address, borrowerAddress, borrowAmount);

      await expect(result)
        .to.emit(vToken, "Borrow")
        .withArgs(borrowerAddress, borrowAmount, borrowAmount, beforeProtocolBorrows.add(borrowAmount).toString());
    });

    it("stores new borrow principal and interest index", async () => {
      const beforeProtocolBorrows = await vToken.totalBorrows();
      await pretendBorrow(vToken, borrower, 0, 3, 0);
      await borrowFresh(vToken, borrower, borrowAmount);
      const borrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(borrowSnap.principal).to.equal(borrowAmount);
      expect(borrowSnap.interestIndex).to.equal(convertToUnit("3", 18));
      expect(await vToken.totalBorrows()).to.equal(beforeProtocolBorrows.add(borrowAmount));
    });

    it("borrow fresh with stable rate", async () => {
      const beforeProtocolCash = await underlying.balanceOf(vToken.address);
      const beforeProtocolBorrows = await vToken.totalBorrows();
      const beforeStableBorrows = await vToken.stableBorrows();
      const beforeAccountCash = await underlying.balanceOf(borrowerAddress);
      await stableInterestRateModel.getBorrowRate.returns(convertToUnit(25, 12));

      const result = await borrowStableFresh(vToken, borrower, borrowAmount);

      expect(await underlying.balanceOf(borrowerAddress)).to.equal(beforeAccountCash.add(borrowAmount));
      expect(await underlying.balanceOf(vToken.address)).to.equal(beforeProtocolCash.sub(borrowAmount));
      expect(await vToken.totalBorrows()).to.equal(beforeProtocolBorrows.add(borrowAmount));
      expect(await vToken.stableBorrows()).to.equal(beforeStableBorrows.add(borrowAmount));

      await expect(result).to.emit(underlying, "Transfer").withArgs(vToken.address, borrowerAddress, borrowAmount);

      await expect(result)
        .to.emit(vToken, "Borrow")
        .withArgs(borrowerAddress, borrowAmount, borrowAmount, beforeProtocolBorrows.add(borrowAmount).toString());
    });

    it("stores new borrow principal and interest index for stable rate borrowing", async () => {
      let beforeProtocolBorrows = await vToken.totalBorrows();
      let borrowSnap = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(borrowSnap.principal).to.equal(0);
      expect(borrowSnap.interestIndex).to.equal(0);
      expect(await vToken.totalBorrows()).to.equal(0);

      await pretendStableBorrow(vToken, borrower, 1, 1, borrowAmount, convertToUnit(5, 8));
      beforeProtocolBorrows = await vToken.totalBorrows();
      borrowSnap = await vToken.harnessAccountStableBorrows(borrowerAddress);

      expect(borrowSnap.principal).to.equal(convertToUnit("1000", 18));
      expect(borrowSnap.interestIndex).to.equal(convertToUnit("1", 18));
      expect(beforeProtocolBorrows).to.equal(convertToUnit("1000", 18));

      await borrowStableFresh(vToken, borrower, borrowAmount);
      beforeProtocolBorrows = await vToken.totalBorrows();
      borrowSnap = await vToken.harnessAccountStableBorrows(borrowerAddress);

      expect(borrowSnap.principal).to.equal(convertToUnit("2000", 18));
      expect(borrowSnap.interestIndex).to.equal(convertToUnit("1", 18));
      expect(beforeProtocolBorrows).to.equal(convertToUnit("2000", 18));
    });
  });

  describe("borrow", () => {
    beforeEach(async () => await preBorrow(contracts, borrower, borrowAmount));

    it("emits a borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(borrow(vToken, borrower, borrowAmount)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from borrowFresh without emitting any extra logs", async () => {
      await expect(borrow(vToken, borrower, new BigNumber(borrowAmount).plus(1).toString())).to.be.revertedWith(
        "math error",
      );
    });

    it("returns success from borrowFresh and transfers the correct amount", async () => {
      const beforeAccountCash = await underlying.balanceOf(borrowerAddress);
      await vToken.harnessFastForward(5);
      //expect(
      await borrow(vToken, borrower, borrowAmount);
      //).toSucceed();
      expect(await underlying.balanceOf(borrowerAddress)).to.equal(beforeAccountCash.add(borrowAmount));
    });

    it("returns success from borrowFresh and transfers the correct amount for stable rate borrowing", async () => {
      const beforeAccountCash = await underlying.balanceOf(borrowerAddress);
      await vToken.harnessFastForward(5);
      await borrowStable(vToken, borrower, borrowAmount);
      expect(await underlying.balanceOf(borrowerAddress)).to.equal(beforeAccountCash.add(borrowAmount));
    });
  });

  describe("repayBorrowFresh for variable rate borrowing", () => {
    [true, false].forEach(benefactorIsPayer => {
      let payer: Signer;
      let payerAddress: string;
      const label = benefactorIsPayer ? "benefactor paying" : "borrower paying";
      describe(label, () => {
        beforeEach(async () => {
          payer = benefactorIsPayer ? benefactor : borrower;
          payerAddress = await payer.getAddress();
          await preRepay(contracts, payer, borrower, repayAmount, 2);
        });

        it("fails if repay is not allowed", async () => {
          comptroller.repayBorrowAllowed.reverts();
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.reverted;
        });

        it("fails if block number ≠ current block number", async () => {
          await vToken.harnessFastForward(5);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount))
            .to.emit(vToken, "Failure")
            .withArgs(10, 57, 0);
        });

        it("fails if insufficient approval", async () => {
          await preApprove(underlying, vToken, payer, 1);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWith(
            "TOKEN_TRANSFER_IN_FAILED",
          );
        });

        it("fails if insufficient balance", async () => {
          await underlying.harnessSetBalance(await payer.getAddress(), 1);
          await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWith(
            "TOKEN_TRANSFER_IN_FAILED",
          );
        });

        // it("returns an error if calculating account new account borrow balance fails", async () => {
        //   await pretendBorrow(vToken, borrower, 1, 1, 1);
        //   await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWithPanic(
        //     PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
        //   );
        // });

        // it("returns an error if calculation of new total borrow balance fails", async () => {
        //   await vToken.harnessSetTotalBorrows(1);
        //   await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.reverted;
        //         });

        // it("reverts if doTransferIn fails", async () => {
        //   await underlying.harnessSetFailTransferFromAddress(payerAddress, true);
        //   await expect(repayBorrowFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWith(
        //     "SafeERC20: ERC20 operation did not succeed",
        //   );
        // });

        it("transfers the underlying cash, and emits Transfer, RepayBorrow events", async () => {
          const beforeProtocolCash = await underlying.balanceOf(vToken.address);
          const result = await repayBorrowFresh(vToken, payer, borrower, repayAmount);
          expect(await underlying.balanceOf(vToken.address)).to.equal(beforeProtocolCash.add(repayAmount));
          await expect(result).to.emit(underlying, "Transfer").withArgs(payerAddress, vToken.address, repayAmount);
          await expect(result)
            .to.emit(vToken, "RepayBorrow")
            .withArgs(payerAddress, borrowerAddress, repayAmount, "0", "0");
        });

        it("stores new borrow principal and interest index", async () => {
          const beforeProtocolBorrows = await vToken.totalBorrows();
          const beforeAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
          //expect(
          await repayBorrowFresh(vToken, payer, borrower, repayAmount);
          //).toSucceed();
          const afterAccountBorrows = await vToken.harnessAccountBorrows(borrowerAddress);
          expect(afterAccountBorrows.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
          expect(afterAccountBorrows.interestIndex).to.equal(convertToUnit("1", 18));
          expect(await vToken.totalBorrows()).to.equal(beforeProtocolBorrows.sub(repayAmount));
        });
      });
    });
  });

  describe("repayBorrowFresh for stable rate borrowing", () => {
    [true, false].forEach(benefactorIsPayer => {
      let payer: Signer;
      let payerAddress: string;
      const label = benefactorIsPayer ? "benefactor paying" : "borrower paying";
      describe(label, () => {
        beforeEach(async () => {
          payer = benefactorIsPayer ? benefactor : borrower;
          payerAddress = await payer.getAddress();
          await preRepay(contracts, payer, borrower, repayAmount, 1);
        });

        it("fails if repay is not allowed", async () => {
          comptroller.repayBorrowAllowed.reverts();
          await expect(repayBorrowStableFresh(vToken, payer, borrower, repayAmount)).to.be.reverted;
        });

        it("fails if block number ≠ current block number", async () => {
          await vToken.harnessFastForward(5);
          await expect(repayBorrowStableFresh(vToken, payer, borrower, repayAmount))
            .to.emit(vToken, "Failure")
            .withArgs(10, 57, 0);
        });

        it("fails if insufficient approval", async () => {
          await preApprove(underlying, vToken, payer, 1);
          await expect(repayBorrowStableFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWith(
            "TOKEN_TRANSFER_IN_FAILED",
          );
        });

        it("fails if insufficient balance", async () => {
          await underlying.harnessSetBalance(await payer.getAddress(), 1);
          await expect(repayBorrowStableFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWith(
            "TOKEN_TRANSFER_IN_FAILED",
          );
        });

        // it("returns an error if calculating account new account borrow balance fails", async () => {
        //   await pretendBorrow(vToken, borrower, 1, 1, 1);
        //   await expect(repayBorrowStableFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWithPanic(
        //     PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
        //   );
        // });

        // it("returns an error if calculation of new total borrow balance fails", async () => {
        //   await vToken.harnessSetTotalBorrows(1);
        //   await expect(repayBorrowStableFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWithPanic(
        //     PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
        //   );
        // });

        // it("reverts if doTransferIn fails", async () => {
        //   await underlying.harnessSetFailTransferFromAddress(payerAddress, true);
        //   await expect(repayBorrowStableFresh(vToken, payer, borrower, repayAmount)).to.be.revertedWith(
        //     "SafeERC20: ERC20 operation did not succeed",
        //   );
        // });

        it("transfers the underlying cash, and emits Transfer, RepayBorrow events", async () => {
          const beforeProtocolCash = await underlying.balanceOf(vToken.address);
          const result = await repayBorrowStableFresh(vToken, payer, borrower, repayAmount);
          expect(await underlying.balanceOf(vToken.address)).to.equal(beforeProtocolCash.add(repayAmount));
          await expect(result).to.emit(underlying, "Transfer").withArgs(payerAddress, vToken.address, repayAmount);
          await expect(result)
            .to.emit(vToken, "RepayBorrow")
            .withArgs(payerAddress, borrowerAddress, repayAmount, "0", "0");
        });

        it("stores new borrow principal and interest index", async () => {
          const beforeProtocolBorrows = await vToken.totalBorrows();
          const beforeAccountBorrowSnap = await vToken.harnessAccountStableBorrows(borrowerAddress);
          //expect(
          await repayBorrowStableFresh(vToken, payer, borrower, repayAmount);
          //).toSucceed();
          const afterAccountBorrows = await vToken.harnessAccountStableBorrows(borrowerAddress);
          expect(afterAccountBorrows.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
          expect(afterAccountBorrows.interestIndex).to.equal(convertToUnit("1", 18));
          expect(await vToken.totalBorrows()).to.equal(beforeProtocolBorrows.sub(repayAmount));
        });
      });
    });
  });

  describe("repayBorrow", () => {
    beforeEach(async () => {
      await preRepay(contracts, borrower, borrower, repayAmount, 2);
    });

    it("emits a repay borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(repayBorrow(vToken, borrower, repayAmount)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(borrowerAddress, 1);
      await expect(repayBorrow(vToken, borrower, repayAmount)).to.be.revertedWith("TOKEN_TRANSFER_IN_FAILED");
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await vToken.harnessFastForward(5);
      const beforeAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
      //expect(
      await repayBorrow(vToken, borrower, repayAmount);
      //).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(afterAccountBorrowSnap.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
    });

    it("repays the full amount owed if payer has enough", async () => {
      await vToken.harnessFastForward(5);
      //expect(
      await repayBorrow(vToken, borrower, constants.MaxUint256);
      //).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(afterAccountBorrowSnap.principal).to.equal(0);
    });

    it("fails gracefully if payer does not have enough", async () => {
      await underlying.harnessSetBalance(borrowerAddress, 3);
      await vToken.harnessFastForward(5);
      await expect(repayBorrow(vToken, borrower, constants.MaxUint256)).to.be.revertedWith("TOKEN_TRANSFER_IN_FAILED");
    });
  });

  describe("repayBorrow for stable rate", () => {
    beforeEach(async () => {
      await preRepay(contracts, borrower, borrower, repayAmount, 1);
    });

    it("emits a repay borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(repayBorrowStable(vToken, borrower, repayAmount)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(borrowerAddress, 1);
      await expect(repayBorrowStable(vToken, borrower, repayAmount)).to.be.revertedWith("TOKEN_TRANSFER_IN_FAILED");
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await vToken.harnessFastForward(5);
      const beforeAccountBorrowSnap = await vToken.harnessAccountStableBorrows(borrowerAddress);
      //expect(
      await repayBorrowStable(vToken, borrower, repayAmount);
      //).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(afterAccountBorrowSnap.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
    });

    it("repays the full amount owed if payer has enough", async () => {
      await vToken.harnessFastForward(5);
      //expect(
      await repayBorrowStable(vToken, borrower, constants.MaxUint256);
      //).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(afterAccountBorrowSnap.principal).to.equal(0);
    });

    it("fails gracefully if payer does not have enough", async () => {
      await underlying.harnessSetBalance(borrowerAddress, 3);
      await vToken.harnessFastForward(5);
      await expect(repayBorrowStable(vToken, borrower, constants.MaxUint256)).to.be.revertedWith(
        "TOKEN_TRANSFER_IN_FAILED",
      );
    });
  });

  describe("Stable interest rate accural", () => {
    it("Stable rate accrual after few blocks", async () => {
      await preRepay(contracts, borrower, borrower, repayAmount, 1, convertToUnit(1, 8));
      await vToken.harnessFastForward(18);

      let borrowSnap = await vToken.harnessAccountStableBorrows(borrower.getAddress());
      expect(borrowSnap.principal).to.equal(convertToUnit(1, 20));
      expect(borrowSnap.lastBlockAccrued).to.equal(convertToUnit(2, 7));

      await vToken.harnessUpdateUserStableBorrowBalance(borrower.getAddress());

      borrowSnap = await vToken.harnessAccountStableBorrows(borrower.getAddress());
      expect(borrowSnap.principal).to.equal(convertToUnit(10000000018, 10));
      expect(borrowSnap.lastBlockAccrued).to.equal(20000018);

      const borrows = await vToken.stableBorrows();
      expect(borrows).to.equal(convertToUnit(10000000018, 10));
    });

    //--
    it("Stable rate accrual for two accounts after few blocks", async () => {
      const [, , borrower2] = await ethers.getSigners();
      await preBorrow(contracts, borrower, borrowAmount, convertToUnit(1, 6));
      await borrowStable(vToken, borrower, borrowAmount);
      await vToken.harnessFastForward(10);
      let borrowSnap1 = await vToken.harnessAccountStableBorrows(borrower.getAddress());

      expect(borrowSnap1.principal).to.equal(convertToUnit(1, 21));
      expect(borrowSnap1.lastBlockAccrued).to.equal(100001);

      await preBorrow(contracts, borrower2, borrowAmount, convertToUnit(1, 8));
      await vToken.harnessSetTotalBorrows(borrowAmount);
      await borrowStable(vToken, borrower2, borrowAmount);
      await vToken.harnessFastForward(10);

      borrowSnap1 = await vToken.harnessAccountStableBorrows(borrower.getAddress());
      let borrowSnap2 = await vToken.harnessAccountStableBorrows(borrower2.getAddress());

      expect(borrowSnap1.principal).to.equal(convertToUnit(1, 21));
      expect(borrowSnap2.principal).to.equal(convertToUnit(1, 21));
      expect(borrowSnap1.lastBlockAccrued).to.equal(100001);
      expect(borrowSnap2.lastBlockAccrued).to.equal(100012);

      await vToken.harnessFastForward(10);
      await vToken.harnessUpdateUserStableBorrowBalance(borrower.getAddress());

      borrowSnap1 = await vToken.harnessAccountStableBorrows(borrower.getAddress());
      borrowSnap2 = await vToken.harnessAccountStableBorrows(borrower2.getAddress());

      expect(borrowSnap1.principal).to.equal("1000000000030999999999");
      expect(borrowSnap1.lastBlockAccrued).to.equal(100032);
      expect(borrowSnap2.lastBlockAccrued).to.equal(100012);

      await vToken.harnessFastForward(10);
      await vToken.harnessUpdateUserStableBorrowBalance(borrower2.getAddress());

      borrowSnap1 = await vToken.harnessAccountStableBorrows(borrower.getAddress());
      borrowSnap2 = await vToken.harnessAccountStableBorrows(borrower2.getAddress());

      expect(borrowSnap1.principal).to.equal("1000000000030999999999");
      expect(borrowSnap2.principal).to.equal("1000000002999999999424");
      expect(borrowSnap1.lastBlockAccrued).to.equal(100032);
      expect(borrowSnap2.lastBlockAccrued).to.equal(100042);

      await vToken.harnessFastForward(10);
      await vToken.harnessUpdateUserStableBorrowBalance(borrower.getAddress());
      await vToken.harnessUpdateUserStableBorrowBalance(borrower2.getAddress());

      borrowSnap1 = await vToken.harnessAccountStableBorrows(borrower.getAddress());
      borrowSnap2 = await vToken.harnessAccountStableBorrows(borrower2.getAddress());

      expect(borrowSnap1.principal).to.equal("1000000000050999999998");
      expect(borrowSnap2.principal).to.equal("1000000004000000001959");
      expect(borrowSnap1.lastBlockAccrued).to.equal(100052);
      expect(borrowSnap2.lastBlockAccrued).to.equal(100052);
    });

    it("Average stable borrow rate, stable borrows after borrow and repay", async () => {
      const [, , borrower2] = await ethers.getSigners();

      await preBorrow(contracts, borrower, borrowAmount, convertToUnit(1, 6));
      await borrowStable(vToken, borrower, borrowAmount);
      let averageBorrowRate = await vToken.averageStableBorrowRate();
      let stabelBorrows = await vToken.stableBorrows();
      expect(averageBorrowRate).to.equal(1000000);
      expect(stabelBorrows).to.equal(borrowAmount);

      await preBorrow(contracts, borrower2, borrowAmount, convertToUnit(1, 8));
      await vToken.harnessSetTotalBorrows(borrowAmount);
      await borrowStable(vToken, borrower2, borrowAmount);
      await vToken.harnessFastForward(10);

      stabelBorrows = await vToken.stableBorrows();

      expect(stabelBorrows).to.equal(convertToUnit(2000, 18));
      averageBorrowRate = await vToken.averageStableBorrowRate();
      expect(averageBorrowRate).to.equal(50500000);

      await underlying.harnessSetFailTransferFromAddress(await borrower.getAddress(), false);
      await preApprove(underlying, vToken, borrower, borrowAmount, { faucet: true });
      await vToken.connect(borrower).harnessRepayBorrowStable(borrowAmount);

      averageBorrowRate = await vToken.averageStableBorrowRate();

      expect(averageBorrowRate).to.equal(99999999);
      stabelBorrows = await vToken.stableBorrows();
      expect(stabelBorrows).to.equal("1000000000011000000000");
    });
  });

  describe("repayBorrowBehalf", () => {
    let payer: Signer;
    let payerAddress: string;

    beforeEach(async () => {
      payer = benefactor;
      payerAddress = await payer.getAddress();
      await preRepay(contracts, payer, borrower, repayAmount, 2);
    });

    it("emits a repay borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(repayBorrowBehalf(vToken, payer, borrower, repayAmount)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(payerAddress, 1);
      await expect(repayBorrowBehalf(vToken, payer, borrower, repayAmount)).to.be.revertedWith(
        "TOKEN_TRANSFER_IN_FAILED",
      );
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await vToken.harnessFastForward(5);
      const beforeAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
      //expect(
      await repayBorrowBehalf(vToken, payer, borrower, repayAmount);
      //).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountBorrows(borrowerAddress);
      expect(afterAccountBorrowSnap.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
    });
  });

  describe("repayBorrowBehalf for stable rate", () => {
    let payer: Signer;
    let payerAddress: string;

    beforeEach(async () => {
      payer = benefactor;
      payerAddress = await payer.getAddress();
      await preRepay(contracts, payer, borrower, repayAmount, 1);
    });

    it("emits a repay borrow failure if interest accrual fails", async () => {
      interestRateModel.getBorrowRate.reverts("Oups");
      await expect(repayBorrowStableBehalf(vToken, payer, borrower, repayAmount)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from repayBorrowFresh without emitting any extra logs", async () => {
      await underlying.harnessSetBalance(payerAddress, 1);
      await expect(repayBorrowStableBehalf(vToken, payer, borrower, repayAmount)).to.be.revertedWith(
        "TOKEN_TRANSFER_IN_FAILED",
      );
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await vToken.harnessFastForward(5);
      const beforeAccountBorrowSnap = await vToken.harnessAccountStableBorrows(borrowerAddress);
      //expect(
      await repayBorrowStableBehalf(vToken, payer, borrower, repayAmount);
      //).toSucceed();
      const afterAccountBorrowSnap = await vToken.harnessAccountStableBorrows(borrowerAddress);
      expect(afterAccountBorrowSnap.principal).to.equal(beforeAccountBorrowSnap.principal.sub(repayAmount));
    });
  });
});
