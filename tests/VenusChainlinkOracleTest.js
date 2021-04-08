const {
  makeChainlinkOracle,
  makeVToken,
} = require('./Utils/Venus');

describe('VenusChainlinkOracle', () => {
  let root, accounts;
  let oracle, vBnb, vDai, vUsdc, vUsdt;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    vBnb = await makeVToken({kind: "vbnb",
      comptrollerOpts: {kind: "v1-no-proxy"},
      supportMarket: true
    });
    vUsdc = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
      underlyingOpts: {symbol: "USDC"}
    });
    vUsdt = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
      underlyingOpts: {symbol: "USDT"}
    });
    vDai = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
      underlyingOpts: {symbol: "DAI"}
    });
    bnbFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 30000000000});
    usdcFeed = await makeChainlinkOracle({decimals: 8, initialAnswer: 100000000});
    oracle = await deploy('VenusChainlinkOracle');
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
        send(oracle, "setFeed", ["vBNB", bnbFeed._address], {from: accounts[0]})
      ).rejects.toRevert("revert only admin may call");
    });

    it("cannot set feed to self address", async () => {
      await expect(
        send(oracle, "setFeed", ["vBNB", oracle._address], {from: root})
      ).rejects.toRevert("revert invalid feed address");
    });

    it("cannot set feed to zero address", async () => {
      await expect(
        send(
          oracle,
          "setFeed",
          ["vBNB", "0x0000000000000000000000000000000000000000"],
          {from: root}
        )
      ).rejects.toRevert("revert invalid feed address");
    });

    it("sets a feed", async () => {
      await send(oracle, "setFeed", ["vBNB", bnbFeed._address], {from: root});
      let feed = await call(oracle, "getFeed", ["vBNB"]);
      expect(feed).toEqual(bnbFeed._address);
    });
  });

  describe("getUnderlyingPrice", () => {
    beforeEach(async () => {
      await send(oracle, "setFeed", ["vBNB", bnbFeed._address], {from: root});
      await send(oracle, "setFeed", ["USDC", usdcFeed._address], {from: root});
      await send(oracle, "setUnderlyingPrice", [vUsdt._address, 1], {from: root});
    });

    it("gets the price from Chainlink for vBNB", async () => {
      let price = await call(oracle, "getUnderlyingPrice", [vBnb._address], {from: root});
      expect(price).toEqual("300000000000000000000");
    });

    it("gets the price from Chainlink for USDC", async () => {
      let price = await call(oracle, "getUnderlyingPrice", [vUsdc._address], {from: root});
      expect(price).toEqual("1000000000000000000");
    });

    it("gets the direct price of a set asset", async () => {
      let price = await call(oracle, "getUnderlyingPrice", [vUsdt._address], {from: root});
      expect(price).toEqual("1");
    });

    it("reverts if no price or feed has been set", async () => {
      await expect(
        send(oracle, "getUnderlyingPrice", [vDai._address], {from: root})
      ).rejects.toRevert();
    });
  });
});
