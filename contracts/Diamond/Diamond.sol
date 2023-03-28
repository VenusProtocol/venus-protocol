pragma solidity 0.8.13;

import { LibDiamond } from "./libraries/LibDiamond.sol";
import { AppStorage } from "./libraries/appStorage.sol";

import { IDiamondCut } from "./interfaces/IDiamondCut.sol";

interface IUnitroller {
    function admin() external view returns(address);
    function _acceptImplementation() external returns (uint);
}

contract Diamond {
    AppStorage internal s;

    constructor(address _contractOwner, address _unitrollerAddress) payable {
        LibDiamond.setContractOwner(_contractOwner);
        LibDiamond.setUnitrollerAddress(_unitrollerAddress);
    }

    function facetCutInitilizer(address _diamondCutFacet) external {
        require(s.admin == msg.sender, "Owner check");
        // Add the diamondCut external function from the diamondCutFacet
        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](1);
        bytes4[] memory functionSelectors = new bytes4[](1);
        functionSelectors[0] = IDiamondCut.diamondCut.selector;
        cut[0] = IDiamondCut.FacetCut({
            facetAddress: _diamondCutFacet,
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: functionSelectors
        });
        LibDiamond.libDiamondCut(cut, address(0), "");
    }

    function _become() external {
        address unitrollerAddress = LibDiamond.getUnitrollerAddress();
        require(msg.sender == IUnitroller(unitrollerAddress).admin(), "only unitroller admin can");
        require(IUnitroller(unitrollerAddress)._acceptImplementation() == 0, "not authorized");
    }

    // Find facet for function that is called and execute the
    // function if a facet is found and return any value.
    fallback() external payable {
        LibDiamond.DiamondStorage storage ds;
        bytes32 position = LibDiamond.DIAMOND_STORAGE_POSITION;
        // get diamond storage
        assembly {
            ds.slot := position
        }
        // get facet from function selector
        address facet = ds.selectorToFacetAndPosition[msg.sig].facetAddress;
        require(facet != address(0), "Diamond: Function does not exist");
        // Execute external function from facet using delegatecall and return any value.
        assembly {
            // copy function selector and any arguments
            calldatacopy(0, 0, calldatasize())
            // execute function call using the facet
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            // get any return value
            returndatacopy(0, 0, returndatasize())
            // return any return value or error back to the caller
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    receive() external payable {}
}