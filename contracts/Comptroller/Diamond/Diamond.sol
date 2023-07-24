pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import { IDiamondCut } from "./interfaces/IDiamondCut.sol";
import "../ComptrollerStorage.sol";
import "../Unitroller.sol";

contract Diamond is ComptrollerV12Storage {
    event DiamondCut(IDiamondCut.FacetCut[] _diamondCut);

    struct Facet {
        address facetAddress;
        bytes4[] functionSelectors;
    }

    /**
     * @notice Call _acceptImplementation to accept the diamond proxy as new implementaion.
     * @param unitroller Address of the unitroller.
     */
    function _become(Unitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can");
        require(unitroller._acceptImplementation() == 0, "not authorized");
    }

    /**
     * @notice To add function selectors to the facets' mapping.
     * @param _diamondCut IDiamondCut contains facets address, action and function selectors.
     */
    function diamondCut(IDiamondCut.FacetCut[] memory _diamondCut) public {
        require(msg.sender == admin, "only unitroller admin can");
        libDiamondCut(_diamondCut);
    }

    /**
     * @notice Get all function selectors mapped to the facet address
     * @param _facet Address of the facet
     * @return _facetFunctionSelectors Array of function selectors
     */
    function getFacetFunctionSelectors(address _facet) external view returns (bytes4[] memory _facetFunctionSelectors) {
        _facetFunctionSelectors = facetFunctionSelectors[_facet].functionSelectors;
    }

    /**
     * @notice Get facet position in the facetFunctionSelectors through facet address
     * @param _facet Address of the facet
     * @return Position of the facet
     */
    function getFacetPosition(address _facet) external view returns (uint256) {
        return facetFunctionSelectors[_facet].facetAddressPosition;
    }

    /**
     * @notice Get all facet addresses
     * @return facetAddresses_ Array of facet addresses
     */
    function getAllFacetAddresses() external view returns (address[] memory facetAddresses_) {
        facetAddresses_ = facetAddresses;
    }

    /**
     * @notice Get facet address and position through function selector
     * @param _functionSelector function selector
     * @return FacetAddressAndPosition facet address and position
     */
    function getFacetAddressAndPosition(
        bytes4 _functionSelector
    ) external view returns (ComptrollerV12Storage.FacetAddressAndPosition memory) {
        return selectorToFacetAndPosition[_functionSelector];
    }

    /**
     * @notice Get all facets address and their function selector
     * @return facets Array of Facet
     */
    function getAllFacets() external view returns (Facet[] memory facets) {
        uint facetsLength = facetAddresses.length;
        facets = new Facet[](facetsLength);
        for (uint256 i; i < facetsLength; ++i) {
            address facetAddress = facetAddresses[i];
            facets[i].facetAddress = facetAddress;
            facets[i].functionSelectors = facetFunctionSelectors[facetAddress].functionSelectors;
        }
    }

    /**
     * @notice To add function selectors to the facets' mapping.
     * @param _diamondCut IDiamondCut contains facets address, action and function selectors.
     */
    function libDiamondCut(IDiamondCut.FacetCut[] memory _diamondCut) internal {
        uint256 diamondCutLength = _diamondCut.length;
        for (uint256 facetIndex; facetIndex < diamondCutLength; ++facetIndex) {
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

    /**
     * @notice Add function selectors to the facet's address mapping.
     * @param _facetAddress Address of the facet.
     * @param _functionSelectors Array of function selectors need to add in the mapping.
     */
    function addFunctions(address _facetAddress, bytes4[] memory _functionSelectors) internal {
        require(_functionSelectors.length != 0, "LibDiamondCut: No selectors in facet to cut");
        require(_facetAddress != address(0), "LibDiamondCut: Add facet can't be address(0)");
        uint96 selectorPosition = uint96(facetFunctionSelectors[_facetAddress].functionSelectors.length);
        // add new facet address if it does not exist
        if (selectorPosition == 0) {
            addFacet(_facetAddress);
        }
        uint256 functionSelectorsLength = _functionSelectors.length;
        for (uint256 selectorIndex; selectorIndex < functionSelectorsLength; ++selectorIndex) {
            bytes4 selector = _functionSelectors[selectorIndex];
            address oldFacetAddress = selectorToFacetAndPosition[selector].facetAddress;
            require(oldFacetAddress == address(0), "LibDiamondCut: Can't add function that already exists");
            addFunction(selector, selectorPosition, _facetAddress);
            ++selectorPosition;
        }
    }

    /**
     * @notice Replace facet's address mapping for function selectors i.e selectors already associate to any other existing facet.
     * @param _facetAddress Address of the facet.
     * @param _functionSelectors Array of function selectors need to replace in the mapping.
     */
    function replaceFunctions(address _facetAddress, bytes4[] memory _functionSelectors) internal {
        require(_functionSelectors.length != 0, "LibDiamondCut: No selectors in facet to cut");
        require(_facetAddress != address(0), "LibDiamondCut: Add facet can't be address(0)");
        uint96 selectorPosition = uint96(facetFunctionSelectors[_facetAddress].functionSelectors.length);
        // add new facet address if it does not exist
        if (selectorPosition == 0) {
            addFacet(_facetAddress);
        }
        uint256 functionSelectorsLength = _functionSelectors.length;
        for (uint256 selectorIndex; selectorIndex < functionSelectorsLength; ++selectorIndex) {
            bytes4 selector = _functionSelectors[selectorIndex];
            address oldFacetAddress = selectorToFacetAndPosition[selector].facetAddress;
            require(oldFacetAddress != _facetAddress, "LibDiamondCut: Can't replace function with same function");
            removeFunction(oldFacetAddress, selector);
            addFunction(selector, selectorPosition, _facetAddress);
            ++selectorPosition;
        }
    }

    /**
     * @notice Remove function selectors to the facet's address mapping.
     * @param _facetAddress Address of the facet.
     * @param _functionSelectors Array of function selectors need to remove in the mapping.
     */
    function removeFunctions(address _facetAddress, bytes4[] memory _functionSelectors) internal {
        uint256 functionSelectorsLength = _functionSelectors.length;
        require(functionSelectorsLength != 0, "LibDiamondCut: No selectors in facet to cut");
        // if function does not exist then do nothing and revert
        require(_facetAddress == address(0), "LibDiamondCut: Remove facet address must be address(0)");
        for (uint256 selectorIndex; selectorIndex < functionSelectorsLength; ++selectorIndex) {
            bytes4 selector = _functionSelectors[selectorIndex];
            address oldFacetAddress = selectorToFacetAndPosition[selector].facetAddress;
            removeFunction(oldFacetAddress, selector);
        }
    }

    /**
     * @notice Add new facet to the proxy.
     * @param _facetAddress Address of the facet.
     */
    function addFacet(address _facetAddress) internal {
        enforceHasContractCode(_facetAddress, "Diamond: New facet has no code");
        facetFunctionSelectors[_facetAddress].facetAddressPosition = facetAddresses.length;
        facetAddresses.push(_facetAddress);
    }

    /**
     * @notice Add function selector to the facet's address mapping.
     * @param _selector funciton selector need to be added.
     * @param _selectorPosition funciton selector position.
     * @param _facetAddress Address of the facet.
     */
    function addFunction(bytes4 _selector, uint96 _selectorPosition, address _facetAddress) internal {
        selectorToFacetAndPosition[_selector].functionSelectorPosition = _selectorPosition;
        facetFunctionSelectors[_facetAddress].functionSelectors.push(_selector);
        selectorToFacetAndPosition[_selector].facetAddress = _facetAddress;
    }

    /**
     * @notice Remove function selector to the facet's address mapping.
     * @param _facetAddress Address of the facet.
     * @param _selector function selectors need to remove in the mapping.
     */
    function removeFunction(address _facetAddress, bytes4 _selector) internal {
        require(_facetAddress != address(0), "LibDiamondCut: Can't remove function that doesn't exist");

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
            delete facetFunctionSelectors[_facetAddress];
        }
    }

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
        address facet = selectorToFacetAndPosition[msg.sig].facetAddress;
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
