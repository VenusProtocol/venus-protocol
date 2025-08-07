// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IVToken } from "./IVToken.sol";

interface IVBep20 is IVToken {
    /**
     * @notice Sender supplies assets into the market and receives vTokens in exchange
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param mintAmount The amount of the underlying asset to supply
     * @return uint Returns 0 on success, otherwise returns a failure code
     */
    function mint(uint256 mintAmount) external returns (uint256);

    /**
     * @notice Sender supplies assets into the market on behalf of another account and receives vTokens in exchange
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param receiver The address that will receive the vTokens
     * @param mintAmount The amount of the underlying asset to supply
     * @return uint Returns 0 on success, otherwise returns a failure code
     */
    function mintBehalf(address receiver, uint256 mintAmount) external returns (uint256);

    /**
     * @notice Sender repays their own borrow
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param repayAmount The amount of the underlying asset to repay
     * @return uint Returns the remaining borrow amount after repayment
     */
    function repayBorrow(uint256 repayAmount) external returns (uint256);

    /**
     * @notice Sender repays a borrow on behalf of another account
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param borrower The address of the borrower
     * @param repayAmount The amount of the underlying asset to repay
     * @return uint Returns the remaining borrow amount after repayment
     */
    function repayBorrowBehalf(address borrower, uint256 repayAmount) external returns (uint256);

    /**
     * @notice Sender borrows assets on behalf of some other address. This function is only available
     *   for senders, explicitly marked as delegates of the borrower using `comptroller.updateDelegate`
     * @param borrower The borrower, on behalf of whom to borrow.
     * @param borrowAmount The amount of the underlying asset to borrow
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits Borrow event on success
    function borrowBehalf(address borrower, uint256 borrowAmount) external returns (uint256);

    /**
     * @notice Liquidates a borrowers position
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param borrower The address of the borrower
     * @param repayAmount The amount of the underlying asset to repay
     * @param vTokenCollateral The address of the vToken collateral
     * @return uint Returns the amount successfully liquidated
     */
    function liquidateBorrow(address borrower, uint repayAmount, IVToken vTokenCollateral) external returns (uint);

    /*** Admin Functions ***/

    /**
     * @notice Admin function to add reserves to the protocol
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param addAmount The amount of the underlying asset to add
     * @return uint Returns the new total reserves
     */
    function _addReserves(uint256 addAmount) external returns (uint256);
}
