const { bnbUnsigned } = require("../Utils/BSC");
const { makeComptroller, makeVToken, setOraclePrice, setOraclePriceFromMantissa } = require("../Utils/Venus");

const collateralPrice = 1e18;
const repayAmount = bnbUnsigned(1e18);

async function vaiCalculateSeizeTokens(comptroller, vTokenCollateral, repayAmount) {
  return call(comptroller, "liquidateVAICalculateSeizeTokens", [vTokenCollateral._address, repayAmount]);
}

function rando(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

describe("Comptroller", () => {
  let comptroller, vTokenCollateral;

  beforeEach(async () => {
    comptroller = await makeComptroller();
    vTokenCollateral = await makeVToken({ comptroller: comptroller, underlyingPrice: 0 });
  });

  beforeEach(async () => {
    await setOraclePrice(vTokenCollateral, collateralPrice);
    await send(vTokenCollateral, "harnessExchangeRateDetails", [8e10, 4e10, 0]);
  });

  describe("liquidateVAICalculateAmountSeize", () => {
    it("fails if either asset price is 0", async () => {
      await setOraclePrice(vTokenCollateral, 0);
      expect(await vaiCalculateSeizeTokens(comptroller, vTokenCollateral, repayAmount)).toHaveTrollErrorTuple([
        "PRICE_ERROR",
        0,
      ]);
    });

    it("fails if the repayAmount causes overflow ", async () => {
      await expect(
        vaiCalculateSeizeTokens(
          comptroller,
          vTokenCollateral,
          "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
        ),
      ).rejects.toRevert("revert multiplication overflow");
    });

    it("reverts if it fails to calculate the exchange rate", async () => {
      await send(vTokenCollateral, "harnessExchangeRateDetails", [1, 0, 10]); // (1 - 10) -> underflow
      await expect(
        send(comptroller, "liquidateVAICalculateSeizeTokens", [vTokenCollateral._address, repayAmount]),
      ).rejects.toRevert("revert exchangeRateStored: exchangeRateStoredInternal failed");
    });

    [
      [1e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 1e18, 1.42e18, 1.3e18, 2.45e18],
      [2.789e18, 1e18, 771.32e18, 1.3e18, 10002.45e18],
      [7.009232529961056e24, 1e18, 2.6177112093242585e23, 1179713989619784000, 7.790468414639561e24],
      [rando(0, 1e25), 1e18, rando(1, 1e25), rando(1e18, 1.5e18), rando(0, 1e25)],
    ].forEach(testCase => {
      it(`returns the correct value for ${testCase}`, async () => {
        const [exchangeRate, borrowedPrice, collateralPrice, liquidationIncentive, repayAmount] =
          testCase.map(bnbUnsigned);

        await setOraclePriceFromMantissa(vTokenCollateral, collateralPrice);
        await send(comptroller, "_setLiquidationIncentive", [liquidationIncentive]);
        await send(vTokenCollateral, "harnessSetExchangeRate", [exchangeRate]);

        const seizeAmount = repayAmount.mul(liquidationIncentive).mul(borrowedPrice).div(collateralPrice);
        const seizeTokens = seizeAmount.div(exchangeRate);

        expect(await vaiCalculateSeizeTokens(comptroller, vTokenCollateral, repayAmount)).toHaveTrollErrorTuple(
          ["NO_ERROR", Number(seizeTokens)],
          (x, y) => Math.abs(x - y) < 1e7,
        );
      });
    });
  });
});
