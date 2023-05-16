pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

contract DiamondHarnessInterface {
    enum FacetCutAction {
        Add,
        Replace,
        Remove
    }

    struct FacetCut {
        address facetAddress;
        FacetCutAction action;
        bytes4[] functionSelectors;
    }

    function getFacetAddress(bytes4 sig) public view returns (address);

    function diamondCut(FacetCut[] calldata _diamondCut) external;
}
