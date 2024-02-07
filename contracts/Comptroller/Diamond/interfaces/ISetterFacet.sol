// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.5.16;

import { PriceOracle } from "../../../Oracle/PriceOracle.sol";
import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { ComptrollerTypes } from "../../ComptrollerStorage.sol";
import { VAIControllerInterface } from "../../../Tokens/VAI/VAIControllerInterface.sol";
import { ComptrollerLensInterface } from "../../../Comptroller/ComptrollerLensInterface.sol";
import { IPrime } from "../../../Tokens/Prime/IPrime.sol";

interface ISetterFacet {
    function _setPriceOracle(PriceOracle newOracle) external returns (uint256);

    function _setCloseFactor(uint256 newCloseFactorMantissa) external returns (uint256);

    function _setAccessControl(address newAccessControlAddress) external returns (uint256);

    function _setCollateralFactor(VToken vToken, uint256 newCollateralFactorMantissa) external returns (uint256);

    function _setLiquidationIncentive(uint256 newLiquidationIncentiveMantissa) external returns (uint256);

    function _setLiquidatorContract(address newLiquidatorContract_) external;

    function _setPauseGuardian(address newPauseGuardian) external returns (uint256);

    function _setMarketBorrowCaps(VToken[] calldata vTokens, uint256[] calldata newBorrowCaps) external;

    function _setMarketSupplyCaps(VToken[] calldata vTokens, uint256[] calldata newSupplyCaps) external;

    function _setProtocolPaused(bool state) external returns (bool);

    function _setActionsPaused(
        address[] calldata markets,
        ComptrollerTypes.Action[] calldata actions,
        bool paused
    ) external;

    function _setVAIController(VAIControllerInterface vaiController_) external returns (uint256);

    function _setVAIMintRate(uint256 newVAIMintRate) external returns (uint256);

    function setMintedVAIOf(address owner, uint256 amount) external returns (uint256);

    function _setTreasuryData(
        address newTreasuryGuardian,
        address newTreasuryAddress,
        uint256 newTreasuryPercent
    ) external returns (uint256);

    function _setComptrollerLens(ComptrollerLensInterface comptrollerLens_) external returns (uint256);

    function _setVenusVAIVaultRate(uint256 venusVAIVaultRate_) external;

    function _setVAIVaultInfo(address vault_, uint256 releaseStartBlock_, uint256 minReleaseAmount_) external;

    function _setForcedLiquidation(address vToken, bool enable) external;

    function _setPrimeToken(IPrime _prime) external returns (uint);

    function _setForcedLiquidationForUser(address borrower, address vTokenBorrowed, bool enable) external;
}
