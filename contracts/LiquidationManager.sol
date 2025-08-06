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
     * @notice Error thrown when collateral exceeds borrow capacity
     */
    error CollateralExceedsBorrowCapacity();

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
        uint256 baseCloseFactorMantissa,
        uint256 dynamicLiquidationIncentive,
        uint256 maxLiquidationIncentive
    ) external pure returns (uint256 closeFactor) {
        if (dynamicLiquidationIncentive == maxLiquidationIncentive) {
            // Prevent underflow
            if (wtAvg * totalCollateral > borrowBalance * mantissaOne) {
                revert CollateralExceedsBorrowCapacity();
            }

            uint256 numerator = borrowBalance * mantissaOne - wtAvg * totalCollateral;
            uint256 denominator = borrowBalance * (mantissaOne - ((wtAvg * maxLiquidationIncentive) / mantissaOne));

            closeFactor = add_((numerator / denominator), baseCloseFactorMantissa);
            closeFactor = closeFactor > mantissaOne ? mantissaOne : closeFactor;
        } else {
            closeFactor = mantissaOne; // Liquidate 100% if unhealthy
        }
    }

    /**
     * @notice Calculate the dynamic liquidation incentive based on health factor and average liquidation threshold
     * @param healthFactor The health factor of the borrower
     * @param liquidationThresholdAvg The average liquidation threshold of the collateral
     * @param maxLiquidationIncentiveMantissa The maximum liquidation incentive allowed, scaled by 1e18
     * @return incentive The calculated dynamic liquidation incentive, scaled by 1e18
     */
    function calculateDynamicLiquidationIncentive(
        uint256 healthFactor,
        uint256 liquidationThresholdAvg,
        uint256 maxLiquidationIncentiveMantissa
    ) external pure returns (uint256 incentive) {
        uint256 value = (healthFactor * mantissaOne) / liquidationThresholdAvg;
        return value > maxLiquidationIncentiveMantissa ? maxLiquidationIncentiveMantissa : value;
    }
}
