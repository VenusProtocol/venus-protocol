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
        address borrower,
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

    function getDynamicLiquidationIncentive(address borrower, address vToken) external view returns (uint256);

    function getAllMarkets() external view returns (VToken[] memory);

    function updateDelegate(address delegate, bool allowBorrows) external;

    function unlistMarket(address market) external returns (uint256);

    function getCollateralFactor(address vToken) external view returns (uint256);

    function getLiquidationThreshold(address vToken) external view returns (uint256);
}
