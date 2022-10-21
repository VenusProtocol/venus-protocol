const { bnbMantissa } = require("../Utils/BSC");

const { makeVToken, makePriceOracle } = require("../Utils/Venus");

describe("Comptroller", function () {
  let root, accounts;
  let unitroller;
  let brains;
  let oracle;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    oracle = await makePriceOracle();
    brains = await deploy("Comptroller");
    unitroller = await deploy("Unitroller");
  });

  let initializeBrains = async (priceOracle, closeFactor) => {
    await send(unitroller, "_setPendingImplementation", [brains._address]);
    await send(brains, "_become", [unitroller._address]);
    const unitrollerAsBrain = await saddle.getContractAt("Comptroller", unitroller._address);
    await send(unitrollerAsBrain, "_setPriceOracle", [priceOracle._address]);
    await send(unitrollerAsBrain, "_setCloseFactor", [closeFactor]);
    await send(unitrollerAsBrain, "_setLiquidationIncentive", [bnbMantissa(1)]);
    return unitrollerAsBrain;
  };

  describe("delegating to comptroller", () => {
    const closeFactor = bnbMantissa(0.051);
    let unitrollerAsComptroller, vToken;

    beforeEach(async () => {
      unitrollerAsComptroller = await initializeBrains(oracle, bnbMantissa(0.06));
      vToken = await makeVToken({ comptroller: unitrollerAsComptroller });
    });

    describe("becoming brains sets initial state", () => {
      it("reverts if this is not the pending implementation", async () => {
        await expect(send(brains, "_become", [unitroller._address])).rejects.toRevert("revert not authorized");
      });

      it("on success it sets admin to caller of constructor", async () => {
        expect(await call(unitrollerAsComptroller, "admin")).toEqual(root);
        expect(await call(unitrollerAsComptroller, "pendingAdmin")).toBeAddressZero();
      });

      it("on success it sets closeFactor as specified", async () => {
        const comptroller = await initializeBrains(oracle, closeFactor);
        expect(await call(comptroller, "closeFactorMantissa")).toEqualNumber(closeFactor);
      });
    });

    describe("_setCollateralFactor", () => {
      const half = bnbMantissa(0.5),
        one = bnbMantissa(1);

      it("fails if not called by admin", async () => {
        await expect(
          send(unitrollerAsComptroller, "_setCollateralFactor", [vToken._address, half], {
            from: accounts[1],
          }),
        ).rejects.toRevert("revert only admin can");
      });

      it("fails if asset is not listed", async () => {
        await expect(send(unitrollerAsComptroller, "_setCollateralFactor", [vToken._address, half])).rejects.toRevert(
          "revert market not listed",
        );
      });

      it("fails if factor is too high", async () => {
        const vToken = await makeVToken({ supportMarket: true, comptroller: unitrollerAsComptroller });
        expect(await send(unitrollerAsComptroller, "_setCollateralFactor", [vToken._address, one])).toHaveTrollFailure(
          "INVALID_COLLATERAL_FACTOR",
          "SET_COLLATERAL_FACTOR_VALIDATION",
        );
      });

      it("fails if factor is set without an underlying price", async () => {
        const vToken = await makeVToken({ supportMarket: true, comptroller: unitrollerAsComptroller });
        expect(await send(unitrollerAsComptroller, "_setCollateralFactor", [vToken._address, half])).toHaveTrollFailure(
          "PRICE_ERROR",
          "SET_COLLATERAL_FACTOR_WITHOUT_PRICE",
        );
      });

      it("succeeds and sets market", async () => {
        const vToken = await makeVToken({ supportMarket: true, comptroller: unitrollerAsComptroller });
        await send(oracle, "setUnderlyingPrice", [vToken._address, 1]);
        expect(await send(unitrollerAsComptroller, "_setCollateralFactor", [vToken._address, half])).toHaveLog(
          "NewCollateralFactor",
          {
            vToken: vToken._address,
            oldCollateralFactorMantissa: "0",
            newCollateralFactorMantissa: half.toString(),
          },
        );
      });
    });

    describe("_supportMarket", () => {
      it("fails if not called by admin", async () => {
        await expect(
          send(unitrollerAsComptroller, "_supportMarket", [vToken._address], { from: accounts[1] }),
        ).rejects.toRevert("revert only admin can");
      });

      it("fails if asset is not a VToken", async () => {
        const notAVToken = await makePriceOracle();
        await expect(send(unitrollerAsComptroller, "_supportMarket", [notAVToken._address])).rejects.toRevert();
      });

      it("succeeds and sets market", async () => {
        const result = await send(unitrollerAsComptroller, "_supportMarket", [vToken._address]);
        expect(result).toHaveLog("MarketListed", { vToken: vToken._address });
      });

      it("cannot list a market a second time", async () => {
        const result1 = await send(unitrollerAsComptroller, "_supportMarket", [vToken._address]);
        const result2 = await send(unitrollerAsComptroller, "_supportMarket", [vToken._address]);
        expect(result1).toHaveLog("MarketListed", { vToken: vToken._address });
        expect(result2).toHaveTrollFailure("MARKET_ALREADY_LISTED", "SUPPORT_MARKET_EXISTS");
      });

      it("can list two different markets", async () => {
        const vToken1 = await makeVToken({ comptroller: unitroller });
        const vToken2 = await makeVToken({ comptroller: unitroller });
        const result1 = await send(unitrollerAsComptroller, "_supportMarket", [vToken1._address]);
        const result2 = await send(unitrollerAsComptroller, "_supportMarket", [vToken2._address]);
        expect(result1).toHaveLog("MarketListed", { vToken: vToken1._address });
        expect(result2).toHaveLog("MarketListed", { vToken: vToken2._address });
      });
    });
  });
});
