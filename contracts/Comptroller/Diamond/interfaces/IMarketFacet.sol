// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.5.16;

import { VToken } from "../../../Tokens/VTokens/VToken.sol";

interface IMarketFacet {
    function isComptroller() external pure returns (bool);

    function liquidateCalculateSeizeTokens(
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

    function getAssetsIn(address account) external view returns (VToken[] memory);

    function getAllMarkets() external view returns (VToken[] memory);

    function updateDelegate(address delegate, bool allowBorrows) external;
}
