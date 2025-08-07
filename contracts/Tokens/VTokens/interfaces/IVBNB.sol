// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IVToken } from "./IVToken.sol";

interface IVBNB is IVToken {
    /**
     * @notice Send BNB to VBNB to mint
     */
    receive() external payable;

    /**
     * @notice Sender supplies assets into the market and receives vTokens in exchange
     * @dev Reverts upon any failure
     * @custom:event Emits Transfer event
     * @custom:event Emits Mint event
     */
    function mint() external payable;

    /**
     * @notice Sender redeems vTokens in exchange for the underlying asset
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemTokens The number of vTokens to redeem into underlying
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     * @custom:event Emits Redeem event on success
     * @custom:event Emits Transfer event on success
     * @custom:event Emits RedeemFee when fee is charged by the treasury
     */
    function redeem(uint256 redeemTokens) external returns (uint256);

    /**
     * @notice Sender redeems vTokens in exchange for a specified amount of underlying asset
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemAmount The amount of underlying to redeem
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     * @custom:event Emits Redeem event on success
     * @custom:event Emits Transfer event on success
     * @custom:event Emits RedeemFee when fee is charged by the treasury
     */
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);

    /**
     * @notice Sender borrows assets from the protocol to their own address
     * @param borrowAmount The amount of the underlying asset to borrow
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     * @custom:event Emits Borrow event on success
     */
    function borrow(uint256 borrowAmount) external returns (uint256);

    /**
     * @notice Sender repays their own borrow
     * @dev Reverts upon any failure
     * @custom:event Emits RepayBorrow event on success
     */
    function repayBorrow() external payable;

    /**
     * @notice Sender repays a borrow belonging to borrower
     * @dev Reverts upon any failure
     * @param borrower The account with the debt being payed off
     * @custom:event Emits RepayBorrow event on success
     */
    function repayBorrowBehalf(address borrower) external payable;

    /**
     * @notice The sender liquidates the borrowers collateral.
     *  The collateral seized is transferred to the liquidator.
     * @dev Reverts upon any failure
     * @param borrower The borrower of this vToken to be liquidated
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @custom:event Emit LiquidateBorrow event on success
     */
    function liquidateBorrow(address borrower, IVToken vTokenCollateral) external payable;
}
