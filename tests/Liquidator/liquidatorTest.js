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
  await send(vToken.underlying, 'harnessSetFailTransferFromAddress', [liquidator, false]);
  await send(vToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(vTokenCollateral.interestRateModel, 'setFailBorrowRate', [false]);
  await send(vTokenCollateral.comptroller, 'setCalculatedSeizeTokens', [seizeTokens]);
  await setBalance(vTokenCollateral, liquidator, 0);
  await setBalance(vTokenCollateral, borrower, seizeTokens);
  await pretendBorrow(vTokenCollateral, borrower, 0, 1, 0);
  await pretendBorrow(vToken, borrower, 1, 1, repayAmount);
  await preApprove(vToken, liquidator, liquidatorContract._address, repayAmount);
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

function calculateSplitSeizedTokens(amount) {
  const treasuryDelta =
      amount
        .mul(bnbMantissa('1')).div(announcedIncentive) // / 1.1
        .mul(treasuryPercent).div(bnbMantissa('1'));   // * 0.05
  const liquidatorDelta = amount.sub(treasuryDelta);
  return { treasuryDelta, liquidatorDelta };
}

describe('Liquidator', function () {
  let root, liquidator, borrower, treasury, accounts;
  let vToken, vTokenCollateral, liquidatorContract;

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
    await preLiquidate(liquidatorContract, vToken, liquidator, borrower, repayAmount, vTokenCollateral);
  });

  describe('liquidateBorrow', () => {
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
});