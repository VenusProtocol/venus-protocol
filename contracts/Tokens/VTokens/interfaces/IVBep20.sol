// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IVToken } from "./IVToken.sol";

interface IVBep20 is IVToken {
    /*** User Interface ***/
    /**
     * @notice Sender supplies assets into the market and receives vTokens in exchange
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param mintAmount The amount of the underlying asset to supply
     * @return uint Returns 0 on success, otherwise returns a failure code
     */
    function mint(uint mintAmount) external returns (uint);

    /**
     * @notice Sender supplies assets into the market on behalf of another account and receives vTokens in exchange
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param receiver The address that will receive the vTokens
     * @param mintAmount The amount of the underlying asset to supply
     * @return uint Returns 0 on success, otherwise returns a failure code
     */
    function mintBehalf(address receiver, uint mintAmount) external returns (uint);

    /**
     * @notice Sender redeems vTokens in exchange for the underlying asset
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemTokens The amount of vTokens to redeem
     * @return uint Returns the underlying asset received
     */
    function redeem(uint redeemTokens) external returns (uint);

    /**
     * @notice Sender redeems vTokens in exchange for a specified amount of underlying asset
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemAmount The amount of underlying asset to receive
     * @return uint Returns the vTokens redeemed
     */
    function redeemUnderlying(uint redeemAmount) external returns (uint);

    /**
     * @notice Sender borrows assets from the protocol to their own address
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param borrowAmount The amount of the underlying asset to borrow
     * @return uint Returns the amount successfully borrowed
     */
    function borrow(uint borrowAmount) external returns (uint);

    /**
     * @notice Sender repays their own borrow
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param repayAmount The amount of the underlying asset to repay
     * @return uint Returns the remaining borrow amount after repayment
     */
    function repayBorrow(uint repayAmount) external returns (uint);

    /**
     * @notice Sender repays a borrow on behalf of another account
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param borrower The address of the borrower
     * @param repayAmount The amount of the underlying asset to repay
     * @return uint Returns the remaining borrow amount after repayment
     */
    function repayBorrowBehalf(address borrower, uint repayAmount) external returns (uint);

    /**
     * @notice Liquidates a borrowers position
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param borrower The address of the borrower
     * @param repayAmount The amount of the underlying asset to repay
     * @param vTokenCollateral The address of the vToken collateral
     * @return uint Returns the amount successfully liquidated
     */
    function liquidateBorrow(
        address borrower,
        uint repayAmount,
        IVToken vTokenCollateral
    ) external returns (uint);

    /*** Admin Functions ***/

    /**
     * @notice Admin function to add reserves to the protocol
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param addAmount The amount of the underlying asset to add
     * @return uint Returns the new total reserves
     */
    function _addReserves(uint addAmount) external returns (uint);
}
