const {
  bnbMantissa,
  both,
  address,
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
      await expect(
        send(comptroller, '_setLiquidationIncentive', [initialIncentive], {from: accounts[0]})
      ).rejects.toRevert('revert only admin can');
      expect(await call(comptroller, 'liquidationIncentiveMantissa')).toEqualNumber(initialIncentive);
    });

    it("fails if incentive is less than 1e18", async () => {
      await expect(
        send(comptroller, '_setLiquidationIncentive', [tooSmallIncentive], {from: root})
      ).rejects.toRevert('revert incentive must be over 1e18');
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

  describe('Non zero address check', () => {
    beforeEach(async () => {
      comptroller = await makeComptroller();
    });

    async function testZeroAddress(funcName, args) {
      it(funcName, async () => {
        await expect(
          send(comptroller, funcName, args, {from: root})
        ).rejects.toRevert('revert can\'t be zero address');
      });
    }
    testZeroAddress('_setPriceOracle', [address(0)]);
    testZeroAddress('_setCollateralFactor', [address(0), 0]);
    testZeroAddress('_setPauseGuardian', [address(0)]);
    testZeroAddress('_setBorrowCapGuardian', [address(0)]);
    testZeroAddress('_setSupplyCapGuardian', [address(0)]);
    testZeroAddress('_setVAIController', [address(0)]);
    testZeroAddress('_setTreasuryData', [address(0), address(0), 0]);
    testZeroAddress('_setComptrollerLens', [address(0)]);
    testZeroAddress('_setVAIVaultInfo', [address(0), 0, 0]);
    testZeroAddress('_setVenusSpeed', [address(0), 0]);
  })

  describe('_setPriceOracle', () => {
    let comptroller, oldOracle, newOracle;
    beforeEach(async () => {
      comptroller = await makeComptroller();
      oldOracle = comptroller.priceOracle;
      newOracle = await makePriceOracle();
    });

    it("fails if called by non-admin", async () => {
      await expect(
        send(comptroller, '_setPriceOracle', [newOracle._address], {from: accounts[0]})
      ).rejects.toRevert('revert only admin can');

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

  describe('_setComptrollerLens', () => {
    let comptroller;
  
    beforeEach(async () => {
      comptroller = await makeComptroller();
    });

    it("fails if not called by admin", async () => {
      const comptrollerLens = await deploy('ComptrollerLens');
      await expect(
        send(comptroller, '_setComptrollerLens', [comptrollerLens._address], {from: accounts[0]})
      ).rejects.toRevert('revert only admin can');
    });

    it("should fire an event", async () => {
      const newComptrollerLens = await deploy('ComptrollerLens');
      const oldComptrollerLensAddress = await call(comptroller, 'comptrollerLens', []);
      const result = await send(comptroller, '_setComptrollerLens', [newComptrollerLens._address], {from: root})
      expect(result).toHaveLog('NewComptrollerLens', {
        oldComptrollerLens: oldComptrollerLensAddress,
        newComptrollerLens: newComptrollerLens._address,
      });
    });
  });

  describe('_setCloseFactor', () => {
    it("fails if not called by admin", async () => {
      const vToken = await makeVToken();
      await expect(
        send(vToken.comptroller, '_setCloseFactor', [1], {from: accounts[0]})
      ).rejects.toRevert('revert only admin can');
    });
  });

  describe('_setCollateralFactor', () => {
    const half = bnbMantissa(0.5);
    const one = bnbMantissa(1);

    it("fails if not called by admin", async () => {
      const vToken = await makeVToken();
      await expect(
        send(vToken.comptroller, '_setCollateralFactor', [vToken._address, half], {from: accounts[0]})
      ).rejects.toRevert('revert only admin can');
    });

    it("fails if asset is not listed", async () => {
      const vToken = await makeVToken();
      await expect(
        send(vToken.comptroller, '_setCollateralFactor', [vToken._address, half])
      ).rejects.toRevert('revert market not listed');
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
      await expect(
        send(vToken.comptroller, '_supportMarket', [vToken._address], {from: accounts[0]})
      ).rejects.toRevert('revert only admin can');
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
