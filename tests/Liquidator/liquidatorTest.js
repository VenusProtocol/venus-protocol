const BigNumber = require('bignumber.js');
const {
  bnbGasCost,
  bnbUnsigned,
  bnbMantissa
} = require('../Utils/BSC');

const { dfn } = require('../Utils/JS');
const {
  makeVToken,
  fastForward,
  setBalance,
  getBalances,
  adjustBalances,
  pretendBorrow
} = require('../Utils/Venus');

const repayAmount = bnbUnsigned(10e2);
const seizeAmount = repayAmount;
const seizeTokens = seizeAmount.mul(4); // forced
const announcedIncentive = bnbMantissa('1.10');
const treasuryPercent = bnbMantissa('0.05');

async function preApprove(vToken, from, spender, amount, opts = {}) {

  if (dfn(opts.faucet, true)) {
    expect(await send(vToken.underlying, 'harnessSetBalance', [from, amount], { from })).toSucceed();
  }

  return send(vToken.underlying, 'approve', [spender, amount], { from });
}

async function preLiquidate(liquidatorContract, vToken, liquidator, borrower, repayAmount, vTokenCollateral) {
  // setup for success in liquidating
  await send(vToken.comptroller, 'setLiquidateBorrowAllowed', [true]);
  await send(vToken.comptroller, 'setLiquidateBorrowVerify', [true]);
  await send(vToken.comptroller, 'setRepayBorrowAllowed', [true]);
  await send(vToken.comptroller, 'setRepayBorrowVerify', [true]);
  await send(vToken.comptroller, 'setSeizeAllowed', [true]);
  await send(vToken.comptroller, 'setSeizeVerify', [true]);
  await send(vToken.comptroller, 'setFailCalculateSeizeTokens', [false]);
  await send(vToken.comptroller, 'setAnnouncedLiquidationIncentiveMantissa', [announcedIncentive]);

  if (vToken.underlying) {
    await send(vToken.underlying, 'harnessSetFailTransferFromAddress', [liquidator, false]);
  }
  await send(vToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(vTokenCollateral.interestRateModel, 'setFailBorrowRate', [false]);
  await send(vTokenCollateral.comptroller, 'setCalculatedSeizeTokens', [seizeTokens]);
  await setBalance(vTokenCollateral, liquidator, 0);
  await setBalance(vTokenCollateral, borrower, seizeTokens);
  await pretendBorrow(vTokenCollateral, borrower, 0, 1, 0);
  await pretendBorrow(vToken, borrower, 1, 1, repayAmount);
  if (vToken.underlying) {
    await preApprove(vToken, liquidator, liquidatorContract._address, repayAmount);
  }
}

async function liquidate(liquidatorContract, vToken, liquidator, borrower, repayAmount, vTokenCollateral) {
  // make sure to have a block delta so we accrue interest
  await fastForward(vToken, 1);
  await fastForward(vTokenCollateral, 1);
  return send(
    liquidatorContract,
    'liquidateBorrow',
    [vToken._address, borrower, repayAmount, vTokenCollateral._address],
    { from: liquidator }
  );
}

async function liquidatevBnb(liquidatorContract, vToken, liquidator, borrower, repayAmount, vTokenCollateral) {
  // make sure to have a block delta so we accrue interest
  await fastForward(vToken, 1);
  await fastForward(vTokenCollateral, 1);
  return send(
    liquidatorContract,
    'liquidateBorrow',
    [vToken._address, borrower, repayAmount, vTokenCollateral._address],
    { from: liquidator, value: repayAmount }
  );
}

// There are fractional divisions in corresponding calculation in Liquidator.sol, which is 
// equivalate to `toFixed(0, ROUND_FLOOR)` when the results are positive, so we must reproduce this effect
function calculateSplitSeizedTokens(amount) {
  const seizedForRepayment = bnbUnsigned(amount.mul(bnbMantissa('1')).div(announcedIncentive).toFixed(0, BigNumber.ROUND_FLOOR));
  const treasuryDelta = bnbUnsigned(seizedForRepayment.mul(treasuryPercent).div(bnbMantissa('1')).toFixed(0, BigNumber.ROUND_FLOOR));
  const liquidatorDelta = amount.sub(treasuryDelta);
  return { treasuryDelta, liquidatorDelta };
}

describe('Liquidator', function () {
  let root, liquidator, borrower, treasury, accounts;
  let vToken, vTokenCollateral, liquidatorContract, vBnb;

  beforeEach(async () => {
    [root, liquidator, borrower, treasury, ...accounts] = saddle.accounts;
    vToken = await makeVToken({ comptrollerOpts: { kind: 'bool' } });
    vTokenCollateral = await makeVToken({ comptroller: vToken.comptroller });
    vBnb = await makeVToken({ kind: 'vbnb', comptroller: vToken.comptroller });
    liquidatorContract = await deploy(
      'Liquidator', [
      root,
      vBnb._address,
      vToken.comptroller._address,
      treasury,
      treasuryPercent
    ]
    );
  });

  describe('liquidateBorrow', () => {

    beforeEach(async () => {
      await preLiquidate(liquidatorContract, vToken, liquidator, borrower, repayAmount, vTokenCollateral);
    });

    it('returns success from liquidateBorrow and transfers the correct amounts', async () => {
      const beforeBalances = await getBalances([vToken, vTokenCollateral], [treasury, liquidator, borrower]);
      const result = await liquidate(liquidatorContract, vToken, liquidator, borrower, repayAmount, vTokenCollateral);
      const gasCost = await bnbGasCost(result);
      const afterBalances = await getBalances([vToken, vTokenCollateral], [treasury, liquidator, borrower]);

      const { treasuryDelta, liquidatorDelta } = calculateSplitSeizedTokens(seizeTokens);

      expect(result).toHaveLog('LiquidateBorrowedTokens', {
        liquidator,
        borrower,
        repayAmount: repayAmount.toString(),
        vTokenCollateral: vTokenCollateral._address,
        seizeTokensForTreasury: treasuryDelta.toString(),
        seizeTokensForLiquidator: liquidatorDelta.toString()
      });

      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [vToken, 'cash', repayAmount],
        [vToken, 'borrows', -repayAmount],
        [vToken, liquidator, 'bnb', -gasCost],
        [vToken, liquidator, 'cash', -repayAmount],
        [vTokenCollateral, liquidator, 'bnb', -gasCost],
        [vTokenCollateral, liquidator, 'tokens', liquidatorDelta],
        [vTokenCollateral, treasury, 'tokens', treasuryDelta],
        [vToken, borrower, 'borrows', -repayAmount],
        [vTokenCollateral, borrower, 'tokens', -seizeTokens]
      ]));
    });

  });

  describe('liquidate vBNB-Borrow', () => {

    beforeEach(async () => {
      await preLiquidate(liquidatorContract, vBnb, liquidator, borrower, repayAmount, vTokenCollateral);
    });

    it('liquidate-vBNB and returns success from liquidateBorrow and transfers the correct amounts', async () => {
      const beforeBalances = await getBalances([vBnb, vTokenCollateral], [treasury, liquidator, borrower]);
      const result = await liquidatevBnb(liquidatorContract, vBnb, liquidator, borrower, repayAmount, vTokenCollateral);
      const gasCost = await bnbGasCost(result);
      const afterBalances = await getBalances([vBnb, vTokenCollateral], [treasury, liquidator, borrower]);

      const { treasuryDelta, liquidatorDelta } = calculateSplitSeizedTokens(seizeTokens);
      expect(result).toHaveLog('LiquidateBorrowedTokens', {
        liquidator,
        borrower,
        repayAmount: repayAmount.toString(),
        vTokenCollateral: vTokenCollateral._address,
        seizeTokensForTreasury: treasuryDelta.toString(),
        seizeTokensForLiquidator: liquidatorDelta.toString()
      });

      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [vBnb, 'bnb', repayAmount],
        [vBnb, 'borrows', -repayAmount],
        [vBnb, liquidator, 'bnb', -(gasCost.add(repayAmount))],
        [vTokenCollateral, liquidator, 'bnb', -(gasCost.add(repayAmount))],
        [vTokenCollateral, liquidator, 'tokens', liquidatorDelta],
        [vTokenCollateral, treasury, 'tokens', treasuryDelta],
        [vBnb, borrower, 'borrows', -repayAmount],
        [vTokenCollateral, borrower, 'tokens', -seizeTokens]
      ]));
    });

    it('liquidate-vBNB and repay-BNB should return success from liquidateBorrow and transfers the correct amounts', async () => {
      await setBalance(vBnb, borrower, seizeTokens.add(1000));
      const beforeBalances = await getBalances([vBnb, vBnb], [treasury, liquidator, borrower]);
      const result = await liquidatevBnb(liquidatorContract, vBnb, liquidator, borrower, repayAmount, vBnb);
      const gasCost = await bnbGasCost(result);
      const afterBalances = await getBalances([vBnb], [treasury, liquidator, borrower]);

      const { treasuryDelta, liquidatorDelta } = calculateSplitSeizedTokens(seizeTokens);
      expect(result).toHaveLog('LiquidateBorrowedTokens', {
        liquidator,
        borrower,
        repayAmount: repayAmount.toString(),
        vTokenCollateral: vBnb._address,
        seizeTokensForTreasury: treasuryDelta.toString(),
        seizeTokensForLiquidator: liquidatorDelta.toString()
      });

      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [vBnb, 'bnb', repayAmount],
        [vBnb, 'borrows', -repayAmount],
        [vBnb, liquidator, 'bnb', -(gasCost.add(repayAmount))],
        [vBnb, liquidator, 'tokens', liquidatorDelta],
        [vBnb, treasury, 'tokens', treasuryDelta],
        [vBnb, borrower, 'borrows', -repayAmount],
        [vBnb, borrower, 'tokens', -seizeTokens]
      ]));
    });
  });

});