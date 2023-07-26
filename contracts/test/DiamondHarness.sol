pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../Comptroller/Diamond/Diamond.sol";

contract DiamondHarness is Diamond {
    function getFacetAddress(bytes4 sig) public view returns (address) {
        address facet = _selectorToFacetAndPosition[sig].facetAddress;
        require(facet != address(0), "Diamond: Function does not exist");
        return facet;
    }
}
