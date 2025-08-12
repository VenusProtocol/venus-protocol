pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ComptrollerInterface } from "../../Comptroller/ComptrollerInterface.sol";
import { InterestRateModelV8 } from "../../InterestRateModels/InterestRateModelV8.sol";
import { VBep20Interface, VTokenInterface } from "./VTokenInterfaces.sol";
import { VToken } from "./VToken.sol";
import { ComptrollerLensInterface } from "../../Comptroller/ComptrollerLensInterface.sol";

/**
 * @title Venus's VBep20 Contract
 * @notice vTokens which wrap an ERC-20 underlying
 * @author Venus
 */
contract VBep20 is VToken, VBep20Interface {
    using SafeERC20 for IERC20;

    /*** User Interface ***/

    /**
     * @notice Sender supplies assets into the market and receives vTokens in exchange
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param mintAmount The amount of the underlying asset to supply
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits Transfer event
    // @custom:event Emits Mint event
    function mint(uint mintAmount) external returns (uint) {
        (uint err, ) = mintInternal(mintAmount);
        return err;
    }

    /**
     * @notice Sender supplies assets into the market and receiver receives vTokens in exchange
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param receiver The account which is receiving the vTokens
     * @param mintAmount The amount of the underlying asset to supply
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits Transfer event
    // @custom:event Emits MintBehalf event
    function mintBehalf(address receiver, uint mintAmount) external returns (uint) {
        (uint err, ) = mintBehalfInternal(receiver, mintAmount);
        return err;
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
        return redeemInternal(msg.sender, payable(msg.sender), redeemTokens);
    }

    /**
     * @notice Sender redeems assets on behalf of some other address. This function is only available
     *   for senders, explicitly marked as delegates of the supplier using `comptroller.updateDelegate`
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemer The user on behalf of whom to redeem
     * @param redeemTokens The number of vTokens to redeem into underlying
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits Redeem event on success
    // @custom:event Emits Transfer event on success
    // @custom:event Emits RedeemFee when fee is charged by the treasury
    function redeemBehalf(address redeemer, uint redeemTokens) external returns (uint) {
        require(comptroller.approvedDelegates(redeemer, msg.sender), "not an approved delegate");

        return redeemInternal(redeemer, payable(msg.sender), redeemTokens);
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
        return redeemUnderlyingInternal(msg.sender, payable(msg.sender), redeemAmount);
    }

    /**
     * @notice Sender redeems underlying assets on behalf of some other address. This function is only available
     *   for senders, explicitly marked as delegates of the supplier using `comptroller.updateDelegate`
     * @dev Accrues interest whether or not the operation succeeds, unless reverted
     * @param redeemer, on behalf of whom to redeem
     * @param redeemAmount The amount of underlying to receive from redeeming vTokens
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits Redeem event on success
    // @custom:event Emits Transfer event on success
    // @custom:event Emits RedeemFee when fee is charged by the treasury
    function redeemUnderlyingBehalf(address redeemer, uint redeemAmount) external returns (uint) {
        require(comptroller.approvedDelegates(redeemer, msg.sender), "not an approved delegate");

        return redeemUnderlyingInternal(redeemer, payable(msg.sender), redeemAmount);
    }

    /**
     * @notice Sender borrows assets from the protocol to their own address
     * @param borrowAmount The amount of the underlying asset to borrow
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits Borrow event on success
    function borrow(uint borrowAmount) external returns (uint) {
        return borrowInternal(msg.sender, payable(msg.sender), borrowAmount);
    }

    /**
     * @notice Sender borrows assets on behalf of some other address. This function is only available
     *   for senders, explicitly marked as delegates of the borrower using `comptroller.updateDelegate`
     * @param borrower The borrower, on behalf of whom to borrow.
     * @param borrowAmount The amount of the underlying asset to borrow
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits Borrow event on success
    function borrowBehalf(address borrower, uint borrowAmount) external returns (uint) {
        require(comptroller.approvedDelegates(borrower, msg.sender), "not an approved delegate");
        return borrowInternal(borrower, payable(msg.sender), borrowAmount);
    }

    /**
     * @notice Sender repays their own borrow
     * @param repayAmount The amount to repay
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits RepayBorrow event on success
    function repayBorrow(uint repayAmount) external returns (uint) {
        (uint err, ) = repayBorrowInternal(repayAmount);
        return err;
    }

    /**
     * @notice Sender repays a borrow belonging to another borrowing account
     * @param borrower The account with the debt being payed off
     * @param repayAmount The amount to repay
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits RepayBorrow event on success
    function repayBorrowBehalf(address borrower, uint repayAmount) external returns (uint) {
        (uint err, ) = repayBorrowBehalfInternal(borrower, repayAmount);
        return err;
    }

    /**
     * @notice The sender liquidates the borrowers collateral.
     *  The collateral seized is transferred to the liquidator.
     * @param borrower The borrower of this vToken to be liquidated
     * @param repayAmount The amount of the underlying borrowed asset to repay
     * @param vTokenCollateral The market in which to seize collateral from the borrower
     * @param snapshot The account snapshot of the borrower
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emit LiquidateBorrow event on success
    function liquidateBorrow(
        address borrower,
        uint repayAmount,
        VTokenInterface vTokenCollateral,
        ComptrollerLensInterface.AccountSnapshot memory snapshot
    ) external returns (uint) {
        (uint err, ) = liquidateBorrowInternal(borrower, repayAmount, vTokenCollateral, snapshot);
        return err;
    }

    /**
     * @notice The sender adds to reserves.
     * @param addAmount The amount of underlying tokens to add as reserves
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details).
     */
    // @custom:event Emits ReservesAdded event
    function _addReserves(uint addAmount) external returns (uint) {
        return _addReservesInternal(addAmount);
    }

    /**
     * @notice Initialize the new money market
     * @param underlying_ The address of the underlying asset
     * @param comptroller_ The address of the Comptroller
     * @param interestRateModel_ The address of the interest rate model
     * @param initialExchangeRateMantissa_ The initial exchange rate, scaled by 1e18
     * @param name_ BEP-20 name of this token
     * @param symbol_ BEP-20 symbol of this token
     * @param decimals_ BEP-20 decimal precision of this token
     */
    function initialize(
        address underlying_,
        ComptrollerInterface comptroller_,
        InterestRateModelV8 interestRateModel_,
        uint initialExchangeRateMantissa_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) public {
        // VToken initialize does the bulk of the work
        super.initialize(comptroller_, interestRateModel_, initialExchangeRateMantissa_, name_, symbol_, decimals_);

        // Set underlying and sanity check it
        underlying = underlying_;
        IERC20(underlying).totalSupply();
    }

    /*** Safe Token ***/

    /**
     * @dev Similar to ERC-20 transfer, but handles tokens that have transfer fees.
     *      This function returns the actual amount received,
     *      which may be less than `amount` if there is a fee attached to the transfer.
     * @param from Sender of the underlying tokens
     * @param amount Amount of underlying to transfer
     * @return Actual amount received
     */
    function doTransferIn(address from, uint256 amount) internal virtual override returns (uint256) {
        IERC20 token = IERC20(underlying);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        uint256 balanceAfter = token.balanceOf(address(this));
        // Return the amount that was *actually* transferred
        return balanceAfter - balanceBefore;
    }

    /**
     * @dev Just a regular ERC-20 transfer, reverts on failure
     * @param to Receiver of the underlying tokens
     * @param amount Amount of underlying to transfer
     */
    function doTransferOut(address payable to, uint256 amount) internal virtual override {
        IERC20 token = IERC20(underlying);
        token.safeTransfer(to, amount);
    }

    /**
     * @notice Gets balance of this contract in terms of the underlying
     * @dev This excludes the value of the current message, if any
     * @return The quantity of underlying tokens owned by this contract
     */
    function getCashPrior() internal view override returns (uint) {
        return IERC20(underlying).balanceOf(address(this));
    }
}
