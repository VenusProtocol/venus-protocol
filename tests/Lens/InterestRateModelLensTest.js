const fs = require("fs");
const path = require("path");
const { bnbUnsigned } = require("../Utils/BSC");
const { makeInterestRateModel } = require("../Utils/Venus");

describe("InterestRateModelLens", () => {
  let interestRateModel, model, baseRate, multiplier, interestRateModelAddresses;
  let interestRateModelLens;
  let referenceAmountInWei, reserveFactor;

  beforeEach(async () => {
    model = "white-paper";
    baseRate = 0.1;
    multiplier = 0.45;
    interestRateModel = await makeInterestRateModel({ kind: model, baseRate: baseRate, multiplier: multiplier });
    interestRateModelAddresses = interestRateModel._address;

    interestRateModelLens = await deploy("InterestRateModelLens");
  });

  describe("getSimulation", () => {
    it("must get simulation Data", async () => {
      referenceAmountInWei = bnbUnsigned(0.3e18);
      reserveFactor = bnbUnsigned(0.1e18);

      const response = await call(interestRateModelLens, "getSimulationResponse", [
        referenceAmountInWei,
        interestRateModelAddresses,
        reserveFactor,
      ]);

      const borrowRatesInSimulatedResponse = response["borrowSimulation"];
      expect(borrowRatesInSimulatedResponse).not.toBeNull();
      expect(borrowRatesInSimulatedResponse.length).toBe(100);

      const borrowRates_expected_data = fs.readFileSync(
        path.resolve(__dirname, "./expected-data/borrow-rates-simulation.json"),
        "utf8",
      );
      const borrowRates_expected = JSON.parse(borrowRates_expected_data);
      expect(borrowRatesInSimulatedResponse.map(str => Number(str))).toEqual(borrowRates_expected);

      const supplyRatesInSimulatedResponse = response["supplySimulation"];
      expect(supplyRatesInSimulatedResponse).not.toBeNull();
      expect(supplyRatesInSimulatedResponse.length).toBe(100);

      const supplyRates_expected_data = fs.readFileSync(
        path.resolve(__dirname, "./expected-data/supply-rates-simulation.json"),
        "utf8",
      );
      const supplyRates_expected = JSON.parse(supplyRates_expected_data);
      expect(supplyRatesInSimulatedResponse.map(str => Number(str))).toEqual(supplyRates_expected);
    });
  });
});
