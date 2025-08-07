// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { Action } from "../../ComptrollerInterface.sol";
import { VAIControllerInterface } from "../../../Tokens/VAI/VAIControllerInterface.sol";
import { ComptrollerLensInterface } from "../../../Comptroller/ComptrollerLensInterface.sol";
import { IPrime } from "../../../Tokens/Prime/IPrime.sol";

interface ISetterFacet {
    function setPriceOracle(ResilientOracleInterface newOracle) external returns (uint256);

    function _setPriceOracle(ResilientOracleInterface newOracle) external returns (uint256);

    function _setAccessControl(address newAccessControlAddress) external returns (uint256);

    function setCollateralFactor(
        VToken vToken,
        uint256 newCollateralFactorMantissa,
        uint256 newLiquidationThresholdMantissa
    ) external returns (uint256);

    function _setLiquidatorContract(address newLiquidatorContract_) external;

    function _setPauseGuardian(address newPauseGuardian) external returns (uint256);

    function setMarketBorrowCaps(VToken[] calldata vTokens, uint256[] calldata newBorrowCaps) external;

    function _setMarketBorrowCaps(VToken[] calldata vTokens, uint256[] calldata newBorrowCaps) external;

    function setMarketSupplyCaps(VToken[] calldata vTokens, uint256[] calldata newSupplyCaps) external;

    function _setMarketSupplyCaps(VToken[] calldata vTokens, uint256[] calldata newSupplyCaps) external;

    function _setProtocolPaused(bool state) external returns (bool);

    function setActionsPaused(address[] calldata markets, Action[] calldata actions, bool paused) external;

    function _setActionsPaused(address[] calldata markets, Action[] calldata actions, bool paused) external;

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

    function setPrimeToken(IPrime _prime) external returns (uint256);

    function _setPrimeToken(IPrime _prime) external returns (uint);

    function setForcedLiquidation(address vTokenBorrowed, bool enable) external;

    function _setForcedLiquidationForUser(address borrower, address vTokenBorrowed, bool enable) external;

    function _setXVSToken(address xvs_) external;

    function _setXVSVToken(address xvsVToken_) external;

    function setMarketMaxLiquidationIncentive(
        address vToken,
        uint256 newMaxLiquidationIncentive
    ) external returns (uint256);

    function setLiquidationManager(address liquidationManager_) external;
}
