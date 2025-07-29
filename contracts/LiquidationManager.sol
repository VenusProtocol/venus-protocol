// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.5.16;

import { ExponentialNoError } from "./Utils/ExponentialNoError.sol";

contract LiquidationManager is ExponentialNoError {
    function calculateCloseFactor(
        uint256 borrowBalance,
        uint256 wtAvg,
        uint256 totalCollateral,
        uint256 healthFactor,
        uint256 healthFactorThreshold,
        uint256 maxLiquidationIncentive
    ) external pure returns (uint256 closeFactor) {
        if (healthFactor >= healthFactorThreshold) {
            // Prevent underflow
            require(
                wtAvg * totalCollateral <= borrowBalance * mantissaOne,
                "LiquidationManager: Collateral exceeds borrow capacity"
            );

            uint256 numerator = borrowBalance * mantissaOne - wtAvg * totalCollateral;
            uint256 denominator = borrowBalance *
                (mantissaOne - ((wtAvg * (mantissaOne + maxLiquidationIncentive)) / mantissaOne));

            closeFactor = (numerator * mantissaOne) / denominator;
            closeFactor = closeFactor > mantissaOne ? mantissaOne : closeFactor;
        } else {
            closeFactor = mantissaOne; // Liquidate 100% if unhealthy
        }
    }

    function calculateDynamicLiquidationIncentive(
        uint256 healthFactor,
        uint256 healthFactorThreshold,
        uint256 averageLT,
        uint256 maxLiquidationIncentiveMantissa
    ) external pure returns (uint256 incentive) {
        if (healthFactor >= healthFactorThreshold) {
            return maxLiquidationIncentiveMantissa;
        }

        uint256 value = ((healthFactor * 1e18) / averageLT) - 1e18;
        return value > maxLiquidationIncentiveMantissa ? maxLiquidationIncentiveMantissa : value;
    }

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

    function isToxicLiquidation(
        uint256 averageLT,
        uint256 liquidationIncentiveAvg,
        uint256 healthFactor
    ) external pure returns (bool) {
        return ((averageLT * (1e18 + liquidationIncentiveAvg)) > healthFactor);
    }
}
