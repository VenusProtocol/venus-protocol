const { makeVToken, makePriceOracle, enterMarkets } = require("../Utils/Venus");

function cullTuple(tuple) {
  return Object.keys(tuple).reduce((acc, key) => {
    if (Number.isNaN(Number(key))) {
      return {
        ...acc,
        [key]: tuple[key],
      };
    } else {
      return acc;
    }
  }, {});
}

describe("SnapshotLens", () => {
  let snapshotLens, comptroller;
  let borrower;
  let oracle, vBnb, vUsdc, vUsdcAddress, usdcAddress, vUsdt, vUsdtAddress, usdtAddress;

  beforeEach(async () => {
    [borrower] = saddle.accounts;
    snapshotLens = await deploy("SnapshotLens");
    oracle = await makePriceOracle();

    vBnb = await makeVToken({
      kind: "vbnb",
      comptrollerOpts: { kind: "v1-no-proxy" },
      supportMarket: true,
    });

    comptroller = vBnb.comptroller;
    const result = await send(comptroller, "_setPriceOracle", [oracle._address]);
    expect(result).toSucceed();

    vUsdc = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
      underlyingOpts: {
        decimals: 6,
        symbol: "USDC",
      },
      name: "USD Coin",
    });

    vUsdcAddress = vUsdc._address;
    usdcAddress = vUsdc.underlying._address;

    await send(oracle, "setUnderlyingPrice", [vUsdc._address, 1]);

    let price = await call(oracle, "getUnderlyingPrice", [vUsdc._address]);
    expect(price).toEqual("1");

    vUsdt = await makeVToken({
      comptroller: vBnb.comptroller,
      supportMarket: true,
      underlyingOpts: {
        decimals: 6,
        symbol: "USDT",
      },
      name: "USD Tether",
    });

    vUsdtAddress = vUsdt._address;
    usdtAddress = vUsdt.underlying._address;

    await send(oracle, "setUnderlyingPrice", [vUsdt._address, 1]);
    let price2 = await call(oracle, "getUnderlyingPrice", [vUsdt._address]);
    expect(price2).toEqual("1");
  });

  describe("snapshot", () => {
    it("is correct for vUsdc", async () => {
      expect(
        cullTuple(await call(snapshotLens, "getAccountSnapshot", [borrower, comptroller._address, vUsdc._address])),
      ).toEqual({
        account: borrower,
        assetName: "USD Coin",
        vTokenAddress: vUsdcAddress,
        underlyingAssetAddress: usdcAddress,
        supply: "0",
        supplyInUsd: "0",
        collateral: "0",
        borrows: "0",
        borrowsInUsd: "0",
        assetPrice: "1",
        accruedInterest: "1000000000000000000",
        vTokenDecimals: "8",
        underlyingDecimals: "6",
        exchangeRate: "1000000000000000000",
        isACollateral: false,
      });
    });

    it("is correct for vUsdt", async () => {
      expect(
        cullTuple(await call(snapshotLens, "getAccountSnapshot", [borrower, comptroller._address, vUsdt._address])),
      ).toEqual({
        account: borrower,
        assetName: "USD Tether",
        vTokenAddress: vUsdtAddress,
        underlyingAssetAddress: usdtAddress,
        supply: "0",
        supplyInUsd: "0",
        collateral: "0",
        borrows: "0",
        borrowsInUsd: "0",
        assetPrice: "1",
        accruedInterest: "1000000000000000000",
        vTokenDecimals: "8",
        underlyingDecimals: "6",
        exchangeRate: "1000000000000000000",
        isACollateral: false,
      });
    });

    it("get accountSnapshots for Borrower with all markets, he has entered", async () => {
      expect(await enterMarkets([vUsdc, vUsdt], borrower)).toSucceed();
      expect((await call(snapshotLens, "getAccountSnapshot", [borrower, comptroller._address])).map(cullTuple)).toEqual(
        [
          {
            account: borrower,
            accruedInterest: "1000000000000000000",
            assetName: "VToken vBNB",
            assetPrice: "1000000000000000000",
            borrows: "0",
            borrowsInUsd: "0",
            collateral: "0",
            exchangeRate: "1000000000000000000",
            isACollateral: false,
            supply: "0",
            supplyInUsd: "0",
            underlyingAssetAddress: "0x0000000000000000000000000000000000000000",
            underlyingDecimals: "18",
            vTokenAddress: vBnb._address,
            vTokenDecimals: "8",
          },
          {
            account: borrower,
            assetName: "USD Coin",
            vTokenAddress: vUsdcAddress,
            underlyingAssetAddress: usdcAddress,
            supply: "0",
            supplyInUsd: "0",
            collateral: "0",
            borrows: "0",
            borrowsInUsd: "0",
            assetPrice: "1",
            accruedInterest: "1000000000000000000",
            vTokenDecimals: "8",
            underlyingDecimals: "6",
            exchangeRate: "1000000000000000000",
            isACollateral: true,
          },
          {
            account: borrower,
            assetName: "USD Tether",
            vTokenAddress: vUsdtAddress,
            underlyingAssetAddress: usdtAddress,
            supply: "0",
            supplyInUsd: "0",
            collateral: "0",
            borrows: "0",
            borrowsInUsd: "0",
            assetPrice: "1",
            accruedInterest: "1000000000000000000",
            vTokenDecimals: "8",
            underlyingDecimals: "6",
            exchangeRate: "1000000000000000000",
            isACollateral: true,
          },
        ],
      );
    });

    it("get accountSnapshots for Borrower who has never entered any market", async () => {
      expect((await call(snapshotLens, "getAccountSnapshot", [borrower, comptroller._address])).map(cullTuple)).toEqual(
        [
          {
            account: borrower,
            accruedInterest: "1000000000000000000",
            assetName: "VToken vBNB",
            assetPrice: "1000000000000000000",
            borrows: "0",
            borrowsInUsd: "0",
            collateral: "0",
            exchangeRate: "1000000000000000000",
            isACollateral: false,
            supply: "0",
            supplyInUsd: "0",
            underlyingAssetAddress: "0x0000000000000000000000000000000000000000",
            underlyingDecimals: "18",
            vTokenAddress: vBnb._address,
            vTokenDecimals: "8",
          },
          {
            account: borrower,
            accruedInterest: "1000000000000000000",
            assetName: "USD Coin",
            assetPrice: "1",
            borrows: "0",
            borrowsInUsd: "0",
            collateral: "0",
            exchangeRate: "1000000000000000000",
            isACollateral: false,
            supply: "0",
            supplyInUsd: "0",
            underlyingAssetAddress: usdcAddress,
            underlyingDecimals: "6",
            vTokenAddress: vUsdcAddress,
            vTokenDecimals: "8",
          },
          {
            account: borrower,
            accruedInterest: "1000000000000000000",
            assetName: "USD Tether",
            assetPrice: "1",
            borrows: "0",
            borrowsInUsd: "0",
            collateral: "0",
            exchangeRate: "1000000000000000000",
            isACollateral: false,
            supply: "0",
            supplyInUsd: "0",
            underlyingAssetAddress: usdtAddress,
            underlyingDecimals: "6",
            vTokenAddress: vUsdtAddress,
            vTokenDecimals: "8",
          },
        ],
      );
    });
  });
});
