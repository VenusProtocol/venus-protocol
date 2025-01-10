pragma solidity ^0.5.16;

import { PriceOracle } from "../Oracle/PriceOracle.sol";
import { VTokenInterface } from "../Tokens/VTokens/VTokenInterfaces.sol";

contract FixedPriceOracle is PriceOracle {
    uint public price;

    constructor(uint _price) public {
        price = _price;
    }

    function getUnderlyingPrice(VTokenInterface vToken) public view returns (uint) {
        vToken;
        return price;
    }

    function assetPrices(address asset) public view returns (uint) {
        asset;
        return price;
    }
}
