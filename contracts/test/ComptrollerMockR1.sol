pragma solidity 0.8.25;

import "../Comptroller/legacy/Diamond/facets/MarketFacetR1.sol";
import "../Comptroller/legacy/Diamond/facets/PolicyFacetR1.sol";
import "../Comptroller/legacy/Diamond/facets/RewardFacetR1.sol";
import "../Comptroller/legacy/Diamond/facets/SetterFacetR1.sol";
import "../Comptroller/Unitroller.sol";

// This contract contains all methods of Comptroller implementation in different facets at one place for testing purpose
// This contract does not have diamond functionality(i.e delegate call to facets methods)
contract ComptrollerMockR1 is MarketFacetR1, PolicyFacetR1, RewardFacetR1, SetterFacetR1 {
    constructor() {
        admin = msg.sender;
    }

    function _become(Unitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can");
        require(unitroller._acceptImplementation() == 0, "not authorized");
    }

    function _setComptrollerLens(ComptrollerLensInterfaceR1 comptrollerLens_) external override returns (uint) {
        ensureAdmin();
        ensureNonzeroAddress(address(comptrollerLens_));
        address oldComptrollerLens = address(comptrollerLens);
        comptrollerLens = comptrollerLens_;
        emit NewComptrollerLens(oldComptrollerLens, address(comptrollerLens));

        return uint(Error.NO_ERROR);
    }
}
