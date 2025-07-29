// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IVToken, IComptroller } from "../InterfacesV8.sol";
import { ISwapHelper } from "./ISwapHelper.sol";

contract CollateralSwapper is Ownable2StepUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice The Comptroller used for permission and liquidity checks.
    IComptroller public immutable COMPTROLLER;

    /// @notice The vToken representing the native asset (e.g., vBNB).
    address public immutable NATIVE_MARKET;

    /// @notice Emitted after a successful swap and mint.
    event CollateralSwapped(address indexed user, address marketFrom, address marketTo, uint256 amountOut);

    /// @notice Emitted when the owner sweeps leftover ERC-20 tokens.
    event SweepToken(address indexed token, address indexed receiver, uint256 amount);

    /// @custom:error Unauthorized Caller is neither the user nor an approved delegate.
    error Unauthorized();

    /// @custom:error SeizeFailed
    error SeizeFailed();

    /// @custom:error RedeemFailed
    error RedeemFailed();

    /// @custom:error MintFailed
    error MintFailed();

    /// @custom:error NoVTokenBalance
    error NoVTokenBalance();

    /// @custom:error ZeroAmount
    error ZeroAmount();

    /// @custom:error NoUnderlyingReceived
    error NoUnderlyingReceived();

    /// @custom:error SwapCausesLiquidation
    error SwapCausesLiquidation();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _comptroller, address _nativeMarket) {
        COMPTROLLER = IComptroller(_comptroller);
        NATIVE_MARKET = _nativeMarket;
        _disableInitializers();
    }

    function initialize() external initializer {
        __Ownable2Step_init();
    }

    /**
     * @notice Accepts native tokens (e.g., BNB) sent to this contract.
     */
    receive() external payable {}

    /**
     * @notice Swaps the full vToken collateral of a user from one market to another.
     * @param user The address whose collateral is being swapped.
     * @param marketFrom The vToken market to seize from.
     * @param marketTo The vToken market to mint into.
     * @param helper The ISwapHelper contract for performing the token swap.
     */
    function swapFullCollateral(
        address user,
        IVToken marketFrom,
        IVToken marketTo,
        ISwapHelper helper
    ) external payable {
        uint256 userBalance = marketFrom.balanceOf(user);
        if (userBalance == 0) revert NoVTokenBalance();
        _swapCollateral(user, marketFrom, marketTo, userBalance, helper);
        emit CollateralSwapped(user, address(marketFrom), address(marketTo), userBalance);
    }

    /**
     * @notice Swaps a specific amount of collateral from one market to another.
     * @param user The address whose collateral is being swapped.
     * @param marketFrom The vToken market to seize from.
     * @param marketTo The vToken market to mint into.
     * @param amountToSwap The amount of vTokens to seize and swap.
     * @param helper The ISwapHelper contract for performing the token swap.
     */
    function swapCollateralWithAmount(
        address user,
        IVToken marketFrom,
        IVToken marketTo,
        uint256 amountToSwap,
        ISwapHelper helper
    ) external payable {
        if (amountToSwap == 0) revert ZeroAmount();
        if (amountToSwap > marketFrom.balanceOf(user)) revert NoVTokenBalance();
        _swapCollateral(user, marketFrom, marketTo, amountToSwap, helper);
        emit CollateralSwapped(user, address(marketFrom), address(marketTo), amountToSwap);
    }

    /**
     * @notice Internal function that performs the full collateral swap process.
     * @param user The address whose collateral is being swapped.
     * @param marketFrom The vToken market from which collateral is seized.
     * @param marketTo The vToken market into which the swapped collateral is minted.
     * @param amountToSeize The amount of vTokens to seize and convert.
     * @param swapHelper The swap helper contract used to perform the token conversion.
     */
    function _swapCollateral(
        address user,
        IVToken marketFrom,
        IVToken marketTo,
        uint256 amountToSeize,
        ISwapHelper swapHelper
    ) internal {
        if (user != msg.sender && !COMPTROLLER.approvedDelegates(user, msg.sender)) {
            revert Unauthorized();
        }
        _checkAccountSafe(user);

        if (marketFrom.seize(address(this), user, amountToSeize) != 0) revert SeizeFailed();

        address toUnderlyingAddress = marketTo.underlying();
        IERC20Upgradeable toUnderlying = IERC20Upgradeable(toUnderlyingAddress);
        uint256 toUnderlyingBalanceBefore = toUnderlying.balanceOf(address(this));

        if (address(marketFrom) == NATIVE_MARKET) {
            uint256 nativeBalanceBefore = address(this).balance;
            if (marketFrom.redeem(amountToSeize) != 0) revert RedeemFailed();

            uint256 receivedNative = address(this).balance - nativeBalanceBefore;
            if (receivedNative == 0) revert NoUnderlyingReceived();

            swapHelper.swapInternal{ value: receivedNative }(address(0), toUnderlyingAddress, receivedNative);
        } else {
            IERC20Upgradeable fromUnderlying = IERC20Upgradeable(marketFrom.underlying());
            uint256 fromUnderlyingBalanceBefore = fromUnderlying.balanceOf(address(this));

            if (marketFrom.redeem(amountToSeize) != 0) revert RedeemFailed();

            uint256 receivedFromToken = fromUnderlying.balanceOf(address(this)) - fromUnderlyingBalanceBefore;
            if (receivedFromToken == 0) revert NoUnderlyingReceived();

            fromUnderlying.safeApprove(address(swapHelper), 0);
            fromUnderlying.safeApprove(address(swapHelper), receivedFromToken);

            swapHelper.swapInternal(address(fromUnderlying), toUnderlyingAddress, receivedFromToken);
        }

        uint256 toUnderlyingBalanceAfter = toUnderlying.balanceOf(address(this));
        uint256 toUnderlyingReceived = toUnderlyingBalanceAfter - toUnderlyingBalanceBefore;
        if (toUnderlyingReceived == 0) revert NoUnderlyingReceived();

        toUnderlying.safeApprove(address(marketTo), 0);
        toUnderlying.safeApprove(address(marketTo), toUnderlyingReceived);
        if (marketTo.mintBehalf(user, toUnderlyingReceived) != 0) revert MintFailed();

        _checkAccountSafe(user);
    }

    /**
     * @notice Allows the owner to sweep leftover ERC-20 tokens from the contract.
     * @param token The token to sweep.
     */
    function sweepToken(IERC20Upgradeable token) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            token.safeTransfer(owner(), balance);
            emit SweepToken(address(token), owner(), balance);
        }
    }

    /**
     * @dev Checks if a user's account is safe post-swap.
     * @param user The address to check.
     */
    function _checkAccountSafe(address user) internal view {
        (uint256 err, , uint256 shortfall) = COMPTROLLER.getAccountLiquidity(user);
        if (err != 0 || shortfall > 0) revert SwapCausesLiquidation();
    }
}
