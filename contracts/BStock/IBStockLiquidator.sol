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
    /// @dev The swap can be one or two hops. When `router2 == address(0)` it is a single hop
    ///      (bStock -> debt) and `swapCalldata2` / `intermediateToken` are ignored — behavior is
    ///      identical to the single-hop version. When `router2` is set it is two hops
    ///      (bStock -> `intermediateToken` -> debt): hop 1 sells bStock via `router`, hop 2 converts
    ///      the intermediate to the debt asset via `router2`. `minOut` is always the FINAL debt-asset
    ///      floor across the whole chain.
    struct LiquidationParams {
        address borrower; // account to liquidate
        IVBep20 vDebt; // borrowed market to repay (e.g. vUSDT)
        IVBep20 vBStock; // bStock collateral market to seize (e.g. vTSLAB)
        uint256 repayAmount; // debt underlying to repay (its own decimals)
        address router; // hop-1 router = Native firm-quote txRequest.target (must be allowlisted)
        bytes swapCalldata; // hop-1 calldata (MM-signed Native order): bStock -> intermediate (or -> debt if single-hop)
        uint256 minOut; // minimum FINAL debt-asset amount the swap chain must yield, else revert
        address router2; // hop-2 router (AMM/aggregator): intermediate -> debt; address(0) = single-hop
        bytes swapCalldata2; // hop-2 calldata; the swap recipient inside it MUST be this contract
        address intermediateToken; // token hop 1 outputs and hop 2 consumes (e.g. USDT); required when router2 set
    }

    /// @notice Emitted when an operator is allowlisted or removed.
    event OperatorSet(address indexed operator, bool allowed);

    /// @notice Emitted when a swap router is allowlisted or removed.
    event RouterSet(address indexed router, bool allowed);

    /// @notice Emitted on a successful liquidation.
    /// @param borrower The liquidated account.
    /// @param vBStock The seized bStock collateral market.
    /// @param vDebt The repaid debt market.
    /// @param repayAmount Debt underlying repaid.
    /// @param seizedBStock Raw bStock redeemed and sold.
    /// @param debtOut Debt-asset proceeds of the swap.
    /// @param flash True if funded by a flash loan, false if from inventory.
    event Liquidated(
        address indexed borrower,
        address indexed vBStock,
        address indexed vDebt,
        uint256 repayAmount,
        uint256 seizedBStock,
        uint256 debtOut,
        bool flash
    );

    /// @notice Emitted when the owner withdraws a token.
    event Swept(address indexed token, address indexed to, uint256 amount);

    /// @notice Thrown when the caller is neither the owner nor an allowlisted operator.
    error NotOperator();

    /// @notice Thrown when the supplied swap router is not allowlisted.
    error RouterNotAllowed(address router);

    /// @notice Thrown when `vBStock.redeem` returns a non-zero error code.
    error RedeemFailed(uint256 errCode);

    /// @notice Thrown when the low-level call to the router reverts.
    error SwapFailed();

    /// @notice Thrown when swap proceeds are below `minOut`.
    error InsufficientOut(uint256 got, uint256 minOut);

    /// @notice Thrown when `minOut` is zero: a liquidation must set a non-zero debt-asset floor,
    ///         else it would silently accept any proceeds (including zero).
    error ZeroMinOut();

    /// @notice Thrown when a two-hop `intermediateToken` is zero, or equals the debt or bStock token.
    error InvalidIntermediate();

    /// @notice Thrown when `executeOperation` is called by something other than the Comptroller.
    error OnlyComptroller();

    /// @notice Thrown when the flash-loan initiator is not this contract.
    error BadInitiator(address initiator);

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

    /// @notice Liquidate using the contract's own debt-asset inventory.
    /// @dev The contract must already hold >= `repayAmount` of `vDebt.underlying()`.
    ///      Profit (proceeds - repay) stays in the contract; withdraw it with `sweep`.
    /// @param params Liquidation parameters (borrower, markets, repay, hop-1 router + calldata, final
    ///        minOut, and the optional hop-2 router/calldata/intermediate for non-USDT debt).
    /// @return debtOut Debt-asset proceeds realized by the swap chain.
    function liquidate(LiquidationParams calldata params) external returns (uint256 debtOut);

    /// @notice Liquidate by flash-borrowing the repay amount from Venus, repaid (+ premium) in the same tx.
    /// @dev Requires this contract to be `authorizedFlashLoan` in the Comptroller and `vDebt` flash-enabled.
    ///      Profit (proceeds - repay - premium) stays in the contract; withdraw it with `sweep`.
    /// @param params Liquidation parameters (borrower, markets, repay, hop-1 router + calldata, final
    ///        minOut, and the optional hop-2 router/calldata/intermediate for non-USDT debt).
    function flashLiquidate(LiquidationParams calldata params) external;
}
