const { makeComptroller, makeVToken, enterMarkets, quickMint, setMarketSupplyCap } = require("../Utils/Venus");

describe("Comptroller", () => {
  let root, accounts; // eslint-disable-line @typescript-eslint/no-unused-vars

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
  });

  describe("liquidity", () => {
    it("fails if a price has not been set", async () => {
      const vToken = await makeVToken({ supportMarket: true });
      await enterMarkets([vToken], accounts[1]);
      let result = await call(vToken.comptroller, "getAccountLiquidity", [accounts[1]]);
      expect(result).toHaveTrollError("PRICE_ERROR");
    });

    it("allows a borrow up to collateralFactor, but not more", async () => {
      const collateralFactor = 0.5,
        underlyingPrice = 1,
        user = accounts[1],
        amount = 1e6;
      const vToken = await makeVToken({ supportMarket: true, collateralFactor, underlyingPrice });
      await setMarketSupplyCap(vToken.comptroller, [vToken._address], [100000000000]);

      let liquidity, shortfall;

      // not in market yet, hypothetical borrow should have no effect
      ({ 1: liquidity, 2: shortfall } = await call(vToken.comptroller, "getHypotheticalAccountLiquidity", [
        user,
        vToken._address,
        0,
        amount,
      ]));
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(0);

      await enterMarkets([vToken], user);
      await quickMint(vToken, user, amount);

      // total account liquidity after supplying `amount`
      ({ 1: liquidity, 2: shortfall } = await call(vToken.comptroller, "getAccountLiquidity", [user]));
      expect(liquidity).toEqualNumber(amount * collateralFactor);
      expect(shortfall).toEqualNumber(0);

      // hypothetically borrow `amount`, should shortfall over collateralFactor
      ({ 1: liquidity, 2: shortfall } = await call(vToken.comptroller, "getHypotheticalAccountLiquidity", [
        user,
        vToken._address,
        0,
        amount,
      ]));
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(amount * (1 - collateralFactor));

      // hypothetically redeem `amount`, should be back to even
      ({ 1: liquidity, 2: shortfall } = await call(vToken.comptroller, "getHypotheticalAccountLiquidity", [
        user,
        vToken._address,
        amount,
        0,
      ]));
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(0);
    }, 300000);

    it("allows entering 3 markets, supplying to 2 and borrowing up to collateralFactor in the 3rd", async () => {
      const amount1 = 1e6,
        amount2 = 1e3,
        user = accounts[1];
      const cf1 = 0.5,
        cf2 = 0.666,
        cf3 = 0,
        up1 = 3,
        up2 = 2.718,
        up3 = 1;
      const c1 = amount1 * cf1 * up1,
        c2 = amount2 * cf2 * up2,
        collateral = Math.floor(c1 + c2);
      const vToken1 = await makeVToken({ supportMarket: true, collateralFactor: cf1, underlyingPrice: up1 });
      await setMarketSupplyCap(vToken1.comptroller, [vToken1._address], [100000000000]);
      const vToken2 = await makeVToken({
        supportMarket: true,
        comptroller: vToken1.comptroller,
        collateralFactor: cf2,
        underlyingPrice: up2,
      });
      await setMarketSupplyCap(vToken2.comptroller, [vToken2._address], [100000000000]);
      const vToken3 = await makeVToken({
        supportMarket: true,
        comptroller: vToken1.comptroller,
        collateralFactor: cf3,
        underlyingPrice: up3,
      });
      await setMarketSupplyCap(vToken3.comptroller, [vToken3._address], [100000000000]);

      await enterMarkets([vToken1, vToken2, vToken3], user);
      await quickMint(vToken1, user, amount1);
      await quickMint(vToken2, user, amount2);

      let error, liquidity, shortfall;

      ({ 0: error, 1: liquidity, 2: shortfall } = await call(vToken3.comptroller, "getAccountLiquidity", [user]));
      expect(error).toEqualNumber(0);
      expect(liquidity).toEqualNumber(collateral);
      expect(shortfall).toEqualNumber(0);

      ({ 1: liquidity, 2: shortfall } = await call(vToken3.comptroller, "getHypotheticalAccountLiquidity", [
        user,
        vToken3._address,
        Math.floor(c2),
        0,
      ]));
      expect(liquidity).toEqualNumber(collateral);
      expect(shortfall).toEqualNumber(0);

      ({ 1: liquidity, 2: shortfall } = await call(vToken3.comptroller, "getHypotheticalAccountLiquidity", [
        user,
        vToken3._address,
        0,
        Math.floor(c2),
      ]));
      expect(liquidity).toEqualNumber(c1);
      expect(shortfall).toEqualNumber(0);

      ({ 1: liquidity, 2: shortfall } = await call(vToken3.comptroller, "getHypotheticalAccountLiquidity", [
        user,
        vToken3._address,
        0,
        collateral + c1,
      ]));
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(c1);

      ({ 1: liquidity, 2: shortfall } = await call(vToken1.comptroller, "getHypotheticalAccountLiquidity", [
        user,
        vToken1._address,
        amount1,
        0,
      ]));
      expect(liquidity).toEqualNumber(Math.floor(c2));
      expect(shortfall).toEqualNumber(0);
    });
  });

  describe("getAccountLiquidity", () => {
    it("returns 0 if not 'in' any markets", async () => {
      const comptroller = await makeComptroller();
      const { 0: error, 1: liquidity, 2: shortfall } = await call(comptroller, "getAccountLiquidity", [accounts[0]]);
      expect(error).toEqualNumber(0);
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(0);
    });
  });

  describe("getHypotheticalAccountLiquidity", () => {
    it("returns 0 if not 'in' any markets", async () => {
      const vToken = await makeVToken();
      await setMarketSupplyCap(vToken.comptroller, [vToken._address], [100000000000]);
      const {
        0: error,
        1: liquidity,
        2: shortfall,
      } = await call(vToken.comptroller, "getHypotheticalAccountLiquidity", [accounts[0], vToken._address, 0, 0]);
      expect(error).toEqualNumber(0);
      expect(liquidity).toEqualNumber(0);
      expect(shortfall).toEqualNumber(0);
    });

    it("returns collateral factor times dollar amount of tokens minted in a single market", async () => {
      const collateralFactor = 0.5,
        exchangeRate = 1,
        underlyingPrice = 1;
      const vToken = await makeVToken({ supportMarket: true, collateralFactor, exchangeRate, underlyingPrice });
      await setMarketSupplyCap(vToken.comptroller, [vToken._address], [100000000000]);
      const from = accounts[0],
        balance = 1e7,
        amount = 1e6;
      await enterMarkets([vToken], from);
      await send(vToken.underlying, "harnessSetBalance", [from, balance], { from });
      await send(vToken.underlying, "approve", [vToken._address, balance], { from });
      await send(vToken, "mint", [amount], { from });
      const {
        0: error,
        1: liquidity,
        2: shortfall,
      } = await call(vToken.comptroller, "getHypotheticalAccountLiquidity", [from, vToken._address, 0, 0]);
      expect(error).toEqualNumber(0);
      expect(liquidity).toEqualNumber(amount * collateralFactor * exchangeRate * underlyingPrice);
      expect(shortfall).toEqualNumber(0);
    });
  });
});
