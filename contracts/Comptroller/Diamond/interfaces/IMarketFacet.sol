// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { IVToken } from "../../../Tokens/VTokens/interfaces/IVToken.sol";

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

    function checkMembership(address account, IVToken vToken) external view returns (bool);

    function enterMarkets(address[] calldata vTokens) external returns (uint256[] memory);

    function exitMarket(address vToken) external returns (uint256);

    function _supportMarket(IVToken vToken) external returns (uint256);

    function supportMarket(IVToken vToken) external returns (uint256);

    function isMarketListed(IVToken vToken) external view returns (bool);

    function getAssetsIn(address account) external view returns (IVToken[] memory);

    function getAllMarkets() external view returns (IVToken[] memory);

    function updateDelegate(address delegate, bool allowBorrows) external;

    function unlistMarket(address market) external returns (uint256);
}
