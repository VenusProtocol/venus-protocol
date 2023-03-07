pragma solidity ^0.8.13;

interface IMarketFacet {
    function enterMarkets(address[] calldata vTokens) external returns (uint[] memory);

    function exitMarket(address vToken) external returns (uint);
}
