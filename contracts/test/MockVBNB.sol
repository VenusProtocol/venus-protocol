pragma solidity ^0.5.16;

import "../Tokens/VTokens/VToken.sol";

/**
 * @title Venus's vBNB Contract
 * @notice vToken which wraps BNB
 * @author Venus
 */
contract MockVBNB is VToken {
    /**
     * @notice Construct a new vBNB money market
     * @param comptroller_ The address of the Comptroller
     * @param interestRateModel_ The address of the interest rate model
     * @param initialExchangeRateMantissa_ The initial exchange rate, scaled by 1e18
     * @param name_ BEP-20 name of this token
     * @param symbol_ BEP-20 symbol of this token
     * @param decimals_ BEP-20 decimal precision of this token
     * @param admin_ Address of the administrator of this token
     */
    constructor(
        ComptrollerInterface comptroller_,
        InterestRateModel interestRateModel_,
        uint initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address payable admin_
    ) public {
        // Creator of the contract is admin during initialization
        admin = msg.sender;

        initialize(comptroller_, interestRateModel_, initialExchangeRateMantissa_, name_, symbol_, decimals_);

        // Set the proper admin now that initialization is done
        admin = admin_;
    }

    /**
     * @notice Send BNB to VBNB to mint
     */
    function() external payable {
        (uint err, ) = mintInternal(msg.value);
        requireNoError(err, "mint failed");
    }

    /*** User Interface ***/

    /**
     * @notice Sender supplies assets into the market and receives vTokens in exchange
     * @dev Reverts upon any failure
     */
    // @custom:event Emits Transfer event
    // @custom:event Emits Mint event
    function mint() external payable {
        (uint err, ) = mintInternal(msg.value);
        requireNoError(err, "mint failed");
    }

    /**
     * @notice Sender redeems vTokens in exchange for the underlying asset
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemTokens The number of vTokens to redeem into underlying
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits Redeem event on success
    // @custom:event Emits Transfer event on success
    // @custom:event Emits RedeemFee when fee is charged by the treasury
    function redeem(uint redeemTokens) external returns (uint) {
        return redeemInternal(redeemTokens);
    }

    /**
     * @notice Sender redeems vTokens in exchange for a specified amount of underlying asset
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemAmount The amount of underlying to redeem
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits Redeem event on success
    // @custom:event Emits Transfer event on success
    // @custom:event Emits RedeemFee when fee is charged by the treasury
    function redeemUnderlying(uint redeemAmount) external returns (uint) {
        return redeemUnderlyingInternal(redeemAmount);
    }

    /**
     * @notice Sender borrows assets from the protocol to their own address
     * @param borrowAmount The amount of the underlying asset to borrow
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits Borrow event on success
    function borrow(uint borrowAmount) external returns (uint) {
        return borrowInternal(msg.sender, msg.sender, borrowAmount);
    }

    /**
     * @notice Sender repays their own borrow
     * @dev Reverts upon any failure
     */
    // @custom:event Emits RepayBorrow event on success
    function repayBorrow() external payable {
        (uint err, ) = repayBorrowInternal(msg.value);
        requireNoError(err, "repayBorrow failed");
    }

    /**
     * @notice Sender repays a borrow belonging to borrower
     * @dev Reverts upon any failure
     * @param borrower The account with the debt being payed off
     */
    // @custom:event Emits RepayBorrow event on success
    function repayBorrowBehalf(address borrower) external payable {
        (uint err, ) = repayBorrowBehalfInternal(borrower, msg.value);
        requireNoError(err, "repayBorrowBehalf failed");
    }

    /**
     * @notice The sender liquidates the borrowers collateral.
     *  The collateral seized is transferred to the liquidator.
     * @dev Reverts upon any failure
     * @param borrower The borrower of this vToken to be liquidated
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     */
    // @custom:event Emit LiquidateBorrow event on success
    function liquidateBorrow(address borrower, VToken vTokenCollateral) external payable {
        (uint err, ) = liquidateBorrowInternal(borrower, msg.value, vTokenCollateral);
        requireNoError(err, "liquidateBorrow failed");
    }

    function setTotalReserves(uint totalReserves_) external payable {
        totalReserves = totalReserves_;
    }

    /*** Safe Token ***/

    /**
     * @notice Perform the actual transfer in, which is a no-op
     * @param from Address sending the BNB
     * @param amount Amount of BNB being sent
     * @return The actual amount of BNB transferred
     */
    function doTransferIn(address from, uint amount) internal returns (uint) {
        // Sanity checks
        require(msg.sender == from, "sender mismatch");
        require(msg.value == amount, "value mismatch");
        return amount;
    }

    function doTransferOut(address payable to, uint amount) internal {
        /* Send the BNB, with minimal gas and revert on failure */
        to.transfer(amount);
    }

    /**
     * @notice Gets balance of this contract in terms of BNB, before this message
     * @dev This excludes the value of the current message, if any
     * @return The quantity of BNB owned by this contract
     */
    function getCashPrior() internal view returns (uint) {
        (MathError err, uint startingBalance) = subUInt(address(this).balance, msg.value);
        require(err == MathError.NO_ERROR, "cash prior math error");
        return startingBalance;
    }

    function requireNoError(uint errCode, string memory message) internal pure {
        if (errCode == uint(Error.NO_ERROR)) {
            return;
        }

        bytes memory fullMessage = new bytes(bytes(message).length + 5);
        uint i;

        for (i = 0; i < bytes(message).length; i++) {
            fullMessage[i] = bytes(message)[i];
        }

        fullMessage[i + 0] = bytes1(uint8(32));
        fullMessage[i + 1] = bytes1(uint8(40));
        fullMessage[i + 2] = bytes1(uint8(48 + (errCode / 10)));
        fullMessage[i + 3] = bytes1(uint8(48 + (errCode % 10)));
        fullMessage[i + 4] = bytes1(uint8(41));

        require(errCode == uint(Error.NO_ERROR), string(fullMessage));
    }

    /**
     * @dev Function to simply retrieve block number
     *  This exists mainly for inheriting test contracts to stub this result.
     */
    function getBlockNumber() internal view returns (uint) {
        return block.number;
    }

    /**
     * @notice Reduces reserves by transferring to admin
     * @dev Requires fresh interest accrual
     * @param reduceAmount Amount of reduction to reserves
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    function _reduceReservesFresh(uint reduceAmount) internal returns (uint) {
        // totalReserves - reduceAmount
        uint totalReservesNew;

        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.REDUCE_RESERVES_ADMIN_CHECK);
        }

        // We fail gracefully unless market's block number equals current block number
        if (accrualBlockNumber != getBlockNumber()) {
            return fail(Error.MARKET_NOT_FRESH, FailureInfo.REDUCE_RESERVES_FRESH_CHECK);
        }

        // Fail gracefully if protocol has insufficient underlying cash
        if (getCashPrior() < reduceAmount) {
            return fail(Error.TOKEN_INSUFFICIENT_CASH, FailureInfo.REDUCE_RESERVES_CASH_NOT_AVAILABLE);
        }

        // Check reduceAmount ≤ reserves[n] (totalReserves)
        if (reduceAmount > totalReserves) {
            return fail(Error.BAD_INPUT, FailureInfo.REDUCE_RESERVES_VALIDATION);
        }

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        totalReservesNew = totalReserves - reduceAmount;

        // Store reserves[n+1] = reserves[n] - reduceAmount
        totalReserves = totalReservesNew;

        // // doTransferOut reverts if anything goes wrong, since we can't be sure if side effects occurred.
        doTransferOut(admin, reduceAmount);

        emit ReservesReduced(admin, reduceAmount, totalReservesNew);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Accrues interest and reduces reserves by transferring to admin
     * @param reduceAmount Amount of reduction to reserves
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits ReservesReduced event
    function _reduceReserves(uint reduceAmount) external nonReentrant returns (uint) {
        uint error = accrueInterest();
        if (error != uint(Error.NO_ERROR)) {
            // accrueInterest emits logs on errors, but on top of that we want to log the fact that an attempted reduce reserves failed.
            return fail(Error(error), FailureInfo.REDUCE_RESERVES_ACCRUE_INTEREST_FAILED);
        }
        // _reduceReservesFresh emits reserve-reduction-specific logs on errors, so we don't need to.
        return _reduceReservesFresh(reduceAmount);
    }

    /**
     * @notice Applies accrued interest to total borrows and reserves
     * @dev This calculates interest accrued from the last checkpointed block
     *   up to the current block and writes new checkpoint to storage.
     */
    // @custom:event Emits AccrueInterest event
    function accrueInterest() public returns (uint) {
        /* Remember the initial block number */
        uint currentBlockNumber = getBlockNumber();
        uint accrualBlockNumberPrior = accrualBlockNumber;

        /* Short-circuit accumulating 0 interest */
        if (accrualBlockNumberPrior == currentBlockNumber) {
            return uint(Error.NO_ERROR);
        }

        /* Read the previous values out of storage */
        uint cashPrior = getCashPrior();
        uint borrowsPrior = totalBorrows;
        uint reservesPrior = totalReserves;
        uint borrowIndexPrior = borrowIndex;

        /* Calculate the current borrow interest rate */
        uint borrowRateMantissa = interestRateModel.getBorrowRate(cashPrior, borrowsPrior, reservesPrior);
        require(borrowRateMantissa <= borrowRateMaxMantissa, "borrow rate is absurdly high");

        /* Calculate the number of blocks elapsed since the last accrual */
        (MathError mathErr, uint blockDelta) = subUInt(currentBlockNumber, accrualBlockNumberPrior);
        require(mathErr == MathError.NO_ERROR, "could not calculate block delta");

        /*
         * Calculate the interest accumulated into borrows and reserves and the new index:
         *  simpleInterestFactor = borrowRate * blockDelta
         *  interestAccumulated = simpleInterestFactor * totalBorrows
         *  totalBorrowsNew = interestAccumulated + totalBorrows
         *  totalReservesNew = interestAccumulated * reserveFactor + totalReserves
         *  borrowIndexNew = simpleInterestFactor * borrowIndex + borrowIndex
         */

        Exp memory simpleInterestFactor;
        uint interestAccumulated;
        uint totalBorrowsNew;
        uint totalReservesNew;
        uint borrowIndexNew;

        (mathErr, simpleInterestFactor) = mulScalar(Exp({ mantissa: borrowRateMantissa }), blockDelta);
        if (mathErr != MathError.NO_ERROR) {
            return
                failOpaque(
                    Error.MATH_ERROR,
                    FailureInfo.ACCRUE_INTEREST_SIMPLE_INTEREST_FACTOR_CALCULATION_FAILED,
                    uint(mathErr)
                );
        }

        (mathErr, interestAccumulated) = mulScalarTruncate(simpleInterestFactor, borrowsPrior);
        if (mathErr != MathError.NO_ERROR) {
            return
                failOpaque(
                    Error.MATH_ERROR,
                    FailureInfo.ACCRUE_INTEREST_ACCUMULATED_INTEREST_CALCULATION_FAILED,
                    uint(mathErr)
                );
        }

        (mathErr, totalBorrowsNew) = addUInt(interestAccumulated, borrowsPrior);
        if (mathErr != MathError.NO_ERROR) {
            return
                failOpaque(
                    Error.MATH_ERROR,
                    FailureInfo.ACCRUE_INTEREST_NEW_TOTAL_BORROWS_CALCULATION_FAILED,
                    uint(mathErr)
                );
        }

        (mathErr, totalReservesNew) = mulScalarTruncateAddUInt(
            Exp({ mantissa: reserveFactorMantissa }),
            interestAccumulated,
            reservesPrior
        );
        if (mathErr != MathError.NO_ERROR) {
            return
                failOpaque(
                    Error.MATH_ERROR,
                    FailureInfo.ACCRUE_INTEREST_NEW_TOTAL_RESERVES_CALCULATION_FAILED,
                    uint(mathErr)
                );
        }

        (mathErr, borrowIndexNew) = mulScalarTruncateAddUInt(simpleInterestFactor, borrowIndexPrior, borrowIndexPrior);
        if (mathErr != MathError.NO_ERROR) {
            return
                failOpaque(
                    Error.MATH_ERROR,
                    FailureInfo.ACCRUE_INTEREST_NEW_BORROW_INDEX_CALCULATION_FAILED,
                    uint(mathErr)
                );
        }

        /////////////////////////
        // EFFECTS & INTERACTIONS
        // (No safe failures beyond this point)

        /* We write the previously calculated values into storage */
        accrualBlockNumber = currentBlockNumber;
        borrowIndex = borrowIndexNew;
        totalBorrows = totalBorrowsNew;
        totalReserves = totalReservesNew;

        /* We emit an AccrueInterest event */
        emit AccrueInterest(cashPrior, interestAccumulated, borrowIndexNew, totalBorrowsNew);

        return uint(Error.NO_ERROR);
    }
}
