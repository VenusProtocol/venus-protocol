// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { ExponentialNoError } from "./Utils/ExponentialNoError.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";

/**
 * @title LiquidationManager
 * @dev This contract provides functions to manage liquidations in the venus protocol.
 * It calculates close factors, dynamic liquidation incentives, and the number of tokens to seize during liquidation.
 * It also checks if a liquidation is toxic based on average liquidation threshold and health factor.
 * @author Venus
 * @notice This contract is designed to be used in conjunction with the venus protocol's liquidation process.
 */
contract LiquidationManager is AccessControlledV8, ExponentialNoError {
    /// @notice Base close factor, scaled by 1e18 (e.g., 0.05e18 for 5%)
    uint256 public immutable baseCloseFactorMantissa;

    /// @notice Default close factor, scaled by 1e18 (e.g., 5e17 for 50%)
    uint256 public immutable defaultCloseFactorMantissa;

    /// @notice Target health factor, scaled by 1e18 (e.g., 1.5e18 for 1.5)
    uint256 public immutable targetHealthFactor;

    /// @notice Indicates whether the dynamic close factor is enabled for a given market.
    /// @dev Maps a market address to a boolean flag for dynamic close factor activation.
    mapping(address => bool) public dynamicCloseFactorEnabled;

    /// @notice Indicates whether the dynamic liquidation incentive is enabled for a given market.
    /// @dev Maps a market address to a boolean flag for dynamic liquidation incentive activation.
    mapping(address => bool) public dynamicLiquidationIncentiveEnabled;

    /// @notice Emitted when the dynamic close factor is enabled or disabled for a market.
    event DynamicCloseFactorEnabledSet(address indexed market, bool enabled);

    /// @notice Emitted when the dynamic liquidation incentive is enabled or disabled for a market.
    event DynamicLiquidationIncentiveEnabledSet(address indexed market, bool enabled);

    /**
     * @notice Error thrown when collateral exceeds borrow capacity
     */
    error CollateralExceedsBorrowCapacity();

    /**
     * @notice Error thrown when the provided base close factor is invalid.
     */
    error InvalidBaseCloseFactor();

    /**
     * @notice Error thrown when the provided default close factor is invalid.
     */
    error InvalidDefaultCloseFactor();

    /**
     * @notice Error thrown when the provided target health factor is invalid.
     */
    error InvalidTargetHealthFactor();

    /**
     * @notice Error thrown when the specified market is not listed.
     * @param market The address of the market that is not listed.
     */
    error MarketNotListed(address market);

    /**
     * @notice Constructor for the LiquidationManager contract.
     * @param accessControlManager_ The address of the Access Control Manager.
     * @param baseCloseFactorMantissa_ The base close factor, scaled by 1e18.
     * @param defaultCloseFactorMantissa_ The default close factor, scaled by 1e18.
     * @param targetHealthFactor_ The target health factor, scaled by 1e18.
     * @dev Ensures that the provided addresses are non-zero and that the close factors and health factor are within valid ranges.
     *      Reverts with `InvalidBaseCloseFactor` if `_baseCloseFactorMantissa` is invalid.
     *      Reverts with `InvalidDefaultCloseFactor` if `_defaultCloseFactorMantissa` is invalid.
     *      Reverts with `InvalidTargetHealthFactor` if `_targetHealthFactor` is invalid.
     */
    constructor(
        address accessControlManager_,
        uint256 baseCloseFactorMantissa_,
        uint256 defaultCloseFactorMantissa_,
        uint256 targetHealthFactor_
    ) {
        if (baseCloseFactorMantissa_ > mantissaOne || baseCloseFactorMantissa_ > defaultCloseFactorMantissa_) {
            revert InvalidBaseCloseFactor();
        }
        if (defaultCloseFactorMantissa_ > mantissaOne) {
            revert InvalidDefaultCloseFactor();
        }
        if (targetHealthFactor_ < mantissaOne) {
            revert InvalidTargetHealthFactor();
        }

        baseCloseFactorMantissa = baseCloseFactorMantissa_;
        defaultCloseFactorMantissa = defaultCloseFactorMantissa_;
        targetHealthFactor = targetHealthFactor_;

        __AccessControlled_init_unchained(accessControlManager_);
    }

    /**
     * @notice Enables or disables the dynamic close factor for a specific market.
     * @param market The address of the market to update.
     * @param enabled Boolean indicating whether the dynamic close factor should be enabled or disabled.
     * @custom:event DynamicCloseFactorEnabledSet
     */
    function setDynamicCloseFactorEnabled(address market, bool enabled) external {
        _checkAccessAllowed("setDynamicCloseFactorEnabled(address,bool)");
        dynamicCloseFactorEnabled[market] = enabled;
        emit DynamicCloseFactorEnabledSet(market, enabled);
    }

    /**
     * @notice Enables or disables the dynamic liquidation incentive for a specific market.
     * @param market The address of the market to update.
     * @param enabled Boolean indicating whether the dynamic liquidation incentive should be enabled or disabled.
     * @custom:event DynamicLiquidationIncentiveEnabledSet
     */
    function setDynamicLiquidationIncentiveEnabled(address market, bool enabled) external {
        _checkAccessAllowed("setDynamicLiquidationIncentiveEnabled(address,bool)");
        dynamicLiquidationIncentiveEnabled[market] = enabled;
        emit DynamicLiquidationIncentiveEnabledSet(market, enabled);
    }

    /**
     * @notice Calculate the close factor for a liquidation
     * @param borrowBalance The borrow balance of the borrower
     * @param wtAvg The weighted average of the collateral
     * @param totalCollateral The total collateral available for liquidation
     * @param dynamicLiquidationIncentive The dynamic liquidation incentive, scaled by 1e18
     * @param maxLiquidationIncentive The maximum liquidation incentive allowed
     * @return closeFactor The calculated close factor, scaled by 1e18
     */
    function calculateDynamicCloseFactor(
        address market,
        uint256 borrowBalance,
        uint256 wtAvg,
        uint256 totalCollateral,
        uint256 dynamicLiquidationIncentive,
        uint256 maxLiquidationIncentive
    ) external view returns (uint256 closeFactor) {
        if (!dynamicCloseFactorEnabled[market]) {
            // Use default close factor if dynamic close factor is not enabled
            return defaultCloseFactorMantissa;
        }

        if (dynamicLiquidationIncentive == maxLiquidationIncentive) {
            // Prevent underflow
            if (wtAvg * totalCollateral > borrowBalance * mantissaOne) {
                revert CollateralExceedsBorrowCapacity();
            }

            uint256 numerator = (borrowBalance * targetHealthFactor - wtAvg * totalCollateral) / mantissaOne;
            uint256 denominator = borrowBalance *
                (targetHealthFactor - ((wtAvg * maxLiquidationIncentive) / mantissaOne));

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
        address market,
        uint256 healthFactor,
        uint256 liquidationThresholdAvg,
        uint256 maxLiquidationIncentiveMantissa
    ) external view returns (uint256 incentive) {
        if (!dynamicLiquidationIncentiveEnabled[market]) {
            return maxLiquidationIncentiveMantissa;
        }

        uint256 value = (healthFactor * mantissaOne) / liquidationThresholdAvg;
        return value > maxLiquidationIncentiveMantissa ? maxLiquidationIncentiveMantissa : value;
    }
}
