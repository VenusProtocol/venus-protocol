pragma solidity 0.8.25;

import "../Tokens/VTokens/VToken.sol";

interface ComptrollerLensInterface {
    struct AccountSnapshot {
        // Total collateral value supplied by the account (USD, scaled by 1e18)
        uint256 totalCollateral;
        // Collateral value weighted by each asset's liquidation threshold or collateral factor (USD, scaled by 1e18)
        uint256 weightedCollateral;
        // Total borrowed value by the account (USD, scaled by 1e18)
        uint256 borrows;
        // Balance of vTokens held by the account (vTokens)
        uint256 vTokenBalance;
        // Outstanding borrow balance for the account (underlying asset units)
        uint256 borrowBalance;
        // Exchange rate between vToken and underlying asset (scaled by 1e18)
        uint256 exchangeRateMantissa;
        // Price of the underlying asset from the oracle (USD, scaled by 1e18)
        uint256 oraclePriceMantissa;
        // Amount of excess collateral available for borrowing (USD, scaled by 1e18)
        uint256 liquidity;
        // Amount by which the account is undercollateralized (USD, scaled by 1e18)
        uint256 shortfall;
        // Average liquidation threshold across all supplied assets (scaled by 1e18)
        uint256 liquidationThresholdAvg;
        // Health factor of the account, used to assess liquidation risk (scaled by 1e18)
        uint256 healthFactor;
        // Generic error code for operations
        uint256 err;
    }

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
        uint256 borrowAmount
    ) external view returns (uint256, uint256, uint256);

    function getAccountHealthSnapshot(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount
    ) external view returns (uint256, AccountSnapshot memory);
}
