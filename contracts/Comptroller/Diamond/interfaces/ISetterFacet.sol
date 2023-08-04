pragma solidity 0.5.16;

import { PriceOracle } from "../../../Oracle/PriceOracle.sol";
import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { ComptrollerV12Storage } from "../../ComptrollerStorage.sol";
import { VAIControllerInterface } from "../../../Tokens/VAI/VAIController.sol";
import { ComptrollerLensInterface } from "../../../Comptroller/ComptrollerLensInterface.sol";

interface ISetterFacet {
    function _setPriceOracle(PriceOracle newOracle) external returns (uint);

    function _setCloseFactor(uint newCloseFactorMantissa) external returns (uint);

    function _setAccessControl(address newAccessControlAddress) external returns (uint);

    function _setCollateralFactor(VToken vToken, uint newCollateralFactorMantissa) external returns (uint);

    function _setLiquidationIncentive(uint newLiquidationIncentiveMantissa) external returns (uint);

    function _setLiquidatorContract(address newLiquidatorContract_) external;

    function _setPauseGuardian(address newPauseGuardian) external returns (uint);

    function _setMarketBorrowCaps(VToken[] calldata vTokens, uint[] calldata newBorrowCaps) external;

    function _setMarketSupplyCaps(VToken[] calldata vTokens, uint256[] calldata newSupplyCaps) external;

    function _setProtocolPaused(bool state) external returns (bool);

    function _setActionsPaused(
        address[] calldata markets,
        ComptrollerV12Storage.Action[] calldata actions,
        bool paused
    ) external;

    function _setVAIController(VAIControllerInterface vaiController_) external returns (uint);

    function _setVAIMintRate(uint newVAIMintRate) external returns (uint);

    function setMintedVAIOf(address owner, uint amount) external returns (uint);

    function _setTreasuryData(
        address newTreasuryGuardian,
        address newTreasuryAddress,
        uint newTreasuryPercent
    ) external returns (uint);

    function _setComptrollerLens(ComptrollerLensInterface comptrollerLens_) external returns (uint);

    function _setVenusVAIVaultRate(uint venusVAIVaultRate_) external;

    function _setVAIVaultInfo(address vault_, uint256 releaseStartBlock_, uint256 minReleaseAmount_) external;
}
