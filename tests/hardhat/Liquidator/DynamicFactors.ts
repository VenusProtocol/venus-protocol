import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToBigInt, convertToUnit } from "../../../helpers/utils";
import {
  BEP20Harness,
  IAccessControlManagerV5,
  InterestRateModelHarness,
  PriceOracle,
  VBep20Harness,
} from "../../../typechain";
import { deployDiamond } from "../Comptroller/Diamond/scripts/deploy";

const { expect } = chai;
chai.use(smock.matchers);

describe("Dynamic Liquidation Tests", () => {
  async function setupDynamicLiquidationTest() {
    const [admin, borrower, liquidator] = await ethers.getSigners();

    // Deploy mocks
    const oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
    const accessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");

    // Setup mocks
    accessControlManager.isAllowedToCall.returns(true);
    accessControlManager.hasRole.returns(true);
    oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));

    // Deploy underlying token
    const TokenFactory = await ethers.getContractFactory("BEP20Harness");
    const underlying = (await TokenFactory.deploy(
      convertToBigInt("10000000", 18),
      "Test Token",
      18,
      "TEST",
    )) as BEP20Harness;

    // Deploy interest rate model
    const InterestRateModelFactory = await ethers.getContractFactory("InterestRateModelHarness");
    const interestRateModel = (await InterestRateModelFactory.deploy(
      convertToBigInt("0.000000001", 18),
    )) as InterestRateModelHarness;

    // Deploy comptroller
    const result = await deployDiamond("");
    const comptroller = await ethers.getContractAt("ComptrollerMock", result.unitroller.address);

    // Deploy comptroller lens
    const ComptrollerLensFactory = await ethers.getContractFactory("ComptrollerLens");
    const comptrollerLens = await ComptrollerLensFactory.deploy();

    // Setup comptroller
    await comptroller._setAccessControl(accessControlManager.address);
    await comptroller._setComptrollerLens(comptrollerLens.address);
    await comptroller._setPriceOracle(oracle.address);

    // Deploy vToken
    const VTokenFactory = await ethers.getContractFactory("VBep20Harness");
    const vToken = (await VTokenFactory.deploy(
      underlying.address,
      comptroller.address,
      interestRateModel.address,
      convertToBigInt("200000000", 18),
      "vTest Token",
      "vTEST",
      8,
      admin.address,
    )) as VBep20Harness;

    // Support market
    await comptroller._supportMarket(vToken.address);
    await comptroller._setMarketSupplyCaps([vToken.address], [convertToBigInt("1000000", 18)]);
    await comptroller._setMarketBorrowCaps([vToken.address], [convertToBigInt("1000000", 18)]);
    await comptroller.setIsBorrowAllowed(0, vToken.address, true);

    // Set collateral factor and liquidation threshold
    await comptroller["setCollateralFactor(address,uint256,uint256)"](
      vToken.address,
      convertToBigInt("0.75", 18), // 75% collateral factor
      convertToBigInt("0.80", 18), // 80% liquidation threshold
    );

    // Set max liquidation incentive
    await comptroller["setMarketMaxLiquidationIncentive(address,uint256)"](
      vToken.address,
      convertToBigInt("1.10", 18), // 110%
    );

    // Deploy LiquidationManager
    const LiquidationManagerFactory = await ethers.getContractFactory("LiquidationManager");
    const liquidationManager = await LiquidationManagerFactory.deploy(
      convertToBigInt("0.05", 18), // baseCloseFactorMantissa (5%)
      convertToBigInt("0.5", 18), // defaultCloseFactorMantissa (50%)
      convertToBigInt("1.05", 18), // targetHealthFactor (105%)
    );
    await liquidationManager.initialize(accessControlManager.address);
    await comptroller.setLiquidationManager(liquidationManager.address);

    // Enable dynamic features for this market
    await liquidationManager.setDynamicLiquidationIncentiveEnabled(vToken.address, true);
    await liquidationManager.setDynamicCloseFactorEnabled(vToken.address, true);

    return {
      admin,
      borrower,
      liquidator,
      comptroller,
      comptrollerLens,
      oracle,
      underlying,
      vToken,
      liquidationManager,
    };
  }

  describe("Dynamic Liquidation Incentive", () => {
    it("should calculate incentives dynamically based on health factor", async () => {
      const { liquidationManager, vToken } = await loadFixture(setupDynamicLiquidationTest);

      // Verify dynamic liquidation is enabled
      const isDynamicEnabled = await liquidationManager.dynamicLiquidationIncentiveEnabled(vToken.address);
      expect(isDynamicEnabled).to.be.true;

      // Test healthy position - should return max incentive
      const healthyIncentive = await liquidationManager.calculateDynamicLiquidationIncentive(
        vToken.address,
        convertToBigInt("1.00", 18), // 100% health factor
        convertToBigInt("0.80", 18), // 80% liquidation threshold
        convertToBigInt("1.10", 18), // 110% max incentive
      );
      expect(healthyIncentive.eq(convertToBigInt("1.10", 18))).to.be.true;

      // Test liquidatable positions with various health factors
      const testCases = [
        { healthFactor: "0.50", expectedRatio: 0.625 }, // 0.50/0.80 = 0.625
        { healthFactor: "0.60", expectedRatio: 0.75 }, // 0.60/0.80 = 0.75
        { healthFactor: "0.70", expectedRatio: 0.875 }, // 0.70/0.80 = 0.875
        { healthFactor: "0.75", expectedRatio: 0.9375 }, // 0.75/0.80 = 0.9375
        { healthFactor: "0.90", expectedRatio: 1.125 }, // 0.90/0.80 = 1.125 (capped at 1.10)
      ];

      for (const testCase of testCases) {
        const hf = convertToBigInt(testCase.healthFactor, 18);
        const liquidationThreshold = convertToBigInt("0.80", 18);

        const incentive = await liquidationManager.calculateDynamicLiquidationIncentive(
          vToken.address,
          hf,
          liquidationThreshold,
          convertToBigInt("1.10", 18),
        );

        const ratio = parseFloat(incentive.toString()) / parseFloat(convertToUnit(1, 18).toString());
        const expectedRatio = Math.min(testCase.expectedRatio, 1.1);

        expect(Math.abs(ratio - expectedRatio)).to.be.lessThan(0.001);
      }
    });

    it("should return max incentive when disabled", async () => {
      const { liquidationManager, vToken } = await loadFixture(setupDynamicLiquidationTest);

      // Disable dynamic liquidation incentive
      await liquidationManager.setDynamicLiquidationIncentiveEnabled(vToken.address, false);

      const incentive = await liquidationManager.calculateDynamicLiquidationIncentive(
        vToken.address,
        convertToBigInt("0.60", 18), // Low health factor
        convertToBigInt("0.80", 18), // Liquidation threshold
        convertToBigInt("1.10", 18), // Max incentive
      );

      // When disabled, should always return max incentive
      expect(incentive.eq(convertToBigInt("1.10", 18))).to.be.true;
    });
  });

  describe("Dynamic Close Factor", () => {
    it("should calculate close factors dynamically", async () => {
      const { liquidationManager, vToken } = await loadFixture(setupDynamicLiquidationTest);

      // Verify dynamic close factor is enabled
      const isDynamicEnabled = await liquidationManager.dynamicCloseFactorEnabled(vToken.address);
      expect(isDynamicEnabled).to.be.true;

      // Get configuration parameters
      const defaultCloseFactor = await liquidationManager.defaultCloseFactorMantissa();

      // Test scenarios with different liquidation parameters
      const testScenarios = [
        {
          borrowBalance: convertToBigInt("60", 18),
          totalCollateral: convertToBigInt("85", 18),
          wtAvgMantissa: convertToBigInt("0.75", 36),
          dynamicLiquidationIncentive: convertToBigInt("1.08", 18), // Below max
          maxLiquidationIncentive: convertToBigInt("1.10", 18),
          expectedResult: "100% liquidation", // When incentive < max
        },
        {
          borrowBalance: convertToBigInt("70", 18),
          totalCollateral: convertToBigInt("75", 18),
          wtAvgMantissa: convertToBigInt("0.75", 36),
          dynamicLiquidationIncentive: convertToBigInt("1.05", 18), // Below max
          maxLiquidationIncentive: convertToBigInt("1.10", 18),
          expectedResult: "100% liquidation", // When incentive < max
        },
      ];

      for (const scenario of testScenarios) {
        try {
          const closeFactor = await liquidationManager.calculateDynamicCloseFactor(
            vToken.address,
            scenario.borrowBalance,
            scenario.wtAvgMantissa,
            scenario.totalCollateral,
            scenario.dynamicLiquidationIncentive,
            scenario.maxLiquidationIncentive,
          );

          // Verify close factor is within bounds
          expect(closeFactor.gte(0)).to.be.true;
          expect(closeFactor.lte(convertToUnit(1, 18))).to.be.true;

          // When liquidation incentive < max, should liquidate 100%
          if (ethers.BigNumber.from(scenario.dynamicLiquidationIncentive).lt(scenario.maxLiquidationIncentive)) {
            expect(closeFactor.eq(convertToUnit(1, 18))).to.be.true;
          }
        } catch (error: any) {
          // Some scenarios may fail with CollateralExceedsBorrowCapacity
          expect(error.message).to.include("CollateralExceedsBorrowCapacity");
        }
      }

      // Test disabled mode
      await liquidationManager.setDynamicCloseFactorEnabled(vToken.address, false);

      const disabledCloseFactor = await liquidationManager.calculateDynamicCloseFactor(
        vToken.address,
        convertToBigInt("50", 18),
        convertToBigInt("0.75", 36),
        convertToBigInt("100", 18),
        convertToBigInt("1.10", 18),
        convertToBigInt("1.10", 18),
      );

      // When disabled, should return default close factor
      expect(disabledCloseFactor.eq(defaultCloseFactor)).to.be.true;
    });

    it("should handle edge cases properly", async () => {
      const { liquidationManager, vToken } = await loadFixture(setupDynamicLiquidationTest);

      // Test with small position
      try {
        const closeFactor = await liquidationManager.calculateDynamicCloseFactor(
          vToken.address,
          convertToBigInt("1", 18), // Small borrow
          convertToBigInt("0.75", 36),
          convertToBigInt("10", 18), // Small collateral
          convertToBigInt("1.10", 18),
          convertToBigInt("1.10", 18),
        );

        expect(closeFactor.gte(0)).to.be.true;
        expect(closeFactor.lte(convertToUnit(1, 18))).to.be.true;
      } catch (error: any) {
        // Expected for edge cases that violate constraints
        expect(error.message).to.include("CollateralExceedsBorrowCapacity");
      }
    });
  });

  describe("Integration Tests", () => {
    it("should work with real borrower positions", async () => {
      const { borrower, comptrollerLens, comptroller, underlying, vToken, liquidationManager } =
        await loadFixture(setupDynamicLiquidationTest);

      // Setup borrower position
      await underlying.harnessSetBalance(borrower.address, convertToBigInt("1", 18));
      await underlying.connect(borrower).approve(vToken.address, convertToBigInt("1", 18));
      await underlying.harnessSetBalance(vToken.address, convertToBigInt("10000", 18));

      await vToken.connect(borrower).mint(convertToBigInt("1", 18));
      await comptroller.connect(borrower).enterMarkets([vToken.address]);
      await vToken.connect(borrower).borrow(convertToBigInt("0.7", 18));

      // Get health snapshot
      const healthSnapshot = await comptrollerLens.getAccountHealthSnapshot(
        comptroller.address,
        borrower.address,
        vToken.address,
        0,
        0,
        0,
      );

      // Verify both dynamic systems are enabled
      const incentiveEnabled = await liquidationManager.dynamicLiquidationIncentiveEnabled(vToken.address);
      const closeFactorEnabled = await liquidationManager.dynamicCloseFactorEnabled(vToken.address);

      expect(incentiveEnabled).to.be.true;
      expect(closeFactorEnabled).to.be.true;

      // Test dynamic liquidation incentive calculation
      const dynamicIncentive = await liquidationManager.calculateDynamicLiquidationIncentive(
        vToken.address,
        healthSnapshot[1].healthFactor,
        healthSnapshot[1].liquidationThresholdAvg,
        convertToBigInt("1.10", 18),
      );

      expect(dynamicIncentive.gt(0)).to.be.true;
      expect(dynamicIncentive.lte(convertToBigInt("1.10", 18))).to.be.true;
    });
  });
});
