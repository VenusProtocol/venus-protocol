// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { VToken } from "../Tokens/VTokens/VToken.sol";
import { IFlashLoanReceiver } from "../FlashLoan/interfaces/IFlashLoanReceiver.sol";
import { IWBNB } from "../external/IWBNB.sol";

// Shared Venus interfaces: IComptroller (Core diamond — liquidator gate + flash loan), IVToken
// (flash-loan asset array element), and ILiquidator (the pool-wide Venus Liquidator gate that pulls
// the repay and returns our share of the seized collateral).
import { IComptroller, IVToken, IVBep20, ILiquidator, IVAIController } from "../InterfacesV8.sol";
import { IBStockLiquidator } from "./IBStockLiquidator.sol";

/// @notice The two getters this contract needs from a non-Core pool's comptroller. Declared locally
///         because the isolated-pools package is not a dependency here.
interface IPoolComptroller {
    /// @dev The pool declares this as `isMarketListed(VToken)`. A contract type encodes as `address`,
    ///      so the selector is the same.
    function isMarketListed(address vToken) external view returns (bool);

    /// @dev `pure` in the pool. Widening to `view` is safe: both compile to a STATICCALL.
    function isComptroller() external view returns (bool);
}

/**
 * @title BStockLiquidator
 * @author Venus
 * @notice Atomic backstop liquidator for bStock (ERC-8056 tokenized stock) collateral.
 *
 * In ONE transaction it repays an undercollateralized borrow, seizes the bStock vToken,
 * redeems it to the raw bStock, and sells that bStock to the debt asset in one or two hops. Hop 1
 * sells bStock (to USDT) through an allowlisted RFQ router using a pre-fetched, off-chain-signed
 * `swapCalldata` — Native firm-quote or Liquid Mesh (see `routerSpender`) or any future allowlisted
 * source; the contract is router-agnostic and just forwards the opaque blob. For USDT debt that single
 * hop lands the debt asset directly. For non-USDT debt an OPTIONAL hop 2 (RFQ sources quote bStock->USDT
 * only) converts the USDT to the debt asset through a second allowlisted router (an AMM/aggregator).
 * Because seize and sell happen in the same tx there is no price-drift window, and the realized
 * debt-asset amount must clear `minOut` or the whole call reverts — the protocol never ends up holding
 * the RFQ-only asset or the intermediate.
 *
 * Two funding modes share the same core (`_liquidate`):
 *   - INVENTORY: the contract is pre-funded with the debt asset and repays from its own balance.
 *   - FLASH:     the debt asset is flash-borrowed from Venus (`Comptroller.executeFlashLoan`) and repaid
 *                (+ premium) within the same tx; no capital is locked in the contract.
 *
 * Two POOLS are served by that same core, resolved per call in `_resolvePool` from the COLLATERAL
 * market's own comptroller — never from a flag the caller supplies:
 *   - CORE:     the Venus Core pool, via the pool-wide Venus Liquidator gate.
 *   - ISOLATED: a hub-funded spoke pool (an isolated-pools `Comptroller` fork) the owner has allowlisted
 *               in `isAllowedComptroller`. While that allowlist is empty every call resolves to Core, so
 *               all this adds to a Core liquidation is one `vBStock.comptroller()` staticcall.
 * Only the repay differs between pools (`_repayAndSeize`); redeem, sale, `minOut` and `sweep` are shared.
 * Isolated pools are ERC20-only, so the vBNB and VAI branches below are Core-only.
 *
 * Native BNB debt (vBNB): supported in both modes with WBNB as the debt-accounting token. The repay
 * must be native BNB, so exactly the repay amount of WBNB is unwrapped and forwarded to the gate's
 * payable path; the two-hop swap lands WBNB (bStock->USDT->WBNB) and `minOut` is measured in WBNB
 * (1:1 with BNB). FLASH mode borrows from vWBNB, NOT vBNB: vBNB cannot be flash-repaid (its
 * `doTransferIn` requires `msg.value`), whereas vWBNB's underlying is a plain ERC20.
 *
 * VAI debt (VAIController): supported in INVENTORY mode only. VAI is not a vToken — a `vDebt` equal to
 * `comptroller.vaiController()` is VAI, and like vBNB it has no `underlying()`, so the debt token is
 * resolved via `getVAIAddress()`. The repay is a plain ERC20 approval to the gate, which takes its
 * `_liquidateVAI` branch (pulls the VAI from us, then burns it via `VAIController.liquidateVAI`).
 * Because RFQ sources quote bStock->USDT only, a VAI debt is inherently two-hop (bStock->USDT->VAI);
 * hop 2 is expected to be the Peg Stability Module (`swapStableForVAI`, allowlisted as `router2`),
 * which mints VAI from USDT at the oracle rate. FLASH mode is rejected (`FlashNotSupportedForVai`):
 * `executeFlashLoan` lends a vToken's underlying, and VAI is minted/burned with no vVAI market.
 *
 * Ownership / scope: this is Venus's OWN backstop tool, NOT a public utility — `liquidate` and
 * `flashLiquidate` are operator-only (owner + allowlisted operators). It does not make bStock
 * liquidation exclusive: anyone may still liquidate bStock through the normal permissionless Venus
 * path with their own funds and their own offload. This contract is intentionally gated because it
 * custodies funds (debt-asset inventory / flash principal) and forwards a CALLER-SUPPLIED calldata blob to
 * an external router — the swap's recipient (`to`) lives inside that calldata, so an open entrypoint
 * would let anyone route the proceeds to themselves and drain the contract. The router allowlist and
 * `minOut` bound the blast radius but cannot replace operator-gating.
 *
 * Security model:
 *   - `liquidate` / `flashLiquidate` are `onlyOperator` (owner or allowlisted operator).
 *   - BOTH swap targets (`router` and, when set, `router2`) must be allowlisted (`isRouter`) — defends
 *     the low-level `router.call(swapCalldata)` on each hop.
 *   - the approval for each hop is the exact amount being sold, granted to the router's configured spender
 *     (the router itself when unset — see `routerSpender`) and reset to 0 afterwards (bStock on hop 1; the
 *     measured intermediate balance delta on hop 2, so pre-existing inventory is never exposed).
 *   - `executeOperation` accepts calls only from the Comptroller with `initiator == this` (i.e. a flash we started).
 *   - the realized debt-asset amount must clear `minOut` or the tx reverts.
 *
 * Core liquidation gate (handled automatically): Core has a POOL-WIDE `Comptroller.liquidatorContract`,
 * which is always configured on the networks this contract targets. While it is set, a direct
 * `vToken.liquidateBorrow` from an arbitrary caller reverts UNAUTHORIZED, so this contract reads the gate
 * at call time and routes the repay through that Venus Liquidator (the permissionless entry anyone may
 * call), reverting if the gate is ever unset. Routing through the gate needs no governance change, and no
 * other Core market is affected. Note: setting THIS contract as `liquidatorContract` is NOT an option —
 * the gate is pool-wide, so every other market's liquidations would be forced through here.
 *
 * Isolated pools have no such gate, so the repay goes straight to the debt market. That makes the
 * approval target caller-supplied where Core never is, which is why `_resolvePool` proves both legs are
 * listed in the allowlisted pool's own storage first. A pool may separately gate seizing behind its own
 * liquidation allowlist; THIS CONTRACT's address has to appear on it, not the operator's.
 *
 * Isolated FLASH still borrows from CORE via `coreFlashSource` — isolated pools have no flash lender of
 * their own. See `_flashSource`.
 */
contract BStockLiquidator is
    Ownable2StepUpgradeable,
    ReentrancyGuardUpgradeable,
    IBStockLiquidator,
    IFlashLoanReceiver
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Core Comptroller (diamond): reads the liquidation gate and provides the flash loan
    ///         via `executeFlashLoan`.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IComptroller public immutable comptroller;

    /// @notice The native BNB market (vBNB). A debt equal to this address is settled with native BNB:
    ///         WBNB is the debt-accounting token, and only the repay amount is unwrapped (see `_liquidate`).
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable vBNB;

    /// @notice The WBNB market (vWBNB). BNB debt is flash-funded from here, NOT from vBNB: vBNB cannot be
    ///         flash-repaid (its `doTransferIn` needs `msg.value`), whereas vWBNB's underlying is a plain
    ///         ERC20 repaid via `transferFrom`.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IVToken public immutable vWBNB;

    /// @notice WBNB token: the debt-accounting asset for BNB debt, unwrapped to native BNB for the repay.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IWBNB public immutable wbnb;

    /// @notice Addresses allowed to trigger a liquidation.
    mapping(address => bool) public isOperator;

    /// @notice Routers allowed as the swap target (defends the low-level call).
    mapping(address => bool) public isRouter;

    /// @notice Optional token-approval target (spender) per router, for aggregators whose settlement
    ///         contract that pulls the input token differs from the call target (e.g. Liquid Mesh, where
    ///         the router is the call target but a separate spender pulls the token). When unset
    ///         (address(0)), the approval defaults to the router itself — the Native behaviour, where the
    ///         call target IS the puller — so existing routers need no spender entry.
    mapping(address => address) public routerSpender;

    /// @notice Comptrollers of NON-Core pools this contract may liquidate in (the hub-funded spoke pool).
    ///         Core is never keyed here — it is resolved by identity against the `comptroller` immutable.
    /// @dev Gates the entire isolated branch: while it is empty, every call resolves to Core.
    mapping(address => bool) public isAllowedComptroller;

    /// @notice Core market whose underlying flash-funds an isolated repay, keyed by the isolated pool's
    ///         debt underlying (e.g. USDT -> the Core USDT market). Unused in Core mode.
    mapping(address => IVBep20) public coreFlashSource;

    /// @dev Reserved storage to allow new state variables in future upgrades without layout clashes.
    uint256[47] private __gap;

    modifier onlyOperator() {
        if (msg.sender != owner() && !isOperator[msg.sender]) revert NotOperator();
        _;
    }

    /// @notice Constructor for the implementation contract. Sets the immutables and locks initializers.
    /// @param comptroller_ Venus Core Comptroller (diamond) — gates liquidation and provides flash loans.
    /// @param vBNB_ Native BNB market; a debt equal to this address is settled in native BNB.
    /// @param vWBNB_ WBNB market; the flash-borrow source for BNB debt (vBNB itself cannot be flash-repaid).
    /// @param wbnb_ WBNB token; the debt-accounting asset for BNB debt, unwrapped for the native repay.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(IComptroller comptroller_, address vBNB_, IVToken vWBNB_, IWBNB wbnb_) {
        ensureNonzeroAddress(address(comptroller_));
        ensureNonzeroAddress(vBNB_);
        ensureNonzeroAddress(address(vWBNB_));
        ensureNonzeroAddress(address(wbnb_));
        comptroller = comptroller_;
        vBNB = vBNB_;
        vWBNB = vWBNB_;
        wbnb = wbnb_;
        _disableInitializers();
    }

    /// @notice Initializes the proxy: sets the owner and the reentrancy guard.
    /// @param initialOwner Address that owns the contract (admin + default operator).
    function initialize(address initialOwner) external initializer {
        ensureNonzeroAddress(initialOwner);
        __Ownable2Step_init();
        __ReentrancyGuard_init();
        _transferOwnership(initialOwner);
    }

    /// @notice Accept native BNB. The expected inflow is `wbnb.withdraw` during a BNB liquidation (the
    ///         unwrapped repay is forwarded to the gate in the same call, so no BNB is retained on the
    ///         happy path). Left permissive (not restricted to `wbnb`) both to keep the receive body
    ///         minimal for WBNB's 2300-gas `.transfer` stipend and to tolerate a stray transfer or a
    ///         future gate refund — any such balance is recoverable via `sweepNative`.
    receive() external payable {}

    // --------------------------------------------------------------------- //
    //                               Admin                                   //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IBStockLiquidator
    function setOperator(address operator, bool allowed) external override onlyOwner {
        ensureNonzeroAddress(operator);
        isOperator[operator] = allowed;
        emit OperatorSet(operator, allowed);
    }

    /// @inheritdoc IBStockLiquidator
    function setRouter(address router, bool allowed) external override onlyOwner {
        ensureNonzeroAddress(router);
        isRouter[router] = allowed;
        // De-allowlisting also clears any configured spender: a stale entry must not silently
        // reactivate (with a possibly rotated-away spender) if the router is ever re-allowlisted.
        if (!allowed && routerSpender[router] != address(0)) {
            delete routerSpender[router];
            emit RouterSpenderSet(router, address(0));
        }
        emit RouterSet(router, allowed);
    }

    /// @inheritdoc IBStockLiquidator
    function setRouterSpender(address router, address spender) external override onlyOwner {
        // Couple the spender lifecycle to the allowlist: a spender only ever matters for an
        // allowlisted router (`_swap` approves it right before the router call), so requiring
        // `isRouter` here catches a fat-fingered router address instead of storing it silently.
        if (!isRouter[router]) revert RouterNotAllowed(router);
        // `spender == address(0)` is allowed and clears the entry, reverting the router to
        // approve-the-call-target (Native) behaviour. A non-zero spender receives a live (exact-amount,
        // same-tx) approval during `_swap`, so require it to be a deployed contract — an EOA spender is
        // always a misconfiguration.
        if (spender != address(0) && spender.code.length == 0) revert SpenderNotContract(spender);
        routerSpender[router] = spender;
        emit RouterSpenderSet(router, spender);
    }

    /// @inheritdoc IBStockLiquidator
    function setAllowedComptroller(address comptroller_, bool allowed) external override onlyOwner {
        ensureNonzeroAddress(comptroller_);
        // `_resolvePool` matches Core by identity and never reads this mapping, so an entry for it would
        // never be consulted. Reject rather than store a silent no-op.
        if (comptroller_ == address(comptroller)) revert CoreComptrollerNotConfigurable();
        // Checked only on the way IN, so a pool that later breaks stays removable.
        if (allowed && !IPoolComptroller(comptroller_).isComptroller()) revert NotAComptroller(comptroller_);
        isAllowedComptroller[comptroller_] = allowed;
        emit AllowedComptrollerSet(comptroller_, allowed);
    }

    /// @inheritdoc IBStockLiquidator
    function setCoreFlashSource(address debtToken, IVBep20 vToken) external override onlyOwner {
        ensureNonzeroAddress(debtToken);
        // `vToken == 0` clears the entry. A non-zero one must lend `debtToken`: `executeOperation` approves
        // the debt token to this market while the facet pulls the market's own underlying, so a mismatch
        // approves one token while another is owed. Core-listed and flash-enabled are enforced by
        // `FlashLoanFacet` at call time.
        if (address(vToken) != address(0) && vToken.underlying() != debtToken) {
            revert FlashSourceMismatch(address(vToken), debtToken);
        }
        coreFlashSource[debtToken] = vToken;
        emit CoreFlashSourceSet(debtToken, address(vToken));
    }

    /// @inheritdoc IBStockLiquidator
    function sweep(address token, address to, uint256 amount) external override onlyOwner {
        ensureNonzeroAddress(token);
        ensureNonzeroAddress(to);
        IERC20Upgradeable(token).safeTransfer(to, amount);
        emit Swept(token, to, amount);
    }

    /// @inheritdoc IBStockLiquidator
    /// @dev `nonReentrant` is defense-in-depth only (the function is `onlyOwner`, snapshots no state, and
    ///      reads no balance after the native `.call`), added for consistency with the liquidation entrypoints.
    function sweepNative(address to, uint256 amount) external override onlyOwner nonReentrant {
        ensureNonzeroAddress(to);
        (bool ok, ) = to.call{ value: amount }("");
        if (!ok) revert NativeTransferFailed();
        emit SweptNative(to, amount);
    }

    /// @notice Disabled. This backstop custodies protocol capital (debt-asset inventory, native BNB) and
    ///         every admin function (`sweep`, `sweepNative`, `setOperator`, `setRouter`) is `onlyOwner`,
    ///         so renouncing ownership would permanently strand those funds and brick the contract. The
    ///         override is an `onlyOwner` no-op: an accidental owner call cannot zero the owner, and a
    ///         non-owner call reverts. Ownership is still transferable via the two-step `transferOwnership` flow.
    function renounceOwnership() public override onlyOwner {}

    // --------------------------------------------------------------------- //
    //                          INVENTORY mode                               //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IBStockLiquidator
    /// @dev INVENTORY mode spends the contract's OWN debt-asset capital, so — unlike FLASH mode, where
    ///      `executeOperation` forces the swap proceeds to cover principal + premium — there is no
    ///      built-in floor tying `debtOut` to `repayAmount`. This asymmetry is intentional: a repay can
    ///      legitimately out-cost its proceeds (e.g. the Venus Liquidator keeps a treasury cut of the
    ///      seized collateral, so proceeds land a few % under the repay). `minOut` IS the operator's
    ///      chosen loss floor for inventory mode — set it to the lowest acceptable debt-asset return.
    function liquidate(
        LiquidationParams calldata params
    ) external override onlyOperator nonReentrant returns (uint256 debtOut) {
        _validateRouters(params.router, params.router2);

        if (params.minOut == 0) revert ZeroMinOut();
        if (block.timestamp > params.deadline) revert DeadlineExpired(params.deadline, block.timestamp);
        uint256 seizedBStock;
        (debtOut, seizedBStock) = _liquidate(params, _resolvePool(params.vDebt, params.vBStock));
        emit Liquidated(
            params.borrower,
            address(params.vBStock),
            address(params.vDebt),
            params.repayAmount,
            seizedBStock,
            debtOut,
            false
        );
    }

    // --------------------------------------------------------------------- //
    //                            FLASH mode                                 //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IBStockLiquidator
    function flashLiquidate(LiquidationParams calldata params) external override onlyOperator nonReentrant {
        _validateRouters(params.router, params.router2);

        if (params.minOut == 0) revert ZeroMinOut();
        if (block.timestamp > params.deadline) revert DeadlineExpired(params.deadline, block.timestamp);

        // VAI has no market to flash from: `executeFlashLoan` lends a vToken's underlying, whereas VAI is
        // MINTED/BURNED by the VAIController (`repayVAIFresh` burns it) and has no vVAI. Reject up front
        // instead of passing the VAIController into `executeFlashLoan` and failing opaquely. Use
        // `liquidate` (INVENTORY) with pre-funded VAI for a VAI debt.
        if (address(params.vDebt) == address(comptroller.vaiController())) revert FlashNotSupportedForVai();

        // Always a CORE market, in both pool modes: `vDebt` itself, vWBNB for a BNB debt, or the
        // configured `coreFlashSource` for an isolated debt. See `_flashSource`.
        IVToken[] memory vTokens = new IVToken[](1);
        vTokens[0] = _flashSource(params.vDebt, _resolvePool(params.vDebt, params.vBStock));
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = params.repayAmount;

        comptroller.executeFlashLoan(
            payable(address(this)),
            payable(address(this)),
            vTokens,
            amounts,
            abi.encode(params)
        );
    }

    /// @inheritdoc IFlashLoanReceiver
    function executeOperation(
        VToken[] calldata vTokens,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        address /* onBehalf */,
        bytes calldata param
    ) external override returns (bool, uint256[] memory repayAmounts) {
        if (msg.sender != address(comptroller)) revert OnlyComptroller();
        // initiator == this proves the flash was started by our own flashLiquidate: the FlashLoanFacet
        // passes msg.sender (the executeFlashLoan caller) as `initiator`, and only flashLiquidate calls it.
        if (initiator != address(this)) revert BadInitiator(initiator);

        // Hoisted while the frame is shallow. Without viaIR the stack budget here is tight, which is also
        // why the flashed-asset check lives in `_runFlashLiquidation`.
        address flashed = address(vTokens[0]);

        LiquidationParams memory params = abi.decode(param, (LiquidationParams));

        // Repay was just funded by the flash loan; verify the flashed asset, then liquidate + swap.
        (uint256 debtOut, uint256 seizedBStock) = _runFlashLiquidation(params, flashed);

        // The swap proceeds alone MUST cover principal + premium. Without this, any debt-asset inventory
        // held by the contract would silently backfill an underwater swap (a real loss), since the
        // flash repayment is pulled from the total balance, not just the swap output.
        repayAmounts = new uint256[](1);
        repayAmounts[0] = amounts[0] + premiums[0];
        if (debtOut < repayAmounts[0]) revert InsufficientOut(debtOut, repayAmounts[0]);

        // Approve the flashed vToken to pull back principal + premium. For BNB debt the flashed asset is
        // WBNB (from vWBNB); the ternary short-circuits so `underlying()` is never called on vBNB (it has none).
        // No mode branch needed: vBNB is Core-only, and for an isolated debt `_flashSource` already
        // asserted its underlying equals the flash market's. Either way this is the token that is owed.
        IERC20Upgradeable(address(params.vDebt) == vBNB ? address(wbnb) : params.vDebt.underlying()).forceApprove(
            flashed,
            repayAmounts[0]
        );

        emit Liquidated(
            params.borrower,
            address(params.vBStock),
            address(params.vDebt),
            params.repayAmount,
            seizedBStock,
            debtOut,
            true
        );
        return (true, repayAmounts);
    }

    // --------------------------------------------------------------------- //
    //                              Core                                     //
    // --------------------------------------------------------------------- //

    /// @dev Pre-flight: every swap router must be allowlisted. `router2` is optional (single-hop when
    ///      zero) so it is only checked when set. Liquidatability itself is not pre-checked here — the
    ///      owning pool's own liquidate hook already enforces it, and pre-checking shortfall would wrongly block
    ///      forced liquidations (which liquidate healthy accounts).
    function _validateRouters(address router, address router2) private view {
        if (!isRouter[router]) revert RouterNotAllowed(router);
        if (router2 != address(0) && !isRouter[router2]) revert RouterNotAllowed(router2);
    }

    /**
     * @dev Resolves which pool owns the position, and for a non-Core pool proves both legs belong to it.
     *
     *      Probed on the COLLATERAL leg because it is always a real vToken, whereas `vDebt` may be the vBNB
     *      sentinel or the VAIController, neither of which has `comptroller()`.
     *
     *      Core returns early and keeps its existing validation: the Venus Liquidator gate checks the
     *      collateral market is Core-listed, and covers the borrowed leg by a listing check (BEP20) or by
     *      identity against its own vBNB / VAIController.
     * @return isCore True when the position lives in the Core pool, false for an allowlisted isolated pool.
     */
    function _resolvePool(IVBep20 vDebt, IVBep20 vBStock) private view returns (bool isCore) {
        address pool = address(vBStock.comptroller());
        if (pool == address(comptroller)) return true;

        if (!isAllowedComptroller[pool]) revert ComptrollerNotAllowed(pool);
        // Ask the POOL what it lists rather than trust what a market claims about itself. The isolated
        // repay approves a caller-supplied `vDebt`, and a hostile contract can forge `comptroller()` —
        // but it cannot forge an entry in the pool's storage.
        if (!IPoolComptroller(pool).isMarketListed(address(vBStock))) {
            revert MarketNotInPool(pool, address(vBStock));
        }
        if (!IPoolComptroller(pool).isMarketListed(address(vDebt))) {
            revert MarketNotInPool(pool, address(vDebt));
        }
        return false;
    }

    /**
     * @dev The CORE market whose underlying funds a flash repay, in both pool modes. `FlashLoanFacet` only
     *      lends against Core-listed, flash-enabled markets, but nothing there ties the flashed asset to
     *      the liquidation target: it hands over a market's underlying and wants it back in the same tx.
     *      That is why an isolated pool with no flash lender of its own can still be flash-liquidated.
     */
    function _flashSource(IVBep20 vDebt, bool isCore) private view returns (IVToken) {
        // KEEP THIS ORDER — `underlying()` below must never be evaluated for the vBNB sentinel or the
        // VAIController, neither of which implements it. BNB draws from vWBNB: vBNB cannot be flash-repaid.
        if (isCore) {
            return (address(vDebt) == vBNB) ? vWBNB : IVToken(address(vDebt));
        }

        address debtToken = vDebt.underlying();
        IVBep20 src = coreFlashSource[debtToken];
        if (address(src) == address(0)) revert FlashSourceNotSet(debtToken);
        // Re-asserted, not just trusted from the setter: the market is upgradeable. `executeOperation`
        // approves `debtToken` to whatever this returns, so any drift approves one token while the facet
        // pulls another.
        if (src.underlying() != debtToken) revert FlashSourceMismatch(address(src), debtToken);
        return IVToken(address(src));
    }

    /// @dev One swap hop: approve the exact `amount` to the router's configured spender, forward the
    ///      opaque calldata via a low-level call to the allowlisted `router`, then reset the approval to
    ///      0. The spender defaults to the router itself when unset (Native, where the call target is the
    ///      puller); aggregators with a separate settlement/pull contract (e.g. Liquid Mesh) set it via
    ///      `setRouterSpender`. The approval caps what the spender can pull; if the calldata sells less
    ///      (e.g. a partially-filled RFQ quote), the unconsumed remainder stays in the contract and is
    ///      surfaced via `PartialSwapLeftover` so operations can recover it with `sweep` — `minOut` still
    ///      bounds the realized debt-asset proceeds regardless.
    function _swap(IERC20Upgradeable token, address router, bytes memory data, uint256 amount) private {
        uint256 balBefore = token.balanceOf(address(this));
        // Approve the PULLER, which is not always the call target: Liquid Mesh and similar split-settlement
        // aggregators pull through a separate spender. Defaults to the router when unset, so Native (whose
        // call target is the puller) is unaffected.
        address spender = routerSpender[router];
        if (spender == address(0)) spender = router;
        token.forceApprove(spender, amount);
        (bool ok, bytes memory returndata) = router.call(data);
        if (!ok) {
            // Bubble up the router's own revert reason for easier debugging; fall back to SwapFailed()
            // only when the call reverted without returndata.
            if (returndata.length != 0) {
                assembly {
                    revert(add(returndata, 0x20), mload(returndata))
                }
            }
            revert SwapFailed();
        }
        token.forceApprove(spender, 0); // never leave a standing approval
        // `token` is the hop's INPUT: the spender can pull at most `amount` (the approval, just reset),
        // and any refund is a subset of what it pulled, so the balance can only fall (balAfter <=
        // balBefore) — the subtraction cannot underflow. A shortfall (spent < amount) means the router
        // filled less than approved; emit the residual so it can be swept.
        uint256 spent = balBefore - token.balanceOf(address(this));
        if (spent < amount) emit PartialSwapLeftover(address(token), amount - spent);
    }

    /**
     * @dev The atomic sequence shared by both funding modes:
     *      approve debt -> liquidateBorrow (seize vBStock) -> redeem (raw bStock)
     *      -> swap bStock to the debt asset (one hop, or two via an intermediate) -> assert minOut.
     *      A `calldata` struct from `liquidate` is copied to memory on entry; `executeOperation`
     *      already holds it in memory (decoded from the flash callback).
     * @param params Liquidation parameters.
     * @return debtOut Debt-asset proceeds realized by the swap chain (reverts if below `minOut`).
     * @return seizedBStock Raw bStock redeemed and sold (balance delta).
     */
    function _liquidate(
        LiquidationParams memory params,
        bool isCore
    ) private returns (uint256 debtOut, uint256 seizedBStock) {
        // A debt equal to `vBNB` is native BNB. vBNB has no `underlying()`, so the `isBnb` check MUST come
        // first: the ternary short-circuits and `underlying()` is never evaluated for vBNB. WBNB is the
        // debt-accounting token throughout (1:1 with BNB), so the whole swap/minOut path below is reused.
        // KEEP THIS ORDER — hoisting `underlying()` above the check reverts every BNB liquidation.
        // vBNB is a Core-only market, so `isCore` gates the check too.
        bool isBnb = isCore && address(params.vDebt) == vBNB;
        IERC20Upgradeable debt;
        // Scoped so `vaiCtrl`/`isVai` don't hold stack slots for the rest of the frame.
        {
            // A debt equal to the VAIController is VAI: it is not a vToken and has no `underlying()`
            // either, so — like vBNB — the check MUST come before any `underlying()` evaluation. The gate
            // takes its VAI branch (`Liquidator._liquidateVAI`), which pulls VAI from us and burns it via
            // `VAIController.liquidateVAI`; the repay is a plain ERC20 approval, so the non-BNB path below
            // is reused as-is.
            // Read off the CORE immutable, not the position's pool. In isolated mode this costs one
            // staticcall and matches nothing, since VAI is Core-only.
            IVAIController vaiCtrl = comptroller.vaiController();
            bool isVai = isCore && address(params.vDebt) == address(vaiCtrl);
            // RFQ sources only quote bStock->USDT, so BNB and VAI debts are inherently two-hop
            // (...->WBNB / ...->VAI). Reject a single-hop config up front instead of failing opaquely
            // later on a zero debt-asset delta.
            if ((isBnb || isVai) && params.router2 == address(0)) revert InvalidIntermediate();
            debt = isBnb
                ? IERC20Upgradeable(address(wbnb))
                : isVai
                    ? IERC20Upgradeable(vaiCtrl.getVAIAddress())
                    : IERC20Upgradeable(params.vDebt.underlying());
        }
        IERC20Upgradeable bStock = IERC20Upgradeable(params.vBStock.underlying());

        // 1. Repay the borrow, seizing the bStock vToken to this contract. The Core/isolated branch lives
        //    in `_repayAndSeize`, which also keeps this frame within the stack budget.
        uint256 seizedV = _repayAndSeize(params, debt, isCore, isBnb);

        // 2. Redeem the seized vBStock for raw bStock. Measure by DELTA so any pre-existing bStock
        //    (dust or a stray transfer) is excluded — we only sell what this redeem actually returned.
        uint256 rawBefore = bStock.balanceOf(address(this));
        uint256 redeemErr = params.vBStock.redeem(seizedV);
        if (redeemErr != 0) revert RedeemFailed(redeemErr);
        seizedBStock = bStock.balanceOf(address(this)) - rawBefore;

        // 3. Sell the bStock to the debt asset (one hop, or two via an intermediate) and assert minOut.
        //    Extracted into `_sellToDebt` to keep this frame within the EVM stack limit.
        debtOut = _sellToDebt(debt, bStock, seizedBStock, params);
    }

    /**
     * @dev Body of `executeOperation`: prove the flashed asset is the one this position implies, then run
     *      the liquidation. Split out for stack room.
     * @param params Liquidation parameters, as decoded from the flash payload.
     * @param flashed The asset the flash lender actually handed over.
     */
    function _runFlashLiquidation(
        LiquidationParams memory params,
        address flashed
    ) private returns (uint256 debtOut, uint256 seizedBStock) {
        // Re-derived from chain state, never from the flash payload.
        bool isCore = _resolvePool(params.vDebt, params.vBStock);
        if (flashed != address(_flashSource(params.vDebt, isCore))) revert WrongFlashAsset();
        return _liquidate(params, isCore);
    }

    /**
     * @dev Repay the borrow and take delivery of the seized bStock vToken, in whichever pool owns it.
     *
     *      CORE routes through the pool-wide liquidator gate, which keeps a treasury cut. ISOLATED has no
     *      gate, so the repay goes straight to the debt market and the COLLATERAL market withholds its own
     *      `protocolSeizeShare`. Neither cut is handled here: the seize is read as a BALANCE DELTA.
     *
     *      The isolated approval target is validated upstream in `_resolvePool`.
     * @return seizedV Seized bStock vTokens actually credited to this contract (balance delta).
     */
    function _repayAndSeize(
        LiquidationParams memory params,
        IERC20Upgradeable debt,
        bool isCore,
        bool isBnb
    ) private returns (uint256 seizedV) {
        uint256 vBefore = params.vBStock.balanceOf(address(this));

        if (isCore) {
            // Guard against an unset gate so a misconfig fails loudly instead of silently no-op'ing a call
            // to address(0) (a low-level call to a codeless address returns success).
            address gate = comptroller.liquidatorContract();
            ensureNonzeroAddress(gate);
            if (isBnb) {
                // Unwrap EXACTLY the repay (WBNB held as inventory or drawn from the vWBNB flash) and forward
                // native BNB to the gate's vBNB branch (`{value:}`). Only the repay portion is unwrapped, so
                // pre-existing WBNB inventory is untouched; the swap proceeds stay as WBNB. No approval
                // is granted (value is forwarded), so there is no standing allowance to reset.
                wbnb.withdraw(params.repayAmount);
                ILiquidator(gate).liquidateBorrow{ value: params.repayAmount }(
                    address(params.vDebt),
                    params.borrower,
                    params.repayAmount,
                    params.vBStock
                );
            } else {
                debt.forceApprove(gate, params.repayAmount);
                ILiquidator(gate).liquidateBorrow(
                    address(params.vDebt),
                    params.borrower,
                    params.repayAmount,
                    params.vBStock
                );
                // Reset the gate approval: if the Liquidator pulled less than `repayAmount` (e.g. a close-factor
                // cap), the remainder would otherwise linger as a standing allowance. Same invariant as `_swap`.
                debt.forceApprove(gate, 0);
            }
        } else {
            // Isolated pools are ERC20-only, so this is always the plain approve-and-call shape.
            // `VToken.liquidateBorrow` answers NO_ERROR or reverts, so its return value is ignored.
            debt.forceApprove(address(params.vDebt), params.repayAmount);
            params.vDebt.liquidateBorrow(params.borrower, params.repayAmount, params.vBStock);
            // Reset unconditionally, as the Core branch does. Today the pull always consumes the whole
            // approval, but the market is upgradeable and not controlled by this contract.
            debt.forceApprove(address(params.vDebt), 0);
        }

        seizedV = params.vBStock.balanceOf(address(this)) - vBefore;
    }

    /**
     * @dev Sell `seizedBStock` to the debt asset and enforce `minOut`. Single hop by default
     *      (bStock -> debt via the Native router). When `params.router2` is set, two hops
     *      (bStock -> intermediate -> debt): hop 1 sells bStock to the intermediate (USDT) via the
     *      Native router, hop 2 converts that intermediate to the debt asset via a second allowlisted
     *      router (AMM/aggregator). `minOut` is measured in the debt asset across the whole chain.
     * @return debtOut Debt-asset proceeds (balance delta), reverting if below `minOut`.
     */
    function _sellToDebt(
        IERC20Upgradeable debt,
        IERC20Upgradeable bStock,
        uint256 seizedBStock,
        LiquidationParams memory params
    ) private returns (uint256 debtOut) {
        uint256 debtBefore = debt.balanceOf(address(this));
        if (params.router2 == address(0)) {
            _swap(bStock, params.router, params.swapCalldata, seizedBStock);
        } else {
            // The intermediate must be a real token distinct from both endpoints: if it equals `debt`,
            // hop 1 would inflate the balance `debtBefore` snapshots against (breaking the proceeds
            // delta); if it equals `bStock`, the hop-1 sell shrinks the balance and the midDelta
            // subtraction underflows.
            if (
                params.intermediateToken == address(0) ||
                params.intermediateToken == address(debt) ||
                params.intermediateToken == address(bStock)
            ) revert InvalidIntermediate();

            IERC20Upgradeable mid = IERC20Upgradeable(params.intermediateToken);
            uint256 midBefore = mid.balanceOf(address(this));
            _swap(bStock, params.router, params.swapCalldata, seizedBStock); // hop 1: bStock -> intermediate
            // Only the hop-1 proceeds are sold onward; any pre-existing intermediate inventory is excluded.
            uint256 midDelta = mid.balanceOf(address(this)) - midBefore;
            _swap(mid, params.router2, params.swapCalldata2, midDelta); // hop 2: intermediate -> debt
        }

        debtOut = debt.balanceOf(address(this)) - debtBefore;
        if (debtOut < params.minOut) revert InsufficientOut(debtOut, params.minOut);
    }
}
