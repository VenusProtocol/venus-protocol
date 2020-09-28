const BigNumber = require('bignumber.js');

const {
  address,
  bnbMantissa
} = require('./Utils/BSC');

const {
  makeVToken,
  makePriceOracle,
} = require('./Utils/Venus');

describe('PriceOracleProxy', () => {
  let root, accounts;
  let oracle, backingOracle, vBnb, vUsdc, vSai, vDai, vUsdt, cOther;
  let daiOracleKey = address(2);

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    vBnb = await makeVToken({kind: "vbnb", comptrollerOpts: {kind: "v1-no-proxy"}, supportMarket: true});
    vUsdc = await makeVToken({comptroller: vBnb.comptroller, supportMarket: true});
    vSai = await makeVToken({comptroller: vBnb.comptroller, supportMarket: true});
    vDai = await makeVToken({comptroller: vBnb.comptroller, supportMarket: true});
    vUsdt = await makeVToken({comptroller: vBnb.comptroller, supportMarket: true});
    cOther = await makeVToken({comptroller: vBnb.comptroller, supportMarket: true});

    backingOracle = await makePriceOracle();
    oracle = await deploy('PriceOracleProxy',
      [
        root,
        backingOracle._address,
        vBnb._address,
        vUsdc._address,
        vSai._address,
        vDai._address,
        vUsdt._address
      ]
     );
  });

  describe("constructor", () => {
    it("sets address of guardian", async () => {
      let configuredGuardian = await call(oracle, "guardian");
      expect(configuredGuardian).toEqual(root);
    });

    it("sets address of v1 oracle", async () => {
      let configuredOracle = await call(oracle, "v1PriceOracle");
      expect(configuredOracle).toEqual(backingOracle._address);
    });

    it("sets address of vBnb", async () => {
      let configuredVBNB = await call(oracle, "vBnbAddress");
      expect(configuredVBNB).toEqual(vBnb._address);
    });

    it("sets address of vUSDC", async () => {
      let configuredCUSD = await call(oracle, "vUsdcAddress");
      expect(configuredCUSD).toEqual(vUsdc._address);
    });

    it("sets address of vSAI", async () => {
      let configuredCSAI = await call(oracle, "vSaiAddress");
      expect(configuredCSAI).toEqual(vSai._address);
    });

    it("sets address of vDAI", async () => {
      let configuredVDAI = await call(oracle, "vDaiAddress");
      expect(configuredVDAI).toEqual(vDai._address);
    });

    it("sets address of vUSDT", async () => {
      let configuredCUSDT = await call(oracle, "vUsdtAddress");
      expect(configuredCUSDT).toEqual(vUsdt._address);
    });
  });

  describe("getUnderlyingPrice", () => {
    let setAndVerifyBackingPrice = async (vToken, price) => {
      await send(
        backingOracle,
        "setUnderlyingPrice",
        [vToken._address, bnbMantissa(price)]);

      let backingOraclePrice = await call(
        backingOracle,
        "assetPrices",
        [vToken.underlying._address]);

      expect(Number(backingOraclePrice)).toEqual(price * 1e18);
    };

    let readAndVerifyProxyPrice = async (token, price) =>{
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [token._address]);
      expect(Number(proxyPrice)).toEqual(price * 1e18);;
    };

    it("always returns 1e18 for vBnb", async () => {
      await readAndVerifyProxyPrice(vBnb, 1);
    });

    it("uses address(1) for USDC and address(2) for vdai", async () => {
      await send(backingOracle, "setDirectPrice", [address(1), bnbMantissa(5e12)]);
      await send(backingOracle, "setDirectPrice", [address(2), bnbMantissa(8)]);
      await readAndVerifyProxyPrice(vDai, 8);
      await readAndVerifyProxyPrice(vUsdc, 5e12);
      await readAndVerifyProxyPrice(vUsdt, 5e12);
    });

    it("proxies for whitelisted tokens", async () => {
      await setAndVerifyBackingPrice(cOther, 11);
      await readAndVerifyProxyPrice(cOther, 11);

      await setAndVerifyBackingPrice(cOther, 37);
      await readAndVerifyProxyPrice(cOther, 37);
    });

    it("returns 0 for token without a price", async () => {
      let unlistedToken = await makeVToken({comptroller: vBnb.comptroller});

      await readAndVerifyProxyPrice(unlistedToken, 0);
    });

    it("correctly handle setting SAI price", async () => {
      await send(backingOracle, "setDirectPrice", [daiOracleKey, bnbMantissa(0.01)]);

      await readAndVerifyProxyPrice(vDai, 0.01);
      await readAndVerifyProxyPrice(vSai, 0.01);

      await send(oracle, "setSaiPrice", [bnbMantissa(0.05)]);

      await readAndVerifyProxyPrice(vDai, 0.01);
      await readAndVerifyProxyPrice(vSai, 0.05);

      await expect(send(oracle, "setSaiPrice", [1])).rejects.toRevert("revert SAI price may only be set once");
    });

    it("only guardian may set the sai price", async () => {
      await expect(send(oracle, "setSaiPrice", [1], {from: accounts[0]})).rejects.toRevert("revert only guardian may set the SAI price");
    });

    it("sai price must be bounded", async () => {
      await expect(send(oracle, "setSaiPrice", [bnbMantissa(10)])).rejects.toRevert("revert SAI price must be < 0.1 BNB");
    });
});
});
