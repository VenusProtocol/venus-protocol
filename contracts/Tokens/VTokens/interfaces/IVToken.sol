// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IComptroller } from "../../../Comptroller/interfaces/IComptroller.sol";
import { InterestRateModelV8 } from "../../../InterestRateModels/InterestRateModelV8.sol";
import { IVTokenStorage } from "./IVTokenStorage.sol";

/**
 * @title Venus VToken Interface
 * @author Venus
 * @notice Interface for interacting with Venus VTokens
 * @dev This interface defines the core functionality of Venus VTokens, which are interest-bearing tokens that represent deposits of underlying assets
 */
interface IVToken is IVTokenStorage, IERC20 {
    /// @notice Event emitted when interest is accrued
    event AccrueInterest(uint cashPrior, uint interestAccumulated, uint borrowIndex, uint totalBorrows);

    /// @notice Event emitted when tokens are minted
    event Mint(address minter, uint mintAmount, uint mintTokens, uint256 totalSupply);

    /// @notice Event emitted when tokens are minted behalf by payer to receiver
    event MintBehalf(address payer, address receiver, uint mintAmount, uint mintTokens, uint256 totalSupply);

    /// @notice Event emitted when tokens are redeemed
    event Redeem(address redeemer, uint redeemAmount, uint redeemTokens, uint256 totalSupply);

    /// @notice Event emitted when tokens are redeemed and fee is transferred
    event RedeemFee(address redeemer, uint feeAmount, uint redeemTokens);

    /// @notice Event emitted when underlying is borrowed
    event Borrow(address borrower, uint borrowAmount, uint accountBorrows, uint totalBorrows);

    /// @notice Event emitted when a borrow is repaid
    event RepayBorrow(address payer, address borrower, uint repayAmount, uint accountBorrows, uint totalBorrows);

    /// @notice Event emitted when a borrow is liquidated
    event LiquidateBorrow(
        address liquidator,
        address borrower,
        uint repayAmount,
        address vTokenCollateral,
        uint seizeTokens
    );

    /// @notice Event emitted when pendingAdmin is changed
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /// @notice Event emitted when pendingAdmin is accepted, which means admin has been updated
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Event emitted when comptroller is changed
    event NewComptroller(IComptroller oldComptroller, IComptroller newComptroller);

    /// @notice Event emitted when interestRateModel is changed
    event NewMarketInterestRateModel(
        InterestRateModelV8 oldInterestRateModel,
        InterestRateModelV8 newInterestRateModel
    );

    /// @notice Event emitted when the reserve factor is changed
    event NewReserveFactor(uint oldReserveFactorMantissa, uint newReserveFactorMantissa);

    /// @notice Event emitted when the reserves are added
    event ReservesAdded(address benefactor, uint addAmount, uint newTotalReserves);

    /// @notice Event emitted when the reserves are reduced
    event ReservesReduced(address protocolShareReserve, uint reduceAmount, uint newTotalReserves);

    /// @notice Event emitted when block delta for reduce reserves get updated
    event NewReduceReservesBlockDelta(uint256 oldReduceReservesBlockDelta, uint256 newReduceReservesBlockDelta);

    /// @notice Event emitted when address of ProtocolShareReserve contract get updated
    event NewProtocolShareReserve(address indexed oldProtocolShareReserve, address indexed newProtocolShareReserve);

    /// @notice Emitted when access control address is changed by admin
    event NewAccessControlManager(address oldAccessControlAddress, address newAccessControlAddress);

    /**
     * @notice Indicator that this is a vToken contract (for inspection)
     */
    function isVToken() external pure returns (bool);

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
     * @notice Get the underlying balance of the `owner`
     * @dev This also accrues interest in a transaction
     * @param owner The address of the account to query
     * @return The amount of underlying owned by `owner`
     */
    function balanceOfUnderlying(address owner) external returns (uint);

    /**
     * @notice Returns the current total borrows plus accrued interest
     * @return The total borrows with interest
     */
    function totalBorrowsCurrent() external returns (uint);

    /**
     * @notice Accrue interest to updated borrowIndex and then calculate account's borrow balance using the updated borrowIndex
     * @param account The address whose balance should be calculated after updating borrowIndex
     * @return The calculated balance
     */
    function borrowBalanceCurrent(address account) external returns (uint);

    /**
     * @notice Transfers collateral tokens (this market) to the liquidator
     * @dev Called only during liquidation
     * @param liquidator The account receiving seized collateral
     * @param borrower The account having collateral seized
     * @param seizeTokens The number of vTokens to seize
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details)
     * @custom:event Emits Transfer event
     */
    function seize(address liquidator, address borrower, uint seizeTokens) external returns (uint);

    /**
     * @notice Calculates the current exchange rate from the underlying to the VToken
     * @dev This function includes accruing interest
     * @return Calculated exchange rate scaled by 1e18
     */
    function exchangeRateCurrent() external returns (uint);

    /**
     * @notice Applies accrued interest to total borrows and reserves
     * @dev This calculates interest accrued from the last checkpointed block up to the current block
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details)
     * @custom:event Emits AccrueInterest on success
     */
    function accrueInterest() external returns (uint);

    /**
     * @notice Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @dev Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @param newPendingAdmin New pending admin.
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details)
     * @custom:event Emits NewPendingAdmin event
     * @custom:access Only Governance
     */
    function _setPendingAdmin(address payable newPendingAdmin) external returns (uint);

    /**
     * @notice Accepts transfer of admin rights. msg.sender must be pendingAdmin
     * @dev Admin function for pending admin to accept role and update admin
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details)
     * @custom:event Emits NewAdmin event
     * @custom:event Emits NewPendingAdmin event
     * @custom:access Only pending admin
     */
    function _acceptAdmin() external returns (uint);

    /**
     * @notice Sets a new reserve factor for the protocol
     * @dev Admin function to set a new reserve factor
     * @param newReserveFactorMantissa The new reserve factor, scaled by 1e18
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details)
     * @custom:event Emits NewReserveFactor event
     * @custom:access Controlled by AccessControlManager
     */
    function _setReserveFactor(uint newReserveFactorMantissa) external returns (uint);

    /**
     * @notice Reduces reserves by transferring to protocol share reserve
     * @dev Requires fresh interest accrual
     * @param reduceAmount Amount of reduction to reserves
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details)
     * @custom:event Emits ReservesReduced event
     * @custom:access Controlled by AccessControlManager
     */
    function _reduceReserves(uint reduceAmount) external returns (uint);

    /**
     * @notice Sets a new comptroller for the market
     * @dev Admin function to set a new comptroller
     * @param newComptroller The new comptroller address
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details)
     * @custom:event Emits NewComptroller event
     * @custom:access Only Governance
     */
    function _setComptroller(IComptroller newComptroller) external returns (uint);

    /**
     * @notice Sets a new interest rate model for the market
     * @dev Admin function to set a new interest rate model
     * @param newInterestRateModel The new interest rate model address
     * @return uint Returns 0 on success, otherwise returns a failure code (see ErrorReporter.sol for details)
     * @custom:event Emits NewMarketInterestRateModel event
     * @custom:access Controlled by AccessControlManager
     */
    function _setInterestRateModel(InterestRateModelV8 newInterestRateModel) external returns (uint);

    /**
     * @notice Get various information about an account in this market
     * @param account The address of the account to query
     * @return (possible error, token balance, borrow balance, exchange rate mantissa)
     */
    function getAccountSnapshot(address account) external view returns (uint, uint, uint, uint);

    /**
     * @notice Get the current borrow interest rate per block
     * @return The borrow interest rate per block, scaled by 1e18
     */
    function borrowRatePerBlock() external view returns (uint);

    /**
     * @notice Get the current supply interest rate per block
     * @return The supply interest rate per block, scaled by 1e18
     */
    function supplyRatePerBlock() external view returns (uint);

    /**
     * @notice Get the amount of tokens held by this contract
     * @return The number of tokens held by this contract
     */
    function getCash() external view returns (uint);

    /**
     * @notice Get the borrow balance of account based on stored data
     * @param account The address whose balance should be calculated
     * @return The calculated balance
     */
    function borrowBalanceStored(address account) external view returns (uint);

    /**
     * @notice Get the current exchange rate from the underlying to the VToken
     * @return The current exchange rate from the underlying to the VToken, scaled by 1e18
     */
    function exchangeRateStored() external view returns (uint);
}

interface VDelegateInterface {
    /**
     * @notice Called by the delegator on a delegate to initialize it for duty
     * @dev Should revert if any issues arise which make it unfit for delegation
     * @param data The encoded bytes data for any initialization
     */
    function _becomeImplementation(bytes memory data) external;

    /**
     * @notice Called by the delegator on a delegate to forfeit its responsibility
     */
    function _resignImplementation() external;
}
