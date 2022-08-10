const {
  makeVToken,
  setMarketSupplyCap,
  enterMarkets,
  quickMint,
} = require('./Utils/Venus')

async function preBorrow(vToken, borrower, borrowAmount) {
  await send(vToken.interestRateModel, 'setFailBorrowRate', [false])
  await send(vToken.underlying, 'harnessSetBalance', [
    vToken._address,
    borrowAmount,
  ])
  await send(vToken, 'harnessSetFailTransferToAddress', [borrower, false])
  await send(vToken, 'harnessSetAccountBorrows', [borrower, 0, 0])
  await send(vToken, 'harnessSetTotalBorrows', [0])
}

describe('VToken', function () {
  describe('borrow', () => {
    it('test', async () => {
      const [root, ...accounts] = saddle.accounts
      const amount1 = 1e6,
        amount2 = 1e3,
        user = accounts[1]
      const cf1 = 0.5,
        cf2 = 0.666,
        cf3 = 0,
        up1 = 3,
        up2 = 2.718,
        up3 = 1
      const c1 = amount1 * cf1 * up1,
        c2 = amount2 * cf2 * up2,
        collateral = Math.floor(c1 + c2)
      const vToken1 = await makeVToken({
        supportMarket: true,
        collateralFactor: cf1,
        underlyingPrice: up1,
      })
      await setMarketSupplyCap(
        vToken1.comptroller,
        [vToken1._address],
        [100000000000],
      )
      const vToken2 = await makeVToken({
        supportMarket: true,
        comptroller: vToken1.comptroller,
        collateralFactor: cf2,
        underlyingPrice: up2,
      })
      await setMarketSupplyCap(
        vToken2.comptroller,
        [vToken2._address],
        [100000000000],
      )
      const vToken3 = await makeVToken({
        supportMarket: true,
        comptroller: vToken1.comptroller,
        collateralFactor: cf3,
        underlyingPrice: up3,
        kind: 'evilX',
        symbol: 'XToken',
      })
      await setMarketSupplyCap(
        vToken3.comptroller,
        [vToken3._address],
        [100000000000],
      )

      await enterMarkets([vToken1, vToken2, vToken3], user)
      await quickMint(vToken1, user, amount1 + amount2)
      ;({
        0: error,
        1: liquidity,
        2: shortfall,
      } = await call(vToken3.comptroller, 'getAccountLiquidity', [user]))
      expect(liquidity).toBe("1501500");

      // Pre borrow steps.
      await preBorrow(vToken3, user, amount1)

      // Setting the address of the token, which attacker wants to borrow more through malicious doTransferOut
      await send(vToken3, 'setTokenAddress', [vToken2._address])

      // BorrowAllowed will throw COMPTROLLER_REJECTION, BORROW_COMPTROLLER_REJECTION errors as user has no sufficient liquity to borrow
      expect(await send(vToken3, 'borrow', [amount1], { from: user })).toHaveTokenFailure('COMPTROLLER_REJECTION', 'BORROW_COMPTROLLER_REJECTION');
    })
  })
})
