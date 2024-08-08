pragma solidity ^0.5.16;

import "../Comptroller/Diamond/facets/MarketFacet.sol";
import "../Comptroller/Diamond/facets/PolicyFacet.sol";
import "../Comptroller/Diamond/facets/RewardFacet.sol";
import "../Comptroller/Diamond/facets/SetterFacet.sol";
import "../Comptroller/Unitroller.sol";

// This contract contains all methods of Comptroller implementation in different facets at one place for testing purpose
// This contract does not have diamond functionality(i.e delegate call to facets methods)
contract ComptrollerMockR1 is MarketFacet, PolicyFacet, RewardFacet, SetterFacet {
    event MarketListed(address vToken);
    event NewCollateralFactor(address vToken, uint256 oldCollateralFactorMantissa, uint256 newCollateralFactorMantissa);
    event MarketEntered(address vToken, address account);
    event MarketExited(address vToken, address account);

    constructor() public {
        admin = msg.sender;
    }

    function _become(Unitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can");
        require(unitroller._acceptImplementation() == 0, "not authorized");
    }

    function _setComptrollerLens(ComptrollerLensInterface comptrollerLens_) external returns (uint) {
        ensureAdmin();
        ensureNonzeroAddress(address(comptrollerLens_));
        address oldComptrollerLens = address(comptrollerLens);
        comptrollerLens = comptrollerLens_;
        emit NewComptrollerLens(oldComptrollerLens, address(comptrollerLens));

        return uint(Error.NO_ERROR);
    }
}
