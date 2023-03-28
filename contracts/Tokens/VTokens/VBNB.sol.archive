pragma solidity ^0.5.16;

import "./VToken.sol";

/**
 * @title Venus's vBNB Contract
 * @notice vToken which wraps BNB
 * @author Venus
 */
contract VBNB is VToken {
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
        return borrowInternal(borrowAmount);
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
}
