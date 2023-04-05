import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "bignumber.js";
import chai from "chai";
import { BigNumberish, Signer, constants } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import { Comptroller, VBep20Harness } from "../../typechain";
import { ComptrollerErrorReporter } from "./util/Errors";
import {
  VTokenContracts,
  adjustBalances,
  getBalances,
  makeVToken,
  preApprove,
  pretendBorrow,
} from "./util/TokenTestHelpers";

const { expect } = chai;
chai.use(smock.matchers);

const repayAmount = convertToUnit("10", 18);
const seizeTokens = convertToUnit("40", 18); // forced, repayAmount * 4
const exchangeRate = convertToUnit("0.2", 18);

type LiquidateTestFixture = {
  //   accessControlManager: FakeContract<AccessControlManager>;
  comptroller: FakeContract<Comptroller>;
  borrowed: VTokenContracts;
  collateral: VTokenContracts;
};

async function liquidateTestFixture(): Promise<LiquidateTestFixture> {
  const comptroller = await smock.fake<Comptroller>("Comptroller");
  comptroller.isComptroller.returns(true);
  //   const accessControlManager = await smock.fake<AccessControlManager>("AccessControlManager");
  //   accessControlManager.isAllowedToCall.returns(true);
  //   const shortfall = await smock.fake<Shortfall>("Shortfall");
  const [admin, liquidator, borrower] = await ethers.getSigners();
  const borrowed = await makeVToken({ name: "BAT", comptroller, admin });
  const collateral = await makeVToken({ name: "ZRX", comptroller, admin });
  await collateral.vToken.harnessSetExchangeRate(exchangeRate);

  // setup for success in liquidating
  await collateral.vToken.harnessSetTotalSupply(convertToUnit("10", 18));
  await collateral.vToken.harnessSetBalance(await liquidator.getAddress(), 0);
  await collateral.vToken.harnessSetBalance(await borrower.getAddress(), seizeTokens);
  await pretendBorrow(collateral.vToken, borrower, 0, 1, 0);
  await pretendBorrow(borrowed.vToken, borrower, 1, 1, repayAmount);
  await preApprove(borrowed.underlying, borrowed.vToken, liquidator, repayAmount, { faucet: true });

  return { comptroller, borrowed, collateral };
}

function configure({ comptroller, collateral, borrowed }: LiquidateTestFixture) {
  //   accessControlManager.isAllowedToCall.returns(true);

  comptroller.liquidateBorrowAllowed.reset();
  comptroller.repayBorrowAllowed.reset();
  comptroller.seizeAllowed.reset();

  comptroller.liquidateCalculateSeizeTokens.reset();
  comptroller.liquidateCalculateSeizeTokens.returns([0, seizeTokens]);

  borrowed.underlying.transferFrom.reset();

  for (const model of [borrowed.interestRateModel, collateral.interestRateModel]) {
    model.getBorrowRate.reset();
    model.getBorrowRate.returns(0);
  }
}

async function liquidateFresh(
  vToken: MockContract<VBep20Harness>,
  liquidator: Signer,
  borrower: Signer,
  repayAmount: BigNumberish,
  vTokenCollateral: MockContract<VBep20Harness>,
) {
  return vToken.harnessLiquidateBorrowFresh(
    await liquidator.getAddress(),
    await borrower.getAddress(),
    repayAmount,
    vTokenCollateral.address,
  );
}

async function liquidate(
  vToken: MockContract<VBep20Harness>,
  liquidator: Signer,
  borrower: Signer,
  repayAmount: BigNumberish,
  vTokenCollateral: MockContract<VBep20Harness>,
) {
  // make sure to have a block delta so we accrue interest

  await vToken.harnessFastForward(1);

  await vTokenCollateral.harnessFastForward(1);

  return vToken.connect(liquidator).liquidateBorrow(await borrower.getAddress(), repayAmount, vTokenCollateral.address);
}

async function seize(
  vToken: MockContract<VBep20Harness>,
  liquidator: Signer,
  borrower: Signer,
  seizeAmount: BigNumberish,
) {
  return vToken.seize(await liquidator.getAddress(), await borrower.getAddress(), seizeAmount);
}

describe("VToken", function () {
  let _root: Signer;
  let liquidator: Signer;
  let borrower: Signer;
  let comptroller: FakeContract<Comptroller>;
  let borrowed: VTokenContracts;
  let collateral: VTokenContracts;

  const protocolSeizeShareMantissa = convertToUnit("0.05", 18); // 5%

  const protocolShareTokens = new BigNumber(seizeTokens)
    .multipliedBy(protocolSeizeShareMantissa)
    .dividedBy(convertToUnit("1", 18))
    .toString();
  const liquidatorShareTokens = new BigNumber(seizeTokens).toString();
  const addReservesAmount = new BigNumber(protocolShareTokens)
    .multipliedBy(exchangeRate)
    .dividedBy(convertToUnit("1", 18))
    .toString();

  beforeEach(async () => {
    [_root, liquidator, borrower] = await ethers.getSigners();
    const contracts = await loadFixture(liquidateTestFixture);
    configure(contracts);
    ({ comptroller, borrowed, collateral } = contracts);
  });

  describe("liquidateBorrowFresh", () => {
    it("fails if comptroller tells it to", async () => {
      comptroller.liquidateBorrowAllowed.reverts();
      await expect(liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be
        .reverted;
    });

    it("proceeds if comptroller tells it to", async () => {
      await liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken);
    });

    it("fails if market not fresh", async () => {
      await borrowed.vToken.harnessFastForward(5);
      await expect(liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken))
        .to.emit(borrowed.vToken, "Failure")
        .withArgs(10, 22, 0);
    });

    it("fails if collateral market not fresh", async () => {
      await borrowed.vToken.harnessFastForward(5);
      await collateral.vToken.harnessFastForward(5);
      await borrowed.vToken.accrueInterest();
      expect(await liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be
        .reverted;
    });

    it("fails if borrower is equal to liquidator", async () => {
      expect(await liquidateFresh(borrowed.vToken, borrower, borrower, repayAmount, collateral.vToken)).to.be.reverted;
    });

    it("fails if repayAmount = 0", async () => {
      await expect(liquidateFresh(borrowed.vToken, liquidator, borrower, 0, collateral.vToken))
        .to.emit(borrowed.vToken, "Failure")
        .withArgs(7, 21, 0);
    });

    it("fails if calculating seize tokens fails and does not adjust balances", async () => {
      const liquidatorAddress = await liquidator.getAddress();
      const borrowerAddress = await borrower.getAddress();
      const beforeBalances = await getBalances(
        [borrowed.vToken, collateral.vToken],
        [liquidatorAddress, borrowerAddress],
      );
      comptroller.liquidateCalculateSeizeTokens.reverts("Oups");

      await expect(liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be
        .reverted; //With('LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED');
      const afterBalances = await getBalances(
        [borrowed.vToken, collateral.vToken],
        [liquidatorAddress, borrowerAddress],
      );
      expect(afterBalances).to.deep.equal(beforeBalances);
    });

    it("fails if repay fails", async () => {
      comptroller.repayBorrowAllowed.reverts();
      await expect(liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be
        .reverted;
    });

    it("reverts if seize fails", async () => {
      comptroller.seizeAllowed.reverts();
      await expect(liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be
        .reverted;

      it("transfers the cash, borrows, tokens, and emits Transfer, LiquidateBorrow events", async () => {
        const liquidatorAddress = await liquidator.getAddress();
        const borrowerAddress = await borrower.getAddress();

        const beforeBalances = await getBalances(
          [borrowed.vToken, collateral.vToken],
          [liquidatorAddress, borrowerAddress],
        );

        const result = await liquidateFresh(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken);
        const afterBalances = await getBalances(
          [borrowed.vToken, collateral.vToken],
          [liquidatorAddress, borrowerAddress],
        );

        await expect(result)
          .to.emit(borrowed.vToken, "LiquidateBorrow")
          .withArgs(liquidatorAddress, borrowerAddress, repayAmount, collateral.vToken.address, seizeTokens);

        await expect(result)
          .to.emit(borrowed.underlying, "Transfer")
          .withArgs(liquidatorAddress, borrowed.vToken.address, repayAmount);

        await expect(result)
          .to.emit(collateral.vToken, "Transfer")
          .withArgs(borrowerAddress, liquidatorAddress, liquidatorShareTokens);

        await expect(result)
          .to.emit(collateral.vToken, "Transfer")
          .withArgs(borrowerAddress, collateral.vToken.address, protocolShareTokens);

        expect(afterBalances).to.deep.equal(
          adjustBalances(beforeBalances, [
            [borrowed.vToken, "cash", repayAmount],
            [borrowed.vToken, "borrows", -repayAmount],
            [borrowed.vToken, liquidatorAddress, "cash", -repayAmount],
            [collateral.vToken, liquidatorAddress, "tokens", liquidatorShareTokens],
            [borrowed.vToken, borrowerAddress, "borrows", -repayAmount],
            [collateral.vToken, borrowerAddress, "tokens", -seizeTokens],
            // [collateral.vToken, collateral.vToken.address, "reserves", addReservesAmount],
            // [collateral.vToken, collateral.vToken.address, "tokens", -protocolShareTokens],
          ]),
        );
      });
    });

    describe("liquidateBorrow", () => {
      it("emits a liquidation failure if borrowed asset interest accrual fails", async () => {
        borrowed.interestRateModel.getBorrowRate.reverts("Oups");
        await expect(liquidate(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
      });

      it("emits a liquidation failure if collateral asset interest accrual fails", async () => {
        collateral.interestRateModel.getBorrowRate.reverts("Oups");
        await expect(liquidate(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken)).to.be.reverted; //With("INTEREST_RATE_MODEL_ERROR");
      });

      it("returns error from liquidateBorrowFresh without emitting any extra logs", async () => {
        await expect(liquidate(borrowed.vToken, liquidator, borrower, 0, collateral.vToken))
          .to.emit(borrowed.vToken, "Failure")
          .withArgs(7, 21, 0);
      });

      it("returns success from liquidateBorrowFresh and transfers the correct amounts", async () => {
        const liquidatorAddress = await liquidator.getAddress();
        const borrowerAddress = await borrower.getAddress();
        const beforeBalances = await getBalances(
          [borrowed.vToken, collateral.vToken],
          [liquidatorAddress, borrowerAddress],
        );
        const result = await liquidate(borrowed.vToken, liquidator, borrower, repayAmount, collateral.vToken);
        const receipt = await result.wait();
        const gasCost = receipt.effectiveGasPrice.mul(receipt.gasUsed).toString();
        const afterBalances = await getBalances(
          [borrowed.vToken, collateral.vToken],
          [liquidatorAddress, borrowerAddress],
        );
        //expect(result).toSucceed();
        expect(afterBalances).to.deep.equal(
          adjustBalances(beforeBalances, [
            [borrowed.vToken, "cash", repayAmount],
            [borrowed.vToken, "borrows", -repayAmount],
            [borrowed.vToken, liquidatorAddress, "eth", -gasCost],
            [borrowed.vToken, liquidatorAddress, "cash", -repayAmount],
            [collateral.vToken, liquidatorAddress, "eth", -gasCost],
            [collateral.vToken, liquidatorAddress, "tokens", liquidatorShareTokens],
            // [collateral.vToken, collateral.vToken.address, "reserves", addReservesAmount],
            [borrowed.vToken, borrowerAddress, "borrows", -repayAmount],
            [collateral.vToken, borrowerAddress, "tokens", -seizeTokens],
            // [collateral.vToken, collateral.vToken.address, "tokens", -protocolShareTokens], // total supply decreases
          ]),
        );
      });
    });

    describe("seize", () => {
      // XXX verify callers are properly checked

      it("fails if seize is not allowed", async () => {
        comptroller.seizeAllowed.reverts();
        await expect(seize(collateral.vToken, liquidator, borrower, seizeTokens)).to.be.reverted;
      });

      it("fails if vTokenBalances[borrower] < amount", async () => {
        await collateral.vToken.harnessSetBalance(await borrower.getAddress(), 1);
        expect(await seize(collateral.vToken, liquidator, borrower, seizeTokens)).to.be.reverted;
      });

      it("fails if vTokenBalances[liquidator] overflows", async () => {
        await collateral.vToken.harnessSetBalance(await liquidator.getAddress(), constants.MaxUint256);
        expect(await seize(collateral.vToken, liquidator, borrower, seizeTokens)).to.be.reverted;
      });
    });
  });
});
