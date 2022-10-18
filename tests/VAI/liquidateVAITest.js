const { bnbGasCost, bnbUnsigned } = require("../Utils/BSC");

const {
  makeVToken,
  fastForward,
  setBalance,
  setMintedVAIOf,
  setVAIBalance,
  getBalancesWithVAI,
  adjustBalancesWithVAI,
  pretendBorrow,
  pretendVAIMint,
  preApproveVAI,
} = require("../Utils/Venus");

const repayAmount = bnbUnsigned(10e2);
const seizeAmount = repayAmount;
const seizeTokens = seizeAmount.mul(4); // forced

async function preLiquidateVAI(comptroller, vaicontroller, vai, liquidator, borrower, repayAmount, vTokenCollateral) {
  // setup for success in liquidating
  await send(comptroller, "setLiquidateBorrowAllowed", [true]);
  await send(comptroller, "setLiquidateBorrowVerify", [true]);
  await send(comptroller, "setRepayBorrowAllowed", [true]);
  await send(comptroller, "setRepayBorrowVerify", [true]);
  await send(comptroller, "setSeizeAllowed", [true]);
  await send(comptroller, "setSeizeVerify", [true]);
  await send(comptroller, "setVAIFailCalculateSeizeTokens", [false]);
  await send(vTokenCollateral.interestRateModel, "setFailBorrowRate", [false]);
  await send(vTokenCollateral.comptroller, "setVAICalculatedSeizeTokens", [seizeTokens]);
  await setBalance(vTokenCollateral, liquidator, 0);
  await setBalance(vTokenCollateral, borrower, seizeTokens);
  await setMintedVAIOf(comptroller, borrower, 40e2);
  await setVAIBalance(vai, borrower, 40e2);
  await setVAIBalance(vai, liquidator, 40e2);
  await pretendBorrow(vTokenCollateral, borrower, 0, 10e2, 0);
  await pretendVAIMint(comptroller, vaicontroller, vai, borrower, 40e2);
  await preApproveVAI(comptroller, vai, liquidator, vaicontroller._address, repayAmount);
}

async function liquidateVAIFresh(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral) {
  return send(vaicontroller, "harnessLiquidateVAIFresh", [
    liquidator,
    borrower,
    repayAmount,
    vTokenCollateral._address,
  ]);
}

async function liquidateVAI(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral) {
  // make sure to have a block delta so we accrue interest
  await fastForward(vaicontroller, 1);
  await fastForward(vTokenCollateral, 1);
  return send(vaicontroller, "liquidateVAI", [borrower, repayAmount, vTokenCollateral._address], { from: liquidator });
}

async function seize(vToken, liquidator, borrower, seizeAmount) {
  return send(vToken, "seize", [liquidator, borrower, seizeAmount]);
}

describe("VAIController", function () {
  let root, liquidator, borrower; // eslint-disable-line @typescript-eslint/no-unused-vars
  let vTokenCollateral;
  let comptroller, vaicontroller, vai;

  beforeEach(async () => {
    [root, liquidator, borrower] = saddle.accounts; // eslint-disable-line @typescript-eslint/no-var-requires
    vTokenCollateral = await makeVToken({ comptrollerOpts: { kind: "bool" } });
    comptroller = vTokenCollateral.comptroller;
    vaicontroller = comptroller.vaicontroller;
    await send(comptroller, "setLiquidateBorrowAllowed", [false]);
    vai = comptroller.vai;
  });

  beforeEach(async () => {
    await preLiquidateVAI(comptroller, vaicontroller, vai, liquidator, borrower, repayAmount, vTokenCollateral);
  });

  describe("liquidateVAIFresh", () => {
    it("fails if comptroller tells it to", async () => {
      await send(comptroller, "setLiquidateBorrowAllowed", [false]);
      expect(
        await liquidateVAIFresh(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral),
      ).toHaveVAITrollReject("VAI_LIQUIDATE_COMPTROLLER_REJECTION", "MATH_ERROR");
    });

    it("proceeds if comptroller tells it to", async () => {
      expect(await liquidateVAIFresh(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral)).toSucceed();
    });

    it("fails if collateral market not fresh", async () => {
      await fastForward(vaicontroller);
      await fastForward(vTokenCollateral);
      expect(
        await liquidateVAIFresh(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral),
      ).toHaveVAITrollFailure("REJECTION", "VAI_LIQUIDATE_COLLATERAL_FRESHNESS_CHECK");
    });

    it("fails if borrower is equal to liquidator", async () => {
      expect(
        await liquidateVAIFresh(vaicontroller, borrower, borrower, repayAmount, vTokenCollateral),
      ).toHaveVAITrollFailure("REJECTION", "VAI_LIQUIDATE_LIQUIDATOR_IS_BORROWER");
    });

    it("fails if repayAmount = 0", async () => {
      expect(await liquidateVAIFresh(vaicontroller, liquidator, borrower, 0, vTokenCollateral)).toHaveVAITrollFailure(
        "REJECTION",
        "VAI_LIQUIDATE_CLOSE_AMOUNT_IS_ZERO",
      );
    });

    it("fails if calculating seize tokens fails and does not adjust balances", async () => {
      const beforeBalances = await getBalancesWithVAI(vai, [vTokenCollateral], [liquidator, borrower]);
      await send(comptroller, "setVAIFailCalculateSeizeTokens", [true]);
      await expect(
        liquidateVAIFresh(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral),
      ).rejects.toRevert("revert VAI_LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED");
      const afterBalances = await getBalancesWithVAI(vai, [vTokenCollateral], [liquidator, borrower]);
      expect(afterBalances).toEqual(beforeBalances);
    });

    // it("fails if repay fails", async () => {
    //   await send(comptroller, 'setRepayBorrowAllowed', [false]);
    //   expect(
    //     await liquidateVAIFresh(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral)
    //   ).toHaveVAITrollReject('LIQUIDATE_REPAY_BORROW_FRESH_FAILED');
    // });

    it("reverts if seize fails", async () => {
      await send(comptroller, "setSeizeAllowed", [false]);
      await expect(
        liquidateVAIFresh(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral),
      ).rejects.toRevert("revert token seizure failed");
    });

    it("reverts if liquidateBorrowVerify fails", async () => {
      await send(comptroller, "setLiquidateBorrowVerify", [false]);
      await expect(
        liquidateVAIFresh(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral),
      ).rejects.toRevert("revert liquidateBorrowVerify rejected liquidateBorrow");
    });

    it("transfers the cash, borrows, tokens, and emits LiquidateVAI events", async () => {
      const beforeBalances = await getBalancesWithVAI(vai, [vTokenCollateral], [liquidator, borrower]);
      const result = await liquidateVAIFresh(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral);
      const afterBalances = await getBalancesWithVAI(vai, [vTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      expect(result).toHaveLog("LiquidateVAI", {
        liquidator: liquidator,
        borrower: borrower,
        repayAmount: repayAmount.toString(),
        vTokenCollateral: vTokenCollateral._address,
        seizeTokens: seizeTokens.toString(),
      });
      // expect(result).toHaveLog(['Transfer', 0], {
      //   from: liquidator,
      //   to: vaicontroller._address,
      //   amount: repayAmount.toString()
      // });
      // expect(result).toHaveLog(['Transfer', 1], {
      //   from: borrower,
      //   to: liquidator,
      //   amount: seizeTokens.toString()
      // });

      expect(afterBalances).toEqual(
        await adjustBalancesWithVAI(
          beforeBalances,
          [
            [vTokenCollateral, liquidator, "tokens", seizeTokens],
            [vTokenCollateral, borrower, "tokens", -seizeTokens],
            [vai, liquidator, "vai", -repayAmount],
          ],
          vai,
        ),
      );
    });
  });

  describe("liquidateVAI", () => {
    // it("emits a liquidation failure if borrowed asset interest accrual fails", async () => {
    //   await send(vToken.interestRateModel, 'setFailBorrowRate', [true]);
    //   await expect(liquidateVAI(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    // });

    // it("emits a liquidation failure if collateral asset interest accrual fails", async () => {
    //   await send(vTokenCollateral.interestRateModel, 'setFailBorrowRate', [true]);
    //   await expect(liquidateVAI(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    // });

    it("returns error from liquidateVAIFresh without emitting any extra logs", async () => {
      expect(await liquidateVAI(vaicontroller, liquidator, borrower, 0, vTokenCollateral)).toHaveVAITrollFailure(
        "REJECTION",
        "VAI_LIQUIDATE_CLOSE_AMOUNT_IS_ZERO",
      );
    });

    it("returns success from liquidateVAIFresh and transfers the correct amounts", async () => {
      const beforeBalances = await getBalancesWithVAI(vai, [vTokenCollateral], [liquidator, borrower]);
      const result = await liquidateVAI(vaicontroller, liquidator, borrower, repayAmount, vTokenCollateral);
      const gasCost = await bnbGasCost(result);
      const afterBalances = await getBalancesWithVAI(vai, [vTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      expect(afterBalances).toEqual(
        await adjustBalancesWithVAI(
          beforeBalances,
          [
            [vTokenCollateral, liquidator, "bnb", -gasCost],
            [vTokenCollateral, liquidator, "tokens", seizeTokens],
            [vTokenCollateral, borrower, "tokens", -seizeTokens],
            [vai, liquidator, "vai", -repayAmount],
          ],
          vai,
        ),
      );
    });
  });

  describe("seize", () => {
    // XXX verify callers are properly checked

    it("fails if seize is not allowed", async () => {
      await send(comptroller, "setSeizeAllowed", [false]);
      expect(await seize(vTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTrollReject(
        "LIQUIDATE_SEIZE_COMPTROLLER_REJECTION",
        "MATH_ERROR",
      );
    });

    it("fails if vTokenBalances[borrower] < amount", async () => {
      await setBalance(vTokenCollateral, borrower, 1);
      expect(await seize(vTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTokenMathFailure(
        "LIQUIDATE_SEIZE_BALANCE_DECREMENT_FAILED",
        "INTEGER_UNDERFLOW",
      );
    });

    it("fails if vTokenBalances[liquidator] overflows", async () => {
      await setBalance(
        vTokenCollateral,
        liquidator,
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
      );
      expect(await seize(vTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTokenMathFailure(
        "LIQUIDATE_SEIZE_BALANCE_INCREMENT_FAILED",
        "INTEGER_OVERFLOW",
      );
    });

    it("succeeds, updates balances, and emits Transfer event", async () => {
      const beforeBalances = await getBalancesWithVAI(vai, [vTokenCollateral], [liquidator, borrower]);
      const result = await seize(vTokenCollateral, liquidator, borrower, seizeTokens);
      const afterBalances = await getBalancesWithVAI(vai, [vTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      expect(result).toHaveLog("Transfer", {
        from: borrower,
        to: liquidator,
        amount: seizeTokens.toString(),
      });
      expect(afterBalances).toEqual(
        await adjustBalancesWithVAI(
          beforeBalances,
          [
            [vTokenCollateral, liquidator, "tokens", seizeTokens],
            [vTokenCollateral, borrower, "tokens", -seizeTokens],
          ],
          vai,
        ),
      );
    });
  });
});
