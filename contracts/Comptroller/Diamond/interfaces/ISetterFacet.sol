// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { IVToken } from "../../../Tokens/VTokens/interfaces/IVToken.sol";
import { IFacetBase, Action } from "./IFacetBase.sol";
import { IVAIController } from "../../../Tokens/VAI/interfaces/IVAIController.sol";
import { IComptrollerLens } from "../../../Lens/interfaces/IComptrollerLens.sol";
import { IPrime } from "../../../Tokens/Prime/IPrime.sol";

/**
 * @title ISetterFacet
 * @author Venus
 * @dev This interface contains all the setters for the states
 * @notice This interface contract contains all the configurational setter functions
 */
interface ISetterFacet is IFacetBase {
    /**
     * @notice Alias to _setPriceOracle to support the Isolated Lending Comptroller Interface
     * @param newOracle The new price oracle to set
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function setPriceOracle(ResilientOracleInterface newOracle) external returns (uint256);

    /**
     * @notice Sets a new price oracle for the comptroller
     * @dev Allows the contract admin to set a new price oracle used by the Comptroller
     * @param newOracle The new price oracle to set
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setPriceOracle(ResilientOracleInterface newOracle) external returns (uint256);

    /**
     * @notice Alias to _setCloseFactor to support the Isolated Lending Comptroller Interface
     * @param newCloseFactorMantissa New close factor, scaled by 1e18
     * @return uint256 0=success, otherwise will revert
     */
    function setCloseFactor(uint256 newCloseFactorMantissa) external returns (uint256);

    /**
     * @notice Sets the closeFactor used when liquidating borrows
     * @dev Allows the contract admin to set the closeFactor used to liquidate borrows
     * @param newCloseFactorMantissa New close factor, scaled by 1e18
     * @return uint256 0=success, otherwise will revert
     */
    function _setCloseFactor(uint256 newCloseFactorMantissa) external returns (uint256);

    /**
     * @notice Sets the address of the access control of this contract
     * @dev Allows the contract admin to set the address of access control of this contract
     * @param newAccessControlAddress New address for the access control
     * @return uint256 0=success, otherwise will revert
     */
    function _setAccessControl(address newAccessControlAddress) external returns (uint256);

    /**
     * @notice Alias to _setCollateralFactor to support the Isolated Lending Comptroller Interface
     * @param vToken The market to set the factor on
     * @param newCollateralFactorMantissa The new collateral factor, scaled by 1e18
     * @param newLiquidationThresholdMantissa The new liquidation threshold, scaled by 1e18
     * @return uint256 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function setCollateralFactor(
        IVToken vToken,
        uint256 newCollateralFactorMantissa,
        uint256 newLiquidationThresholdMantissa
    ) external returns (uint256);

    /**
     * @notice Sets the collateralFactor for a market
     * @dev Allows a privileged role to set the collateralFactorMantissa
     * @param vToken The market to set the factor on
     * @param newCollateralFactorMantissa The new collateral factor, scaled by 1e18
     * @return uint256 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function _setCollateralFactor(IVToken vToken, uint256 newCollateralFactorMantissa) external returns (uint256);

    /**
     * @notice Alias to _setLiquidationIncentive to support the Isolated Lending Comptroller Interface
     * @param newLiquidationIncentiveMantissa New liquidationIncentive scaled by 1e18
     * @return uint256 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function setLiquidationIncentive(uint256 newLiquidationIncentiveMantissa) external returns (uint256);

    /**
     * @notice Sets liquidationIncentive
     * @dev Allows a privileged role to set the liquidationIncentiveMantissa
     * @param newLiquidationIncentiveMantissa New liquidationIncentive scaled by 1e18
     * @return uint256 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function _setLiquidationIncentive(uint256 newLiquidationIncentiveMantissa) external returns (uint256);

    /**
     * @notice Update the address of the liquidator contract
     * @dev Allows the contract admin to update the address of liquidator contract
     * @param newLiquidatorContract_ The new address of the liquidator contract
     */
    function _setLiquidatorContract(address newLiquidatorContract_) external;

    /**
     * @notice Admin function to change the Pause Guardian
     * @dev Allows the contract admin to change the Pause Guardian
     * @param newPauseGuardian The address of the new Pause Guardian
     * @return uint256 0=success, otherwise a failure. (See enum Error for details)
     */
    function _setPauseGuardian(address newPauseGuardian) external returns (uint256);

    /**
     * @notice Alias to _setMarketBorrowCaps to support the Isolated Lending Comptroller Interface
     * @param vTokens The addresses of the markets (tokens) to change the borrow caps for
     * @param newBorrowCaps The new borrow cap values in underlying to be set. A value of 0 corresponds to Borrow not allowed
     */
    function setMarketBorrowCaps(IVToken[] calldata vTokens, uint256[] calldata newBorrowCaps) external;

    /**
     * @notice Set the given borrow caps for the given vToken market Borrowing that brings total borrows to or above borrow cap will revert
     * @dev Allows a privileged role to set the borrowing cap for a vToken market. A borrow cap of 0 corresponds to Borrow not allowed
     * @param vTokens The addresses of the markets (tokens) to change the borrow caps for
     * @param newBorrowCaps The new borrow cap values in underlying to be set. A value of 0 corresponds to Borrow not allowed
     */
    function _setMarketBorrowCaps(IVToken[] calldata vTokens, uint256[] calldata newBorrowCaps) external;

    /**
     * @notice Alias to _setMarketSupplyCaps to support the Isolated Lending Comptroller Interface
     * @param vTokens The addresses of the markets (tokens) to change the supply caps for
     * @param newSupplyCaps The new supply cap values in underlying to be set. A value of 0 corresponds to Minting NotAllowed
     */
    function setMarketSupplyCaps(IVToken[] calldata vTokens, uint256[] calldata newSupplyCaps) external;

    /**
     * @notice Set the given supply caps for the given vToken market Supply that brings total Supply to or above supply cap will revert
     * @dev Allows a privileged role to set the supply cap for a vToken. A supply cap of 0 corresponds to Minting NotAllowed
     * @param vTokens The addresses of the markets (tokens) to change the supply caps for
     * @param newSupplyCaps The new supply cap values in underlying to be set. A value of 0 corresponds to Minting NotAllowed
     */
    function _setMarketSupplyCaps(IVToken[] calldata vTokens, uint256[] calldata newSupplyCaps) external;

    /**
     * @notice Set whole protocol pause/unpause state
     * @dev Allows a privileged role to pause/unpause protocol
     * @param state The new state (true=paused, false=unpaused)
     * @return bool The updated state of the protocol
     */
    function _setProtocolPaused(bool state) external returns (bool);

    /**
     * @notice Alias to _setActionsPaused to support the Isolated Lending Comptroller Interface
     * @param markets Markets to pause/unpause the actions on
     * @param actions List of action ids to pause/unpause
     * @param paused The new paused state (true=paused, false=unpaused)
     */
    function setActionsPaused(address[] calldata markets, Action[] calldata actions, bool paused) external;

    /**
     * @notice Pause/unpause certain actions
     * @dev Allows a privileged role to pause/unpause the protocol action state
     * @param markets Markets to pause/unpause the actions on
     * @param actions List of action ids to pause/unpause
     * @param paused The new paused state (true=paused, false=unpaused)
     */
    function _setActionsPaused(address[] calldata markets, Action[] calldata actions, bool paused) external;

    /**
     * @notice Sets a new VAI controller
     * @dev Admin function to set a new VAI controller
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setVAIController(IVAIController vaiController_) external returns (uint256);

    /**
     * @notice Set the VAI mint rate
     * @param newVAIMintRate The new VAI mint rate to be set
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setVAIMintRate(uint256 newVAIMintRate) external returns (uint256);

    /**
     * @notice Set the minted VAI amount of the `owner`
     * @param owner The address of the account to set
     * @param amount The amount of VAI to set to the account
     * @return The number of minted VAI by `owner`
     */
    function setMintedVAIOf(address owner, uint256 amount) external returns (uint256);

    /**
     * @notice Set the treasury data.
     * @param newTreasuryGuardian The new address of the treasury guardian to be set
     * @param newTreasuryAddress The new address of the treasury to be set
     * @param newTreasuryPercent The new treasury percent to be set
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setTreasuryData(
        address newTreasuryGuardian,
        address newTreasuryAddress,
        uint256 newTreasuryPercent
    ) external returns (uint256);

    /**
     * @dev Set ComptrollerLens contract address
     * @param comptrollerLens_ The new ComptrollerLens contract address to be set
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setComptrollerLens(IComptrollerLens comptrollerLens_) external returns (uint256);

    /**
     * @notice Set the amount of XVS distributed per block to VAI Vault
     * @param venusVAIVaultRate_ The amount of XVS wei per block to distribute to VAI Vault
     */
    function _setVenusVAIVaultRate(uint256 venusVAIVaultRate_) external;

    /**
     * @notice Set the VAI Vault infos
     * @param vault_ The address of the VAI Vault
     * @param releaseStartBlock_ The start block of release to VAI Vault
     * @param minReleaseAmount_ The minimum release amount to VAI Vault
     */
    function _setVAIVaultInfo(address vault_, uint256 releaseStartBlock_, uint256 minReleaseAmount_) external;

    /**
     * @notice Enables forced liquidations for a market. If forced liquidation is enabled,
     * borrows in the market may be liquidated regardless of the account liquidity
     * @dev Allows a privileged role to set enable/disable forced liquidations
     * @param vToken Borrowed vToken
     * @param enable Whether to enable forced liquidations
     */
    function _setForcedLiquidation(address vToken, bool enable) external;

    /**
     * @notice Alias to _setPrimeToken to support the Isolated Lending Comptroller Interface
     * @param _prime The new prime token contract to be set
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function setPrimeToken(IPrime _prime) external returns (uint256);

    /**
     * @notice Sets the prime token contract for the comptroller
     * @param _prime The new prime token contract to be set
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setPrimeToken(IPrime _prime) external returns (uint);

    /**
     * @notice Alias to _setForcedLiquidation to support the Isolated Lending Comptroller Interface
     * @param vTokenBorrowed Borrowed vToken
     * @param enable Whether to enable forced liquidations
     */
    function setForcedLiquidation(address vTokenBorrowed, bool enable) external;

    /**
     * @notice Enables forced liquidations for user's borrows in a certain market. If forced
     * liquidation is enabled, user's borrows in the market may be liquidated regardless of
     * the account liquidity. Forced liquidation may be enabled for a user even if it is not
     * enabled for the entire market.
     * @param borrower The address of the borrower
     * @param vTokenBorrowed Borrowed vToken
     * @param enable Whether to enable forced liquidations
     */
    function _setForcedLiquidationForUser(address borrower, address vTokenBorrowed, bool enable) external;

    /**
     * @notice Set the address of the XVS token
     * @param xvs_ The address of the XVS token
     */
    function _setXVSToken(address xvs_) external;

    /**
     * @notice Set the address of the XVS vToken
     * @param xvsVToken_ The address of the XVS vToken
     */
    function _setXVSVToken(address xvsVToken_) external;
}
