pragma solidity 0.5.16;

import "../../../Utils/ErrorReporter.sol";
import "./FacetHelper.sol";
import "../../../Tokens/VTokens/VToken.sol";

contract PolicyFacet is ComptrollerErrorReporter, ExponentialNoError, FacetHelper {
    /// @notice Emitted when a new borrow-side XVS speed is calculated for a market
    event VenusBorrowSpeedUpdated(VToken indexed vToken, uint newSpeed);

    /// @notice Emitted when a new supply-side XVS speed is calculated for a market
    event VenusSupplySpeedUpdated(VToken indexed vToken, uint newSpeed);

    /**
     * @notice Checks if the account should be allowed to mint tokens in the given market
     * @param vToken The market to verify the mint against
     * @param minter The account which would get the minted tokens
     * @param mintAmount The amount of underlying being supplied to the market in exchange for tokens
     * @return 0 if the mint is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function mintAllowed(address vToken, address minter, uint mintAmount) public returns (uint) {
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

    function mintVerify(address vToken, address minter, uint actualMintAmount, uint mintTokens) public {}

    /**
     * @notice Checks if the account should be allowed to redeem tokens in the given market
     * @param vToken The market to verify the redeem against
     * @param redeemer The account which would redeem the tokens
     * @param redeemTokens The number of vTokens to exchange for the underlying asset in the market
     * @return 0 if the redeem is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function redeemAllowed(address vToken, address redeemer, uint redeemTokens) public returns (uint) {
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

    /**
     * @notice Validates redeem and reverts on rejection. May emit log
     * @param vToken Asset being redeemed
     * @param redeemer The address redeeming the tokens
     * @param redeemAmount The amount of the underlying asset being redeemed
     * @param redeemTokens The number of tokens being redeemed
     */
    // solhint-disable-next-line no-unused-vars
    function redeemVerify(address vToken, address redeemer, uint redeemAmount, uint redeemTokens) public pure {
        require(redeemTokens != 0 || redeemAmount == 0, "redeemTokens zero");
    }

    /**
     * @notice Checks if the account should be allowed to borrow the underlying asset of the given market
     * @param vToken The market to verify the borrow against
     * @param borrower The account which would borrow the asset
     * @param borrowAmount The amount of underlying the account would borrow
     * @return 0 if the borrow is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function borrowAllowed(address vToken, address borrower, uint borrowAmount) public returns (uint) {
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
     * @notice Validates borrow and reverts on rejection. May emit log
     * @param vToken Asset whose underlying is being borrowed
     * @param borrower The address borrowing the underlying
     * @param borrowAmount The amount of the underlying asset requested to borrow
     */
    // solhint-disable-next-line no-unused-vars
    function borrowVerify(address vToken, address borrower, uint borrowAmount) public {}

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
        // solhint-disable-next-line no-unused-vars
        address payer,
        address borrower,
        // solhint-disable-next-line no-unused-vars
        uint repayAmount
    ) public returns (uint) {
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
     * @notice Validates repayBorrow and reverts on rejection. May emit log
     * @param vToken Asset being repaid
     * @param payer The address repaying the borrow
     * @param borrower The address of the borrower
     * @param actualRepayAmount The amount of underlying being repaid
     */
    function repayBorrowVerify(
        address vToken,
        address payer,
        address borrower,
        uint actualRepayAmount,
        uint borrowerIndex
    ) public {}

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
    ) public view returns (uint) {
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
        (Error err, , uint shortfall) = getHypotheticalAccountLiquidityInternal(borrower, VToken(address(0)), 0, 0);
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
        //-- maxClose = multipy of closeFactorMantissa and borrowBalance
        if (repayAmount > mul_ScalarTruncate(Exp({ mantissa: closeFactorMantissa }), borrowBalance)) {
            return uint(Error.TOO_MUCH_REPAY);
        }

        return uint(Error.NO_ERROR);
    }

    function liquidateBorrowVerify(
        address vTokenBorrowed,
        address vTokenCollateral,
        address liquidator,
        address borrower,
        uint actualRepayAmount,
        uint seizeTokens
    ) public {}

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
    ) public returns (uint) {
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
     * @notice Validates seize and reverts on rejection. May emit log
     * @param vTokenCollateral Asset which was used as collateral and will be seized
     * @param vTokenBorrowed Asset which was borrowed by the borrower
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param seizeTokens The number of collateral tokens to seize
     */
    // solhint-disable-next-line no-unused-vars
    function seizeVerify(
        address vTokenCollateral,
        address vTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens
    ) public {}

    /**
     * @notice Checks if the account should be allowed to transfer tokens in the given market
     * @param vToken The market to verify the transfer against
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of vTokens to transfer
     * @return 0 if the transfer is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function transferAllowed(address vToken, address src, address dst, uint transferTokens) public returns (uint) {
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
     * @notice Validates transfer and reverts on rejection. May emit log
     * @param vToken Asset being transferred
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of vTokens to transfer
     */
    // solhint-disable-next-line no-unused-vars
    function transferVerify(address vToken, address src, address dst, uint transferTokens) public {}

    /**
     * @notice Check for the borrow rate swap is allowed.
     * @param vToken Address of the vToken, borrow rate swap has to perform.
     */
    function swapBorrowRateModeAllowed(address vToken) external view {
        checkActionPauseState(vToken, Action.SWAP_RATE_MODE);
    }

    /**
     * @notice Determine the current account liquidity wrt collateral requirements
     * @return (possible error code (semi-opaque),
                account liquidity in excess of collateral requirements,
     *          account shortfall below collateral requirements)
     */
    function getAccountLiquidity(address account) public view returns (uint, uint, uint) {
        (Error err, uint liquidity, uint shortfall) = getHypotheticalAccountLiquidityInternal(
            account,
            VToken(address(0)),
            0,
            0
        );

        return (uint(err), liquidity, shortfall);
    }

    // setter functionality
    /**
     * @notice Set XVS speed for a single market
     * @param vTokens The market whose XVS speed to update
     * @param supplySpeeds New XVS speed for supply
     * @param borrowSpeeds New XVS speed for borrow
     */
    function _setVenusSpeeds(VToken[] memory vTokens, uint[] memory supplySpeeds, uint[] memory borrowSpeeds) public {
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
     * @notice Accrue XVS to the market by updating the borrow index
     * @param vToken The market whose borrow index to update
     */
    function updateVenusBorrowIndex(address vToken, ExponentialNoError.Exp memory marketBorrowIndex) internal {
        VenusMarketState storage borrowState = venusBorrowState[vToken];
        uint borrowSpeed = venusBorrowSpeeds[vToken];
        uint blockNumber = block.number;
        uint deltaBlocks = sub_(uint(blockNumber), uint(borrowState.block));
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint borrowAmount = div_(VToken(vToken).totalBorrows(), marketBorrowIndex);
            uint venusAccrued = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(venusAccrued, borrowAmount) : Double({ mantissa: 0 });
            borrowState.index = safe224(
                add_(Double({ mantissa: borrowState.index }), ratio).mantissa,
                "new index exceeds 224 bits"
            );
            borrowState.block = uint32(blockNumber);
        } else if (deltaBlocks > 0) {
            borrowState.block = uint32(blockNumber);
        }
    }

    /**
     * @notice Accrue XVS to the market by updating the supply index
     * @param vToken The market whose supply index to update
     */
    function updateVenusSupplyIndex(address vToken) internal {
        VenusMarketState storage supplyState = venusSupplyState[vToken];
        uint supplySpeed = venusSupplySpeeds[vToken];
        uint blockNumber = block.number;

        uint deltaBlocks = sub_(uint(blockNumber), uint(supplyState.block));
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint supplyTokens = VToken(vToken).totalSupply();
            uint venusAccrued = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(venusAccrued, supplyTokens) : Double({ mantissa: 0 });
            supplyState.index = safe224(
                add_(Double({ mantissa: supplyState.index }), ratio).mantissa,
                "new index exceeds 224 bits"
            );
            supplyState.block = uint32(blockNumber);
        } else if (deltaBlocks > 0) {
            supplyState.block = uint32(blockNumber);
        }
    }

    /**
     * @notice Calculate XVS accrued by a supplier and possibly transfer it to them
     * @param vToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute XVS to
     */
    function distributeSupplierVenus(address vToken, address supplier) internal {
        if (address(vaiVaultAddress) != address(0)) {
            // releaseToVault();
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
        // emit DistributedSupplierVenus(VToken(vToken), supplier, supplierDelta, supplyIndex);
    }

    /**
     * @notice Calculate XVS accrued by a borrower and possibly transfer it to them
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param vToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute XVS to
     */
    function distributeBorrowerVenus(
        address vToken,
        address borrower,
        ExponentialNoError.Exp memory marketBorrowIndex
    ) internal {
        if (address(vaiVaultAddress) != address(0)) {
            // releaseToVault();
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
        // emit DistributedBorrowerVenus(VToken(vToken), borrower, borrowerDelta, borrowIndex);
    }
}
