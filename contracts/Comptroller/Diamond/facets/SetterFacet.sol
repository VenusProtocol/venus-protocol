// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { Action } from "../../ComptrollerInterface.sol";
import { ComptrollerLensInterface } from "../../ComptrollerLensInterface.sol";
import { VAIControllerInterface } from "../../../Tokens/VAI/VAIControllerInterface.sol";
import { IPrime } from "../../../Tokens/Prime/IPrime.sol";
import { ISetterFacet } from "../interfaces/ISetterFacet.sol";
import { FacetBase } from "./FacetBase.sol";
import { PoolMarketId } from "../../../Comptroller/Types/PoolMarketId.sol";

/**
 * @title SetterFacet
 * @author Venus
 * @dev This facet contains all the setters for the states
 * @notice This facet contract contains all the configurational setter functions
 */
contract SetterFacet is ISetterFacet, FacetBase {
    /// @notice Emitted when close factor is changed by admin
    event NewCloseFactor(uint256 oldCloseFactorMantissa, uint256 newCloseFactorMantissa);

    /// @notice Emitted when a collateral factor for a market in a pool is changed by admin
    event NewCollateralFactor(
        uint96 indexed poolId,
        VToken indexed vToken,
        uint256 oldCollateralFactorMantissa,
        uint256 newCollateralFactorMantissa
    );

    /// @notice Emitted when liquidation incentive for a market in a pool is changed by admin
    event NewLiquidationIncentive(
        uint96 indexed poolId,
        address indexed vToken,
        uint256 oldLiquidationIncentiveMantissa,
        uint256 newLiquidationIncentiveMantissa
    );

    /// @notice Emitted when price oracle is changed
    event NewPriceOracle(ResilientOracleInterface oldPriceOracle, ResilientOracleInterface newPriceOracle);

    /// @notice Emitted when borrow cap for a vToken is changed
    event NewBorrowCap(VToken indexed vToken, uint256 newBorrowCap);

    /// @notice Emitted when VAIController is changed
    event NewVAIController(VAIControllerInterface oldVAIController, VAIControllerInterface newVAIController);

    /// @notice Emitted when VAI mint rate is changed by admin
    event NewVAIMintRate(uint256 oldVAIMintRate, uint256 newVAIMintRate);

    /// @notice Emitted when protocol state is changed by admin
    event ActionProtocolPaused(bool state);

    /// @notice Emitted when treasury guardian is changed
    event NewTreasuryGuardian(address oldTreasuryGuardian, address newTreasuryGuardian);

    /// @notice Emitted when treasury address is changed
    event NewTreasuryAddress(address oldTreasuryAddress, address newTreasuryAddress);

    /// @notice Emitted when treasury percent is changed
    event NewTreasuryPercent(uint256 oldTreasuryPercent, uint256 newTreasuryPercent);

    /// @notice Emitted when liquidator adress is changed
    event NewLiquidatorContract(address oldLiquidatorContract, address newLiquidatorContract);

    /// @notice Emitted when ComptrollerLens address is changed
    event NewComptrollerLens(address oldComptrollerLens, address newComptrollerLens);

    /// @notice Emitted when supply cap for a vToken is changed
    event NewSupplyCap(VToken indexed vToken, uint256 newSupplyCap);

    /// @notice Emitted when access control address is changed by admin
    event NewAccessControl(address oldAccessControlAddress, address newAccessControlAddress);

    /// @notice Emitted when pause guardian is changed
    event NewPauseGuardian(address oldPauseGuardian, address newPauseGuardian);

    /// @notice Emitted when an action is paused on a market
    event ActionPausedMarket(VToken indexed vToken, Action indexed action, bool pauseState);

    /// @notice Emitted when VAI Vault info is changed
    event NewVAIVaultInfo(address indexed vault_, uint256 releaseStartBlock_, uint256 releaseInterval_);

    /// @notice Emitted when Venus VAI Vault rate is changed
    event NewVenusVAIVaultRate(uint256 oldVenusVAIVaultRate, uint256 newVenusVAIVaultRate);

    /// @notice Emitted when prime token contract address is changed
    event NewPrimeToken(IPrime oldPrimeToken, IPrime newPrimeToken);

    /// @notice Emitted when forced liquidation is enabled or disabled for all users in a market
    event IsForcedLiquidationEnabledUpdated(address indexed vToken, bool enable);

    /// @notice Emitted when forced liquidation is enabled or disabled for a user borrowing in a market
    event IsForcedLiquidationEnabledForUserUpdated(address indexed borrower, address indexed vToken, bool enable);

    /// @notice Emitted when XVS token address is changed
    event NewXVSToken(address indexed oldXVS, address indexed newXVS);

    /// @notice Emitted when XVS vToken address is changed
    event NewXVSVToken(address indexed oldXVSVToken, address indexed newXVSVToken);

    /// @notice Emitted when an account's flash loan whitelist status is updated
    event IsAccountFlashLoanWhitelisted(address indexed account, bool indexed isWhitelisted);
    /// @notice Emitted when delegate authorization for flash loans is changed
    event DelegateAuthorizationFlashloanChanged(
        address indexed user,
        address indexed market,
        address indexed delegate,
        bool approved
    );

    /// @notice Emitted when liquidation threshold for a market in a pool is changed by admin
    event NewLiquidationThreshold(
        uint96 indexed poolId,
        VToken indexed vToken,
        uint256 oldLiquidationThresholdMantissa,
        uint256 newLiquidationThresholdMantissa
    );

    /// @notice Emitted when the borrowAllowed flag is updated for a market
    event BorrowAllowedUpdated(uint96 indexed poolId, address indexed market, bool oldStatus, bool newStatus);

    /// @notice Emitted when pool active status changes
    event PoolActiveStatusUpdated(uint96 indexed poolId, bool oldStatus, bool newStatus);

    /// @notice Emitted when pool label is updated
    event PoolLabelUpdated(uint96 indexed poolId, string oldLabel, string newLabel);

    /**
     * @notice Compare two addresses to ensure they are different
     * @param oldAddress The original address to compare
     * @param newAddress The new address to compare
     */
    modifier compareAddress(address oldAddress, address newAddress) {
        require(oldAddress != newAddress, "old address is same as new address");
        _;
    }

    /**
     * @notice Compare two values to ensure they are different
     * @param oldValue The original value to compare
     * @param newValue The new value to compare
     */
    modifier compareValue(uint256 oldValue, uint256 newValue) {
        require(oldValue != newValue, "old value is same as new value");
        _;
    }

    /**
     * @notice Alias to _setPriceOracle to support the Isolated Lending Comptroller Interface
     * @param newOracle The new price oracle to set
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function setPriceOracle(ResilientOracleInterface newOracle) external returns (uint256) {
        return __setPriceOracle(newOracle);
    }

    /**
     * @notice Sets a new price oracle for the comptroller
     * @dev Allows the contract admin to set a new price oracle used by the Comptroller
     * @param newOracle The new price oracle to set
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setPriceOracle(ResilientOracleInterface newOracle) external returns (uint256) {
        return __setPriceOracle(newOracle);
    }

    /**
     * @notice Alias to _setCloseFactor to support the Isolated Lending Comptroller Interface
     * @param newCloseFactorMantissa New close factor, scaled by 1e18
     * @return uint256 0=success, otherwise will revert
     */
    function setCloseFactor(uint256 newCloseFactorMantissa) external returns (uint256) {
        return __setCloseFactor(newCloseFactorMantissa);
    }

    /**
     * @notice Sets the closeFactor used when liquidating borrows
     * @dev Allows the contract admin to set the closeFactor used to liquidate borrows
     * @param newCloseFactorMantissa New close factor, scaled by 1e18
     * @return uint256 0=success, otherwise will revert
     */
    function _setCloseFactor(uint256 newCloseFactorMantissa) external returns (uint256) {
        return __setCloseFactor(newCloseFactorMantissa);
    }

    /**
     * @notice Sets the address of the access control of this contract
     * @dev Allows the contract admin to set the address of access control of this contract
     * @param newAccessControlAddress New address for the access control
     * @return uint256 0=success, otherwise will revert
     */
    function _setAccessControl(
        address newAccessControlAddress
    ) external compareAddress(accessControl, newAccessControlAddress) returns (uint256) {
        // Check caller is admin
        ensureAdmin();
        ensureNonzeroAddress(newAccessControlAddress);

        address oldAccessControlAddress = accessControl;

        accessControl = newAccessControlAddress;
        emit NewAccessControl(oldAccessControlAddress, newAccessControlAddress);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Sets the collateral factor and liquidation threshold for a market in the Core Pool only.
     * @param vToken The market to set the factor on
     * @param newCollateralFactorMantissa The new collateral factor, scaled by 1e18
     * @param newLiquidationThresholdMantissa The new liquidation threshold, scaled by 1e18
     * @return uint256 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function setCollateralFactor(
        VToken vToken,
        uint256 newCollateralFactorMantissa,
        uint256 newLiquidationThresholdMantissa
    ) external returns (uint256) {
        ensureAllowed("setCollateralFactor(address,uint256,uint256)");
        return __setCollateralFactor(corePoolId, vToken, newCollateralFactorMantissa, newLiquidationThresholdMantissa);
    }

    /**
     * @notice Sets the liquidation incentive for a market in the Core Pool only.
     * @param vToken The market to set the liquidationIncentive for
     * @param newLiquidationIncentiveMantissa New liquidationIncentive scaled by 1e18
     * @return uint256 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function setLiquidationIncentive(
        address vToken,
        uint256 newLiquidationIncentiveMantissa
    ) external returns (uint256) {
        ensureAllowed("setLiquidationIncentive(address,uint256)");
        return __setLiquidationIncentive(corePoolId, vToken, newLiquidationIncentiveMantissa);
    }

    /**
     * @notice Sets the collateral factor and liquidation threshold for a market in the specified pool.
     * @param poolId The ID of the pool.
     * @param vToken The market to set the factor on
     * @param newCollateralFactorMantissa The new collateral factor, scaled by 1e18
     * @param newLiquidationThresholdMantissa The new liquidation threshold, scaled by 1e18
     * @return uint256 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function setCollateralFactor(
        uint96 poolId,
        VToken vToken,
        uint256 newCollateralFactorMantissa,
        uint256 newLiquidationThresholdMantissa
    ) external returns (uint256) {
        ensureAllowed("setCollateralFactor(uint96,address,uint256,uint256)");
        return __setCollateralFactor(poolId, vToken, newCollateralFactorMantissa, newLiquidationThresholdMantissa);
    }

    /**
     * @notice Sets the liquidation incentive for a market in the specified pool.
     * @param poolId The ID of the pool.
     * @param vToken The market to set the liquidationIncentive for
     * @param newLiquidationIncentiveMantissa New liquidationIncentive scaled by 1e18
     * @return uint256 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function setLiquidationIncentive(
        uint96 poolId,
        address vToken,
        uint256 newLiquidationIncentiveMantissa
    ) external returns (uint256) {
        ensureAllowed("setLiquidationIncentive(uint96,address,uint256)");
        return __setLiquidationIncentive(poolId, vToken, newLiquidationIncentiveMantissa);
    }

    /**
     * @notice Update the address of the liquidator contract
     * @dev Allows the contract admin to update the address of liquidator contract
     * @param newLiquidatorContract_ The new address of the liquidator contract
     */
    function _setLiquidatorContract(
        address newLiquidatorContract_
    ) external compareAddress(liquidatorContract, newLiquidatorContract_) {
        // Check caller is admin
        ensureAdmin();
        ensureNonzeroAddress(newLiquidatorContract_);
        address oldLiquidatorContract = liquidatorContract;
        liquidatorContract = newLiquidatorContract_;
        emit NewLiquidatorContract(oldLiquidatorContract, newLiquidatorContract_);
    }

    /**
     * @notice Admin function to change the Pause Guardian
     * @dev Allows the contract admin to change the Pause Guardian
     * @param newPauseGuardian The address of the new Pause Guardian
     * @return uint256 0=success, otherwise a failure. (See enum Error for details)
     */
    function _setPauseGuardian(
        address newPauseGuardian
    ) external compareAddress(pauseGuardian, newPauseGuardian) returns (uint256) {
        ensureAdmin();
        ensureNonzeroAddress(newPauseGuardian);

        // Save current value for inclusion in log
        address oldPauseGuardian = pauseGuardian;
        // Store pauseGuardian with value newPauseGuardian
        pauseGuardian = newPauseGuardian;

        // Emit NewPauseGuardian(OldPauseGuardian, NewPauseGuardian)
        emit NewPauseGuardian(oldPauseGuardian, newPauseGuardian);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Alias to _setMarketBorrowCaps to support the Isolated Lending Comptroller Interface
     * @param vTokens The addresses of the markets (tokens) to change the borrow caps for
     * @param newBorrowCaps The new borrow cap values in underlying to be set. A value of 0 corresponds to Borrow not allowed
     */
    function setMarketBorrowCaps(VToken[] calldata vTokens, uint256[] calldata newBorrowCaps) external {
        __setMarketBorrowCaps(vTokens, newBorrowCaps);
    }

    /**
     * @notice Set the given borrow caps for the given vToken market Borrowing that brings total borrows to or above borrow cap will revert
     * @dev Allows a privileged role to set the borrowing cap for a vToken market. A borrow cap of 0 corresponds to Borrow not allowed
     * @param vTokens The addresses of the markets (tokens) to change the borrow caps for
     * @param newBorrowCaps The new borrow cap values in underlying to be set. A value of 0 corresponds to Borrow not allowed
     */
    function _setMarketBorrowCaps(VToken[] calldata vTokens, uint256[] calldata newBorrowCaps) external {
        __setMarketBorrowCaps(vTokens, newBorrowCaps);
    }

    /**
     * @notice Alias to _setMarketSupplyCaps to support the Isolated Lending Comptroller Interface
     * @param vTokens The addresses of the markets (tokens) to change the supply caps for
     * @param newSupplyCaps The new supply cap values in underlying to be set. A value of 0 corresponds to Minting NotAllowed
     */
    function setMarketSupplyCaps(VToken[] calldata vTokens, uint256[] calldata newSupplyCaps) external {
        __setMarketSupplyCaps(vTokens, newSupplyCaps);
    }

    /**
     * @notice Set the given supply caps for the given vToken market Supply that brings total Supply to or above supply cap will revert
     * @dev Allows a privileged role to set the supply cap for a vToken. A supply cap of 0 corresponds to Minting NotAllowed
     * @param vTokens The addresses of the markets (tokens) to change the supply caps for
     * @param newSupplyCaps The new supply cap values in underlying to be set. A value of 0 corresponds to Minting NotAllowed
     */
    function _setMarketSupplyCaps(VToken[] calldata vTokens, uint256[] calldata newSupplyCaps) external {
        __setMarketSupplyCaps(vTokens, newSupplyCaps);
    }

    /**
     * @notice Set whole protocol pause/unpause state
     * @dev Allows a privileged role to pause/unpause protocol
     * @param state The new state (true=paused, false=unpaused)
     * @return bool The updated state of the protocol
     */
    function _setProtocolPaused(bool state) external returns (bool) {
        ensureAllowed("_setProtocolPaused(bool)");

        protocolPaused = state;
        emit ActionProtocolPaused(state);
        return state;
    }

    /**
     * @notice Alias to _setActionsPaused to support the Isolated Lending Comptroller Interface
     * @param markets_ Markets to pause/unpause the actions on
     * @param actions_ List of action ids to pause/unpause
     * @param paused_ The new paused state (true=paused, false=unpaused)
     */
    function setActionsPaused(address[] calldata markets_, Action[] calldata actions_, bool paused_) external {
        __setActionsPaused(markets_, actions_, paused_);
    }

    /**
     * @notice Pause/unpause certain actions
     * @dev Allows a privileged role to pause/unpause the protocol action state
     * @param markets_ Markets to pause/unpause the actions on
     * @param actions_ List of action ids to pause/unpause
     * @param paused_ The new paused state (true=paused, false=unpaused)
     */
    function _setActionsPaused(address[] calldata markets_, Action[] calldata actions_, bool paused_) external {
        __setActionsPaused(markets_, actions_, paused_);
    }

    /**
     * @dev Pause/unpause an action on a market
     * @param market Market to pause/unpause the action on
     * @param action Action id to pause/unpause
     * @param paused The new paused state (true=paused, false=unpaused)
     */
    function setActionPausedInternal(address market, Action action, bool paused) internal {
        ensureListed(getCorePoolMarket(market));
        _actionPaused[market][uint256(action)] = paused;
        emit ActionPausedMarket(VToken(market), action, paused);
    }

    /**
     * @notice Sets a new VAI controller
     * @dev Admin function to set a new VAI controller
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setVAIController(
        VAIControllerInterface vaiController_
    ) external compareAddress(address(vaiController), address(vaiController_)) returns (uint256) {
        // Check caller is admin
        ensureAdmin();
        ensureNonzeroAddress(address(vaiController_));

        VAIControllerInterface oldVaiController = vaiController;
        vaiController = vaiController_;
        emit NewVAIController(oldVaiController, vaiController_);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Set the VAI mint rate
     * @param newVAIMintRate The new VAI mint rate to be set
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setVAIMintRate(
        uint256 newVAIMintRate
    ) external compareValue(vaiMintRate, newVAIMintRate) returns (uint256) {
        // Check caller is admin
        ensureAdmin();
        uint256 oldVAIMintRate = vaiMintRate;
        vaiMintRate = newVAIMintRate;
        emit NewVAIMintRate(oldVAIMintRate, newVAIMintRate);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Set the minted VAI amount of the `owner`
     * @param owner The address of the account to set
     * @param amount The amount of VAI to set to the account
     * @return The number of minted VAI by `owner`
     */
    function setMintedVAIOf(address owner, uint256 amount) external returns (uint256) {
        checkProtocolPauseState();

        // Pausing is a very serious situation - we revert to sound the alarms
        require(!mintVAIGuardianPaused && !repayVAIGuardianPaused, "VAI is paused");
        // Check caller is vaiController
        if (msg.sender != address(vaiController)) {
            return fail(Error.REJECTION, FailureInfo.SET_MINTED_VAI_REJECTION);
        }
        mintedVAIs[owner] = amount;
        return uint256(Error.NO_ERROR);
    }

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
    ) external returns (uint256) {
        // Check caller is admin
        ensureAdminOr(treasuryGuardian);

        require(newTreasuryPercent < 1e18, "percent >= 100%");
        ensureNonzeroAddress(newTreasuryGuardian);
        ensureNonzeroAddress(newTreasuryAddress);

        address oldTreasuryGuardian = treasuryGuardian;
        address oldTreasuryAddress = treasuryAddress;
        uint256 oldTreasuryPercent = treasuryPercent;

        treasuryGuardian = newTreasuryGuardian;
        treasuryAddress = newTreasuryAddress;
        treasuryPercent = newTreasuryPercent;

        emit NewTreasuryGuardian(oldTreasuryGuardian, newTreasuryGuardian);
        emit NewTreasuryAddress(oldTreasuryAddress, newTreasuryAddress);
        emit NewTreasuryPercent(oldTreasuryPercent, newTreasuryPercent);

        return uint256(Error.NO_ERROR);
    }

    /*** Venus Distribution ***/

    /**
     * @dev Set ComptrollerLens contract address
     * @param comptrollerLens_ The new ComptrollerLens contract address to be set
     * @return uint256 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setComptrollerLens(
        ComptrollerLensInterface comptrollerLens_
    ) external virtual compareAddress(address(comptrollerLens), address(comptrollerLens_)) returns (uint256) {
        ensureAdmin();
        ensureNonzeroAddress(address(comptrollerLens_));
        address oldComptrollerLens = address(comptrollerLens);
        comptrollerLens = comptrollerLens_;
        emit NewComptrollerLens(oldComptrollerLens, address(comptrollerLens));

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Set the amount of XVS distributed per block to VAI Vault
     * @param venusVAIVaultRate_ The amount of XVS wei per block to distribute to VAI Vault
     */
    function _setVenusVAIVaultRate(
        uint256 venusVAIVaultRate_
    ) external compareValue(venusVAIVaultRate, venusVAIVaultRate_) {
        ensureAdmin();
        if (vaiVaultAddress != address(0)) {
            releaseToVault();
        }
        uint256 oldVenusVAIVaultRate = venusVAIVaultRate;
        venusVAIVaultRate = venusVAIVaultRate_;
        emit NewVenusVAIVaultRate(oldVenusVAIVaultRate, venusVAIVaultRate_);
    }

    /**
     * @notice Set the VAI Vault infos
     * @param vault_ The address of the VAI Vault
     * @param releaseStartBlock_ The start block of release to VAI Vault
     * @param minReleaseAmount_ The minimum release amount to VAI Vault
     */
    function _setVAIVaultInfo(
        address vault_,
        uint256 releaseStartBlock_,
        uint256 minReleaseAmount_
    ) external compareAddress(vaiVaultAddress, vault_) {
        ensureAdmin();
        ensureNonzeroAddress(vault_);
        if (vaiVaultAddress != address(0)) {
            releaseToVault();
        }

        vaiVaultAddress = vault_;
        releaseStartBlock = releaseStartBlock_;
        minReleaseAmount = minReleaseAmount_;
        emit NewVAIVaultInfo(vault_, releaseStartBlock_, minReleaseAmount_);
    }

    /**
     * @notice Alias to _setPrimeToken to support the Isolated Lending Comptroller Interface
     * @param _prime The new prime token contract to be set
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function setPrimeToken(IPrime _prime) external returns (uint256) {
        return __setPrimeToken(_prime);
    }

    /**
     * @notice Sets the prime token contract for the comptroller
     * @param _prime The new prime token contract to be set
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setPrimeToken(IPrime _prime) external returns (uint256) {
        return __setPrimeToken(_prime);
    }

    /**
     * @notice Alias to _setForcedLiquidation to support the Isolated Lending Comptroller Interface
     * @param vTokenBorrowed Borrowed vToken
     * @param enable Whether to enable forced liquidations
     */
    function setForcedLiquidation(address vTokenBorrowed, bool enable) external {
        __setForcedLiquidation(vTokenBorrowed, enable);
    }

    /** @notice Enables forced liquidations for a market. If forced liquidation is enabled,
     * borrows in the market may be liquidated regardless of the account liquidity
     * @dev Allows a privileged role to set enable/disable forced liquidations
     * @param vTokenBorrowed Borrowed vToken
     * @param enable Whether to enable forced liquidations
     */
    function _setForcedLiquidation(address vTokenBorrowed, bool enable) external {
        __setForcedLiquidation(vTokenBorrowed, enable);
    }

    /**
     * @notice Enables forced liquidations for user's borrows in a certain market. If forced
     * liquidation is enabled, user's borrows in the market may be liquidated regardless of
     * the account liquidity. Forced liquidation may be enabled for a user even if it is not
     * enabled for the entire market.
     * @param borrower The address of the borrower
     * @param vTokenBorrowed Borrowed vToken
     * @param enable Whether to enable forced liquidations
     */
    function _setForcedLiquidationForUser(address borrower, address vTokenBorrowed, bool enable) external {
        ensureAllowed("_setForcedLiquidationForUser(address,address,bool)");
        if (vTokenBorrowed != address(vaiController)) {
            ensureListed(getCorePoolMarket(vTokenBorrowed));
        }
        isForcedLiquidationEnabledForUser[borrower][vTokenBorrowed] = enable;
        emit IsForcedLiquidationEnabledForUserUpdated(borrower, vTokenBorrowed, enable);
    }

    /**
     * @notice Set the address of the XVS token
     * @param xvs_ The address of the XVS token
     */
    function _setXVSToken(address xvs_) external {
        ensureAdmin();
        ensureNonzeroAddress(xvs_);

        emit NewXVSToken(xvs, xvs_);
        xvs = xvs_;
    }

    /**
     * @notice Set the address of the XVS vToken
     * @param xvsVToken_ The address of the XVS vToken
     */
    function _setXVSVToken(address xvsVToken_) external {
        ensureAdmin();
        ensureNonzeroAddress(xvsVToken_);

        address underlying = VToken(xvsVToken_).underlying();
        require(underlying == xvs, "invalid xvs vtoken address");

        emit NewXVSVToken(xvsVToken, xvsVToken_);
        xvsVToken = xvsVToken_;
    }

    /**
     * @notice Adds/Removes an account to the flash loan whitelist
     * @param account The account to authorize for flash loans
     * @param _isWhiteListed True to whitelist the account for flash loans, false to remove from whitelist
     */
    function setWhiteListFlashLoanAccount(address account, bool _isWhiteListed) external {
        ensureAllowed("setWhiteListFlashLoanAccount(address,bool)");
        ensureNonzeroAddress(account);

        authorizedFlashLoan[account] = _isWhiteListed;
        emit IsAccountFlashLoanWhitelisted(account, _isWhiteListed);
     * @notice Updates the label for a specific pool (excluding the Core Pool)
     * @param poolId ID of the pool to update
     * @param newLabel The new label for the pool
     * @custom:error InvalidOperationForCorePool Reverts when attempting to call pool-specific methods on the Core Pool
     * @custom:error PoolDoesNotExist Reverts if the target pool ID does not exist
     * @custom:error EmptyPoolLabel Reverts if the provided label is an empty string
     * @custom:event PoolLabelUpdated Emitted after the pool label is updated
     */
    function setPoolLabel(uint96 poolId, string calldata newLabel) external {
        ensureAllowed("setPoolLabel(uint96,string)");

        if (poolId > lastPoolId) revert PoolDoesNotExist(poolId);
        if (poolId == corePoolId) revert InvalidOperationForCorePool();
        if (bytes(newLabel).length == 0) revert EmptyPoolLabel();

        PoolData storage pool = pools[poolId];

        if (keccak256(bytes(pool.label)) == keccak256(bytes(newLabel))) {
            return;
        }

        emit PoolLabelUpdated(poolId, pool.label, newLabel);
        pool.label = newLabel;
    }

    /**
     * @notice updates active status for a specific pool (excluding the Core Pool)
     * @param poolId id of the pool to update
     * @param active true to enable, false to disable
     * @custom:error InvalidOperationForCorePool Reverts when attempting to call pool-specific methods on the Core Pool.
     * @custom:error PoolDoesNotExist Reverts if the target pool ID does not exist.
     * @custom:event PoolActiveStatusUpdated Emitted after the pool active status is updated.
     */
    function setPoolActive(uint96 poolId, bool active) external {
        ensureAllowed("setPoolActive(uint96,bool)");

        if (poolId > lastPoolId) revert PoolDoesNotExist(poolId);
        if (poolId == corePoolId) revert InvalidOperationForCorePool();

        PoolData storage newPool = pools[poolId];

        if (newPool.isActive == active) {
            return;
        }

        emit PoolActiveStatusUpdated(poolId, newPool.isActive, active);
        newPool.isActive = active;
    }

    /**
     * @notice Updates the `isBorrowAllowed` flag for a market in a pool.
     * @param poolId The ID of the pool.
     * @param vToken The address of the market (vToken).
     * @param borrowAllowed The new borrow allowed status.
     * @custom:error PoolDoesNotExist Reverts if the pool ID is invalid.
     * @custom:error MarketConfigNotFound Reverts if the market is not listed in the pool.
     * @custom:event BorrowAllowedUpdated Emitted after the borrow permission for a market is updated.
     */
    function setIsBorrowAllowed(uint96 poolId, address vToken, bool borrowAllowed) external {
        ensureAllowed("setIsBorrowAllowed(uint96,address,bool)");

        if (poolId > lastPoolId) revert PoolDoesNotExist(poolId);

        PoolMarketId index = getPoolMarketIndex(poolId, vToken);
        Market storage m = _poolMarkets[index];

        if (!m.isListed) {
            revert MarketConfigNotFound();
        }

        if (m.isBorrowAllowed == borrowAllowed) {
            return;
        }

        emit BorrowAllowedUpdated(poolId, vToken, m.isBorrowAllowed, borrowAllowed);
        m.isBorrowAllowed = borrowAllowed;
    }

    /**
     * @dev Updates the valid price oracle. Used by _setPriceOracle and setPriceOracle
     * @param newOracle The new price oracle to be set
     * @return uint256 0=success, otherwise reverted
     */
    function __setPriceOracle(
        ResilientOracleInterface newOracle
    ) internal compareAddress(address(oracle), address(newOracle)) returns (uint256) {
        // Check caller is admin
        ensureAdmin();
        ensureNonzeroAddress(address(newOracle));

        // Track the old oracle for the comptroller
        ResilientOracleInterface oldOracle = oracle;

        // Set comptroller's oracle to newOracle
        oracle = newOracle;

        // Emit NewPriceOracle(oldOracle, newOracle)
        emit NewPriceOracle(oldOracle, newOracle);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @dev Updates the close factor. Used by _setCloseFactor and setCloseFactor
     * @param newCloseFactorMantissa The new close factor to be set
     * @return uint256 0=success, otherwise reverted
     */
    function __setCloseFactor(
        uint256 newCloseFactorMantissa
    ) internal compareValue(closeFactorMantissa, newCloseFactorMantissa) returns (uint256) {
        // Check caller is admin
        ensureAdmin();

        Exp memory newCloseFactorExp = Exp({ mantissa: newCloseFactorMantissa });

        //-- Check close factor <= 0.9
        Exp memory highLimit = Exp({ mantissa: closeFactorMaxMantissa });
        //-- Check close factor >= 0.05
        Exp memory lowLimit = Exp({ mantissa: closeFactorMinMantissa });

        if (lessThanExp(highLimit, newCloseFactorExp) || greaterThanExp(lowLimit, newCloseFactorExp)) {
            return fail(Error.INVALID_CLOSE_FACTOR, FailureInfo.SET_CLOSE_FACTOR_VALIDATION);
        }

        uint256 oldCloseFactorMantissa = closeFactorMantissa;
        closeFactorMantissa = newCloseFactorMantissa;
        emit NewCloseFactor(oldCloseFactorMantissa, newCloseFactorMantissa);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @dev Updates the collateral factor and the liquidation threshold. Used by setCollateralFactor
     * @param poolId The ID of the pool.
     * @param vToken The market to set the factor on
     * @param newCollateralFactorMantissa The new collateral factor to be set
     * @param newLiquidationThresholdMantissa The new liquidation threshold to be set
     * @return uint256 0=success, otherwise reverted
     */
    function __setCollateralFactor(
        uint96 poolId,
        VToken vToken,
        uint256 newCollateralFactorMantissa,
        uint256 newLiquidationThresholdMantissa
    ) internal returns (uint256) {
        ensureNonzeroAddress(address(vToken));

        // Check if pool exists
        if (poolId > lastPoolId) revert PoolDoesNotExist(poolId);

        // Verify market is listed in the pool
        Market storage market = _poolMarkets[getPoolMarketIndex(poolId, address(vToken))];
        ensureListed(market);

        //-- Check collateral factor <= 1
        if (newCollateralFactorMantissa > mantissaOne) {
            return fail(Error.INVALID_COLLATERAL_FACTOR, FailureInfo.SET_COLLATERAL_FACTOR_VALIDATION);
        }

        // If collateral factor != 0, fail if price == 0
        if (newCollateralFactorMantissa != 0 && oracle.getUnderlyingPrice(address(vToken)) == 0) {
            return fail(Error.PRICE_ERROR, FailureInfo.SET_COLLATERAL_FACTOR_WITHOUT_PRICE);
        }

        // Ensure that liquidation threshold <= 1
        if (newLiquidationThresholdMantissa > mantissaOne) {
            return fail(Error.INVALID_LIQUIDATION_THRESHOLD, FailureInfo.SET_LIQUIDATION_THRESHOLD_VALIDATION);
        }

        // Ensure that liquidation threshold >= CF
        if (newLiquidationThresholdMantissa < newCollateralFactorMantissa) {
            return
                fail(
                    Error.INVALID_LIQUIDATION_THRESHOLD,
                    FailureInfo.COLLATERAL_FACTOR_GREATER_THAN_LIQUIDATION_THRESHOLD
                );
        }

        // Set market's collateral factor to new collateral factor, remember old value
        uint256 oldCollateralFactorMantissa = market.collateralFactorMantissa;
        if (newCollateralFactorMantissa != oldCollateralFactorMantissa) {
            market.collateralFactorMantissa = newCollateralFactorMantissa;

            // Emit event with poolId, asset, old collateral factor, and new collateral factor
            emit NewCollateralFactor(poolId, vToken, oldCollateralFactorMantissa, newCollateralFactorMantissa);
        }

        uint256 oldLiquidationThresholdMantissa = market.liquidationThresholdMantissa;
        if (newLiquidationThresholdMantissa != oldLiquidationThresholdMantissa) {
            market.liquidationThresholdMantissa = newLiquidationThresholdMantissa;

            emit NewLiquidationThreshold(
                poolId,
                vToken,
                oldLiquidationThresholdMantissa,
                newLiquidationThresholdMantissa
            );
        }

        return uint256(Error.NO_ERROR);
    }

    /**
     * @dev Updates the liquidation incentive. Used by setLiquidationIncentive
     * @param poolId The ID of the pool.
     * @param vToken The market to set the Incentive for
     * @param newLiquidationIncentiveMantissa The new liquidation incentive to be set
     * @return uint256 0=success, otherwise reverted
     */
    function __setLiquidationIncentive(
        uint96 poolId,
        address vToken,
        uint256 newLiquidationIncentiveMantissa
    )
        internal
        compareValue(
            _poolMarkets[getPoolMarketIndex(poolId, vToken)].liquidationIncentiveMantissa,
            newLiquidationIncentiveMantissa
        )
        returns (uint256)
    {
        // Check if pool exists
        if (poolId > lastPoolId) revert PoolDoesNotExist(poolId);

        // Verify market is listed in the pool
        Market storage market = _poolMarkets[getPoolMarketIndex(poolId, vToken)];
        ensureListed(market);

        require(newLiquidationIncentiveMantissa >= mantissaOne, "incentive < 1e18");

        emit NewLiquidationIncentive(
            poolId,
            vToken,
            market.liquidationIncentiveMantissa,
            newLiquidationIncentiveMantissa
        );

        // Set liquidation incentive to new incentive
        market.liquidationIncentiveMantissa = newLiquidationIncentiveMantissa;

        return uint256(Error.NO_ERROR);
    }

    /**
     * @dev Updates the borrow caps. Used by _setMarketBorrowCaps and setMarketBorrowCaps
     * @param vTokens The markets to set the borrow caps on
     * @param newBorrowCaps The new borrow caps to be set
     */
    function __setMarketBorrowCaps(VToken[] memory vTokens, uint256[] memory newBorrowCaps) internal {
        ensureAllowed("_setMarketBorrowCaps(address[],uint256[])");

        uint256 numMarkets = vTokens.length;
        uint256 numBorrowCaps = newBorrowCaps.length;

        require(numMarkets != 0 && numMarkets == numBorrowCaps, "invalid input");

        for (uint256 i; i < numMarkets; ++i) {
            borrowCaps[address(vTokens[i])] = newBorrowCaps[i];
            emit NewBorrowCap(vTokens[i], newBorrowCaps[i]);
        }
    }

    /**
     * @dev Updates the supply caps. Used by _setMarketSupplyCaps and setMarketSupplyCaps
     * @param vTokens The markets to set the supply caps on
     * @param newSupplyCaps The new supply caps to be set
     */
    function __setMarketSupplyCaps(VToken[] memory vTokens, uint256[] memory newSupplyCaps) internal {
        ensureAllowed("_setMarketSupplyCaps(address[],uint256[])");

        uint256 numMarkets = vTokens.length;
        uint256 numSupplyCaps = newSupplyCaps.length;

        require(numMarkets != 0 && numMarkets == numSupplyCaps, "invalid input");

        for (uint256 i; i < numMarkets; ++i) {
            supplyCaps[address(vTokens[i])] = newSupplyCaps[i];
            emit NewSupplyCap(vTokens[i], newSupplyCaps[i]);
        }
    }

    /**
     * @dev Updates the prime token. Used by _setPrimeToken and setPrimeToken
     * @param _prime The new prime token to be set
     * @return uint256 0=success, otherwise reverted
     */
    function __setPrimeToken(IPrime _prime) internal returns (uint) {
        ensureAdmin();
        ensureNonzeroAddress(address(_prime));

        IPrime oldPrime = prime;
        prime = _prime;
        emit NewPrimeToken(oldPrime, _prime);

        return uint(Error.NO_ERROR);
    }

    /**
     * @dev Updates the forced liquidation. Used by _setForcedLiquidation and setForcedLiquidation
     * @param vTokenBorrowed The market to set the forced liquidation on
     * @param enable Whether to enable forced liquidations
     */
    function __setForcedLiquidation(address vTokenBorrowed, bool enable) internal {
        ensureAllowed("_setForcedLiquidation(address,bool)");
        if (vTokenBorrowed != address(vaiController)) {
            ensureListed(getCorePoolMarket(vTokenBorrowed));
        }
        isForcedLiquidationEnabled[vTokenBorrowed] = enable;
        emit IsForcedLiquidationEnabledUpdated(vTokenBorrowed, enable);
    }

    /**
     * @dev Updates the actions paused. Used by _setActionsPaused and setActionsPaused
     * @param markets_ The markets to set the actions paused on
     * @param actions_ The actions to set the paused state on
     * @param paused_ The new paused state to be set
     */
    function __setActionsPaused(address[] memory markets_, Action[] memory actions_, bool paused_) internal {
        ensureAllowed("_setActionsPaused(address[],uint8[],bool)");

        uint256 numMarkets = markets_.length;
        uint256 numActions = actions_.length;
        for (uint256 marketIdx; marketIdx < numMarkets; ++marketIdx) {
            for (uint256 actionIdx; actionIdx < numActions; ++actionIdx) {
                setActionPausedInternal(markets_[marketIdx], actions_[actionIdx], paused_);
            }
        }
    }
}
