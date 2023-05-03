pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import { IDiamondCut } from "./interfaces/IDiamondCut.sol";
import "../ComptrollerStorage.sol";
import "../Unitroller.sol";

import "hardhat/console.sol";

contract Diamond is ComptrollerV12Storage {
    event DiamondCut(IDiamondCut.FacetCut[] _diamondCut);

    function _become(Unitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can");
        console.log("-------------------become");
        require(unitroller._acceptImplementation() == 0, "not authorized");
    }

    function diamondCut(IDiamondCut.FacetCut[] memory _diamondCut) public {
        require(msg.sender == admin, "only unitroller admin can");
        libDiamondCut(_diamondCut);
    }

    function libDiamondCut(IDiamondCut.FacetCut[] memory _diamondCut) internal {
        for (uint256 facetIndex; facetIndex < _diamondCut.length; facetIndex++) {
            IDiamondCut.FacetCutAction action = _diamondCut[facetIndex].action;
            if (action == IDiamondCut.FacetCutAction.Add) {
                addFunctions(_diamondCut[facetIndex].facetAddress, _diamondCut[facetIndex].functionSelectors);
            } else if (action == IDiamondCut.FacetCutAction.Replace) {
                replaceFunctions(_diamondCut[facetIndex].facetAddress, _diamondCut[facetIndex].functionSelectors);
            } else if (action == IDiamondCut.FacetCutAction.Remove) {
                removeFunctions(_diamondCut[facetIndex].facetAddress, _diamondCut[facetIndex].functionSelectors);
            } else {
                revert("LibDiamondCut: Incorrect FacetCutAction");
            }
        }
        emit DiamondCut(_diamondCut);
    }

    function addFunctions(address _facetAddress, bytes4[] memory _functionSelectors) internal {
        require(_functionSelectors.length > 0, "LibDiamondCut: No selectors in facet to cut");
        require(_facetAddress != address(0), "LibDiamondCut: Add facet can't be address(0)");
        uint96 selectorPosition = uint96(facetFunctionSelectors[_facetAddress].functionSelectors.length);
        // add new facet address if it does not exist
        if (selectorPosition == 0) {
            addFacet(_facetAddress);
        }
        for (uint256 selectorIndex; selectorIndex < _functionSelectors.length; selectorIndex++) {
            bytes4 selector = _functionSelectors[selectorIndex];
            address oldFacetAddress = selectorToFacetAndPosition[selector].facetAddress;
            console.log("-------------selector", oldFacetAddress, selectorIndex);
            require(oldFacetAddress == address(0), "LibDiamondCut: Can't add function that already exists");
            addFunction(selector, selectorPosition, _facetAddress);
            selectorPosition++;
        }
    }

    function replaceFunctions(address _facetAddress, bytes4[] memory _functionSelectors) internal {
        require(_functionSelectors.length > 0, "LibDiamondCut: No selectors in facet to cut");
        require(_facetAddress != address(0), "LibDiamondCut: Add facet can't be address(0)");
        uint96 selectorPosition = uint96(facetFunctionSelectors[_facetAddress].functionSelectors.length);
        // add new facet address if it does not exist
        if (selectorPosition == 0) {
            addFacet(_facetAddress);
        }
        for (uint256 selectorIndex; selectorIndex < _functionSelectors.length; selectorIndex++) {
            bytes4 selector = _functionSelectors[selectorIndex];
            address oldFacetAddress = selectorToFacetAndPosition[selector].facetAddress;
            require(oldFacetAddress != _facetAddress, "LibDiamondCut: Can't replace function with same function");
            removeFunction(oldFacetAddress, selector);
            addFunction(selector, selectorPosition, _facetAddress);
            selectorPosition++;
        }
    }

    function removeFunctions(address _facetAddress, bytes4[] memory _functionSelectors) internal {
        require(_functionSelectors.length > 0, "LibDiamondCut: No selectors in facet to cut");
        // if function does not exist then do nothing and return
        require(_facetAddress == address(0), "LibDiamondCut: Remove facet address must be address(0)");
        for (uint256 selectorIndex; selectorIndex < _functionSelectors.length; selectorIndex++) {
            bytes4 selector = _functionSelectors[selectorIndex];
            address oldFacetAddress = selectorToFacetAndPosition[selector].facetAddress;
            removeFunction(oldFacetAddress, selector);
        }
    }

    function addFacet(address _facetAddress) internal {
        enforceHasContractCode(_facetAddress, "Diamond: New facet has no code");
        facetFunctionSelectors[_facetAddress].facetAddressPosition = facetAddresses.length;
        facetAddresses.push(_facetAddress);
    }

    function addFunction(bytes4 _selector, uint96 _selectorPosition, address _facetAddress) internal {
        selectorToFacetAndPosition[_selector].functionSelectorPosition = _selectorPosition;
        facetFunctionSelectors[_facetAddress].functionSelectors.push(_selector);
        selectorToFacetAndPosition[_selector].facetAddress = _facetAddress;
    }

    function removeFunction(address _facetAddress, bytes4 _selector) internal {
        require(_facetAddress != address(0), "LibDiamondCut: Can't remove function that doesn't exist");
        // an immutable function is a function defined directly in a diamond
        require(_facetAddress != address(this), "LibDiamondCut: Can't remove immutable function");
        // replace selector with last selector, then delete last selector
        uint256 selectorPosition = selectorToFacetAndPosition[_selector].functionSelectorPosition;
        uint256 lastSelectorPosition = facetFunctionSelectors[_facetAddress].functionSelectors.length - 1;
        // if not the same then replace _selector with lastSelector
        if (selectorPosition != lastSelectorPosition) {
            bytes4 lastSelector = facetFunctionSelectors[_facetAddress].functionSelectors[lastSelectorPosition];
            facetFunctionSelectors[_facetAddress].functionSelectors[selectorPosition] = lastSelector;
            selectorToFacetAndPosition[lastSelector].functionSelectorPosition = uint96(selectorPosition);
        }
        // delete the last selector
        facetFunctionSelectors[_facetAddress].functionSelectors.pop();
        delete selectorToFacetAndPosition[_selector];

        // if no more selectors for facet address then delete the facet address
        if (lastSelectorPosition == 0) {
            // replace facet address with last facet address and delete last facet address
            uint256 lastFacetAddressPosition = facetAddresses.length - 1;
            uint256 facetAddressPosition = facetFunctionSelectors[_facetAddress].facetAddressPosition;
            if (facetAddressPosition != lastFacetAddressPosition) {
                address lastFacetAddress = facetAddresses[lastFacetAddressPosition];
                facetAddresses[facetAddressPosition] = lastFacetAddress;
                facetFunctionSelectors[lastFacetAddress].facetAddressPosition = facetAddressPosition;
            }
            facetAddresses.pop();
            delete facetFunctionSelectors[_facetAddress].facetAddressPosition;
        }
    }

    function enforceHasContractCode(address _contract, string memory _errorMessage) internal view {
        uint256 contractSize;
        assembly {
            contractSize := extcodesize(_contract)
        }
        require(contractSize > 0, _errorMessage);
    }

    // Find facet for function that is called and execute the
    // function if a facet is found and return any value.
    function() external payable {
        address facet = selectorToFacetAndPosition[msg.sig].facetAddress;
        console.log("--------------------facetAddress", facet);
        require(facet != address(0), "Diamond: Function does not exist");
        // Execute public function from facet using delegatecall and return any value.
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
}
