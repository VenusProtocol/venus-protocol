// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { ExponentialNoError } from "./Utils/ExponentialNoError.sol";

/**
 * @title LiquidationManager
 * @dev This contract provides functions to manage liquidations in the venus protocol.
 * It calculates close factors, dynamic liquidation incentives, and the number of tokens to seize during liquidation.
 * It also checks if a liquidation is toxic based on average liquidation threshold and health factor.
 * @author Venus
 * @notice This contract is designed to be used in conjunction with the venus protocol's liquidation process.
 */
contract LiquidationManager is ExponentialNoError {
    /**
     * @notice Calculate the close factor for a liquidation
     * @param borrowBalance The borrow balance of the borrower
     * @param wtAvg The weighted average of the collateral
     * @param totalCollateral The total collateral available for liquidation
     * @param dynamicLiquidationIncentive The dynamic liquidation incentive, scaled by 1e18
     * @param maxLiquidationIncentive The maximum liquidation incentive allowed
     * @return closeFactor The calculated close factor, scaled by 1e18
     */
    function calculateCloseFactor(
        uint256 borrowBalance,
        uint256 wtAvg,
        uint256 totalCollateral,
        uint256 dynamicLiquidationIncentive,
        uint256 maxLiquidationIncentive
    ) external pure returns (uint256 closeFactor) {
        if (dynamicLiquidationIncentive == maxLiquidationIncentive) {
            // Prevent underflow
            require(
                wtAvg * totalCollateral <= borrowBalance * mantissaOne,
                "LiquidationManager: Collateral exceeds borrow capacity"
            );

            uint256 numerator = borrowBalance * mantissaOne - wtAvg * totalCollateral;
            uint256 denominator = borrowBalance * (mantissaOne - ((wtAvg * maxLiquidationIncentive) / mantissaOne));

            closeFactor = numerator / denominator;
            closeFactor = closeFactor > mantissaOne ? mantissaOne : closeFactor;
        } else {
            closeFactor = mantissaOne; // Liquidate 100% if unhealthy
        }
    }

    /**
     * @notice Calculate the dynamic liquidation incentive based on health factor and average liquidation threshold
     * @param healthFactor The health factor of the borrower
     * @param averageLT The average liquidation threshold of the collateral
     * @param maxLiquidationIncentiveMantissa The maximum liquidation incentive allowed, scaled by 1e18
     * @return incentive The calculated dynamic liquidation incentive, scaled by 1e18
     */
    function calculateDynamicLiquidationIncentive(
        uint256 healthFactor,
        uint256 averageLT,
        uint256 maxLiquidationIncentiveMantissa
    ) external pure returns (uint256 incentive) {
        uint256 value = ((healthFactor * mantissaOne) / averageLT) - mantissaOne;
        return value > maxLiquidationIncentiveMantissa ? maxLiquidationIncentiveMantissa : value;
    }

    /**
     * @notice Calculate the number of tokens to seize during liquidation
     * @param actualRepayAmount The amount of debt being repaid in the liquidation
     * @param liquidationIncentiveMantissa The liquidation incentive, scaled by 1e18
     * @param priceBorrowedMantissa The price of the borrowed asset, scaled by 1e18
     * @param priceCollateralMantissa The price of the collateral asset, scaled by 1e18
     * @param exchangeRateMantissa The exchange rate of the collateral asset, scaled by 1e18
     * @return seizeTokens The number of tokens to seize during liquidation, scaled by 1e18
     */
    function calculateSeizeTokens(
        uint256 actualRepayAmount,
        uint256 liquidationIncentiveMantissa,
        uint256 priceBorrowedMantissa,
        uint256 priceCollateralMantissa,
        uint256 exchangeRateMantissa
    ) external pure returns (uint256 seizeTokens) {
        Exp memory numerator = mul_(
            Exp({ mantissa: liquidationIncentiveMantissa }),
            Exp({ mantissa: priceBorrowedMantissa })
        );
        Exp memory denominator = mul_(
            Exp({ mantissa: priceCollateralMantissa }),
            Exp({ mantissa: exchangeRateMantissa })
        );
        seizeTokens = mul_ScalarTruncate(div_(numerator, denominator), actualRepayAmount);

        return (seizeTokens);
    }
}
