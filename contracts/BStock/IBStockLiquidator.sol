// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IVBep20 } from "../InterfacesV8.sol";

/// @title IBStockLiquidator
/// @author Venus
/// @notice External API, events, errors and parameter struct for {BStockLiquidator}.
/// @dev The flash-loan callback `executeOperation` is intentionally NOT part of this interface — it is
///      declared by {IFlashLoanReceiver} (owned by the Core flash-loan subsystem) and implemented directly
///      by {BStockLiquidator}, keeping this interface free of the concrete `VToken` dependency.
interface IBStockLiquidator {
    /// @notice Parameters for a single liquidation.
    struct LiquidationParams {
        address borrower; // account to liquidate
        IVBep20 vDebt; // borrowed market to repay (e.g. vUSDT)
        IVBep20 vBStock; // bStock collateral market to seize (e.g. vTSLAB)
        uint256 repayAmount; // debt underlying to repay (its own decimals)
        address router; // Native router = firm-quote txRequest.target (must be allowlisted)
        bytes swapCalldata; // firm-quote txRequest.calldata (MM-signed order)
        uint256 minOut; // minimum debt-asset (USDT) the swap must yield, else revert
    }

    /// @notice Emitted when an operator is allowlisted or removed.
    event OperatorSet(address indexed operator, bool allowed);

    /// @notice Emitted when a swap router is allowlisted or removed.
    event RouterSet(address indexed router, bool allowed);

    /// @notice Emitted on a successful liquidation.
    /// @param borrower The liquidated account.
    /// @param vBStock The seized bStock collateral market.
    /// @param repayAmount Debt underlying repaid.
    /// @param seizedBStock Raw bStock redeemed and sold.
    /// @param usdtOut Debt-asset (USDT) proceeds of the swap.
    /// @param flash True if funded by a flash loan, false if from inventory.
    event Liquidated(
        address indexed borrower,
        address indexed vBStock,
        uint256 repayAmount,
        uint256 seizedBStock,
        uint256 usdtOut,
        bool flash
    );

    /// @notice Emitted when the owner withdraws a token.
    event Swept(address indexed token, address indexed to, uint256 amount);

    /// @notice Thrown when the caller is neither the owner nor an allowlisted operator.
    error NotOperator();

    /// @notice Thrown when the supplied swap router is not allowlisted.
    error RouterNotAllowed(address router);

    /// @notice Thrown when `vDebt.liquidateBorrow` returns a non-zero error code.
    error LiquidateBorrowFailed(uint256 errCode);

    /// @notice Thrown when `vBStock.redeem` returns a non-zero error code.
    error RedeemFailed(uint256 errCode);

    /// @notice Thrown when the low-level call to the router reverts.
    error SwapFailed();

    /// @notice Thrown when swap proceeds are below `minOut`.
    error InsufficientOut(uint256 got, uint256 minOut);

    /// @notice Thrown when `executeOperation` is called by something other than the Comptroller.
    error OnlyComptroller();

    /// @notice Thrown when the flash-loan initiator is not this contract.
    error BadInitiator(address initiator);

    /// @notice Thrown when `executeOperation` is called outside one of our own flash loans.
    error NoFlashInFlight();

    /// @notice Thrown when the flashed asset does not match `params.vDebt`.
    error WrongFlashAsset();

    /// @notice Allow or disallow an address to trigger liquidations.
    /// @param operator Address to allowlist or remove.
    /// @param allowed True to allow, false to remove.
    function setOperator(address operator, bool allowed) external;

    /// @notice Allow or disallow a router as the swap target (e.g. the Native router).
    /// @param router Address to allowlist or remove.
    /// @param allowed True to allow, false to remove.
    function setRouter(address router, bool allowed) external;

    /// @notice Withdraw any token (profit, leftover inventory, stuck dust) to `to`.
    /// @param token Token to withdraw.
    /// @param to Recipient.
    /// @param amount Amount to withdraw.
    function sweep(address token, address to, uint256 amount) external;

    /// @notice Liquidate using the contract's own debt-asset (USDT) inventory.
    /// @dev The contract must already hold >= `repayAmount` of `vDebt.underlying()`.
    ///      Profit (proceeds - repay) stays in the contract; withdraw it with `sweep`.
    /// @param params Liquidation parameters (borrower, markets, repay, router, signed swap calldata, minOut).
    /// @return usdtOut Debt-asset proceeds realized by the swap.
    function liquidate(LiquidationParams calldata params) external returns (uint256 usdtOut);

    /// @notice Liquidate by flash-borrowing the repay amount from Venus, repaid (+ premium) in the same tx.
    /// @dev Requires this contract to be `authorizedFlashLoan` in the Comptroller and `vDebt` flash-enabled.
    ///      Profit (proceeds - repay - premium) stays in the contract; withdraw it with `sweep`.
    /// @param params Liquidation parameters (borrower, markets, repay, router, signed swap calldata, minOut).
    function flashLiquidate(LiquidationParams calldata params) external;
}
