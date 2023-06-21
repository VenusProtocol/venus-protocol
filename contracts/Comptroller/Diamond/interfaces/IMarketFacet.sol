pragma solidity 0.5.16;

import "../../../Tokens/VTokens/VToken.sol";
import "../../../Oracle/PriceOracle.sol";

interface IMarketFacet {
    function isComptroller() external pure returns (bool);

    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint actualRepayAmount
    ) external view returns (uint, uint);

    function liquidateVAICalculateSeizeTokens(
        address vTokenCollateral,
        uint actualRepayAmount
    ) external view returns (uint, uint);

    function checkMembership(address account, VToken vToken) external view returns (bool);

    function enterMarkets(address[] calldata vTokens) external returns (uint[] memory);

    function exitMarket(address vToken) external returns (uint);

    function _supportMarket(VToken vToken) external returns (uint);

    function getAssetsIn(address account) external view returns (VToken[] memory);

    function getAllMarkets() external view returns (VToken[] memory);

    function updateDelegate(address delegate, bool allowBorrows) external;
}
