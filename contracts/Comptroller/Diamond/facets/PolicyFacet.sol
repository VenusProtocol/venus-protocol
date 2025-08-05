// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.5.16;

import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { IPolicyFacet } from "../interfaces/IPolicyFacet.sol";

import { XVSRewardsHelper } from "./XVSRewardsHelper.sol";
import { IFlashLoanReceiver } from "../../../FlashLoan/interfaces/IFlashLoanReceiver.sol";
import { IProtocolShareReserveV5, VBep20Interface } from "../../../Tokens/VTokens/VTokenInterfaces.sol";

import { EIP20Interface } from "../../../Tokens/EIP20Interface.sol";

/**
 * @title PolicyFacet
 * @author Venus
 * @dev This facet contains all the hooks used while transferring the assets
 * @notice This facet contract contains all the external pre-hook functions related to vToken
 */
contract PolicyFacet is IPolicyFacet, XVSRewardsHelper {
    /// @notice Emitted when a new borrow-side XVS speed is calculated for a market
    event VenusBorrowSpeedUpdated(VToken indexed vToken, uint256 newSpeed);

    /// @notice Emitted when a new supply-side XVS speed is calculated for a market
    event VenusSupplySpeedUpdated(VToken indexed vToken, uint256 newSpeed);

    // @notice Emitted When the flash loan is successfully executed
    event FlashLoanExecuted(address receiver, VToken[] assets, uint256[] amounts);

    /**
     * @notice Checks if the account should be allowed to mint tokens in the given market
     * @param vToken The market to verify the mint against
     * @param minter The account which would get the minted tokens
     * @param mintAmount The amount of underlying being supplied to the market in exchange for tokens
     * @return 0 if the mint is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function mintAllowed(address vToken, address minter, uint256 mintAmount) external returns (uint256) {
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

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates mint, accrues interest and updates score in prime. Reverts on rejection. May emit logs.
     * @param vToken Asset being minted
     * @param minter The address minting the tokens
     * @param actualMintAmount The amount of the underlying asset being minted
     * @param mintTokens The number of tokens being minted
     */
    // solhint-disable-next-line no-unused-vars
    function mintVerify(address vToken, address minter, uint256 actualMintAmount, uint256 mintTokens) external {
        if (address(prime) != address(0)) {
            prime.accrueInterestAndUpdateScore(minter, vToken);
        }
    }

    /**
     * @notice Checks if the account should be allowed to redeem tokens in the given market
     * @param vToken The market to verify the redeem against
     * @param redeemer The account which would redeem the tokens
     * @param redeemTokens The number of vTokens to exchange for the underlying asset in the market
     * @return 0 if the redeem is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function redeemAllowed(address vToken, address redeemer, uint256 redeemTokens) external returns (uint256) {
        checkProtocolPauseState();
        checkActionPauseState(vToken, Action.REDEEM);

        uint256 allowed = redeemAllowedInternal(vToken, redeemer, redeemTokens);
        if (allowed != uint256(Error.NO_ERROR)) {
            return allowed;
        }

        // Keep the flywheel moving
        updateVenusSupplyIndex(vToken);
        distributeSupplierVenus(vToken, redeemer);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates redeem, accrues interest and updates score in prime. Reverts on rejection. May emit logs.
     * @param vToken Asset being redeemed
     * @param redeemer The address redeeming the tokens
     * @param redeemAmount The amount of the underlying asset being redeemed
     * @param redeemTokens The number of tokens being redeemed
     */
    function redeemVerify(address vToken, address redeemer, uint256 redeemAmount, uint256 redeemTokens) external {
        require(redeemTokens != 0 || redeemAmount == 0, "redeemTokens zero");
        if (address(prime) != address(0)) {
            prime.accrueInterestAndUpdateScore(redeemer, vToken);
        }
    }

    /**
     * @notice Checks if the account should be allowed to borrow the underlying asset of the given market
     * @param vToken The market to verify the borrow against
     * @param borrower The account which would borrow the asset
     * @param borrowAmount The amount of underlying the account would borrow
     * @return 0 if the borrow is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function borrowAllowed(address vToken, address borrower, uint256 borrowAmount) external returns (uint256) {
        // Pausing is a very serious situation - we revert to sound the alarms
        checkProtocolPauseState();
        checkActionPauseState(vToken, Action.BORROW);
        ensureListed(markets[vToken]);

        uint256 borrowCap = borrowCaps[vToken];
        require(borrowCap != 0, "market borrow cap is 0");

        if (!markets[vToken].accountMembership[borrower]) {
            // only vTokens may call borrowAllowed if borrower not in market
            require(msg.sender == vToken, "sender must be vToken");

            // attempt to add borrower to the market
            Error err = addToMarketInternal(VToken(vToken), borrower);
            if (err != Error.NO_ERROR) {
                return uint256(err);
            }
        }

        if (oracle.getUnderlyingPrice(VToken(vToken)) == 0) {
            return uint256(Error.PRICE_ERROR);
        }

        uint256 nextTotalBorrows = add_(VToken(vToken).totalBorrows(), borrowAmount);
        require(nextTotalBorrows <= borrowCap, "market borrow cap reached");

        (Error err, , uint256 shortfall) = getHypotheticalAccountLiquidityInternal(
            borrower,
            VToken(vToken),
            0,
            borrowAmount
        );
        if (err != Error.NO_ERROR) {
            return uint256(err);
        }
        if (shortfall != 0) {
            return uint256(Error.INSUFFICIENT_LIQUIDITY);
        }

        // Keep the flywheel moving
        Exp memory borrowIndex = Exp({ mantissa: VToken(vToken).borrowIndex() });
        updateVenusBorrowIndex(vToken, borrowIndex);
        distributeBorrowerVenus(vToken, borrower, borrowIndex);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates borrow, accrues interest and updates score in prime. Reverts on rejection. May emit logs.
     * @param vToken Asset whose underlying is being borrowed
     * @param borrower The address borrowing the underlying
     * @param borrowAmount The amount of the underlying asset requested to borrow
     */
    // solhint-disable-next-line no-unused-vars
    function borrowVerify(address vToken, address borrower, uint256 borrowAmount) external {
        if (address(prime) != address(0)) {
            prime.accrueInterestAndUpdateScore(borrower, vToken);
        }
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
        uint256 repayAmount // solhint-disable-line no-unused-vars
    ) external returns (uint256) {
        checkProtocolPauseState();
        checkActionPauseState(vToken, Action.REPAY);
        ensureListed(markets[vToken]);

        // Keep the flywheel moving
        Exp memory borrowIndex = Exp({ mantissa: VToken(vToken).borrowIndex() });
        updateVenusBorrowIndex(vToken, borrowIndex);
        distributeBorrowerVenus(vToken, borrower, borrowIndex);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates repayBorrow, accrues interest and updates score in prime. Reverts on rejection. May emit logs.
     * @param vToken Asset being repaid
     * @param payer The address repaying the borrow
     * @param borrower The address of the borrower
     * @param actualRepayAmount The amount of underlying being repaid
     */
    function repayBorrowVerify(
        address vToken,
        address payer, // solhint-disable-line no-unused-vars
        address borrower,
        uint256 actualRepayAmount, // solhint-disable-line no-unused-vars
        uint256 borrowerIndex // solhint-disable-line no-unused-vars
    ) external {
        if (address(prime) != address(0)) {
            prime.accrueInterestAndUpdateScore(borrower, vToken);
        }
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
        uint256 repayAmount
    ) external view returns (uint256) {
        checkProtocolPauseState();

        // if we want to pause liquidating to vTokenCollateral, we should pause seizing
        checkActionPauseState(vTokenBorrowed, Action.LIQUIDATE);

        if (liquidatorContract != address(0) && liquidator != liquidatorContract) {
            return uint256(Error.UNAUTHORIZED);
        }

        ensureListed(markets[vTokenCollateral]);

        uint256 borrowBalance;
        if (address(vTokenBorrowed) != address(vaiController)) {
            ensureListed(markets[vTokenBorrowed]);
            borrowBalance = VToken(vTokenBorrowed).borrowBalanceStored(borrower);
        } else {
            borrowBalance = vaiController.getVAIRepayAmount(borrower);
        }

        if (isForcedLiquidationEnabled[vTokenBorrowed] || isForcedLiquidationEnabledForUser[borrower][vTokenBorrowed]) {
            if (repayAmount > borrowBalance) {
                return uint(Error.TOO_MUCH_REPAY);
            }
            return uint(Error.NO_ERROR);
        }

        /* The borrower must have shortfall in order to be liquidatable */
        (Error err, , uint256 shortfall) = getHypotheticalAccountLiquidityInternal(borrower, VToken(address(0)), 0, 0);
        if (err != Error.NO_ERROR) {
            return uint256(err);
        }
        if (shortfall == 0) {
            return uint256(Error.INSUFFICIENT_SHORTFALL);
        }

        // The liquidator may not repay more than what is allowed by the closeFactor
        //-- maxClose = multipy of closeFactorMantissa and borrowBalance
        if (repayAmount > mul_ScalarTruncate(Exp({ mantissa: closeFactorMantissa }), borrowBalance)) {
            return uint256(Error.TOO_MUCH_REPAY);
        }

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates liquidateBorrow, accrues interest and updates score in prime. Reverts on rejection. May emit logs.
     * @param vTokenBorrowed Asset which was borrowed by the borrower
     * @param vTokenCollateral Asset which was used as collateral and will be seized
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param actualRepayAmount The amount of underlying being repaid
     * @param seizeTokens The amount of collateral token that will be seized
     */
    function liquidateBorrowVerify(
        address vTokenBorrowed,
        address vTokenCollateral, // solhint-disable-line no-unused-vars
        address liquidator,
        address borrower,
        uint256 actualRepayAmount, // solhint-disable-line no-unused-vars
        uint256 seizeTokens // solhint-disable-line no-unused-vars
    ) external {
        if (address(prime) != address(0)) {
            prime.accrueInterestAndUpdateScore(borrower, vTokenBorrowed);
            prime.accrueInterestAndUpdateScore(liquidator, vTokenBorrowed);
        }
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
        uint256 seizeTokens // solhint-disable-line no-unused-vars
    ) external returns (uint256) {
        // Pausing is a very serious situation - we revert to sound the alarms
        checkProtocolPauseState();
        checkActionPauseState(vTokenCollateral, Action.SEIZE);

        Market storage market = markets[vTokenCollateral];

        // We've added VAIController as a borrowed token list check for seize
        ensureListed(market);

        if (!market.accountMembership[borrower]) {
            return uint256(Error.MARKET_NOT_COLLATERAL);
        }

        if (address(vTokenBorrowed) != address(vaiController)) {
            ensureListed(markets[vTokenBorrowed]);
        }

        if (VToken(vTokenCollateral).comptroller() != VToken(vTokenBorrowed).comptroller()) {
            return uint256(Error.COMPTROLLER_MISMATCH);
        }

        // Keep the flywheel moving
        updateVenusSupplyIndex(vTokenCollateral);
        distributeSupplierVenus(vTokenCollateral, borrower);
        distributeSupplierVenus(vTokenCollateral, liquidator);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates seize, accrues interest and updates score in prime. Reverts on rejection. May emit logs.
     * @param vTokenCollateral Asset which was used as collateral and will be seized
     * @param vTokenBorrowed Asset which was borrowed by the borrower
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param seizeTokens The number of collateral tokens to seize
     */
    function seizeVerify(
        address vTokenCollateral,
        address vTokenBorrowed, // solhint-disable-line no-unused-vars
        address liquidator,
        address borrower,
        uint256 seizeTokens // solhint-disable-line no-unused-vars
    ) external {
        if (address(prime) != address(0)) {
            prime.accrueInterestAndUpdateScore(borrower, vTokenCollateral);
            prime.accrueInterestAndUpdateScore(liquidator, vTokenCollateral);
        }
    }

    /**
     * @notice Executes a flashLoan operation with the specified assets, amounts, and modes.
     * @dev Transfer the specified assets to the receiver contract and handles repayment based on modes.
     *      Mode 0: Classic flash loan - must repay everything or revert
     *      Mode 1: Can create debt position for unpaid amounts
     * @param receiver The address of the contract that will receive the flashLoan and execute the operation
     * @param vTokens The addresses of the vToken assets to be loaned
     * @param underlyingAmounts The amounts of each underlying asset to be loaned
     * @param modes How each borrowed asset is handled if not repaid immediately (0: flash loan, 1: debt position)
     * @param onBehalfOf The address for whom debt positions will be opened (if mode = 1)
     * @param param The bytes passed in the executeOperation call
     */
    function executeFlashLoan(
        address payable receiver,
        VToken[] calldata vTokens,
        uint256[] calldata underlyingAmounts,
        uint256[] calldata modes,
        address onBehalfOf,
        bytes calldata param
    ) external {
        ensureNonzeroAddress(receiver);
        ensureNonzeroAddress(onBehalfOf);

        // All arrays must have the same length and not be zero
        if (vTokens.length != underlyingAmounts.length || vTokens.length != modes.length || vTokens.length == 0) {
            revert("Invalid flashLoan params");
        }

        // Validate parameters and delegation
        _validateFlashLoanParams(vTokens, modes, onBehalfOf);

        // Execute flash loan phases
        _executeFlashLoanPhases(
            receiver,
            vTokens,
            underlyingAmounts,
            modes,
            onBehalfOf,
            param
        );

        emit FlashLoanExecuted(receiver, vTokens, underlyingAmounts);
    }

    /**
     * @notice Validates flash loan parameters and delegation
     */
    function _validateFlashLoanParams(
        VToken[] memory vTokens,
        uint256[] memory modes,
        address onBehalfOf
    ) internal view {
        // Check delegation if borrowing on behalf of someone else
        if (onBehalfOf != msg.sender) {
            for (uint256 i = 0; i < vTokens.length; i++) {
                if (modes[i] == 1) {
                    // Only check delegation for debt-creating modes
                    require(
                        delegateAuthorizationFlashloan[onBehalfOf][address(vTokens[i])][msg.sender],
                        "Sender not authorized to borrow on behalf"
                    );
                }
            }
        }

        // Validate modes
        for (uint256 i = 0; i < modes.length; i++) {
            require(modes[i] <= 1, "Invalid mode");
        }
    }

    /**
     * @notice Executes all flash loan phases
     */
    function _executeFlashLoanPhases(
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        uint256[] memory modes,
        address onBehalfOf,
        bytes memory param
    ) internal returns (FlashLoanData memory flashLoanData) {
        // Initialize arrays
        flashLoanData.protocolFees = new uint256[](vTokens.length);
        flashLoanData.supplierFees = new uint256[](vTokens.length);
        flashLoanData.totalFees = new uint256[](vTokens.length);
        flashLoanData.balanceAfterTransfer = new uint256[](vTokens.length);
        flashLoanData.actualRepayments = new uint256[](vTokens.length);
        flashLoanData.remainingDebts = new uint256[](vTokens.length);

        // Phase 1: Calculate fees and transfer assets
        _executePhase1(receiver, vTokens, underlyingAmounts, flashLoanData);

        // Phase 2: Execute operation on receiver contract
        _executePhase2(receiver, vTokens, underlyingAmounts, flashLoanData.totalFees, param);

        // Phase 3: Handle repayment based on modes
        _executePhase3(receiver, vTokens, underlyingAmounts, modes, onBehalfOf, flashLoanData);

        return flashLoanData;
    }

    /**
     * @notice Phase 1: Calculate fees and transfer assets to receiver
     */
    function _executePhase1(
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        FlashLoanData memory flashLoanData
    ) internal {
        for (uint256 j = 0; j < vTokens.length; j++) {
            (flashLoanData.protocolFees[j], flashLoanData.supplierFees[j]) = vTokens[j].calculateFlashLoanFee(
                underlyingAmounts[j]
            );
            flashLoanData.totalFees[j] = flashLoanData.protocolFees[j] + flashLoanData.supplierFees[j];

            // Transfer the asset to receiver
            flashLoanData.balanceAfterTransfer[j] = vTokens[j].transferOutUnderlying(receiver, underlyingAmounts[j]);
        }
    }

    /**
     * @notice Phase 2: Execute operation on receiver contract
     */
    function _executePhase2(
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        uint256[] memory totalFees,
        bytes memory param
    ) internal {
        if (!IFlashLoanReceiver(receiver).executeOperation(vTokens, underlyingAmounts, totalFees, msg.sender, param)) {
            revert("Execute flashLoan failed");
        }
    }

    /**
     * @notice Phase 3: Handle repayment based on modes
     */
    function _executePhase3(
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        uint256[] memory modes,
        address onBehalfOf,
        FlashLoanData memory flashLoanData
    ) internal {
        for (uint256 k = 0; k < vTokens.length; k++) {
            if (modes[k] == 0) {
                // Mode 0: Classic flash loan - must repay everything
                _handleFlashLoanMode0(
                    vTokens[k],
                    receiver,
                    underlyingAmounts[k],
                    flashLoanData.totalFees[k],
                    flashLoanData.protocolFees[k],
                    flashLoanData.balanceAfterTransfer[k]
                );
                flashLoanData.actualRepayments[k] = underlyingAmounts[k] + flashLoanData.totalFees[k];
                flashLoanData.remainingDebts[k] = 0;
            } else if (modes[k] == 1) {
                // Mode 1: Can create debt position
                (flashLoanData.actualRepayments[k], flashLoanData.remainingDebts[k]) = _handleFlashLoanMode1(
                    address(vTokens[k]),
                    onBehalfOf,
                    underlyingAmounts[k],
                    flashLoanData.totalFees[k],
                    flashLoanData.protocolFees[k],
                    flashLoanData.balanceAfterTransfer[k]
                );
            }
        }
    }

    /**
     * @notice Handles classic flash loan mode (mode 0) - must repay within transaction
     */
    function _handleFlashLoanMode0(
        VToken vToken,
        address payable receiver,
        uint256 amount,
        uint256 totalFee,
        uint256 protocolFee,
        uint256 balanceAfterTransfer
    ) internal {
        // Must repay full amount + fee
        vToken.transferInUnderlyingAndVerify(receiver, amount, totalFee, balanceAfterTransfer);

        // Transfer protocol fee to protocol share reserve
        vToken.transferOutUnderlying(vToken.protocolShareReserve(), protocolFee);

        // Update protocol share reserve state
        IProtocolShareReserveV5(vToken.protocolShareReserve()).updateAssetsState(
            address(vToken.comptroller()),
            address(vToken.underlying()),
            IProtocolShareReserveV5.IncomeType.FLASHLOAN
        );
    }

    /**
     * @notice Handles debt position mode (mode 1) - can create ongoing debt
     * @return actualRepayment The amount actually repaid
     * @return remainingDebt The amount that became ongoing debt
     */
    function _handleFlashLoanMode1(
        address vTokenAddress,
        address onBehalfOf,
        uint256 amount,
        uint256 totalFee,
        uint256 protocolFee,
        uint256 balanceAfterTransfer
    ) internal returns (uint256 actualRepayment, uint256 remainingDebt) {
        VToken vToken = VToken(vTokenAddress);
        uint256 requiredRepayment = amount + totalFee;
        uint256 currentBalance = EIP20Interface(vToken.underlying()).balanceOf(onBehalfOf);

        // Calculate actual repayment received
        if (currentBalance > balanceAfterTransfer) {
            actualRepayment = currentBalance - balanceAfterTransfer;
        } else {
            actualRepayment = 0;
        }

        if (actualRepayment >= requiredRepayment) {
            // Full repayment - treat as classic flash loan
            vToken.transferOutUnderlying(vToken.protocolShareReserve(), protocolFee);

            IProtocolShareReserveV5(vToken.protocolShareReserve()).updateAssetsState(
                address(vToken.comptroller()),
                address(vToken.underlying()),
                IProtocolShareReserveV5.IncomeType.FLASHLOAN
            );

            remainingDebt = 0;
        } else {
            // Partial or no repayment - create debt position
            remainingDebt = requiredRepayment - actualRepayment;

            // Check if borrowing is allowed for the remaining amount
            uint allowed = vToken.comptroller().borrowAllowed(address(vToken), onBehalfOf, remainingDebt);
            require(allowed == 0, "Cannot create debt position");

            // Create debt position by calling VBep20's borrow function
            // This will handle all the proper borrow logic including state updates
            uint256 debtError = VBep20Interface(vTokenAddress).borrow(remainingDebt);
            require(debtError == 0, "Failed to create debt position");

            // Handle fees from actual repayment proportionally
            if (actualRepayment > 0) {
                uint256 feeFromRepayment = (actualRepayment * protocolFee) / requiredRepayment;
                if (feeFromRepayment > 0) {
                    vToken.transferOutUnderlying(vToken.protocolShareReserve(), feeFromRepayment);

                    IProtocolShareReserveV5(vToken.protocolShareReserve()).updateAssetsState(
                        address(vToken.comptroller()),
                        address(vToken.underlying()),
                        IProtocolShareReserveV5.IncomeType.FLASHLOAN
                    );
                }
            }
        }

        return (actualRepayment, remainingDebt);
    }

    /**
     * @notice Checks if the account should be allowed to transfer tokens in the given market
     * @param vToken The market to verify the transfer against
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of vTokens to transfer
     * @return 0 if the transfer is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function transferAllowed(
        address vToken,
        address src,
        address dst,
        uint256 transferTokens
    ) external returns (uint256) {
        // Pausing is a very serious situation - we revert to sound the alarms
        checkProtocolPauseState();
        checkActionPauseState(vToken, Action.TRANSFER);

        // Currently the only consideration is whether or not
        //  the src is allowed to redeem this many tokens
        uint256 allowed = redeemAllowedInternal(vToken, src, transferTokens);
        if (allowed != uint256(Error.NO_ERROR)) {
            return allowed;
        }

        // Keep the flywheel moving
        updateVenusSupplyIndex(vToken);
        distributeSupplierVenus(vToken, src);
        distributeSupplierVenus(vToken, dst);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Validates transfer, accrues interest and updates score in prime. Reverts on rejection. May emit logs.
     * @param vToken Asset being transferred
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of vTokens to transfer
     */
    // solhint-disable-next-line no-unused-vars
    function transferVerify(address vToken, address src, address dst, uint256 transferTokens) external {
        if (address(prime) != address(0)) {
            prime.accrueInterestAndUpdateScore(src, vToken);
            prime.accrueInterestAndUpdateScore(dst, vToken);
        }
    }

    /**
     * @notice Determine the current account liquidity wrt collateral requirements
     * @return (possible error code (semi-opaque),
                account liquidity in excess of collateral requirements,
     *          account shortfall below collateral requirements)
     */
    function getAccountLiquidity(address account) external view returns (uint256, uint256, uint256) {
        (Error err, uint256 liquidity, uint256 shortfall) = getHypotheticalAccountLiquidityInternal(
            account,
            VToken(address(0)),
            0,
            0
        );

        return (uint256(err), liquidity, shortfall);
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
        uint256 redeemTokens,
        uint256 borrowAmount
    ) external view returns (uint256, uint256, uint256) {
        (Error err, uint256 liquidity, uint256 shortfall) = getHypotheticalAccountLiquidityInternal(
            account,
            VToken(vTokenModify),
            redeemTokens,
            borrowAmount
        );
        return (uint256(err), liquidity, shortfall);
    }

    // setter functionality
    /**
     * @notice Set XVS speed for a single market
     * @dev Allows the contract admin to set XVS speed for a market
     * @param vTokens The market whose XVS speed to update
     * @param supplySpeeds New XVS speed for supply
     * @param borrowSpeeds New XVS speed for borrow
     */
    function _setVenusSpeeds(
        VToken[] calldata vTokens,
        uint256[] calldata supplySpeeds,
        uint256[] calldata borrowSpeeds
    ) external {
        ensureAdmin();

        uint256 numTokens = vTokens.length;
        require(numTokens == supplySpeeds.length && numTokens == borrowSpeeds.length, "invalid input");

        for (uint256 i; i < numTokens; ++i) {
            ensureNonzeroAddress(address(vTokens[i]));
            setVenusSpeedInternal(vTokens[i], supplySpeeds[i], borrowSpeeds[i]);
        }
    }

    function setVenusSpeedInternal(VToken vToken, uint256 supplySpeed, uint256 borrowSpeed) internal {
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
}
