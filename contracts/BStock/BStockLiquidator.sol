// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { ensureNonzeroAddress } from "@venusprotocol/solidity-utilities/contracts/validators.sol";

import { VToken } from "../Tokens/VTokens/VToken.sol";
import { IFlashLoanReceiver } from "../FlashLoan/interfaces/IFlashLoanReceiver.sol";

// Shared Venus interfaces: IComptroller (Core diamond — gate, account liquidity, flash loan),
// IVBep20 (the bStock/debt market surface), IVToken (flash-loan asset array element), and ILiquidator
// (the pool-wide Venus Liquidator gate that pulls the repay and returns our share of the seized collateral).
import { IComptroller, IVBep20, IVToken, ILiquidator } from "../InterfacesV8.sol";
import { IBStockLiquidator } from "./IBStockLiquidator.sol";

/**
 * @title BStockLiquidator
 * @author Venus
 * @notice Atomic backstop liquidator for bStock (ERC-8056 tokenized stock) collateral.
 *
 * In ONE transaction it repays an undercollateralized borrow, seizes the bStock vToken,
 * redeems it to the raw bStock, and sells that bStock to USDT through the Native RFQ router
 * using a pre-fetched, MM-signed firm-quote `txRequest`. Because seize and sell happen in the
 * same tx there is no price-drift window, and the realized USDT must clear `minOut` or the whole
 * call reverts — the protocol never ends up holding the RFQ-only asset.
 *
 * Two funding modes share the same core (`_liquidate`):
 *   - INVENTORY: the contract is pre-funded with the debt asset (USDT) and repays from its own balance.
 *   - FLASH:     the debt asset is flash-borrowed from Venus (`Comptroller.executeFlashLoan`) and repaid
 *                (+ premium) within the same tx; no capital is locked in the contract.
 *
 * Ownership / scope: this is Venus's OWN backstop tool, NOT a public utility — `liquidate` and
 * `flashLiquidate` are operator-only (owner + allowlisted operators). It does not make bStock
 * liquidation exclusive: anyone may still liquidate bStock through the normal permissionless Venus
 * path with their own funds and their own offload. This contract is intentionally gated because it
 * custodies funds (USDT inventory / flash principal) and forwards a CALLER-SUPPLIED calldata blob to
 * an external router — the swap's recipient (`to`) lives inside that calldata, so an open entrypoint
 * would let anyone route the proceeds to themselves and drain the contract. The router allowlist and
 * `minOut` bound the blast radius but cannot replace operator-gating.
 *
 * Security model:
 *   - `liquidate` / `flashLiquidate` are `onlyOperator` (owner or allowlisted operator).
 *   - the swap target must be allowlisted (`isRouter`) — defends the low-level `router.call(swapCalldata)`.
 *   - the bStock approval to the router is the exact seized amount, reset to 0 after the swap.
 *   - `executeOperation` accepts calls only from the Comptroller, mid-flight (`_flashActive`), with `initiator == this`.
 *   - realized USDT must clear `minOut` or the tx reverts.
 *
 * Core liquidation gate (handled automatically): Core has a POOL-WIDE `Comptroller.liquidatorContract`.
 * When it is set, a direct `vToken.liquidateBorrow` from an arbitrary caller reverts UNAUTHORIZED, so this
 * contract reads the gate at call time and routes the repay through that Venus Liquidator (which is the
 * permissionless entry anyone may call); when the gate is unset it liquidates directly. Routing through the
 * gate needs no governance change, and no other Core market is affected. Note: setting THIS contract as `liquidatorContract` is
 * NOT an option — the gate is pool-wide, so every other market's liquidations would be forced through here.
 */
contract BStockLiquidator is
    Ownable2StepUpgradeable,
    ReentrancyGuardUpgradeable,
    IBStockLiquidator,
    IFlashLoanReceiver
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Core Comptroller (diamond): reads the liquidation gate / account liquidity and provides
    ///         the flash loan via `executeFlashLoan`.
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    IComptroller public immutable comptroller;

    /// @notice Addresses allowed to trigger a liquidation.
    mapping(address => bool) public isOperator;

    /// @notice Routers allowed as the swap target (defends the low-level call).
    mapping(address => bool) public isRouter;

    /// @dev True only while one of our own flash loans is mid-flight.
    bool private _flashActive;

    /// @dev Reserved storage to allow new state variables in future upgrades without layout clashes.
    uint256[49] private __gap;

    modifier onlyOperator() {
        if (msg.sender != owner() && !isOperator[msg.sender]) revert NotOperator();
        _;
    }

    /// @notice Constructor for the implementation contract. Sets the immutable Comptroller and locks initializers.
    /// @param comptroller_ Venus Core Comptroller (diamond) — gates liquidation and provides flash loans.
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(IComptroller comptroller_) {
        ensureNonzeroAddress(address(comptroller_));
        comptroller = comptroller_;
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
        IERC20Upgradeable(token).safeTransfer(to, amount);
        emit Swept(token, to, amount);
    }

    // --------------------------------------------------------------------- //
    //                          INVENTORY mode                               //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IBStockLiquidator
    function liquidate(
        LiquidationParams calldata p
    ) external override onlyOperator nonReentrant returns (uint256 usdtOut) {
        _check(p);
        uint256 seizedBStock;
        (usdtOut, seizedBStock) = _liquidate(p);
        emit Liquidated(p.borrower, address(p.vBStock), p.repayAmount, seizedBStock, usdtOut, false);
    }

    // --------------------------------------------------------------------- //
    //                            FLASH mode                                 //
    // --------------------------------------------------------------------- //

    /// @inheritdoc IBStockLiquidator
    function flashLiquidate(LiquidationParams calldata p) external override onlyOperator nonReentrant {
        _check(p);

        IVToken[] memory vTokens = new IVToken[](1);
        vTokens[0] = p.vDebt;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = p.repayAmount;

        _flashActive = true;
        comptroller.executeFlashLoan(payable(address(this)), payable(address(this)), vTokens, amounts, abi.encode(p));
        _flashActive = false;
    }

    /// @inheritdoc IFlashLoanReceiver
    function executeOperation(
        VToken[] calldata vTokens,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        address /* onBehalf */,
        bytes calldata param
    ) external override returns (bool success, uint256[] memory repayAmounts) {
        if (msg.sender != address(comptroller)) revert OnlyComptroller();
        if (!_flashActive) revert NoFlashInFlight();
        if (initiator != address(this)) revert BadInitiator(initiator);

        LiquidationParams memory p = abi.decode(param, (LiquidationParams));
        if (address(vTokens[0]) != address(p.vDebt)) revert WrongFlashAsset();

        // Repay was just funded by the flash loan; run the liquidation + swap.
        (uint256 usdtOut, uint256 seizedBStock) = _liquidate(p);

        // The swap proceeds alone MUST cover principal + premium. Without this, any USDT inventory
        // held by the contract would silently backfill an underwater swap (a real loss), since the
        // flash repayment is pulled from the total balance, not just the swap output.
        repayAmounts = new uint256[](1);
        repayAmounts[0] = amounts[0] + premiums[0];
        if (usdtOut < repayAmounts[0]) revert InsufficientOut(usdtOut, repayAmounts[0]);

        // Approve the flashed vToken to pull back principal + premium.
        IERC20Upgradeable(p.vDebt.underlying()).forceApprove(address(vTokens[0]), repayAmounts[0]);

        emit Liquidated(p.borrower, address(p.vBStock), p.repayAmount, seizedBStock, usdtOut, true);
        return (true, repayAmounts);
    }

    // --------------------------------------------------------------------- //
    //                              Core                                     //
    // --------------------------------------------------------------------- //

    /// @dev Pre-flight: router must be allowlisted and the borrower must have a shortfall.
    function _check(LiquidationParams calldata p) private view {
        if (!isRouter[p.router]) revert RouterNotAllowed(p.router);
        (, , uint256 shortfall) = comptroller.getAccountLiquidity(p.borrower);
        if (shortfall == 0) revert NotLiquidatable(p.borrower);
    }

    /**
     * @dev The atomic sequence shared by both funding modes:
     *      approve debt -> liquidateBorrow (seize vBStock) -> redeem (raw bStock)
     *      -> approve router -> swap to USDT via signed calldata -> assert minOut.
     *      A `calldata` struct from `liquidate` is copied to memory on entry; `executeOperation`
     *      already holds it in memory (decoded from the flash callback).
     * @param p Liquidation parameters.
     * @return usdtOut Debt-asset proceeds realized by the swap (reverts if below `minOut`).
     * @return seizedBStock Raw bStock redeemed and sold (balance delta).
     */
    function _liquidate(LiquidationParams memory p) private returns (uint256 usdtOut, uint256 seizedBStock) {
        IERC20Upgradeable debt = IERC20Upgradeable(p.vDebt.underlying());
        IERC20Upgradeable bStock = IERC20Upgradeable(p.vBStock.underlying());

        // 1. Repay the borrow, seizing the bStock vToken to this contract.
        //    Core has a POOL-WIDE liquidator gate: if `liquidatorContract` is set, a direct
        //    `vToken.liquidateBorrow` reverts UNAUTHORIZED, so we route the repay through that
        //    Venus Liquidator (it pulls our repay and sends us our share of the seized collateral,
        //    treasury keeps a cut). If the gate is unset, we liquidate directly. Either way the
        //    seized amount is read as a BALANCE DELTA, so the Liquidator's cut is handled correctly.
        uint256 vBefore = p.vBStock.balanceOf(address(this));
        address gate = comptroller.liquidatorContract();
        if (gate == address(0)) {
            debt.forceApprove(address(p.vDebt), p.repayAmount);
            uint256 errCode = p.vDebt.liquidateBorrow(p.borrower, p.repayAmount, p.vBStock);
            if (errCode != 0) revert LiquidateBorrowFailed(errCode);
        } else {
            debt.forceApprove(gate, p.repayAmount);
            ILiquidator(gate).liquidateBorrow(address(p.vDebt), p.borrower, p.repayAmount, p.vBStock);
        }
        uint256 seizedV = p.vBStock.balanceOf(address(this)) - vBefore;

        // 2. Redeem the seized vBStock for raw bStock. Measure by DELTA so any pre-existing bStock
        //    (dust or a stray transfer) is excluded — we only sell what this redeem actually returned.
        uint256 rawBefore = bStock.balanceOf(address(this));
        uint256 redeemErr = p.vBStock.redeem(seizedV);
        if (redeemErr != 0) revert RedeemFailed(redeemErr);
        seizedBStock = bStock.balanceOf(address(this)) - rawBefore;

        // 3. Sell the bStock to USDT via the allowlisted Native router (MM-signed calldata).
        uint256 usdtBefore = debt.balanceOf(address(this));
        bStock.forceApprove(p.router, seizedBStock);
        (bool ok, ) = p.router.call(p.swapCalldata);
        if (!ok) revert SwapFailed();
        bStock.forceApprove(p.router, 0); // never leave a standing approval

        usdtOut = debt.balanceOf(address(this)) - usdtBefore;
        if (usdtOut < p.minOut) revert InsufficientOut(usdtOut, p.minOut);
    }
}
