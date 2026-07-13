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
import { IComptroller, IVToken, ILiquidator } from "../InterfacesV8.sol";
import { IBStockLiquidator } from "./IBStockLiquidator.sol";

/**
 * @title BStockLiquidator
 * @author Venus
 * @notice Atomic backstop liquidator for bStock (ERC-8056 tokenized stock) collateral.
 *
 * In ONE transaction it repays an undercollateralized borrow, seizes the bStock vToken,
 * redeems it to the raw bStock, and sells that bStock to the debt asset in one or two hops. Hop 1
 * always sells bStock through the Native RFQ router using a pre-fetched, MM-signed firm-quote
 * `txRequest`. For USDT debt that single hop lands the debt asset directly. For non-USDT debt an
 * OPTIONAL hop 2 (Native quotes bStock->USDT only) converts the USDT to the debt asset through a
 * second allowlisted router (an AMM/aggregator). Because seize and sell happen in the same tx there
 * is no price-drift window, and the realized debt-asset amount must clear `minOut` or the whole call
 * reverts. On a full fill the protocol ends up holding only the debt asset; if a hop's router fills
 * less than approved (e.g. a partial RFQ fill) any residual input token stays in the contract, is
 * surfaced via `PartialSwapLeftover`, and is recoverable via `sweep`.
 *
 * Two funding modes share the same core (`_liquidate`):
 *   - INVENTORY: the contract is pre-funded with the debt asset and repays from its own balance.
 *   - FLASH:     the debt asset is flash-borrowed from Venus (`Comptroller.executeFlashLoan`) and repaid
 *                (+ premium) within the same tx; no capital is locked in the contract.
 *
 * Native BNB debt (vBNB): supported in both modes with WBNB as the debt-accounting token. The repay
 * must be native BNB, so exactly the repay amount of WBNB is unwrapped and forwarded to the gate's
 * payable path; the two-hop swap lands WBNB (bStock->USDT->WBNB) and `minOut` is measured in WBNB
 * (1:1 with BNB). FLASH mode borrows from vWBNB, NOT vBNB: vBNB cannot be flash-repaid (its
 * `doTransferIn` requires `msg.value`), whereas vWBNB's underlying is a plain ERC20.
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
 *   - the approval to each router is the exact amount being sold on that hop, reset to 0 afterwards
 *     (bStock on hop 1; the measured intermediate balance delta on hop 2, so pre-existing inventory
 *     is never exposed).
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

    /// @dev Reserved storage to allow new state variables in future upgrades without layout clashes.
    uint256[50] private __gap;

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
        emit RouterSet(router, allowed);
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
    ///         override is a no-op (matching the sibling {Liquidator}) so an accidental call cannot zero
    ///         the owner. Ownership is still transferable via the two-step `transferOwnership` flow.
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
        (debtOut, seizedBStock) = _liquidate(params);
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

        // BNB debt is flash-funded from vWBNB (an ERC20 market), not vBNB: vBNB cannot be flash-repaid.
        // The flashed WBNB is unwrapped to native BNB for the repay inside `_liquidate` (see `executeOperation`).
        IVToken[] memory vTokens = new IVToken[](1);
        vTokens[0] = (address(params.vDebt) == vBNB) ? vWBNB : IVToken(address(params.vDebt));
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

        LiquidationParams memory params = abi.decode(param, (LiquidationParams));
        // For BNB debt the flash is drawn from vWBNB, not vBNB (see `flashLiquidate`). Scoped so the
        // temporary doesn't count against the stack depth of the rest of the function.
        {
            address expectedFlash = address(params.vDebt) == vBNB ? address(vWBNB) : address(params.vDebt);
            if (address(vTokens[0]) != expectedFlash) revert WrongFlashAsset();
        }

        // Repay was just funded by the flash loan; run the liquidation + swap.
        (uint256 debtOut, uint256 seizedBStock) = _liquidate(params);

        // The swap proceeds alone MUST cover principal + premium. Without this, any debt-asset inventory
        // held by the contract would silently backfill an underwater swap (a real loss), since the
        // flash repayment is pulled from the total balance, not just the swap output.
        repayAmounts = new uint256[](1);
        repayAmounts[0] = amounts[0] + premiums[0];
        if (debtOut < repayAmounts[0]) revert InsufficientOut(debtOut, repayAmounts[0]);

        // Approve the flashed vToken to pull back principal + premium. For BNB debt the flashed asset is
        // WBNB (from vWBNB); the ternary short-circuits so `underlying()` is never called on vBNB (it has none).
        IERC20Upgradeable(address(params.vDebt) == vBNB ? address(wbnb) : params.vDebt.underlying()).forceApprove(
            address(vTokens[0]),
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
    ///      zero) so it is only checked when set. Liquidatability itself is not pre-checked here — Core's
    ///      `liquidateBorrowAllowed` already enforces it, and pre-checking shortfall would wrongly block
    ///      forced liquidations (which liquidate healthy accounts).
    function _validateRouters(address router, address router2) private view {
        if (!isRouter[router]) revert RouterNotAllowed(router);
        if (router2 != address(0) && !isRouter[router2]) revert RouterNotAllowed(router2);
    }

    /// @dev One swap hop: approve the exact `amount` to the allowlisted `router`, forward the opaque
    ///      calldata via a low-level call, then reset the approval to 0. The approval caps what the
    ///      router can pull; if the calldata sells less (e.g. a partially-filled RFQ quote), the
    ///      unconsumed remainder stays in the contract and is surfaced via `PartialSwapLeftover` so
    ///      operations can recover it with `sweep` — `minOut` still bounds the realized debt-asset
    ///      proceeds regardless.
    function _swap(IERC20Upgradeable token, address router, bytes memory data, uint256 amount) private {
        uint256 balBefore = token.balanceOf(address(this));
        token.forceApprove(router, amount);
        (bool ok, ) = router.call(data);
        if (!ok) revert SwapFailed();
        token.forceApprove(router, 0); // never leave a standing approval
        // `token` is the hop's INPUT (sold, never received), so its balance can only fall by what the
        // router pulled. A shortfall means the router filled less than approved; emit the residual.
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
    function _liquidate(LiquidationParams memory params) private returns (uint256 debtOut, uint256 seizedBStock) {
        // A debt equal to `vBNB` is native BNB. vBNB has no `underlying()`, so the `isBnb` check MUST come
        // first: the ternary short-circuits and `underlying()` is never evaluated for vBNB. WBNB is the
        // debt-accounting token throughout (1:1 with BNB), so the whole swap/minOut path below is reused.
        // KEEP THIS ORDER — hoisting `underlying()` above the check reverts every BNB liquidation.
        bool isBnb = address(params.vDebt) == vBNB;
        // Native RFQ only quotes bStock->USDT, so a BNB debt is inherently two-hop (...->WBNB). Reject a
        // single-hop BNB config up front instead of failing opaquely later on a zero WBNB delta.
        if (isBnb && params.router2 == address(0)) revert InvalidIntermediate();
        IERC20Upgradeable debt = isBnb
            ? IERC20Upgradeable(address(wbnb))
            : IERC20Upgradeable(params.vDebt.underlying());
        IERC20Upgradeable bStock = IERC20Upgradeable(params.vBStock.underlying());

        // 1. Repay the borrow, seizing the bStock vToken to this contract.
        //    Core has a POOL-WIDE liquidator gate (`liquidatorContract`), which is always configured on
        //    the networks this contract targets. While it is set, a direct `vToken.liquidateBorrow`
        //    reverts UNAUTHORIZED, so we route the repay through that Venus Liquidator (it pulls our
        //    repay and sends us our share of the seized collateral; treasury keeps a cut). The seized
        //    amount is read as a BALANCE DELTA, so the Liquidator's cut is handled correctly. We guard
        //    against an unset gate so a misconfig fails loudly instead of silently no-op'ing a call to
        //    address(0) (a low-level call to a codeless address returns success).
        uint256 vBefore = params.vBStock.balanceOf(address(this));
        address gate = comptroller.liquidatorContract();
        ensureNonzeroAddress(gate);
        if (isBnb) {
            // Unwrap EXACTLY the repay (WBNB held as inventory or drawn from the vWBNB flash) and forward
            // native BNB to the gate's vBNB branch (`{value:}`). Only the repay portion is unwrapped, so
            // pre-existing WBNB inventory is untouched; the swap proceeds below stay as WBNB. No approval
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
        uint256 seizedV = params.vBStock.balanceOf(address(this)) - vBefore;

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
