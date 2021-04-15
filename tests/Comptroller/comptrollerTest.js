const {
  bnbMantissa,
  both
} = require('../Utils/BSC');

const {
  makeComptroller,
  makePriceOracle,
  makeVToken,
  makeToken
} = require('../Utils/Venus');

describe('Comptroller', () => {
  let root, accounts;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
  });

  describe('constructor', () => {
    it("on success it sets admin to creator and pendingAdmin is unset", async () => {
      const comptroller = await makeComptroller();
      expect(await call(comptroller, 'admin')).toEqual(root);
      expect(await call(comptroller, 'pendingAdmin')).toEqualNumber(0);
    });

    it("on success it sets closeFactor as specified", async () => {
      const comptroller = await makeComptroller();
      expect(await call(comptroller, 'closeFactorMantissa')).toEqualNumber(0.051e18);
    });
  });

  describe('_setLiquidationIncentive', () => {
    const initialIncentive = bnbMantissa(1.0);
    const validIncentive = bnbMantissa(1.1);
    const tooSmallIncentive = bnbMantissa(0.99999);
    const tooLargeIncentive = bnbMantissa(1.50000001);

    let comptroller;
    beforeEach(async () => {
      comptroller = await makeComptroller();
    });

    it("fails if called by non-admin", async () => {
      const {reply, receipt} = await both(comptroller, '_setLiquidationIncentive', [initialIncentive], {from: accounts[0]});
      expect(reply).toHaveTrollError('UNAUTHORIZED');
      expect(receipt).toHaveTrollFailure('UNAUTHORIZED', 'SET_LIQUIDATION_INCENTIVE_OWNER_CHECK');
      expect(await call(comptroller, 'liquidationIncentiveMantissa')).toEqualNumber(initialIncentive);
    });

    it("accepts a valid incentive and emits a NewLiquidationIncentive event", async () => {
      const {reply, receipt} = await both(comptroller, '_setLiquidationIncentive', [validIncentive]);
      expect(reply).toHaveTrollError('NO_ERROR');
      expect(receipt).toHaveLog('NewLiquidationIncentive', {
        oldLiquidationIncentiveMantissa: initialIncentive.toString(),
        newLiquidationIncentiveMantissa: validIncentive.toString()
      });
      expect(await call(comptroller, 'liquidationIncentiveMantissa')).toEqualNumber(validIncentive);
    });
  });

  describe('_setPriceOracle', () => {
    let comptroller, oldOracle, newOracle;
    beforeEach(async () => {
      comptroller = await makeComptroller();
      oldOracle = comptroller.priceOracle;
      newOracle = await makePriceOracle();
    });

    it("fails if called by non-admin", async () => {
      expect(
        await send(comptroller, '_setPriceOracle', [newOracle._address], {from: accounts[0]})
      ).toHaveTrollFailure('UNAUTHORIZED', 'SET_PRICE_ORACLE_OWNER_CHECK');
      expect(await comptroller.methods.oracle().call()).toEqual(oldOracle._address);
    });

    it.skip("reverts if passed a contract that doesn't implement isPriceOracle", async () => {
      await expect(send(comptroller, '_setPriceOracle', [comptroller._address])).rejects.toRevert();
      expect(await call(comptroller, 'oracle')).toEqual(oldOracle._address);
    });

    it.skip("reverts if passed a contract that implements isPriceOracle as false", async () => {
      await send(newOracle, 'setIsPriceOracle', [false]); // Note: not yet implemented
      await expect(send(notOracle, '_setPriceOracle', [comptroller._address])).rejects.toRevert("revert oracle method isPriceOracle returned false");
      expect(await call(comptroller, 'oracle')).toEqual(oldOracle._address);
    });

    it("accepts a valid price oracle and emits a NewPriceOracle event", async () => {
      const result = await send(comptroller, '_setPriceOracle', [newOracle._address]);
      expect(result).toSucceed();
      expect(result).toHaveLog('NewPriceOracle', {
        oldPriceOracle: oldOracle._address,
        newPriceOracle: newOracle._address
      });
      expect(await call(comptroller, 'oracle')).toEqual(newOracle._address);
    });
  });

  describe('_setCloseFactor', () => {
    it("fails if not called by admin", async () => {
      const vToken = await makeVToken();
      await expect(
        send(vToken.comptroller, '_setCloseFactor', [1], {from: accounts[0]})
      ).rejects.toRevert('revert only admin can set close factor');
    });
  });

  describe('_setCollateralFactor', () => {
    const half = bnbMantissa(0.5);
    const one = bnbMantissa(1);

    it("fails if not called by admin", async () => {
      const vToken = await makeVToken();
      expect(
        await send(vToken.comptroller, '_setCollateralFactor', [vToken._address, half], {from: accounts[0]})
      ).toHaveTrollFailure('UNAUTHORIZED', 'SET_COLLATERAL_FACTOR_OWNER_CHECK');
    });

    it("fails if asset is not listed", async () => {
      const vToken = await makeVToken();
      expect(
        await send(vToken.comptroller, '_setCollateralFactor', [vToken._address, half])
      ).toHaveTrollFailure('MARKET_NOT_LISTED', 'SET_COLLATERAL_FACTOR_NO_EXISTS');
    });

    it("fails if factor is set without an underlying price", async () => {
      const vToken = await makeVToken({supportMarket: true});
      expect(
        await send(vToken.comptroller, '_setCollateralFactor', [vToken._address, half])
      ).toHaveTrollFailure('PRICE_ERROR', 'SET_COLLATERAL_FACTOR_WITHOUT_PRICE');
    });

    it("succeeds and sets market", async () => {
      const vToken = await makeVToken({supportMarket: true, underlyingPrice: 1});
      const result = await send(vToken.comptroller, '_setCollateralFactor', [vToken._address, half]);
      expect(result).toHaveLog('NewCollateralFactor', {
        vToken: vToken._address,
        oldCollateralFactorMantissa: '0',
        newCollateralFactorMantissa: half.toString()
      });
    });
  });

  describe('_supportMarket', () => {
    it("fails if not called by admin", async () => {
      const vToken = await makeVToken(root);
      expect(
        await send(vToken.comptroller, '_supportMarket', [vToken._address], {from: accounts[0]})
      ).toHaveTrollFailure('UNAUTHORIZED', 'SUPPORT_MARKET_OWNER_CHECK');
    });

    it("fails if asset is not a VToken", async () => {
      const comptroller = await makeComptroller()
      const asset = await makeToken(root);
      await expect(send(comptroller, '_supportMarket', [asset._address])).rejects.toRevert();
    });

    it("succeeds and sets market", async () => {
      const vToken = await makeVToken();
      const result = await send(vToken.comptroller, '_supportMarket', [vToken._address]);
      expect(result).toHaveLog('MarketListed', {vToken: vToken._address});
    });

    it("cannot list a market a second time", async () => {
      const vToken = await makeVToken();
      const result1 = await send(vToken.comptroller, '_supportMarket', [vToken._address]);
      const result2 = await send(vToken.comptroller, '_supportMarket', [vToken._address]);
      expect(result1).toHaveLog('MarketListed', {vToken: vToken._address});
      expect(result2).toHaveTrollFailure('MARKET_ALREADY_LISTED', 'SUPPORT_MARKET_EXISTS');
    });

    it("can list two different markets", async () => {
      const vToken1 = await makeVToken();
      const vToken2 = await makeVToken({comptroller: vToken1.comptroller});
      const result1 = await send(vToken1.comptroller, '_supportMarket', [vToken1._address]);
      const result2 = await send(vToken1.comptroller, '_supportMarket', [vToken2._address]);
      expect(result1).toHaveLog('MarketListed', {vToken: vToken1._address});
      expect(result2).toHaveLog('MarketListed', {vToken: vToken2._address});
    });
  });

  describe('redeemVerify', () => {
    it('should allow you to redeem 0 underlying for 0 tokens', async () => {
      const comptroller = await makeComptroller();
      const vToken = await makeVToken({comptroller: comptroller});
      await call(comptroller, 'redeemVerify', [vToken._address, accounts[0], 0, 0]);
    });

    it('should allow you to redeem 5 underlyig for 5 tokens', async () => {
      const comptroller = await makeComptroller();
      const vToken = await makeVToken({comptroller: comptroller});
      await call(comptroller, 'redeemVerify', [vToken._address, accounts[0], 5, 5]);
    });

    it('should not allow you to redeem 5 underlying for 0 tokens', async () => {
      const comptroller = await makeComptroller();
      const vToken = await makeVToken({comptroller: comptroller});
      await expect(call(comptroller, 'redeemVerify', [vToken._address, accounts[0], 5, 0])).rejects.toRevert("revert redeemTokens zero");
    });
  })
});
