pragma solidity 0.8.13;

import "../Oracle/PriceOracle.sol";

contract FixedPriceOracle is PriceOracle {
    uint public price;

    constructor(uint _price) {
        price = _price;
    }

    function getUnderlyingPrice(VToken vToken) public override view returns (uint) {
        vToken;
        return price;
    }

    function assetPrices(address asset) public view returns (uint) {
        asset;
        return price;
    }
}
