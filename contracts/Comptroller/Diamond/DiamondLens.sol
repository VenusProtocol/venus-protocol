pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "../ComptrollerStorage.sol";

contract DiamondLens is ComptrollerV12Storage {
    function getFacetFunctionSelectors(address _facet) external view returns (bytes4[] memory _facetFunctionSelectors) {
        _facetFunctionSelectors = facetFunctionSelectors[_facet].functionSelectors;
    }

    function getFacetPosition(address _facet) external view returns (uint256) {
        return facetFunctionSelectors[_facet].facetAddressPosition;
    }

    function getAllFacetAddresses() external view returns (address[] memory facetAddresses_) {
        facetAddresses_ = facetAddresses;
    }

    function getFacetAddressAndPosition(
        bytes4 _functionSelector
    ) external view returns (ComptrollerV12Storage.FacetAddressAndPosition memory) {
        return selectorToFacetAndPosition[_functionSelector];
    }
}
