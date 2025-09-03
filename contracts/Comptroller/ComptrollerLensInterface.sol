// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { VToken } from "../Tokens/VTokens/VToken.sol";
import { WeightFunction } from "./Diamond/interfaces/IFacetBase.sol";

interface ComptrollerLensInterface {
    struct AccountSnapshot {
        // Total collateral value supplied by the account (USD, scaled by 1e18)
        uint256 totalCollateral;
        // Collateral value weighted by each asset's liquidation threshold or collateral factor (USD, scaled by 1e18)
        uint256 weightedCollateral;
        // Total borrowed value by the account (USD, scaled by 1e18)
        uint256 borrows;
        // Amount of excess collateral available for borrowing (USD, scaled by 1e18)
        uint256 liquidity;
        // Amount by which the account is undercollateralized (USD, scaled by 1e18)
        uint256 shortfall;
        // Average liquidation threshold across all supplied assets (scaled by 1e18)
        uint256 liquidationThresholdAvg;
        // Health factor of the account, used to assess liquidation risk (scaled by 1e18)
        uint256 healthFactor;
        // Dynamic liquidation incentive factor applied during liquidations (scaled by 1e18)
        uint256 dynamicLiquidationIncentiveMantissa;
    }

    // Just need to make borrower first then comptroller
    function liquidateCalculateSeizeTokens(
        address comptroller,
        address borrower,
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256);

    function liquidateCalculateSeizeTokens(
        address comptroller,
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount,
        uint256 liquidationIncentiveMantissa
    ) external view returns (uint256, uint256);

    function liquidateVAICalculateSeizeTokens(
        address comptroller,
        address vTokenCollateral,
        uint256 actualRepayAmount,
        uint256 liquidationIncentiveMantissa
    ) external view returns (uint256, uint256);

    function getHypotheticalAccountLiquidity(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount,
        WeightFunction weightingStrategy
    ) external view returns (uint256, uint256, uint256);

    function getAccountHealthSnapshot(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount,
        WeightFunction weightingStrategy
    ) external view returns (uint256, AccountSnapshot memory);
}
