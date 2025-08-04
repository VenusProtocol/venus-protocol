// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IComptroller } from "../../../Comptroller/interfaces/IComptroller.sol";
import { InterestRateModelV8 } from "../../../InterestRateModels/InterestRateModelV8.sol";
import { IVTokenStorage } from "./IVTokenStorage.sol";

interface IVToken is IVTokenStorage {
    /*** Market Events ***/

    /**
     * @notice Event emitted when interest is accrued
     */
    event AccrueInterest(uint cashPrior, uint interestAccumulated, uint borrowIndex, uint totalBorrows);

    /**
     * @notice Event emitted when tokens are minted
     */
    event Mint(address minter, uint mintAmount, uint mintTokens, uint256 totalSupply);

    /**
     * @notice Event emitted when tokens are minted behalf by payer to receiver
     */
    event MintBehalf(address payer, address receiver, uint mintAmount, uint mintTokens, uint256 totalSupply);

    /**
     * @notice Event emitted when tokens are redeemed
     */
    event Redeem(address redeemer, uint redeemAmount, uint redeemTokens, uint256 totalSupply);

    /**
     * @notice Event emitted when tokens are redeemed and fee is transferred
     */
    event RedeemFee(address redeemer, uint feeAmount, uint redeemTokens);

    /**
     * @notice Event emitted when underlying is borrowed
     */
    event Borrow(address borrower, uint borrowAmount, uint accountBorrows, uint totalBorrows);

    /**
     * @notice Event emitted when a borrow is repaid
     */
    event RepayBorrow(address payer, address borrower, uint repayAmount, uint accountBorrows, uint totalBorrows);

    /**
     * @notice Event emitted when a borrow is liquidated
     */
    event LiquidateBorrow(
        address liquidator,
        address borrower,
        uint repayAmount,
        address vTokenCollateral,
        uint seizeTokens
    );

    /*** Admin Events ***/

    /**
     * @notice Event emitted when pendingAdmin is changed
     */
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /**
     * @notice Event emitted when pendingAdmin is accepted, which means admin has been updated
     */
    event NewAdmin(address oldAdmin, address newAdmin);

    /**
     * @notice Event emitted when comptroller is changed
     */
    event NewComptroller(IComptroller oldComptroller, IComptroller newComptroller);

    /**
     * @notice Event emitted when interestRateModel is changed
     */
    event NewMarketInterestRateModel(
        InterestRateModelV8 oldInterestRateModel,
        InterestRateModelV8 newInterestRateModel
    );

    /**
     * @notice Event emitted when the reserve factor is changed
     */
    event NewReserveFactor(uint oldReserveFactorMantissa, uint newReserveFactorMantissa);

    /**
     * @notice Event emitted when the reserves are added
     */
    event ReservesAdded(address benefactor, uint addAmount, uint newTotalReserves);

    /**
     * @notice Event emitted when the reserves are reduced
     */
    event ReservesReduced(address protocolShareReserve, uint reduceAmount, uint newTotalReserves);

    /**
     * @notice EIP20 Transfer event
     */
    event Transfer(address indexed from, address indexed to, uint amount);

    /**
     * @notice EIP20 Approval event
     */
    event Approval(address indexed owner, address indexed spender, uint amount);

    /**
     * @notice Event emitted when block delta for reduce reserves get updated
     */
    event NewReduceReservesBlockDelta(uint256 oldReduceReservesBlockDelta, uint256 newReduceReservesBlockDelta);

    /**
     * @notice Event emitted when address of ProtocolShareReserve contract get updated
     */
    event NewProtocolShareReserve(address indexed oldProtocolShareReserve, address indexed newProtocolShareReserve);

    /// @notice Emitted when access control address is changed by admin
    event NewAccessControlManager(address oldAccessControlAddress, address newAccessControlAddress);

    /*** User Interface ***/

    /**
     * @notice Indicator that this is a vToken contract (for inspection)
     */
    function isVToken() external pure returns (bool);

    function transfer(address dst, uint amount) external returns (bool);

    function transferFrom(address src, address dst, uint amount) external returns (bool);

    function approve(address spender, uint amount) external returns (bool);

    function balanceOfUnderlying(address owner) external returns (uint);

    function totalBorrowsCurrent() external returns (uint);

    function borrowBalanceCurrent(address account) external returns (uint);

    function seize(address liquidator, address borrower, uint seizeTokens) external returns (uint);

    function exchangeRateCurrent() external returns (uint);

    function accrueInterest() external returns (uint);

    /*** Admin Function ***/
    function _setPendingAdmin(address payable newPendingAdmin) external returns (uint);

    /*** Admin Function ***/
    function _acceptAdmin() external returns (uint);

    /*** Admin Function ***/
    function _setReserveFactor(uint newReserveFactorMantissa) external returns (uint);

    /*** Admin Function ***/
    function _reduceReserves(uint reduceAmount) external returns (uint);

    /*** Admin Function ***/
    function _setComptroller(IComptroller newComptroller) external returns (uint);

    /*** Admin Function ***/
    function _setInterestRateModel(InterestRateModelV8 newInterestRateModel) external returns (uint);

    function balanceOf(address owner) external view returns (uint);

    function allowance(address owner, address spender) external view returns (uint);

    function getAccountSnapshot(address account) external view returns (uint, uint, uint, uint);

    function borrowRatePerBlock() external view returns (uint);

    function supplyRatePerBlock() external view returns (uint);

    function getCash() external view returns (uint);

    function borrowBalanceStored(address account) external view returns (uint);

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
