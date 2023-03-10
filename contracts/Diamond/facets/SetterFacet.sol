pragma solidity 0.8.13;

import "../../Oracle/PriceOracle.sol";
import "../../Tokens/VTokens/VToken.sol";
import "../../Utils/ErrorReporter.sol";
import "../../Tokens/XVS/XVS.sol";
import "../../Tokens/VAI/VAI.sol";
import "../libraries/appStorage.sol";
import "../../Governance/IAccessControlManager.sol";
import "../libraries/LibAccessCheck.sol";
import "../libraries/LibHelper.sol";
import "../../Comptroller/Unitroller.sol";

contract SetterFacet is ComptrollerErrorReporter, ExponentialNoError {
    AppStorage internal s;
    /// @notice Emitted when close factor is changed by admin
    event NewCloseFactor(uint oldCloseFactorMantissa, uint newCloseFactorMantissa);

    /// @notice Emitted when a collateral factor is changed by admin
    event NewCollateralFactor(VToken vToken, uint oldCollateralFactorMantissa, uint newCollateralFactorMantissa);

    /// @notice Emitted when liquidation incentive is changed by admin
    event NewLiquidationIncentive(uint oldLiquidationIncentiveMantissa, uint newLiquidationIncentiveMantissa);

    /// @notice Emitted when price oracle is changed
    event NewPriceOracle(PriceOracle oldPriceOracle, PriceOracle newPriceOracle);

    /// @notice Emitted when borrow cap for a vToken is changed
    event NewBorrowCap(VToken indexed vToken, uint newBorrowCap);

    /// @notice Emitted when VAIController is changed
    event NewVAIController(VAIControllerInterface oldVAIController, VAIControllerInterface newVAIController);

    /// @notice Emitted when VAI mint rate is changed by admin
    event NewVAIMintRate(uint oldVAIMintRate, uint newVAIMintRate);

    /// @notice Emitted when protocol state is changed by admin
    event ActionProtocolPaused(bool state);

    /// @notice Emitted when treasury guardian is changed
    event NewTreasuryGuardian(address oldTreasuryGuardian, address newTreasuryGuardian);

    /// @notice Emitted when treasury address is changed
    event NewTreasuryAddress(address oldTreasuryAddress, address newTreasuryAddress);

    /// @notice Emitted when treasury percent is changed
    event NewTreasuryPercent(uint oldTreasuryPercent, uint newTreasuryPercent);

    /// @notice Emitted when liquidator adress is changed
    event NewLiquidatorContract(address oldLiquidatorContract, address newLiquidatorContract);

    /// @notice Emitted whe ComptrollerLens address is changed
    event NewComptrollerLens(address oldComptrollerLens, address newComptrollerLens);

    /// @notice Emitted when supply cap for a vToken is changed
    event NewSupplyCap(VToken indexed vToken, uint newSupplyCap);

    /// @notice Emitted when access control address is changed by admin
    event NewAccessControl(address oldAccessControlAddress, address newAccessControlAddress);

    /// @notice Emitted when pause guardian is changed
    event NewPauseGuardian(address oldPauseGuardian, address newPauseGuardian);

    /// @notice Emitted when an action is paused on a market
    event ActionPausedMarket(VToken indexed vToken, LibAccessCheck.Action indexed action, bool pauseState);

    /// @notice Emitted when VAI Vault info is changed
    event NewVAIVaultInfo(address vault_, uint releaseStartBlock_, uint releaseInterval_);

    /// @notice Emitted when Venus VAI Vault rate is changed
    event NewVenusVAIVaultRate(uint oldVenusVAIVaultRate, uint newVenusVAIVaultRate);

    /**
     * @notice Sets a new price oracle for the comptroller
     * @dev Admin function to set a new price oracle
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setPriceOracle(PriceOracle newOracle) external returns (uint) {
        // Check caller is admin
        LibAccessCheck.ensureAdmin();
        LibAccessCheck.ensureNonzeroAddress(address(newOracle));

        // Track the old oracle for the comptroller
        PriceOracle oldOracle = s.oracle;

        // Set comptroller's oracle to newOracle
        s.oracle = newOracle;

        // Emit NewPriceOracle(oldOracle, newOracle)
        emit NewPriceOracle(oldOracle, newOracle);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Sets the closeFactor used when liquidating borrows
     * @dev Admin function to set closeFactor
     * @param newCloseFactorMantissa New close factor, scaled by 1e18
     * @return uint 0=success, otherwise will revert
     */
    function _setCloseFactor(uint newCloseFactorMantissa) external returns (uint) {
        // Check caller is admin
        LibAccessCheck.ensureAdmin();

        uint oldCloseFactorMantissa = s.closeFactorMantissa;
        s.closeFactorMantissa = newCloseFactorMantissa;
        emit NewCloseFactor(oldCloseFactorMantissa, newCloseFactorMantissa);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Sets the address of the access control of this contract
     * @dev Admin function to set the access control address
     * @param newAccessControlAddress New address for the access control
     * @return uint 0=success, otherwise will revert
     */
    function _setAccessControl(address newAccessControlAddress) external returns (uint) {
        // Check caller is admin
        LibAccessCheck.ensureAdmin();
        LibAccessCheck.ensureNonzeroAddress(newAccessControlAddress);

        address oldAccessControlAddress = s.accessControl;
        s.accessControl = newAccessControlAddress;
        emit NewAccessControl(oldAccessControlAddress, newAccessControlAddress);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Sets the collateralFactor for a market
     * @dev Restricted function to set per-market collateralFactor
     * @param vToken The market to set the factor on
     * @param newCollateralFactorMantissa The new collateral factor, scaled by 1e18
     * @return uint 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function _setCollateralFactor(VToken vToken, uint newCollateralFactorMantissa) external returns (uint) {
        // Check caller is allowed by access control manager
        LibAccessCheck.ensureAllowed("_setCollateralFactor(address,uint256)");
        LibAccessCheck.ensureNonzeroAddress(address(vToken));

        // Verify market is listed
        Market storage market = s.markets[address(vToken)];
        LibAccessCheck.ensureListed(market);

        Exp memory newCollateralFactorExp = Exp({ mantissa: newCollateralFactorMantissa });

        //-- Check collateral factor <= 0.9
        Exp memory highLimit = Exp({ mantissa: LibHelper.collateralFactorMaxMantissa });
        if (lessThanExp(highLimit, newCollateralFactorExp)) {
            return fail(Error.INVALID_COLLATERAL_FACTOR, FailureInfo.SET_COLLATERAL_FACTOR_VALIDATION);
        }

        // If collateral factor != 0, fail if price == 0
        if (newCollateralFactorMantissa != 0 && s.oracle.getUnderlyingPrice(vToken) == 0) {
            return fail(Error.PRICE_ERROR, FailureInfo.SET_COLLATERAL_FACTOR_WITHOUT_PRICE);
        }

        // Set market's collateral factor to new collateral factor, remember old value
        uint oldCollateralFactorMantissa = market.collateralFactorMantissa;
        market.collateralFactorMantissa = newCollateralFactorMantissa;

        // Emit event with asset, old collateral factor, and new collateral factor
        emit NewCollateralFactor(vToken, oldCollateralFactorMantissa, newCollateralFactorMantissa);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Sets liquidationIncentive
     * @dev Admin function to set liquidationIncentive
     * @param newLiquidationIncentiveMantissa New liquidationIncentive scaled by 1e18
     * @return uint 0=success, otherwise a failure. (See ErrorReporter for details)
     */
    function _setLiquidationIncentive(uint newLiquidationIncentiveMantissa) external returns (uint) {
        LibAccessCheck.ensureAllowed("_setLiquidationIncentive(uint256)");

        require(newLiquidationIncentiveMantissa >= 1e18, "incentive must be over 1e18");

        // Save current value for use in log
        uint oldLiquidationIncentiveMantissa = s.liquidationIncentiveMantissa;
        // Set liquidation incentive to new incentive
        s.liquidationIncentiveMantissa = newLiquidationIncentiveMantissa;

        // Emit event with old incentive, new incentive
        emit NewLiquidationIncentive(oldLiquidationIncentiveMantissa, newLiquidationIncentiveMantissa);

        return uint(Error.NO_ERROR);
    }

    function _setLiquidatorContract(address newLiquidatorContract_) external {
        // Check caller is admin
        LibAccessCheck.ensureAdmin();
        address oldLiquidatorContract = s.liquidatorContract;
        s.liquidatorContract = newLiquidatorContract_;
        emit NewLiquidatorContract(oldLiquidatorContract, newLiquidatorContract_);
    }

    /**
     * @notice Admin function to change the Pause Guardian
     * @param newPauseGuardian The address of the new Pause Guardian
     * @return uint 0=success, otherwise a failure. (See enum Error for details)
     */
    function _setPauseGuardian(address newPauseGuardian) external returns (uint) {
        LibAccessCheck.ensureAdmin();
        LibAccessCheck.ensureNonzeroAddress(newPauseGuardian);

        // Save current value for inclusion in log
        address oldPauseGuardian = s.pauseGuardian;
        // Store pauseGuardian with value newPauseGuardian
        s.pauseGuardian = newPauseGuardian;

        // Emit NewPauseGuardian(OldPauseGuardian, NewPauseGuardian)
        emit NewPauseGuardian(oldPauseGuardian, newPauseGuardian);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Set the given borrow caps for the given vToken markets. Borrowing that brings total borrows to or above borrow cap will revert.
     * @dev Access is controled by ACM. A borrow cap of 0 corresponds to unlimited borrowing.
     * @param vTokens The addresses of the markets (tokens) to change the borrow caps for
     * @param newBorrowCaps The new borrow cap values in underlying to be set. A value of 0 corresponds to unlimited borrowing.
     */
    function _setMarketBorrowCaps(VToken[] calldata vTokens, uint[] calldata newBorrowCaps) external {
        LibAccessCheck.ensureAllowed("_setMarketBorrowCaps(address[],uint256[])");

        uint numMarkets = vTokens.length;
        uint numBorrowCaps = newBorrowCaps.length;

        require(numMarkets != 0 && numMarkets == numBorrowCaps, "invalid input");

        for (uint i; i < numMarkets; ++i) {
            s.borrowCaps[address(vTokens[i])] = newBorrowCaps[i];
            emit NewBorrowCap(vTokens[i], newBorrowCaps[i]);
        }
    }

    /**
     * @notice Set the given supply caps for the given vToken markets. Supply that brings total Supply to or above supply cap will revert.
     * @dev Admin function to set the supply caps. A supply cap of 0 corresponds to Minting NotAllowed.
     * @param vTokens The addresses of the markets (tokens) to change the supply caps for
     * @param newSupplyCaps The new supply cap values in underlying to be set. A value of 0 corresponds to Minting NotAllowed.
     */
    function _setMarketSupplyCaps(VToken[] calldata vTokens, uint256[] calldata newSupplyCaps) external {
        LibAccessCheck.ensureAllowed("_setMarketSupplyCaps(address[],uint256[])");

        uint numMarkets = vTokens.length;
        uint numSupplyCaps = newSupplyCaps.length;

        require(numMarkets != 0 && numMarkets == numSupplyCaps, "invalid input");

        for (uint i; i < numMarkets; ++i) {
            s.supplyCaps[address(vTokens[i])] = newSupplyCaps[i];
            emit NewSupplyCap(vTokens[i], newSupplyCaps[i]);
        }
    }

    /**
     * @notice Set whole protocol pause/unpause state
     */
    function _setProtocolPaused(bool state) external returns (bool) {
        LibAccessCheck.ensureAllowed("_setProtocolPaused(bool)");

        s.protocolPaused = state;
        emit ActionProtocolPaused(state);
        return state;
    }

    /**
     * @notice Pause/unpause certain actions
     * @param markets Markets to pause/unpause the actions on
     * @param actions List of action ids to pause/unpause
     * @param paused The new paused state (true=paused, false=unpaused)
     */
    function _setActionsPaused(
        address[] calldata markets,
        LibAccessCheck.Action[] calldata actions,
        bool paused
    ) external {
        LibAccessCheck.ensureAllowed("_setActionsPaused(address[],uint256[],bool)");

        uint256 numMarkets = s.markets.length;
        uint256 numActions = actions.length;
        for (uint marketIdx; marketIdx < numMarkets; ++marketIdx) {
            for (uint actionIdx; actionIdx < numActions; ++actionIdx) {
                setActionPausedInternal(s.markets[marketIdx], actions[actionIdx], paused);
            }
        }
    }

    /**
     * @dev Pause/unpause an action on a market
     * @param market Market to pause/unpause the action on
     * @param action Action id to pause/unpause
     * @param paused The new paused state (true=paused, false=unpaused)
     */
    function setActionPausedInternal(address market, LibAccessCheck.Action action, bool paused) internal {
        LibAccessCheck.ensureListed(s.markets[market]);
        s._actionPaused[market][uint(action)] = paused;
        emit ActionPausedMarket(VToken(market), action, paused);
    }

    /**
     * @notice Sets a new VAI controller
     * @dev Admin function to set a new VAI controller
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setVAIController(VAIControllerInterface vaiController_) external returns (uint) {
        // Check caller is admin
        LibAccessCheck.ensureAdmin();
        LibAccessCheck.ensureNonzeroAddress(address(vaiController_));

        VAIControllerInterface oldVaiController = s.vaiController;
        s.vaiController = vaiController_;
        emit NewVAIController(oldVaiController, vaiController_);

        return uint(Error.NO_ERROR);
    }

    function _setVAIMintRate(uint newVAIMintRate) external returns (uint) {
        // Check caller is admin
        LibAccessCheck.ensureAdmin();
        uint oldVAIMintRate = s.vaiMintRate;
        s.vaiMintRate = newVAIMintRate;
        emit NewVAIMintRate(oldVAIMintRate, newVAIMintRate);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Set the minted VAI amount of the `owner`
     * @param owner The address of the account to set
     * @param amount The amount of VAI to set to the account
     * @return The number of minted VAI by `owner`
     */
    function setMintedVAIOf(address owner, uint amount) external returns (uint) {
        LibAccessCheck.checkProtocolPauseState();

        // Pausing is a very serious situation - we revert to sound the alarms
        require(!s.mintVAIGuardianPaused && !s.repayVAIGuardianPaused, "VAI is paused");
        // Check caller is vaiController
        if (msg.sender != address(s.vaiController)) {
            return fail(Error.REJECTION, FailureInfo.SET_MINTED_VAI_REJECTION);
        }
        s.mintedVAIs[owner] = amount;
        return uint(Error.NO_ERROR);
    }

    function _setTreasuryData(
        address newTreasuryGuardian,
        address newTreasuryAddress,
        uint newTreasuryPercent
    ) external returns (uint) {
        // Check caller is admin
        LibAccessCheck.ensureAdminOr(s.treasuryGuardian);

        require(newTreasuryPercent < 1e18, "treasury percent cap overflow");
        LibAccessCheck.ensureNonzeroAddress(newTreasuryGuardian);

        address oldTreasuryGuardian = s.treasuryGuardian;
        address oldTreasuryAddress = s.treasuryAddress;
        uint oldTreasuryPercent = s.treasuryPercent;

        s.treasuryGuardian = newTreasuryGuardian;
        s.treasuryAddress = newTreasuryAddress;
        s.treasuryPercent = newTreasuryPercent;

        emit NewTreasuryGuardian(oldTreasuryGuardian, newTreasuryGuardian);
        emit NewTreasuryAddress(oldTreasuryAddress, newTreasuryAddress);
        emit NewTreasuryPercent(oldTreasuryPercent, newTreasuryPercent);

        return uint(Error.NO_ERROR);
    }

    function _become(Unitroller unitroller) external {
        require(msg.sender == unitroller.admin(), "only unitroller admin can");
        require(unitroller._acceptImplementation() == 0, "not authorized");
    }

    /*** Venus Distribution ***/

    /**
     * @dev Set ComptrollerLens contract address
     */
    function _setComptrollerLens(ComptrollerLensInterface comptrollerLens_) external returns (uint) {
        LibAccessCheck.ensureAdmin();
        LibAccessCheck.ensureNonzeroAddress(address(comptrollerLens_));
        address oldComptrollerLens = address(s.comptrollerLens);
        s.comptrollerLens = comptrollerLens_;
        emit NewComptrollerLens(oldComptrollerLens, address(s.comptrollerLens));

        return uint(Error.NO_ERROR);
    }

    /**
    /**
     * @notice Set the amount of XVS distributed per block to VAI Vault
     * @param venusVAIVaultRate_ The amount of XVS wei per block to distribute to VAI Vault
     */
    function _setVenusVAIVaultRate(uint venusVAIVaultRate_) external {
        LibAccessCheck.ensureAdmin();
        uint oldVenusVAIVaultRate = s.venusVAIVaultRate;
        s.venusVAIVaultRate = venusVAIVaultRate_;
        emit NewVenusVAIVaultRate(oldVenusVAIVaultRate, venusVAIVaultRate_);
    }

    /**
     * @notice Set the VAI Vault infos
     * @param vault_ The address of the VAI Vault
     * @param releaseStartBlock_ The start block of release to VAI Vault
     * @param minReleaseAmount_ The minimum release amount to VAI Vault
     */
    function _setVAIVaultInfo(address vault_, uint256 releaseStartBlock_, uint256 minReleaseAmount_) external {
        LibAccessCheck.ensureAdmin();
        LibAccessCheck.ensureNonzeroAddress(vault_);

        s.vaiVaultAddress = vault_;
        s.releaseStartBlock = releaseStartBlock_;
        s.minReleaseAmount = minReleaseAmount_;
        emit NewVAIVaultInfo(vault_, releaseStartBlock_, minReleaseAmount_);
    }
}
