// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { VToken } from "../../../Tokens/VTokens/VToken.sol";

interface IMarketFacet {
    function isComptroller() external pure returns (bool);

    function liquidateCalculateSeizeTokens(
        address borrower,
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256);

    function liquidateVAICalculateSeizeTokens(
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256);

    function checkMembership(address account, VToken vToken) external view returns (bool);

    function enterMarkets(address[] calldata vTokens) external returns (uint256[] memory);

    function exitMarket(address vToken) external returns (uint256);

    function _supportMarket(VToken vToken) external returns (uint256);

    function supportMarket(VToken vToken) external returns (uint256);

    function isMarketListed(VToken vToken) external view returns (bool);

    function getAssetsIn(address account) external view returns (VToken[] memory);

    function getAllMarkets() external view returns (VToken[] memory);

    function updateDelegate(address delegate, bool allowBorrows) external;

    function unlistMarket(address market) external returns (uint256);

    function createPool(string memory label) external returns (uint96);

    function enterPool(uint96 poolId) external;

    function addPoolMarkets(uint96[] calldata poolIds, address[] calldata vTokens) external;

    function removePoolMarket(uint96 poolId, address vToken) external;

    function updatePoolMarketBorrow(uint96 poolId, address vToken, bool borrowAllowed) external;

    function updatePoolMarketRiskParams(
        uint96 poolId,
        address vToken,
        uint256 collateralFactorMantissa,
        uint256 liquidationThresholdMantissa,
        uint256 maxLiquidationIncentiveMantissa
    ) external;

    function markets(
        address vToken
    )
        external
        view
        returns (
            bool isListed,
            uint256 collateralFactorMantissa,
            bool isVenus,
            uint256 liquidationThresholdMantissa,
            uint256 liquidationIncentiveMantissa,
            uint96 marketPoolId,
            bool isBorrowAllowed
        );

    function poolMarkets(
        uint96 poolId,
        address vToken
    )
        external
        view
        returns (
            bool isListed,
            uint256 collateralFactorMantissa,
            bool isVenus,
            uint256 liquidationThresholdMantissa,
            uint256 maxLiquidationIncentiveMantissa,
            uint96 marketPoolId,
            bool isBorrowAllowed
        );

    function hasValidPoolBorrows(address user, uint96 targetPoolId) external view returns (bool);
}
