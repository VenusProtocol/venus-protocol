const {
  makeChainlinkOracle,
  makeVToken,
} = require("./Utils/Venus");

const {
  increaseTime, bnbMantissa
} = require('./Utils/BSC');

describe("VenusChainlinkOracle", () => {
  let root, accounts;
  let bnbFeed, daiFeed, usdcFeed, usdtFeed;
  let oracle, vBnb, vDai, vExampleSet, vExampleUnset, vToken, vUsdc, vUsdt, vai, xvs;

  const MAX_STALE_PERIOD = 100 * 60; // 100min, just for test

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    vToken = await makeVToken();
    vBnb = await makeVToken({kind: "vbnb",
      comptrollerOpts: {kind: "v1-no-proxy"},
      supportMarket: true
    });
    vai = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
      symbol: "VAI"
    });
    xvs = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
      symbol: "XVS"
    });
    vExampleSet = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
    });
    vExampleUnset = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
    });
    vUsdc = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
      underlyingOpts: {
        decimals: 6,
        symbol: "USDC"
      }
    });
    vUsdt = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
      underlyingOpts: {
        decimals: 6,
        symbol: "USDT"
      }
    });
    vDai = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
      underlyingOpts: {
        decimals: 18,
        symbol: "DAI"
      }
    });
    bnbFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 30000000000});
    usdcFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 100000000});
    usdtFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 100000000});
    daiFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 100000000});
    oracle = await deploy("VenusChainlinkOracle", []);
  });

  describe("constructor", () => {
    it("sets address of admin", async () => {
      let admin = await call(oracle, "admin");
      expect(admin).toEqual(root);
    });
  });

  describe("setFeed", () => {
    it("only admin may set a feed", async () => {
      await expect(
        send(oracle, "setFeed", ["vBNB", bnbFeed._address, MAX_STALE_PERIOD], {from: accounts[0]})
      ).rejects.toRevert("revert only admin may call");
    });

    it("cannot set feed to self address", async () => {
      await expect(
        send(oracle, "setFeed", ["vBNB", oracle._address, MAX_STALE_PERIOD], {from: root})
      ).rejects.toRevert("revert invalid feed address");
    });

    it("cannot set feed to zero address", async () => {
      await expect(
        send(
          oracle,
          "setFeed",
          ["vBNB", "0x0000000000000000000000000000000000000000", MAX_STALE_PERIOD],
          {from: root}
        )
      ).rejects.toRevert("revert invalid feed address");
    });

    it("sets a feed", async () => {
      await send(oracle, "setFeed", ["vBNB", bnbFeed._address, MAX_STALE_PERIOD], {from: root});
      let feed = await call(oracle, "getFeed", ["vBNB"]);
      expect(feed).toEqual(bnbFeed._address);
    });
  });

  describe('batch set feeds', () => {
    it("only admin may set a feed", async () => {
      await expect(
        send(oracle, "batchSetFeeds", [["vBNB"], [bnbFeed._address], [MAX_STALE_PERIOD]], {from: accounts[0]})
      ).rejects.toRevert("revert only admin may call");
    });

    it("cannot set feed to self address", async () => {
      await expect(
        send(oracle, "batchSetFeeds", [["vBNB"], [oracle._address], [MAX_STALE_PERIOD]], {from: root})
      ).rejects.toRevert("revert invalid feed address");
    });

    it('cannot set feed to zero address', async () => {
      await expect(
        send(
          oracle,
          "batchSetFeeds",
          [["vBNB"], ["0x0000000000000000000000000000000000000000"], [MAX_STALE_PERIOD]],
          {from: root}
        )
      ).rejects.toRevert("revert invalid feed address");
    });

    it('parameter length check', async () => {
      await expect(
        send(oracle, "batchSetFeeds",
          [["vBNB", "vUSDT"], ["0x0000000000000000000000000000000000000000"], [MAX_STALE_PERIOD]],
          {from: root}
        )
      ).rejects.toRevert("revert invalid length");
      await expect(
        send(oracle, "batchSetFeeds",
          [["vBNB", "vUSDT"], ["0x0000000000000000000000000000000000000000"], [MAX_STALE_PERIOD, MAX_STALE_PERIOD]],
          {from: root}
        )
      ).rejects.toRevert("revert invalid length");
      await expect(
        send(oracle, "batchSetFeeds",
          [[], [], []],
          {from: root}
        )
      ).rejects.toRevert("revert empty feeds");
    });

    it("set multiple feeds", async () => {
      await send(oracle, "batchSetFeeds", [
        ["vBNB", "vUSDT"], 
        [bnbFeed._address, usdtFeed._address], 
        [2 * MAX_STALE_PERIOD, 3 * MAX_STALE_PERIOD]
      ], {from: root});
      let newBnbFeed = await call(oracle, "getFeed", ["vBNB"]);
      let newUsdtFeed = await call(oracle, "getFeed", ["vUSDT"]);
      let newBnbStalePeriod = await call(oracle, "getMaxStalePeriod", [bnbFeed._address]);
      let newUsdtStalePeriod = await call(oracle, "getMaxStalePeriod", [usdtFeed._address]);
      expect(newBnbFeed).toEqual(bnbFeed._address);
      expect(newUsdtFeed).toEqual(usdtFeed._address);
      expect(newBnbStalePeriod).toEqualNumber(2 * MAX_STALE_PERIOD);
      expect(newUsdtStalePeriod).toEqualNumber(3 * MAX_STALE_PERIOD);
    });
  });

  describe("getUnderlyingPrice", () => {
    beforeEach(async () => {
      await send(oracle, "setFeed", ["vBNB", bnbFeed._address, MAX_STALE_PERIOD], {from: root});
      await send(oracle, "setFeed", ["USDC", usdcFeed._address, MAX_STALE_PERIOD], {from: root});
      await send(oracle, "setFeed", ["USDT", usdtFeed._address, MAX_STALE_PERIOD], {from: root});
      await send(oracle, "setFeed", ["DAI", daiFeed._address, MAX_STALE_PERIOD], {from: root});
      await send(oracle, "setDirectPrice", [xvs._address, 7], {from: root});
      await send(oracle, "setUnderlyingPrice", [vExampleSet._address, 1], {from: root});
    });

    it("gets the price from Chainlink for vBNB", async () => {
      let price = await call(oracle, "getUnderlyingPrice", [vBnb._address], {from: root});
      expect(price).toEqual("300000000000000000000");
    });

    it("gets the price from Chainlink for USDC", async () => {
      let price = await call(oracle, "getUnderlyingPrice", [vUsdc._address], {from: root});
      expect(price).toEqual("1000000000000000000000000000000");
    });

    it("gets the price from Chainlink for USDT", async () => {
      let price = await call(oracle, "getUnderlyingPrice", [vUsdt._address], {from: root});
      expect(price).toEqual("1000000000000000000000000000000");
    });

    it("gets the price from Chainlink for DAI", async () => {
      let price = await call(oracle, "getUnderlyingPrice", [vDai._address], {from: root});
      expect(price).toEqual("1000000000000000000");
    });

    it("gets the direct price of VAI", async () => {
      let price = await call(
        oracle,
        "getUnderlyingPrice",
        [vai._address],
        {from: root}
      );
      expect(price).toEqual("1000000000000000000");
    });

    it("gets the constant price of XVS", async () => {
      let price = await call(
        oracle,
        "getUnderlyingPrice",
        [xvs._address],
        {from: root}
      );
      expect(price).toEqual("7");
    });

    it("gets the direct price of a set asset", async () => {
      let price = await call(
        oracle,
        "getUnderlyingPrice",
        [vExampleSet._address],
        {from: root}
      );
      expect(price).toEqual("1");
    });

    it("reverts if no price or feed has been set", async () => {
      await expect(
        send(oracle, "getUnderlyingPrice", [vExampleUnset._address], {from: root})
      ).rejects.toRevert();
    });
  });

  describe("setUnderlyingPrice", () => {
    it("only admin may set an underlying price", async () => {
      await expect(
        send(oracle, "setUnderlyingPrice", [vExampleSet._address, 1], {from: accounts[0]})
      ).rejects.toRevert("revert only admin may call");
    });

    it("sets the underlying price", async () => {
      await send(oracle, "setUnderlyingPrice", [vExampleSet._address, 1], {from: root});
      let underlying = await call(vExampleSet, "underlying", []);
      let price = await call(oracle, "assetPrices", [underlying], {from: root});
      expect(price).toEqual("1");
    });
  });

  describe("setDirectPrice", () => {
    it("only admin may set an underlying price", async () => {
      await expect(
        send(oracle, "setDirectPrice", [xvs._address, 7], {from: accounts[0]})
      ).rejects.toRevert("revert only admin may call");
    });

    it("sets the direct price", async () => {
      await send(oracle, "setDirectPrice", [xvs._address, 7], {from: root});
      let price = await call(oracle, "assetPrices", [xvs._address], {from: root});
      expect(price).toEqual("7");
    });
  });

  describe('stale price validation', () => {
    beforeEach(async () => {
      await send(oracle, "setFeed", ["vBNB", bnbFeed._address, MAX_STALE_PERIOD], {from: root})
    });

    it('stale price period cannot be 0', async () => {
      await expect(
        send(oracle, 'setFeed', ["vBNB", bnbFeed._address, 0], {from: root})
      ).rejects.toRevert('revert stale period can\'t be zero');
    });

    it('modify stale price period will emit an event', async () => {
      const result = await send(oracle, 'setFeed', ["vBNB", bnbFeed._address, MAX_STALE_PERIOD], {from: root})
      expect(result).toHaveLog('FeedSet', {
        feed: bnbFeed._address,
        symbol: 'vBNB',
        maxStalePeriod: MAX_STALE_PERIOD
      });
    });

    it('get underlying will return 0 if price stale', async () => {
      const ADVANCE_SECONDS = 90000;
      let price = await call(oracle, "getUnderlyingPrice", [vBnb._address], {from: root});
      expect(price).toEqual('300000000000000000000');
      await increaseTime(ADVANCE_SECONDS);
      price = await call(oracle, "getUnderlyingPrice", [vBnb._address], {from: root});
      expect(price).toEqual('0');
      // update round data
      const nowSeconds = Math.floor(Date.now() / 1000);
      await send(bnbFeed, 'updateRoundData', [1111, 12345, nowSeconds + ADVANCE_SECONDS, nowSeconds]); // decimal delta: 18 - 8
      price = await call(oracle, "getUnderlyingPrice", [vBnb._address], {from: root});
      expect(price).toEqual(bnbMantissa(12345, 1e10).toFixed(0));
    });

    it('if updatedAt is some time in the future, revert it', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      await send(bnbFeed, 'updateRoundData', [1111, 12345, nowSeconds + 900000, nowSeconds]); // decimal delta: 18 - 8
      await expect(
        call(oracle, "getUnderlyingPrice", [vBnb._address], {from: root})
      ).rejects.toRevert('revert SafeMath: subtraction overflow');
    });
  })
});
