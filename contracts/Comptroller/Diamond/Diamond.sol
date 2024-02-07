// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import { IDiamondCut } from "./interfaces/IDiamondCut.sol";
import { Unitroller, ComptrollerV15Storage } from "../Unitroller.sol";

/**
 * @title Diamond
 * @author Venus
 * @notice This contract contains functions related to facets
 */
contract Diamond is IDiamondCut, ComptrollerV15Storage {
    /// @notice Emitted when functions are added, replaced or removed to facets
    event DiamondCut(IDiamondCut.FacetCut[] _diamondCut);

    struct Facet {
        address facetAddress;
        bytes4[] functionSelectors;
    }

    /**
     * @notice Call _acceptImplementation to accept the diamond proxy as new implementaion
     * @param unitroller Address of the unitroller
     */
    function _become(Unitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can");
        require(unitroller._acceptImplementation() == 0, "not authorized");
    }

    /**
     * @notice To add function selectors to the facet's mapping
     * @dev Allows the contract admin to add function selectors
     * @param diamondCut_ IDiamondCut contains facets address, action and function selectors
     */
    function diamondCut(IDiamondCut.FacetCut[] memory diamondCut_) public {
        require(msg.sender == admin, "only unitroller admin can");
        libDiamondCut(diamondCut_);
    }

    /**
     * @notice Get all function selectors mapped to the facet address
     * @param facet Address of the facet
     * @return selectors Array of function selectors
     */
    function facetFunctionSelectors(address facet) external view returns (bytes4[] memory) {
        return _facetFunctionSelectors[facet].functionSelectors;
    }

    /**
     * @notice Get facet position in the _facetFunctionSelectors through facet address
     * @param facet Address of the facet
     * @return Position of the facet
     */
    function facetPosition(address facet) external view returns (uint256) {
        return _facetFunctionSelectors[facet].facetAddressPosition;
    }

    /**
     * @notice Get all facet addresses
     * @return facetAddresses Array of facet addresses
     */
    function facetAddresses() external view returns (address[] memory) {
        return _facetAddresses;
    }

    /**
     * @notice Get facet address and position through function selector
     * @param functionSelector function selector
     * @return FacetAddressAndPosition facet address and position
     */
    function facetAddress(
        bytes4 functionSelector
    ) external view returns (ComptrollerV15Storage.FacetAddressAndPosition memory) {
        return _selectorToFacetAndPosition[functionSelector];
    }

    /**
     * @notice Get all facets address and their function selector
     * @return facets_ Array of Facet
     */
    function facets() external view returns (Facet[] memory) {
        uint256 facetsLength = _facetAddresses.length;
        Facet[] memory facets_ = new Facet[](facetsLength);
        for (uint256 i; i < facetsLength; ++i) {
            address facet = _facetAddresses[i];
            facets_[i].facetAddress = facet;
            facets_[i].functionSelectors = _facetFunctionSelectors[facet].functionSelectors;
        }
        return facets_;
    }

    /**
     * @notice To add function selectors to the facets' mapping
     * @param diamondCut_ IDiamondCut contains facets address, action and function selectors
     */
    function libDiamondCut(IDiamondCut.FacetCut[] memory diamondCut_) internal {
        uint256 diamondCutLength = diamondCut_.length;
        for (uint256 facetIndex; facetIndex < diamondCutLength; ++facetIndex) {
            IDiamondCut.FacetCutAction action = diamondCut_[facetIndex].action;
            if (action == IDiamondCut.FacetCutAction.Add) {
                addFunctions(diamondCut_[facetIndex].facetAddress, diamondCut_[facetIndex].functionSelectors);
            } else if (action == IDiamondCut.FacetCutAction.Replace) {
                replaceFunctions(diamondCut_[facetIndex].facetAddress, diamondCut_[facetIndex].functionSelectors);
            } else if (action == IDiamondCut.FacetCutAction.Remove) {
                removeFunctions(diamondCut_[facetIndex].facetAddress, diamondCut_[facetIndex].functionSelectors);
            } else {
                revert("LibDiamondCut: Incorrect FacetCutAction");
            }
        }
        emit DiamondCut(diamondCut_);
    }

    /**
     * @notice Add function selectors to the facet's address mapping
     * @param facetAddress Address of the facet
     * @param functionSelectors Array of function selectors need to add in the mapping
     */
    function addFunctions(address facetAddress, bytes4[] memory functionSelectors) internal {
        require(functionSelectors.length != 0, "LibDiamondCut: No selectors in facet to cut");
        require(facetAddress != address(0), "LibDiamondCut: Add facet can't be address(0)");
        uint96 selectorPosition = uint96(_facetFunctionSelectors[facetAddress].functionSelectors.length);
        // add new facet address if it does not exist
        if (selectorPosition == 0) {
            addFacet(facetAddress);
        }
        uint256 functionSelectorsLength = functionSelectors.length;
        for (uint256 selectorIndex; selectorIndex < functionSelectorsLength; ++selectorIndex) {
            bytes4 selector = functionSelectors[selectorIndex];
            address oldFacetAddress = _selectorToFacetAndPosition[selector].facetAddress;
            require(oldFacetAddress == address(0), "LibDiamondCut: Can't add function that already exists");
            addFunction(selector, selectorPosition, facetAddress);
            ++selectorPosition;
        }
    }

    /**
     * @notice Replace facet's address mapping for function selectors i.e selectors already associate to any other existing facet
     * @param facetAddress Address of the facet
     * @param functionSelectors Array of function selectors need to replace in the mapping
     */
    function replaceFunctions(address facetAddress, bytes4[] memory functionSelectors) internal {
        require(functionSelectors.length != 0, "LibDiamondCut: No selectors in facet to cut");
        require(facetAddress != address(0), "LibDiamondCut: Add facet can't be address(0)");
        uint96 selectorPosition = uint96(_facetFunctionSelectors[facetAddress].functionSelectors.length);
        // add new facet address if it does not exist
        if (selectorPosition == 0) {
            addFacet(facetAddress);
        }
        uint256 functionSelectorsLength = functionSelectors.length;
        for (uint256 selectorIndex; selectorIndex < functionSelectorsLength; ++selectorIndex) {
            bytes4 selector = functionSelectors[selectorIndex];
            address oldFacetAddress = _selectorToFacetAndPosition[selector].facetAddress;
            require(oldFacetAddress != facetAddress, "LibDiamondCut: Can't replace function with same function");
            removeFunction(oldFacetAddress, selector);
            addFunction(selector, selectorPosition, facetAddress);
            ++selectorPosition;
        }
    }

    /**
     * @notice Remove function selectors to the facet's address mapping
     * @param facetAddress Address of the facet
     * @param functionSelectors Array of function selectors need to remove in the mapping
     */
    function removeFunctions(address facetAddress, bytes4[] memory functionSelectors) internal {
        uint256 functionSelectorsLength = functionSelectors.length;
        require(functionSelectorsLength != 0, "LibDiamondCut: No selectors in facet to cut");
        // if function does not exist then do nothing and revert
        require(facetAddress == address(0), "LibDiamondCut: Remove facet address must be address(0)");
        for (uint256 selectorIndex; selectorIndex < functionSelectorsLength; ++selectorIndex) {
            bytes4 selector = functionSelectors[selectorIndex];
            address oldFacetAddress = _selectorToFacetAndPosition[selector].facetAddress;
            removeFunction(oldFacetAddress, selector);
        }
    }

    /**
     * @notice Add new facet to the proxy
     * @param facetAddress Address of the facet
     */
    function addFacet(address facetAddress) internal {
        enforceHasContractCode(facetAddress, "Diamond: New facet has no code");
        _facetFunctionSelectors[facetAddress].facetAddressPosition = _facetAddresses.length;
        _facetAddresses.push(facetAddress);
    }

    /**
     * @notice Add function selector to the facet's address mapping
     * @param selector funciton selector need to be added
     * @param selectorPosition funciton selector position
     * @param facetAddress Address of the facet
     */
    function addFunction(bytes4 selector, uint96 selectorPosition, address facetAddress) internal {
        _selectorToFacetAndPosition[selector].functionSelectorPosition = selectorPosition;
        _facetFunctionSelectors[facetAddress].functionSelectors.push(selector);
        _selectorToFacetAndPosition[selector].facetAddress = facetAddress;
    }

    /**
     * @notice Remove function selector to the facet's address mapping
     * @param facetAddress Address of the facet
     * @param selector function selectors need to remove in the mapping
     */
    function removeFunction(address facetAddress, bytes4 selector) internal {
        require(facetAddress != address(0), "LibDiamondCut: Can't remove function that doesn't exist");

        // replace selector with last selector, then delete last selector
        uint256 selectorPosition = _selectorToFacetAndPosition[selector].functionSelectorPosition;
        uint256 lastSelectorPosition = _facetFunctionSelectors[facetAddress].functionSelectors.length - 1;
        // if not the same then replace selector with lastSelector
        if (selectorPosition != lastSelectorPosition) {
            bytes4 lastSelector = _facetFunctionSelectors[facetAddress].functionSelectors[lastSelectorPosition];
            _facetFunctionSelectors[facetAddress].functionSelectors[selectorPosition] = lastSelector;
            _selectorToFacetAndPosition[lastSelector].functionSelectorPosition = uint96(selectorPosition);
        }
        // delete the last selector
        _facetFunctionSelectors[facetAddress].functionSelectors.pop();
        delete _selectorToFacetAndPosition[selector];

        // if no more selectors for facet address then delete the facet address
        if (lastSelectorPosition == 0) {
            // replace facet address with last facet address and delete last facet address
            uint256 lastFacetAddressPosition = _facetAddresses.length - 1;
            uint256 facetAddressPosition = _facetFunctionSelectors[facetAddress].facetAddressPosition;
            if (facetAddressPosition != lastFacetAddressPosition) {
                address lastFacetAddress = _facetAddresses[lastFacetAddressPosition];
                _facetAddresses[facetAddressPosition] = lastFacetAddress;
                _facetFunctionSelectors[lastFacetAddress].facetAddressPosition = facetAddressPosition;
            }
            _facetAddresses.pop();
            delete _facetFunctionSelectors[facetAddress];
        }
    }

    /**
     * @dev Ensure that the given address has contract code deployed
     * @param _contract The address to check for contract code
     * @param _errorMessage The error message to display if the contract code is not deployed
     */
    function enforceHasContractCode(address _contract, string memory _errorMessage) internal view {
        uint256 contractSize;
        assembly {
            contractSize := extcodesize(_contract)
        }
        require(contractSize != 0, _errorMessage);
    }

    // Find facet for function that is called and execute the
    // function if a facet is found and return any value.
    function() external payable {
        address facet = _selectorToFacetAndPosition[msg.sig].facetAddress;
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
