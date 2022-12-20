pragma solidity ^0.5.16;

import "../Oracle/PriceOracle.sol";
import "../Tokens/VTokens/VToken.sol";
import "../Utils/ErrorReporter.sol";
import "../Tokens/XVS/XVS.sol";
import "../Tokens/VAI/VAI.sol";
import "../Governance/IAccessControlManager.sol";
import "./ComptrollerLensInterface.sol";
import "./UpdatedComptrollerInterface.sol";
import "./ComptrollerStorage.sol";
import "./Unitroller.sol";

/**
 * @title Venus's Comptroller Contract
 * @dev Name of this comptorller is updated to UpdatedComptroller as tests were failing
 * due to the two contracts name by Comptorller. At the time of deployment of this
 * contract to mainnet it should be nammed as Comptorller
 * @author Venus
 */
//
contract UpdatedComptroller is
    ComptrollerV10Storage,
    UpdatedComptrollerInterfaceG2,
    ComptrollerErrorReporter,
    ExponentialNoError
{
    /// @notice Emitted when an admin supports a market
    event MarketListed(VToken vToken);

    /// @notice Emitted when an account enters a market
    event MarketEntered(VToken vToken, address account);

    /// @notice Emitted when an account exits a market
    event MarketExited(VToken vToken, address account);

    /// @notice Emitted when close factor is changed by admin
    event NewCloseFactor(uint oldCloseFactorMantissa, uint newCloseFactorMantissa);

    /// @notice Emitted when a collateral factor is changed by admin
    event NewCollateralFactor(VToken vToken, uint oldCollateralFactorMantissa, uint newCollateralFactorMantissa);

    /// @notice Emitted when liquidation incentive is changed by admin
    event NewLiquidationIncentive(uint oldLiquidationIncentiveMantissa, uint newLiquidationIncentiveMantissa);

    /// @notice Emitted when price oracle is changed
    event NewPriceOracle(PriceOracle oldPriceOracle, PriceOracle newPriceOracle);

    /// @notice Emitted when VAI Vault info is changed
    event NewVAIVaultInfo(address vault_, uint releaseStartBlock_, uint releaseInterval_);

    /// @notice Emitted when pause guardian is changed
    event NewPauseGuardian(address oldPauseGuardian, address newPauseGuardian);

    /// @notice Emitted when an action is paused on a market
    event ActionPausedMarket(VToken indexed vToken, Action indexed action, bool pauseState);

    /// @notice Emitted when Venus VAI Vault rate is changed
    event NewVenusVAIVaultRate(uint oldVenusVAIVaultRate, uint newVenusVAIVaultRate);

    /// @notice Emitted when a new borrow-side XVS speed is calculated for a market
    event VenusBorrowSpeedUpdated(VToken indexed vToken, uint newSpeed);

    /// @notice Emitted when a new supply-side XVS speed is calculated for a market
    event VenusSupplySpeedUpdated(VToken indexed vToken, uint newSpeed);

    /// @notice Emitted when XVS is distributed to a supplier
    event DistributedSupplierVenus(
        VToken indexed vToken,
        address indexed supplier,
        uint venusDelta,
        uint venusSupplyIndex
    );

    /// @notice Emitted when XVS is distributed to a borrower
    event DistributedBorrowerVenus(
        VToken indexed vToken,
        address indexed borrower,
        uint venusDelta,
        uint venusBorrowIndex
    );

    /// @notice Emitted when XVS is distributed to VAI Vault
    event DistributedVAIVaultVenus(uint amount);

    /// @notice Emitted when VAIController is changed
    event NewVAIController(VAIControllerInterface oldVAIController, VAIControllerInterface newVAIController);

    /// @notice Emitted when VAI mint rate is changed by admin
    event NewVAIMintRate(uint oldVAIMintRate, uint newVAIMintRate);

    /// @notice Emitted when protocol state is changed by admin
    event ActionProtocolPaused(bool state);

    /// @notice Emitted when borrow cap for a vToken is changed
    event NewBorrowCap(VToken indexed vToken, uint newBorrowCap);

    /// @notice Emitted when treasury guardian is changed
    event NewTreasuryGuardian(address oldTreasuryGuardian, address newTreasuryGuardian);

    /// @notice Emitted when treasury address is changed
    event NewTreasuryAddress(address oldTreasuryAddress, address newTreasuryAddress);

    /// @notice Emitted when treasury percent is changed
    event NewTreasuryPercent(uint oldTreasuryPercent, uint newTreasuryPercent);

    // @notice Emitted when liquidator adress is changed
    event NewLiquidatorContract(address oldLiquidatorContract, address newLiquidatorContract);

    /// @notice Emitted when Venus is granted by admin
    event VenusGranted(address recipient, uint amount);

    /// @notice Emitted whe ComptrollerLens address is changed
    event NewComptrollerLens(address oldComptrollerLens, address newComptrollerLens);

    /// @notice Emitted when supply cap for a vToken is changed
    event NewSupplyCap(VToken indexed vToken, uint newSupplyCap);

    /// @notice Emitted when access control address is changed by admin
    event NewAccessControl(address oldAccessControlAddress, address newAccessControlAddress);

    /// @notice The initial Venus index for a market
    uint224 public constant venusInitialIndex = 1e36;

    // closeFactorMantissa must be strictly greater than this value
    uint internal constant closeFactorMinMantissa = 0.05e18; // 0.05

    // closeFactorMantissa must not exceed this value
    uint internal constant closeFactorMaxMantissa = 0.9e18; // 0.9

    // No collateralFactorMantissa may exceed this value
    uint internal constant collateralFactorMaxMantissa = 0.9e18; // 0.9

    constructor() public {
        admin = msg.sender;
    }

    /// @notice Reverts if the protocol is paused
    function checkProtocolPauseState() private view {
        require(!protocolPaused, "protocol is paused");
    }

    /// @notice Reverts if a certain action is paused on a market
    function checkActionPauseState(address market, Action action) private view {
        require(!actionPaused(market, action), "action is paused");
    }

    /// @notice Reverts if the caller is not admin
    function ensureAdmin() private view {
        require(msg.sender == admin, "only admin can");
    }

    /// @notice Checks the passed address is nonzero
    function ensureNonzeroAddress(address someone) private pure {
        require(someone != address(0), "can't be zero address");
    }

    /// @notice Reverts if the market is not listed
    function ensureListed(Market storage market) private view {
        require(market.isListed, "market not listed");
    }

    /// @notice Reverts if the caller is neither admin nor the passed address
    function ensureAdminOr(address privilegedAddress) private view {
        require(msg.sender == admin || msg.sender == privilegedAddress, "access denied");
    }

    function ensureAllowed(string memory functionSig) private view {
        require(IAccessControlManager(accessControl).isAllowedToCall(msg.sender, functionSig), "access denied");
    }

    /*** Assets You Are In ***/

    /**
     * @notice Returns the assets an account has entered
     * @param account The address of the account to pull assets for
     * @return A dynamic list with the assets the account has entered
     */
    function getAssetsIn(address account) external view returns (VToken[] memory) {
        return accountAssets[account];
    }

    /**
     * @notice Returns whether the given account is entered in the given asset
     * @param account The address of the account to check
     * @param vToken The vToken to check
     * @return True if the account is in the asset, otherwise false.
     */
    function checkMembership(address account, VToken vToken) external view returns (bool) {
        return markets[address(vToken)].accountMembership[account];
    }

    /**
     * @notice Add assets to be included in account liquidity calculation
     * @param vTokens The list of addresses of the vToken markets to be enabled
     * @return Success indicator for whether each corresponding market was entered
     */
    function enterMarkets(address[] calldata vTokens) external returns (uint[] memory) {
        uint len = vTokens.length;

        uint[] memory results = new uint[](len);
        for (uint i; i < len; ++i) {
            results[i] = uint(addToMarketInternal(VToken(vTokens[i]), msg.sender));
        }

        return results;
    }

    /**
     * @notice Add the market to the borrower's "assets in" for liquidity calculations
     * @param vToken The market to enter
     * @param borrower The address of the account to modify
     * @return Success indicator for whether the market was entered
     */
    function addToMarketInternal(VToken vToken, address borrower) internal returns (Error) {
        checkActionPauseState(address(vToken), Action.ENTER_MARKET);

        Market storage marketToJoin = markets[address(vToken)];
        ensureListed(marketToJoin);

        if (marketToJoin.accountMembership[borrower]) {
            // already joined
            return Error.NO_ERROR;
        }

        // survived the gauntlet, add to list
        // NOTE: we store these somewhat redundantly as a significant optimization
        //  this avoids having to iterate through the list for the most common use cases
        //  that is, only when we need to perform liquidity checks
        //  and not whenever we want to check if an account is in a particular market
        marketToJoin.accountMembership[borrower] = true;
        accountAssets[borrower].push(vToken);

        emit MarketEntered(vToken, borrower);

        return Error.NO_ERROR;
    }

    /**
     * @notice Removes asset from sender's account liquidity calculation
     * @dev Sender must not have an outstanding borrow balance in the asset,
     *  or be providing necessary collateral for an outstanding borrow.
     * @param vTokenAddress The address of the asset to be removed
     * @return Whether or not the account successfully exited the market
     */
    function exitMarket(address vTokenAddress) external returns (uint) {
        checkActionPauseState(vTokenAddress, Action.EXIT_MARKET);

        VToken vToken = VToken(vTokenAddress);
        /* Get sender tokensHeld and amountOwed underlying from the vToken */
        (uint oErr, uint tokensHeld, uint amountOwed, ) = vToken.getAccountSnapshot(msg.sender);
        require(oErr == 0, "getAccountSnapshot failed"); // semi-opaque error code

        /* Fail if the sender has a borrow balance */
        if (amountOwed != 0) {
            return fail(Error.NONZERO_BORROW_BALANCE, FailureInfo.EXIT_MARKET_BALANCE_OWED);
        }

        /* Fail if the sender is not permitted to redeem all of their tokens */
        uint allowed = redeemAllowedInternal(vTokenAddress, msg.sender, tokensHeld);
        if (allowed != 0) {
            return failOpaque(Error.REJECTION, FailureInfo.EXIT_MARKET_REJECTION, allowed);
        }

        Market storage marketToExit = markets[address(vToken)];

        /* Return true if the sender is not already ‘in’ the market */
        if (!marketToExit.accountMembership[msg.sender]) {
            return uint(Error.NO_ERROR);
        }

        /* Set vToken account membership to false */
        delete marketToExit.accountMembership[msg.sender];

        /* Delete vToken from the account’s list of assets */
        // In order to delete vToken, copy last item in list to location of item to be removed, reduce length by 1
        VToken[] storage userAssetList = accountAssets[msg.sender];
        uint len = userAssetList.length;
        uint i;
        for (; i < len; ++i) {
            if (userAssetList[i] == vToken) {
                userAssetList[i] = userAssetList[len - 1];
                userAssetList.length--;
                break;
            }
        }

        // We *must* have found the asset in the list or our redundant data structure is broken
        assert(i < len);

        emit MarketExited(vToken, msg.sender);

        return uint(Error.NO_ERROR);
    }

    /*** Policy Hooks ***/

    /**
     * @notice Checks if the account should be allowed to mint tokens in the given market
     * @param vToken The market to verify the mint against
     * @param minter The account which would get the minted tokens
     * @param mintAmount The amount of underlying being supplied to the market in exchange for tokens
     * @return 0 if the mint is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function mintAllowed(address vToken, address minter, uint mintAmount) external returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        checkProtocolPauseState();
        checkActionPauseState(vToken, Action.MINT);
        ensureListed(markets[vToken]);

        uint256 supplyCap = supplyCaps[vToken];
        require(supplyCap != 0, "market supply cap is 0");

        uint256 vTokenSupply = VToken(vToken).totalSupply();
        Exp memory exchangeRate = Exp({ mantissa: VToken(vToken).exchangeRateStored() });
        uint256 nextTotalSupply = mul_ScalarTruncateAddUInt(exchangeRate, vTokenSupply, mintAmount);
        require(nextTotalSupply <= supplyCap, "market supply cap reached");

        // Keep the flywheel moving
        updateVenusSupplyIndex(vToken);
        distributeSupplierVenus(vToken, minter);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Checks if the account should be allowed to redeem tokens in the given market
     * @param vToken The market to verify the redeem against
     * @param redeemer The account which would redeem the tokens
     * @param redeemTokens The number of vTokens to exchange for the underlying asset in the market
     * @return 0 if the redeem is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function redeemAllowed(address vToken, address redeemer, uint redeemTokens) external returns (uint) {
        checkProtocolPauseState();
        checkActionPauseState(vToken, Action.REDEEM);

        uint allowed = redeemAllowedInternal(vToken, redeemer, redeemTokens);
        if (allowed != uint(Error.NO_ERROR)) {
            return allowed;
        }

        // Keep the flywheel moving
        updateVenusSupplyIndex(vToken);
        distributeSupplierVenus(vToken, redeemer);

        return uint(Error.NO_ERROR);
    }

    function redeemAllowedInternal(address vToken, address redeemer, uint redeemTokens) internal view returns (uint) {
        ensureListed(markets[vToken]);

        /* If the redeemer is not 'in' the market, then we can bypass the liquidity check */
        if (!markets[vToken].accountMembership[redeemer]) {
            return uint(Error.NO_ERROR);
        }

        /* Otherwise, perform a hypothetical liquidity check to guard against shortfall */
        (Error err, , uint shortfall) = getHypotheticalAccountLiquidityInternal(
            redeemer,
            VToken(vToken),
            redeemTokens,
            0
        );
        if (err != Error.NO_ERROR) {
            return uint(err);
        }
        if (shortfall != 0) {
            return uint(Error.INSUFFICIENT_LIQUIDITY);
        }

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Checks if the account should be allowed to borrow the underlying asset of the given market
     * @param vToken The market to verify the borrow against
     * @param borrower The account which would borrow the asset
     * @param borrowAmount The amount of underlying the account would borrow
     * @return 0 if the borrow is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function borrowAllowed(address vToken, address borrower, uint borrowAmount) external returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        checkProtocolPauseState();
        checkActionPauseState(vToken, Action.BORROW);

        ensureListed(markets[vToken]);

        if (!markets[vToken].accountMembership[borrower]) {
            // only vTokens may call borrowAllowed if borrower not in market
            require(msg.sender == vToken, "sender must be vToken");

            // attempt to add borrower to the market
            Error err = addToMarketInternal(VToken(vToken), borrower);
            if (err != Error.NO_ERROR) {
                return uint(err);
            }
        }

        if (oracle.getUnderlyingPrice(VToken(vToken)) == 0) {
            return uint(Error.PRICE_ERROR);
        }

        uint borrowCap = borrowCaps[vToken];
        // Borrow cap of 0 corresponds to unlimited borrowing
        if (borrowCap != 0) {
            uint nextTotalBorrows = add_(VToken(vToken).totalBorrows(), borrowAmount);
            require(nextTotalBorrows < borrowCap, "market borrow cap reached");
        }

        (Error err, , uint shortfall) = getHypotheticalAccountLiquidityInternal(
            borrower,
            VToken(vToken),
            0,
            borrowAmount
        );
        if (err != Error.NO_ERROR) {
            return uint(err);
        }
        if (shortfall != 0) {
            return uint(Error.INSUFFICIENT_LIQUIDITY);
        }

        // Keep the flywheel moving
        Exp memory borrowIndex = Exp({ mantissa: VToken(vToken).borrowIndex() });
        updateVenusBorrowIndex(vToken, borrowIndex);
        distributeBorrowerVenus(vToken, borrower, borrowIndex);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Checks if the account should be allowed to repay a borrow in the given market
     * @param vToken The market to verify the repay against
     * @param payer The account which would repay the asset
     * @param borrower The account which borrowed the asset
     * @param repayAmount The amount of the underlying asset the account would repay
     * @return 0 if the repay is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function repayBorrowAllowed(
        address vToken,
        address payer, // solhint-disable-line no-unused-vars
        address borrower,
        uint repayAmount // solhint-disable-line no-unused-vars
    ) external returns (uint) {
        checkProtocolPauseState();
        checkActionPauseState(vToken, Action.REPAY);
        ensureListed(markets[vToken]);

        // Keep the flywheel moving
        Exp memory borrowIndex = Exp({ mantissa: VToken(vToken).borrowIndex() });
        updateVenusBorrowIndex(vToken, borrowIndex);
        distributeBorrowerVenus(vToken, borrower, borrowIndex);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Checks if the liquidation should be allowed to occur
     * @param vTokenBorrowed Asset which was borrowed by the borrower
     * @param vTokenCollateral Asset which was used as collateral and will be seized
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param repayAmount The amount of underlying being repaid
     */
    function liquidateBorrowAllowed(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount
    ) external returns (uint) {
        checkProtocolPauseState();

        // if we want to pause liquidating to vTokenCollateral, we should pause seizing
        checkActionPauseState(vTokenBorrowed, Action.LIQUIDATE);

        if (liquidatorContract != address(0) && liquidator != liquidatorContract) {
            return uint(Error.UNAUTHORIZED);
        }

        ensureListed(markets[vTokenCollateral]);
        if (address(vTokenBorrowed) != address(vaiController)) {
            ensureListed(markets[vTokenBorrowed]);
        }

        /* The borrower must have shortfall in order to be liquidatable */
        (Error err, , uint shortfall) = getHypotheticalAccountLiquidityInternal(borrower, VToken(0), 0, 0);
        if (err != Error.NO_ERROR) {
            return uint(err);
        }
        if (shortfall == 0) {
            return uint(Error.INSUFFICIENT_SHORTFALL);
        }

        /* The liquidator may not repay more than what is allowed by the closeFactor */
        uint borrowBalance;
        if (address(vTokenBorrowed) != address(vaiController)) {
            borrowBalance = VToken(vTokenBorrowed).borrowBalanceStored(borrower);
        } else {
            borrowBalance = vaiController.getVAIRepayAmount(borrower);
        }
        // maxClose = multipy of closeFactorMantissa and borrowBalance
        if (repayAmount > mul_ScalarTruncate(Exp({ mantissa: closeFactorMantissa }), borrowBalance)) {
            return uint(Error.TOO_MUCH_REPAY);
        }

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Checks if the seizing of assets should be allowed to occur
     * @param vTokenCollateral Asset which was used as collateral and will be seized
     * @param vTokenBorrowed Asset which was borrowed by the borrower
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param seizeTokens The number of collateral tokens to seize
     */
    function seizeAllowed(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens // solhint-disable-line no-unused-vars
    ) external returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        checkProtocolPauseState();
        checkActionPauseState(vTokenCollateral, Action.SEIZE);

        // We've added VAIController as a borrowed token list check for seize
        ensureListed(markets[vTokenCollateral]);
        if (address(vTokenBorrowed) != address(vaiController)) {
            ensureListed(markets[vTokenBorrowed]);
        }

        if (VToken(vTokenCollateral).comptroller() != VToken(vTokenBorrowed).comptroller()) {
            return uint(Error.COMPTROLLER_MISMATCH);
        }

        // Keep the flywheel moving
        updateVenusSupplyIndex(vTokenCollateral);
        distributeSupplierVenus(vTokenCollateral, borrower);
        distributeSupplierVenus(vTokenCollateral, liquidator);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Checks if the account should be allowed to transfer tokens in the given market
     * @param vToken The market to verify the transfer against
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of vTokens to transfer
     * @return 0 if the transfer is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function transferAllowed(address vToken, address src, address dst, uint transferTokens) external returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        checkProtocolPauseState();
        checkActionPauseState(vToken, Action.TRANSFER);

        // Currently the only consideration is whether or not
        //  the src is allowed to redeem this many tokens
        uint allowed = redeemAllowedInternal(vToken, src, transferTokens);
        if (allowed != uint(Error.NO_ERROR)) {
            return allowed;
        }

        // Keep the flywheel moving
        updateVenusSupplyIndex(vToken);
        distributeSupplierVenus(vToken, src);
        distributeSupplierVenus(vToken, dst);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Determine the current account liquidity wrt collateral requirements
     * @return (possible error code (semi-opaque),
                account liquidity in excess of collateral requirements,
     *          account shortfall below collateral requirements)
     */
    function getAccountLiquidity(address account) external view returns (uint, uint, uint) {
        (Error err, uint liquidity, uint shortfall) = getHypotheticalAccountLiquidityInternal(account, VToken(0), 0, 0);

        return (uint(err), liquidity, shortfall);
    }

    /**
     * @notice Determine what the account liquidity would be if the given amounts were redeemed/borrowed
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @return (possible error code (semi-opaque),
                hypothetical account liquidity in excess of collateral requirements,
     *          hypothetical account shortfall below collateral requirements)
     */
    function getHypotheticalAccountLiquidity(
        address account,
        address vTokenModify,
        uint redeemTokens,
        uint borrowAmount
    ) external view returns (uint, uint, uint) {
        (Error err, uint liquidity, uint shortfall) = getHypotheticalAccountLiquidityInternal(
            account,
            VToken(vTokenModify),
            redeemTokens,
            borrowAmount
        );
        return (uint(err), liquidity, shortfall);
    }

    /**
     * @notice Determine what the account liquidity would be if the given amounts were redeemed/borrowed
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @dev Note that we calculate the exchangeRateStored for each collateral vToken using stored data,
     *  without calculating accumulated interest.
     * @return (possible error code,
                hypothetical account liquidity in excess of collateral requirements,
     *          hypothetical account shortfall below collateral requirements)
     */
    function getHypotheticalAccountLiquidityInternal(
        address account,
        VToken vTokenModify,
        uint redeemTokens,
        uint borrowAmount
    ) internal view returns (Error, uint, uint) {
        (uint err, uint liquidity, uint shortfall) = comptrollerLens.getHypotheticalAccountLiquidity(
            address(this),
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount
        );
        return (Error(err), liquidity, shortfall);
    }

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in vToken.liquidateBorrowFresh)
     * @param vTokenBorrowed The address of the borrowed vToken
     * @param vTokenCollateral The address of the collateral vToken
     * @param actualRepayAmount The amount of vTokenBorrowed underlying to convert into vTokenCollateral tokens
     * @return (errorCode, number of vTokenCollateral tokens to be seized in a liquidation)
     */
    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint actualRepayAmount
    ) external view returns (uint, uint) {
        (uint err, uint seizeTokens) = comptrollerLens.liquidateCalculateSeizeTokens(
            address(this),
            vTokenBorrowed,
            vTokenCollateral,
            actualRepayAmount
        );
        return (err, seizeTokens);
    }

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in vToken.liquidateBorrowFresh)
     * @param vTokenCollateral The address of the collateral vToken
     * @param actualRepayAmount The amount of vTokenBorrowed underlying to convert into vTokenCollateral tokens
     * @return (errorCode, number of vTokenCollateral tokens to be seized in a liquidation)
     */
    function liquidateVAICalculateSeizeTokens(
        address vTokenCollateral,
        uint actualRepayAmount
    ) external view returns (uint, uint) {
        (uint err, uint seizeTokens) = comptrollerLens.liquidateVAICalculateSeizeTokens(
            address(this),
            vTokenCollateral,
            actualRepayAmount
        );
        return (err, seizeTokens);
    }

    /*** Admin Functions ***/

    /**
     * @notice Sets a new price oracle for the comptroller
     * @dev Admin function to set a new price oracle
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setPriceOracle(PriceOracle newOracle) external returns (uint) {
        // Check caller is admin
        ensureAdmin();
        ensureNonzeroAddress(address(newOracle));

        // Track the old oracle for the comptroller
        PriceOracle oldOracle = oracle;

        // Set comptroller's oracle to newOracle
        oracle = newOracle;

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
        ensureAdmin();

        uint oldCloseFactorMantissa = closeFactorMantissa;
        closeFactorMantissa = newCloseFactorMantissa;
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
        ensureAdmin();
        ensureNonzeroAddress(newAccessControlAddress);

        address oldAccessControlAddress = accessControl;
        accessControl = newAccessControlAddress;
        emit NewAccessControl(oldAccessControlAddress, accessControl);

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
        ensureAllowed("_setCollateralFactor(address,uint256)");
        ensureNonzeroAddress(address(vToken));

        // Verify market is listed
        Market storage market = markets[address(vToken)];
        ensureListed(market);

        Exp memory newCollateralFactorExp = Exp({ mantissa: newCollateralFactorMantissa });

        // Check collateral factor <= 0.9
        Exp memory highLimit = Exp({ mantissa: collateralFactorMaxMantissa });
        if (lessThanExp(highLimit, newCollateralFactorExp)) {
            return fail(Error.INVALID_COLLATERAL_FACTOR, FailureInfo.SET_COLLATERAL_FACTOR_VALIDATION);
        }

        // If collateral factor != 0, fail if price == 0
        if (newCollateralFactorMantissa != 0 && oracle.getUnderlyingPrice(vToken) == 0) {
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
        ensureAllowed("_setLiquidationIncentive(uint256)");

        require(newLiquidationIncentiveMantissa >= 1e18, "incentive must be over 1e18");

        // Save current value for use in log
        uint oldLiquidationIncentiveMantissa = liquidationIncentiveMantissa;

        // Set liquidation incentive to new incentive
        liquidationIncentiveMantissa = newLiquidationIncentiveMantissa;

        // Emit event with old incentive, new incentive
        emit NewLiquidationIncentive(oldLiquidationIncentiveMantissa, newLiquidationIncentiveMantissa);

        return uint(Error.NO_ERROR);
    }

    function _setLiquidatorContract(address newLiquidatorContract_) external {
        // Check caller is admin
        ensureAdmin();
        address oldLiquidatorContract = liquidatorContract;
        liquidatorContract = newLiquidatorContract_;
        emit NewLiquidatorContract(oldLiquidatorContract, newLiquidatorContract_);
    }

    /**
     * @notice Add the market to the markets mapping and set it as listed
     * @dev Admin function to set isListed and add support for the market
     * @param vToken The address of the market (token) to list
     * @return uint 0=success, otherwise a failure. (See enum Error for details)
     */
    function _supportMarket(VToken vToken) external returns (uint) {
        ensureAllowed("_supportMarket(address)");

        if (markets[address(vToken)].isListed) {
            return fail(Error.MARKET_ALREADY_LISTED, FailureInfo.SUPPORT_MARKET_EXISTS);
        }

        vToken.isVToken(); // Sanity check to make sure its really a VToken

        // Note that isVenus is not in active use anymore
        markets[address(vToken)] = Market({ isListed: true, isVenus: false, collateralFactorMantissa: 0 });

        _addMarketInternal(vToken);
        _initializeMarket(address(vToken));

        emit MarketListed(vToken);

        return uint(Error.NO_ERROR);
    }

    function _addMarketInternal(VToken vToken) internal {
        for (uint i; i < allMarkets.length; ++i) {
            require(allMarkets[i] != vToken, "market already added");
        }
        allMarkets.push(vToken);
    }

    function _initializeMarket(address vToken) internal {
        uint32 blockNumber = safe32(getBlockNumber(), "block number exceeds 32 bits");

        VenusMarketState storage supplyState = venusSupplyState[vToken];
        VenusMarketState storage borrowState = venusBorrowState[vToken];

        /*
         * Update market state indices
         */
        if (supplyState.index == 0) {
            // Initialize supply state index with default value
            supplyState.index = venusInitialIndex;
        }

        if (borrowState.index == 0) {
            // Initialize borrow state index with default value
            borrowState.index = venusInitialIndex;
        }

        /*
         * Update market state block numbers
         */
        supplyState.block = borrowState.block = blockNumber;
    }

    /**
     * @notice Admin function to change the Pause Guardian
     * @param newPauseGuardian The address of the new Pause Guardian
     * @return uint 0=success, otherwise a failure. (See enum Error for details)
     */
    function _setPauseGuardian(address newPauseGuardian) external returns (uint) {
        ensureAdmin();
        ensureNonzeroAddress(newPauseGuardian);

        // Save current value for inclusion in log
        address oldPauseGuardian = pauseGuardian;

        // Store pauseGuardian with value newPauseGuardian
        pauseGuardian = newPauseGuardian;

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
        ensureAllowed("_setMarketBorrowCaps(address[],uint256[])");

        uint numMarkets = vTokens.length;
        uint numBorrowCaps = newBorrowCaps.length;

        require(numMarkets != 0 && numMarkets == numBorrowCaps, "invalid input");

        for (uint i; i < numMarkets; ++i) {
            borrowCaps[address(vTokens[i])] = newBorrowCaps[i];
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
        ensureAllowed("_setMarketSupplyCaps(address[],uint256[])");

        uint numMarkets = vTokens.length;
        uint numSupplyCaps = newSupplyCaps.length;

        require(numMarkets != 0 && numMarkets == numSupplyCaps, "invalid input");

        for (uint i; i < numMarkets; ++i) {
            supplyCaps[address(vTokens[i])] = newSupplyCaps[i];
            emit NewSupplyCap(vTokens[i], newSupplyCaps[i]);
        }
    }

    /**
     * @notice Set whole protocol pause/unpause state
     */
    function _setProtocolPaused(bool state) external returns (bool) {
        ensureAllowed("_setProtocolPaused(bool)");

        protocolPaused = state;
        emit ActionProtocolPaused(state);
        return state;
    }

    /**
     * @notice Pause/unpause certain actions
     * @param markets Markets to pause/unpause the actions on
     * @param actions List of action ids to pause/unpause
     * @param paused The new paused state (true=paused, false=unpaused)
     */
    function _setActionsPaused(address[] calldata markets, Action[] calldata actions, bool paused) external {
        ensureAllowed("_setActionsPaused(address[],uint256[],bool)");

        uint256 numMarkets = markets.length;
        uint256 numActions = actions.length;
        for (uint marketIdx; marketIdx < numMarkets; ++marketIdx) {
            for (uint actionIdx; actionIdx < numActions; ++actionIdx) {
                setActionPausedInternal(markets[marketIdx], actions[actionIdx], paused);
            }
        }
    }

    /**
     * @dev Pause/unpause an action on a market
     * @param market Market to pause/unpause the action on
     * @param action Action id to pause/unpause
     * @param paused The new paused state (true=paused, false=unpaused)
     */
    function setActionPausedInternal(address market, Action action, bool paused) internal {
        ensureListed(markets[market]);
        _actionPaused[market][uint(action)] = paused;
        emit ActionPausedMarket(VToken(market), action, paused);
    }

    /**
     * @notice Sets a new VAI controller
     * @dev Admin function to set a new VAI controller
     * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
     */
    function _setVAIController(VAIControllerInterface vaiController_) external returns (uint) {
        // Check caller is admin
        ensureAdmin();
        ensureNonzeroAddress(address(vaiController_));

        VAIControllerInterface oldVaiController = vaiController;
        vaiController = vaiController_;
        emit NewVAIController(oldVaiController, vaiController_);

        return uint(Error.NO_ERROR);
    }

    function _setVAIMintRate(uint newVAIMintRate) external returns (uint) {
        // Check caller is admin
        ensureAdmin();
        uint oldVAIMintRate = vaiMintRate;
        vaiMintRate = newVAIMintRate;
        emit NewVAIMintRate(oldVAIMintRate, newVAIMintRate);

        return uint(Error.NO_ERROR);
    }

    function _setTreasuryData(
        address newTreasuryGuardian,
        address newTreasuryAddress,
        uint newTreasuryPercent
    ) external returns (uint) {
        // Check caller is admin
        ensureAdminOr(treasuryGuardian);

        require(newTreasuryPercent < 1e18, "treasury percent cap overflow");
        ensureNonzeroAddress(newTreasuryGuardian);
        ensureNonzeroAddress(newTreasuryAddress);

        address oldTreasuryGuardian = treasuryGuardian;
        address oldTreasuryAddress = treasuryAddress;
        uint oldTreasuryPercent = treasuryPercent;

        treasuryGuardian = newTreasuryGuardian;
        treasuryAddress = newTreasuryAddress;
        treasuryPercent = newTreasuryPercent;

        emit NewTreasuryGuardian(oldTreasuryGuardian, newTreasuryGuardian);
        emit NewTreasuryAddress(oldTreasuryAddress, newTreasuryAddress);
        emit NewTreasuryPercent(oldTreasuryPercent, newTreasuryPercent);

        return uint(Error.NO_ERROR);
    }

    function _become(Unitroller unitroller) external {
        require(msg.sender == unitroller.admin(), "only unitroller admin can");
        require(unitroller._acceptImplementation() == 0, "not authorized");

        // TODO: Remove this post upgrade
        // Should have to change UpdatedComptroller to Comptroller
        UpdatedComptroller(address(unitroller))._upgradeSplitVenusRewards();
    }

    function _upgradeSplitVenusRewards() external {
        require(msg.sender == comptrollerImplementation, "only brains can become itself");

        uint32 blockNumber = safe32(getBlockNumber(), "block number exceeds 32 bits");

        // venusSpeeds -> venusBorrowSpeeds & venusSupplySpeeds t
        for (uint256 i; i < allMarkets.length; ++i) {
            venusBorrowSpeeds[address(allMarkets[i])] = venusSupplySpeeds[address(allMarkets[i])] = venusSpeeds[
                address(allMarkets[i])
            ];
            delete venusSpeeds[address(allMarkets[i])];

            /*
             * Ensure supply and borrow state indices are all set. If not set, update to default value
             */
            VenusMarketState storage supplyState = venusSupplyState[address(allMarkets[i])];
            VenusMarketState storage borrowState = venusBorrowState[address(allMarkets[i])];

            if (supplyState.index == 0) {
                // Initialize supply state index with default value
                supplyState.index = venusInitialIndex;
                supplyState.block = blockNumber;
            }

            if (borrowState.index == 0) {
                // Initialize borrow state index with default value
                borrowState.index = venusInitialIndex;
                borrowState.block = blockNumber;
            }
        }
    }

    /*** Venus Distribution ***/

    function setVenusSpeedInternal(VToken vToken, uint supplySpeed, uint borrowSpeed) internal {
        ensureListed(markets[address(vToken)]);

        if (venusSupplySpeeds[address(vToken)] != supplySpeed) {
            // Supply speed updated so let's update supply state to ensure that
            //  1. XVS accrued properly for the old speed, and
            //  2. XVS accrued at the new speed starts after this block.

            updateVenusSupplyIndex(address(vToken));
            // Update speed and emit event
            venusSupplySpeeds[address(vToken)] = supplySpeed;
            emit VenusSupplySpeedUpdated(vToken, supplySpeed);
        }

        if (venusBorrowSpeeds[address(vToken)] != borrowSpeed) {
            // Borrow speed updated so let's update borrow state to ensure that
            //  1. XVS accrued properly for the old speed, and
            //  2. XVS accrued at the new speed starts after this block.
            Exp memory borrowIndex = Exp({ mantissa: vToken.borrowIndex() });
            updateVenusBorrowIndex(address(vToken), borrowIndex);

            // Update speed and emit event
            venusBorrowSpeeds[address(vToken)] = borrowSpeed;
            emit VenusBorrowSpeedUpdated(vToken, borrowSpeed);
        }
    }

    /**
     * @dev Set ComptrollerLens contract address
     */
    function _setComptrollerLens(ComptrollerLensInterface comptrollerLens_) external returns (uint) {
        ensureAdmin();
        ensureNonzeroAddress(address(comptrollerLens_));
        address oldComptrollerLens = address(comptrollerLens);
        comptrollerLens = comptrollerLens_;
        emit NewComptrollerLens(oldComptrollerLens, address(comptrollerLens));

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Accrue XVS to the market by updating the supply index
     * @param vToken The market whose supply index to update
     */
    function updateVenusSupplyIndex(address vToken) internal {
        VenusMarketState storage supplyState = venusSupplyState[vToken];
        uint supplySpeed = venusSupplySpeeds[vToken];
        uint32 blockNumber = safe32(getBlockNumber(), "block number exceeds 32 bits");
        uint deltaBlocks = sub_(uint(blockNumber), uint(supplyState.block));
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint supplyTokens = VToken(vToken).totalSupply();
            uint venusAccrued = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(venusAccrued, supplyTokens) : Double({ mantissa: 0 });
            supplyState.index = safe224(
                add_(Double({ mantissa: supplyState.index }), ratio).mantissa,
                "new index exceeds 224 bits"
            );
            supplyState.block = blockNumber;
        } else if (deltaBlocks > 0) {
            supplyState.block = blockNumber;
        }
    }

    /**
     * @notice Accrue XVS to the market by updating the borrow index
     * @param vToken The market whose borrow index to update
     */
    function updateVenusBorrowIndex(address vToken, Exp memory marketBorrowIndex) internal {
        VenusMarketState storage borrowState = venusBorrowState[vToken];
        uint borrowSpeed = venusBorrowSpeeds[vToken];
        uint32 blockNumber = safe32(getBlockNumber(), "block number exceeds 32 bits");
        uint deltaBlocks = sub_(uint(blockNumber), uint(borrowState.block));
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint borrowAmount = div_(VToken(vToken).totalBorrows(), marketBorrowIndex);
            uint venusAccrued = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(venusAccrued, borrowAmount) : Double({ mantissa: 0 });
            borrowState.index = safe224(
                add_(Double({ mantissa: borrowState.index }), ratio).mantissa,
                "new index exceeds 224 bits"
            );
            borrowState.block = blockNumber;
        } else if (deltaBlocks > 0) {
            borrowState.block = blockNumber;
        }
    }

    /**
     * @notice Calculate XVS accrued by a supplier and possibly transfer it to them
     * @param vToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute XVS to
     */
    function distributeSupplierVenus(address vToken, address supplier) internal {
        if (address(vaiVaultAddress) != address(0)) {
            releaseToVault();
        }

        uint supplyIndex = venusSupplyState[vToken].index;
        uint supplierIndex = venusSupplierIndex[vToken][supplier];

        // Update supplier's index to the current index since we are distributing accrued XVS
        venusSupplierIndex[vToken][supplier] = supplyIndex;

        if (supplierIndex == 0 && supplyIndex >= venusInitialIndex) {
            // Covers the case where users supplied tokens before the market's supply state index was set.
            // Rewards the user with XVS accrued from the start of when supplier rewards were first
            // set for the market.
            supplierIndex = venusInitialIndex;
        }

        // Calculate change in the cumulative sum of the XVS per vToken accrued
        Double memory deltaIndex = Double({ mantissa: sub_(supplyIndex, supplierIndex) });

        // Multiply of supplierTokens and supplierDelta
        uint supplierDelta = mul_(VToken(vToken).balanceOf(supplier), deltaIndex);

        // Addition of supplierAccrued and supplierDelta
        venusAccrued[supplier] = add_(venusAccrued[supplier], supplierDelta);

        emit DistributedSupplierVenus(VToken(vToken), supplier, supplierDelta, supplyIndex);
    }

    /**
     * @notice Calculate XVS accrued by a borrower and possibly transfer it to them
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param vToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute XVS to
     */
    function distributeBorrowerVenus(address vToken, address borrower, Exp memory marketBorrowIndex) internal {
        if (address(vaiVaultAddress) != address(0)) {
            releaseToVault();
        }

        uint borrowIndex = venusBorrowState[vToken].index;
        uint borrowerIndex = venusBorrowerIndex[vToken][borrower];

        // Update borrowers's index to the current index since we are distributing accrued XVS
        venusBorrowerIndex[vToken][borrower] = borrowIndex;

        if (borrowerIndex == 0 && borrowIndex >= venusInitialIndex) {
            // Covers the case where users borrowed tokens before the market's borrow state index was set.
            // Rewards the user with XVS accrued from the start of when borrower rewards were first
            // set for the market.
            borrowerIndex = venusInitialIndex;
        }

        // Calculate change in the cumulative sum of the XVS per borrowed unit accrued
        Double memory deltaIndex = Double({ mantissa: sub_(borrowIndex, borrowerIndex) });

        uint borrowerDelta = mul_(div_(VToken(vToken).borrowBalanceStored(borrower), marketBorrowIndex), deltaIndex);

        venusAccrued[borrower] = add_(venusAccrued[borrower], borrowerDelta);

        emit DistributedBorrowerVenus(VToken(vToken), borrower, borrowerDelta, borrowIndex);
    }

    /**
     * @notice Claim all the xvs accrued by holder in all markets and VAI
     * @param holder The address to claim XVS for
     */
    function claimVenus(address holder) public {
        return claimVenus(holder, allMarkets);
    }

    /**
     * @notice Claim all the xvs accrued by holder in the specified markets
     * @param holder The address to claim XVS for
     * @param vTokens The list of markets to claim XVS in
     */
    function claimVenus(address holder, VToken[] memory vTokens) public {
        address[] memory holders = new address[](1);
        holders[0] = holder;
        claimVenus(holders, vTokens, true, true);
    }

    /**
     * @notice Claim all xvs accrued by the holders
     * @param holders The addresses to claim XVS for
     * @param vTokens The list of markets to claim XVS in
     * @param borrowers Whether or not to claim XVS earned by borrowing
     * @param suppliers Whether or not to claim XVS earned by supplying
     */
    function claimVenus(address[] memory holders, VToken[] memory vTokens, bool borrowers, bool suppliers) public {
        claimVenus(holders, vTokens, borrowers, suppliers, false);
    }

    /**
     * @notice Claim all xvs accrued by the holders
     * @param holders The addresses to claim XVS for
     * @param vTokens The list of markets to claim XVS in
     * @param borrowers Whether or not to claim XVS earned by borrowing
     * @param suppliers Whether or not to claim XVS earned by supplying
     * @param collateral Whether or not to use XVS earned as collateral, only takes effect when the holder has a shortfall
     */
    function claimVenus(
        address[] memory holders,
        VToken[] memory vTokens,
        bool borrowers,
        bool suppliers,
        bool collateral
    ) public {
        uint j;
        uint256 holdersLength = holders.length;
        for (uint i; i < vTokens.length; ++i) {
            VToken vToken = vTokens[i];
            ensureListed(markets[address(vToken)]);
            if (borrowers) {
                Exp memory borrowIndex = Exp({ mantissa: vToken.borrowIndex() });
                updateVenusBorrowIndex(address(vToken), borrowIndex);
                for (j = 0; j < holdersLength; ++j) {
                    distributeBorrowerVenus(address(vToken), holders[j], borrowIndex);
                }
            }
            if (suppliers) {
                updateVenusSupplyIndex(address(vToken));
                for (j = 0; j < holdersLength; ++j) {
                    distributeSupplierVenus(address(vToken), holders[j]);
                }
            }
        }

        for (j = 0; j < holdersLength; ++j) {
            address holder = holders[j];
            // If there is a positive shortfall, the XVS reward is accrued,
            // but won't be granted to this holder
            (, , uint shortfall) = getHypotheticalAccountLiquidityInternal(holder, VToken(0), 0, 0);
            venusAccrued[holder] = grantXVSInternal(holder, venusAccrued[holder], shortfall, collateral);
        }
    }

    /**
     * @notice Claim all the xvs accrued by holder in all markets, a shorthand for `claimVenus` with collateral set to `true`
     * @param holder The address to claim XVS for
     */
    function claimVenusAsCollateral(address holder) external {
        address[] memory holders = new address[](1);
        holders[0] = holder;
        claimVenus(holders, allMarkets, true, true, true);
    }

    /**
     * @notice Transfer XVS to the user with user's shortfall considered
     * @dev Note: If there is not enough XVS, we do not perform the transfer all.
     * @param user The address of the user to transfer XVS to
     * @param amount The amount of XVS to (possibly) transfer
     * @param shortfall The shortfall of the user
     * @param collateral Whether or not we will use user's venus reward as collateral to pay off the debt
     * @return The amount of XVS which was NOT transferred to the user
     */
    function grantXVSInternal(address user, uint amount, uint shortfall, bool collateral) internal returns (uint) {
        // If the user is blacklisted, they can't get XVS rewards
        require(
            user != 0xEF044206Db68E40520BfA82D45419d498b4bc7Bf &&
                user != 0x7589dD3355DAE848FDbF75044A3495351655cB1A &&
                user != 0x33df7a7F6D44307E1e5F3B15975b47515e5524c0 &&
                user != 0x24e77E5b74B30b026E9996e4bc3329c881e24968,
            "Blacklisted"
        );

        XVS xvs = XVS(getXVSAddress());

        if (amount == 0 || amount > xvs.balanceOf(address(this))) {
            return amount;
        }

        if (shortfall == 0) {
            xvs.transfer(user, amount);
            return 0;
        }
        // If user's bankrupt and doesn't use pending xvs as collateral, don't grant
        // anything, otherwise, we will transfer the pending xvs as collateral to
        // vXVS token and mint vXVS for the user.
        //
        // If mintBehalf failed, don't grant any xvs
        require(collateral, "bankrupt accounts can only collateralize their pending xvs rewards");

        xvs.approve(getXVSVTokenAddress(), amount);
        require(
            VBep20Interface(getXVSVTokenAddress()).mintBehalf(user, amount) == uint(Error.NO_ERROR),
            "mint behalf error during collateralize xvs"
        );

        // set venusAccrue[user] to 0
        return 0;
    }

    /*** Venus Distribution Admin ***/

    /**
     * @notice Transfer XVS to the recipient
     * @dev Note: If there is not enough XVS, we do not perform the transfer all.
     * @param recipient The address of the recipient to transfer XVS to
     * @param amount The amount of XVS to (possibly) transfer
     */
    function _grantXVS(address recipient, uint amount) external {
        ensureAdminOr(comptrollerImplementation);
        uint amountLeft = grantXVSInternal(recipient, amount, 0, false);
        require(amountLeft == 0, "insufficient xvs for grant");
        emit VenusGranted(recipient, amount);
    }

    /**
     * @notice Set the amount of XVS distributed per block to VAI Vault
     * @param venusVAIVaultRate_ The amount of XVS wei per block to distribute to VAI Vault
     */
    function _setVenusVAIVaultRate(uint venusVAIVaultRate_) external {
        ensureAdmin();

        uint oldVenusVAIVaultRate = venusVAIVaultRate;
        venusVAIVaultRate = venusVAIVaultRate_;
        emit NewVenusVAIVaultRate(oldVenusVAIVaultRate, venusVAIVaultRate_);
    }

    /**
     * @notice Set the VAI Vault infos
     * @param vault_ The address of the VAI Vault
     * @param releaseStartBlock_ The start block of release to VAI Vault
     * @param minReleaseAmount_ The minimum release amount to VAI Vault
     */
    function _setVAIVaultInfo(address vault_, uint256 releaseStartBlock_, uint256 minReleaseAmount_) external {
        ensureAdmin();
        ensureNonzeroAddress(vault_);

        vaiVaultAddress = vault_;
        releaseStartBlock = releaseStartBlock_;
        minReleaseAmount = minReleaseAmount_;
        emit NewVAIVaultInfo(vault_, releaseStartBlock_, minReleaseAmount_);
    }

    /**
     * @notice Set XVS speed for a single market
     * @param vTokens The market whose XVS speed to update
     * @param supplySpeeds New XVS speed for supply
     * @param borrowSpeeds New XVS speed for borrow
     */
    function _setVenusSpeeds(
        VToken[] calldata vTokens,
        uint[] calldata supplySpeeds,
        uint[] calldata borrowSpeeds
    ) external {
        ensureAdminOr(comptrollerImplementation);

        uint numTokens = vTokens.length;
        require(
            numTokens == supplySpeeds.length && numTokens == borrowSpeeds.length,
            "Comptroller::_setVenusSpeeds invalid input"
        );

        for (uint i; i < numTokens; ++i) {
            ensureNonzeroAddress(address(vTokens[i]));
            setVenusSpeedInternal(vTokens[i], supplySpeeds[i], borrowSpeeds[i]);
        }
    }

    /**
     * @notice Return all of the markets
     * @dev The automatic getter may be used to access an individual market.
     * @return The list of market addresses
     */
    function getAllMarkets() external view returns (VToken[] memory) {
        return allMarkets;
    }

    function getBlockNumber() public view returns (uint) {
        return block.number;
    }

    /**
     * @notice Return the address of the XVS token
     * @return The address of XVS
     */
    function getXVSAddress() public view returns (address) {
        return 0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63;
    }

    /**
     * @notice Return the address of the XVS vToken
     * @return The address of XVS vToken
     */
    function getXVSVTokenAddress() public view returns (address) {
        return 0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D;
    }

    /**
     * @notice Checks if a certain action is paused on a market
     * @param action Action id
     * @param market vToken address
     */
    function actionPaused(address market, Action action) public view returns (bool) {
        return _actionPaused[market][uint(action)];
    }

    /*** VAI functions ***/

    /**
     * @notice Set the minted VAI amount of the `owner`
     * @param owner The address of the account to set
     * @param amount The amount of VAI to set to the account
     * @return The number of minted VAI by `owner`
     */
    function setMintedVAIOf(address owner, uint amount) external returns (uint) {
        checkProtocolPauseState();

        // Pausing is a very serious situation - we revert to sound the alarms
        require(!mintVAIGuardianPaused && !repayVAIGuardianPaused, "VAI is paused");
        // Check caller is vaiController
        if (msg.sender != address(vaiController)) {
            return fail(Error.REJECTION, FailureInfo.SET_MINTED_VAI_REJECTION);
        }
        mintedVAIs[owner] = amount;

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Transfer XVS to VAI Vault
     */
    function releaseToVault() public {
        if (releaseStartBlock == 0 || getBlockNumber() < releaseStartBlock) {
            return;
        }

        XVS xvs = XVS(getXVSAddress());

        uint256 xvsBalance = xvs.balanceOf(address(this));
        if (xvsBalance == 0) {
            return;
        }

        uint256 actualAmount;
        uint256 deltaBlocks = sub_(getBlockNumber(), releaseStartBlock);
        // releaseAmount = venusVAIVaultRate * deltaBlocks
        uint256 _releaseAmount = mul_(venusVAIVaultRate, deltaBlocks);

        if (xvsBalance >= _releaseAmount) {
            actualAmount = _releaseAmount;
        } else {
            actualAmount = xvsBalance;
        }

        if (actualAmount < minReleaseAmount) {
            return;
        }

        releaseStartBlock = getBlockNumber();

        xvs.transfer(vaiVaultAddress, actualAmount);
        emit DistributedVAIVaultVenus(actualAmount);

        IVAIVault(vaiVaultAddress).updatePendingRewards();
    }
}
