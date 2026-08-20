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
    ///      floor across the whole chain. `deadline` is a unix-timestamp expiry: the call reverts once
    ///      `block.timestamp` passes it, so a stale tx cannot settle against an expired quote.
    struct LiquidationParams {
        address borrower; // account to liquidate
        IVBep20 vDebt; // borrowed market to repay (e.g. vUSDT)
        IVBep20 vBStock; // bStock collateral market to seize (e.g. vTSLAB)
        uint256 repayAmount; // debt underlying to repay (its own decimals)
        address router; // hop-1 RFQ router (Native firm-quote target, Liquid Mesh router, …) — must be allowlisted
        bytes swapCalldata; // hop-1 calldata (off-chain-signed RFQ order): bStock -> intermediate (or -> debt if single-hop)
        uint256 minOut; // minimum FINAL debt-asset amount the swap chain must yield, else revert
        address router2; // hop-2 router (AMM/aggregator): intermediate -> debt; address(0) = single-hop
        bytes swapCalldata2; // hop-2 calldata; the swap recipient inside it MUST be this contract
        address intermediateToken; // token hop 1 outputs and hop 2 consumes (e.g. USDT); required when router2 set
        uint256 deadline; // unix timestamp after which the call reverts; guards a stale tx sitting in the mempool
    }

    /// @notice Emitted when an operator is allowlisted or removed.
    event OperatorSet(address indexed operator, bool allowed);

    /// @notice Emitted when a swap router is allowlisted or removed.
    event RouterSet(address indexed router, bool allowed);

    /// @notice Emitted when a router's token-approval target (spender) is set or cleared.
    event RouterSpenderSet(address indexed router, address indexed spender);

    /// @notice Emitted when a non-Core pool's comptroller is allowlisted or removed.
    event AllowedComptrollerSet(address indexed comptroller, bool allowed);

    /// @notice Emitted when the Core market that flash-funds a non-Core debt token is set or cleared.
    event CoreFlashSourceSet(address indexed debtToken, address indexed vToken);

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

    /// @notice Emitted when the owner withdraws stuck native BNB.
    event SweptNative(address indexed to, uint256 amount);

    /// @notice Emitted when a swap hop pulls less than the amount approved to the router, leaving a
    ///         residual of the input token in the contract (e.g. a partially-filled RFQ quote). The
    ///         residual is recoverable via `sweep`.
    /// @param token The input token left over (bStock on hop 1, the intermediate on hop 2).
    /// @param amount The residual amount not consumed by the swap.
    event PartialSwapLeftover(address indexed token, uint256 amount);

    /// @notice Thrown when the caller is neither the owner nor an allowlisted operator.
    error NotOperator();

    /// @notice Thrown when the supplied swap router is not allowlisted.
    error RouterNotAllowed(address router);

    /// @notice Thrown when a router spender being set is not a deployed contract. The spender receives
    ///         a live token approval during the swap, so an EOA spender is always a misconfiguration.
    error SpenderNotContract(address spender);

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

    /// @notice Thrown when `flashLiquidate` is called with a VAI debt. VAI is minted/burned by the
    ///         VAIController and has no vToken market to flash from — use `liquidate` (INVENTORY mode)
    ///         with pre-funded VAI instead.
    error FlashNotSupportedForVai();

    /// @notice Thrown when the pool that owns the position is neither Core nor an allowlisted comptroller.
    /// @dev The pool is resolved from `vBStock.comptroller()` — the collateral leg, because that is the asset
    ///      this contract custodies, redeems and sells.
    error ComptrollerNotAllowed(address comptroller);

    /// @notice Thrown when a market is not listed in the allowlisted pool it claims to belong to.
    /// @dev Both legs are checked against the POOL's own storage (`isMarketListed`), never against what the
    ///      market reports about itself. In isolated mode the repay is an ERC20 approval to `vDebt`, so an
    ///      unvalidated `vDebt` would be an approval to a caller-chosen address.
    error MarketNotInPool(address comptroller, address market);

    /// @notice Thrown when trying to allowlist the Core comptroller. Core is resolved by identity against the
    ///         `comptroller` immutable and never consults the allowlist, so the entry would never be read.
    error CoreComptrollerNotConfigurable();

    /// @notice Thrown when an address being allowlisted does not answer `isComptroller()` with true.
    error NotAComptroller(address target);

    /// @notice Thrown when `flashLiquidate` is called for a non-Core pool whose debt token has no Core market
    ///         configured to flash-borrow from. Set one with `setCoreFlashSource`, or use `liquidate`.
    error FlashSourceNotSet(address debtToken);

    /// @notice Thrown when the configured Core flash source's underlying is not the debt token being repaid.
    error FlashSourceMismatch(address flashSource, address debtToken);

    /// @notice Thrown when the call is submitted after `params.deadline`.
    error DeadlineExpired(uint256 deadline, uint256 nowTs);

    /// @notice Thrown when a native BNB transfer (the `sweepNative` payout) fails.
    error NativeTransferFailed();

    /// @notice Allow or disallow an address to trigger liquidations.
    /// @param operator Address to allowlist or remove.
    /// @param allowed True to allow, false to remove.
    function setOperator(address operator, bool allowed) external;

    /// @notice Allow or disallow a router as the swap target (e.g. the Native router).
    /// @dev Removing a router also clears its `routerSpender` entry (emitting {RouterSpenderSet} with
    ///      `address(0)`), so a stale spender cannot silently reactivate on a later re-allowlist.
    /// @param router Address to allowlist or remove.
    /// @param allowed True to allow, false to remove.
    function setRouter(address router, bool allowed) external;

    /// @notice Set the token-approval target (spender) for a router whose settlement contract that pulls
    ///         the input token differs from the call target (e.g. Liquid Mesh). When unset, the approval
    ///         defaults to the router itself (Native behaviour). Setting `spender = address(0)` clears it.
    /// @dev Reverts with {RouterNotAllowed} unless `router` is currently allowlisted, and with
    ///      {SpenderNotContract} when a non-zero `spender` has no code. The spender is an approval
    ///      target only — it is never called; the low-level call always targets the allowlisted router.
    /// @param router The allowlisted swap target (call target).
    /// @param spender The contract that pulls the input token via `transferFrom` during settlement.
    function setRouterSpender(address router, address spender) external;

    /// @notice Allow or disallow a non-Core pool's comptroller as a liquidation target.
    /// @dev Gates the whole isolated/spoke branch: with an empty allowlist this contract behaves exactly as it
    ///      did before dual-mode support, so the upgrade is a no-op until a pool is deliberately enabled.
    ///      Reverts with {CoreComptrollerNotConfigurable} for the Core comptroller (resolved by identity, never
    ///      from this mapping) and with {NotAComptroller} unless the target answers `isComptroller()` with true.
    /// @param comptroller_ The pool comptroller to allowlist or remove.
    /// @param allowed True to allow, false to remove.
    function setAllowedComptroller(address comptroller_, bool allowed) external;

    /// @notice Set the Core market whose underlying flash-funds the repay of a non-Core pool's debt token.
    /// @dev Isolated pools have no flash lender of their own, but the Core flash loan is not tied to the
    ///      liquidation target: it lends a Core market's underlying and wants it back in the same transaction.
    ///      So a spoke USDT debt is flash-funded from the CORE USDT market. Only used in isolated mode; Core
    ///      keeps deriving its flash source from `vDebt` itself. Setting `vToken = address(0)` clears the entry
    ///      and makes `flashLiquidate` revert {FlashSourceNotSet} for that token.
    /// @param debtToken The non-Core pool's debt underlying (e.g. USDT).
    /// @param vToken The Core market to flash-borrow from; its `underlying()` must equal `debtToken`.
    function setCoreFlashSource(address debtToken, IVBep20 vToken) external;

    /// @notice Withdraw any token (profit, leftover inventory, stuck dust) to `to`.
    /// @param token Token to withdraw.
    /// @param to Recipient.
    /// @param amount Amount to withdraw.
    function sweep(address token, address to, uint256 amount) external;

    /// @notice Withdraw stuck native BNB (a stray transfer, or a gate refund) to `to`.
    /// @param to Recipient.
    /// @param amount Amount of native BNB to withdraw.
    function sweepNative(address to, uint256 amount) external;

    /// @notice Liquidate using the contract's own debt-asset inventory.
    /// @dev The contract must already hold >= `repayAmount` of `vDebt.underlying()`.
    ///      Profit (proceeds - repay) stays in the contract; withdraw it with `sweep`.
    /// @param params Liquidation parameters (borrower, markets, repay, hop-1 router + calldata, final
    ///        minOut, `deadline`, and the optional hop-2 router/calldata/intermediate for non-USDT debt).
    /// @return debtOut Debt-asset proceeds realized by the swap chain.
    function liquidate(LiquidationParams calldata params) external returns (uint256 debtOut);

    /// @notice Liquidate by flash-borrowing the repay amount from Venus, repaid (+ premium) in the same tx.
    /// @dev Requires this contract to be `authorizedFlashLoan` in the Core Comptroller. The flash always comes
    ///      from a CORE market: in Core mode that is `vDebt` itself (vWBNB for a vBNB debt), and in isolated
    ///      mode it is `coreFlashSource[vDebt.underlying()]`, since isolated pools have no flash lender.
    ///      Profit (proceeds - repay - premium) stays in the contract; withdraw it with `sweep`.
    /// @param params Liquidation parameters (borrower, markets, repay, hop-1 router + calldata, final
    ///        minOut, `deadline`, and the optional hop-2 router/calldata/intermediate for non-USDT debt).
    function flashLiquidate(LiquidationParams calldata params) external;
}
