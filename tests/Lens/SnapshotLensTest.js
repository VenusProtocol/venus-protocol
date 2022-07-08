const {
  makeVToken,
  makePriceOracle,
  enterMarkets
} = require('../Utils/Venus');

const MAX_STALE_PERIOD = 100 * 60;

function cullTuple(tuple) {
    return Object.keys(tuple).reduce((acc, key) => {
      if (Number.isNaN(Number(key))) {
        return {
          ...acc,
          [key]: tuple[key]
        };
      } else {
        return acc;
      }
    }, {});
  }

describe('SnapshotLens', () => {
    let snapshotLens, comptroller;
    let borrower, accounts;
    let usdcFeed;
    let oracle, vBnb, 
        vUsdc, vUsdcAddress, usdcAddress, 
        vUsdt, vUsdtAddress, usdtAddress;

    beforeEach(async () => {
      [borrower, ...accounts] = saddle.accounts;
      snapshotLens = await deploy('SnapshotLens');
      //oracle = await deploy("VenusChainlinkOracle", [MAX_STALE_PERIOD]);
      oracle = await makePriceOracle();

      vBnb = await makeVToken({
        kind: "vbnb",
        comptrollerOpts: { kind: "v1-no-proxy" },
        supportMarket: true,
      });

      comptroller = vBnb.comptroller;
      const result = await send(comptroller, '_setPriceOracle', [oracle._address]);
      expect(result).toSucceed();

      vUsdc = await makeVToken({
        comptroller: vBnb.comptroller,
        supportMarket: true,
        underlyingOpts: {
          decimals: 6,
          symbol: "USDC"
        },
        name: "USD Coin"
      });

      vUsdcAddress = vUsdc._address;
      usdcAddress = vUsdc.underlying._address;

      //usdcFeed = await makeChainlinkOracle({ decimals: 8, initialAnswer: 100000000 });
      //await send(oracle, "setFeed", ["USDC", usdcFeed._address]);

      await send(oracle, 'setUnderlyingPrice', [vUsdc._address, 1]);

      let price = await call(oracle, "getUnderlyingPrice", [vUsdc._address]);
      expect(price).toEqual("1");

      vUsdt = await makeVToken({
        comptroller: vBnb.comptroller,
        supportMarket: true,
        underlyingOpts: {
          decimals: 6,
          symbol: "USDT"
        },
        name: "USD Tether"
      });

      vUsdtAddress = vUsdt._address;
      usdtAddress = vUsdt.underlying._address;

      //usdtFeed = await makeChainlinkOracle({ decimals: 8, initialAnswer: 100000000 });
      //await send(oracle, "setFeed", ["USDT", usdtFeed._address]);

      await send(oracle, 'setUnderlyingPrice', [vUsdt._address, 1]);
      let price2 = await call(oracle, "getUnderlyingPrice", [vUsdt._address]);
      expect(price2).toEqual("1");
    });

    describe('snapshot', () => {
      it('is correct for vUsdc', async () => {
        expect(
          cullTuple(await call(snapshotLens, 'getAccountSnapshot', [borrower, comptroller._address, vUsdc._address]))
        ).toEqual(
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
          }
        );
      });

      it('is correct for vUsdt', async () => {
        expect(
          cullTuple(await call(snapshotLens, 'getAccountSnapshot', [borrower, comptroller._address, vUsdt._address]))
        ).toEqual(
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
          }
        );
      });

      it('get accountSnapshots for Borrower with all markets, he has entered', async () => {
        expect(await enterMarkets([vUsdc, vUsdt], borrower)).toSucceed();
        expect(
          (await call(snapshotLens, 'getAccountSnapshot', [borrower, comptroller._address])).map(cullTuple)
        ).toEqual(
          [
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
            }
          ]
        );
      });

      it('get empty accountSnapshots for Borrower who has never entered any market', async () => {
        expect(
          (await call(snapshotLens, 'getAccountSnapshot', [borrower, comptroller._address])).map(cullTuple)
        ).toEqual([]);
      });

    });

  });