// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.20;

import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import { IWrappedNative } from "./interfaces/IWrappedNative.sol";
import { INativeTokenGateway, IVToken } from "./INativeTokenGateway.sol";

/**
 * @title NativeTokenGateway
 * @author Venus
 * @notice NativeTokenGateway contract facilitates interactions with a vToken market for native tokens (Native or wrappedNativeToken)
 */
contract NativeTokenGateway is INativeTokenGateway, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /**
     * @notice Address of wrapped ether token contract
     */
    IWrappedNative public immutable wrappedNativeToken;

    /**
     * @notice Constructor for NativeTokenGateway
     * @param WrappedNativeToken_ Address of wrapped ether token contract
     */
    constructor(IWrappedNative WrappedNativeToken_) {
        ensureNonzeroAddress(address(WrappedNativeToken_));
        wrappedNativeToken = WrappedNativeToken_;
    }

    /**
     * @notice To receive Native when msg.data is not empty
     */
    fallback() external payable {}

    /**
     * @notice To receive Native when msg.data is empty
     */
    receive() external payable {}

    /**
     * @notice Wrap Native, get wrappedNativeToken, mint vWETH, and supply to the market.
     * @param vToken The vToken market to interact with.
     * @param minter The address on behalf of whom the supply is performed.
     * @custom:error ZeroAddressNotAllowed is thrown if either vToken or minter address is zero address
     * @custom:error ZeroValueNotAllowed is thrown if mintAmount is zero
     */
    function wrapAndSupply(IVToken vToken, address minter) external payable nonReentrant {
        ensureNonzeroAddress(address(vToken));
        ensureNonzeroAddress(minter);

        uint256 mintAmount = msg.value;
        ensureNonzeroValue(mintAmount);

        wrappedNativeToken.deposit{ value: mintAmount }();
        wrappedNativeToken.approve(address(vToken), mintAmount);

        uint256 err = vToken.mintBehalf(minter, mintAmount);
        if (err != 0) {
            revert MintBehalfFailed(err);
        }

        wrappedNativeToken.approve(address(vToken), 0);
    }

    /**
     * @notice Redeem vWETH, unwrap to ETH, and send to the user
     * @param vToken The vToken market to interact with
     * @param redeemAmount The amount of underlying tokens to redeem
     */
    function redeemUnderlyingAndUnwrap(IVToken vToken, uint256 redeemAmount) external payable {
        ensureNonzeroAddress(address(vToken));
        ensureNonzeroValue(redeemAmount);

        uint256 exchangeRate = vToken.exchangeRateCurrent();

        uint256 redeemTokens = (redeemAmount * 1e18) / exchangeRate;

        uint256 _redeemAmount = (redeemTokens * exchangeRate) / 1e18;
        if (_redeemAmount != 0 && _redeemAmount != redeemAmount) redeemTokens++; // round up

        IERC20(address(vToken)).safeTransferFrom(msg.sender, address(this), redeemTokens);

        uint256 balanceBefore = wrappedNativeToken.balanceOf(address(this));

        uint256 err = vToken.redeem(redeemTokens);
        if (err != 0) {
            revert RedeemFailed(err);
        }

        uint256 balanceAfter = wrappedNativeToken.balanceOf(address(this));

        uint256 nativeTokenBalanceBefore = address(this).balance;
        wrappedNativeToken.withdraw(balanceAfter - balanceBefore);
        uint256 nativeTokenBalanceAfter = address(this).balance;

        _safeTransferETH(msg.sender, nativeTokenBalanceAfter - nativeTokenBalanceBefore);
    }

    /**
     * @dev Borrow wrappedNativeToken, unwrap to Native, and send to the user
     * @param vToken The vToken market to interact with
     * @param borrower Address of the borrower
     * @param amount The amount of underlying tokens to borrow
     */
    function borrowAndUnwrap(IVToken vToken, address borrower, uint256 amount) external nonReentrant {
        ensureNonzeroAddress(address(vToken));
        ensureNonzeroAddress(borrower);
        ensureNonzeroValue(amount);

        uint256 balanceBeforeBorrow = wrappedNativeToken.balanceOf(address(this));

        uint256 err = vToken.borrowBehalf(borrower, amount);
        if (err != 0) {
            revert BorrowBehalfFailed(err);
        }
        uint256 balanceAfterBorrow = wrappedNativeToken.balanceOf(address(this));

        uint256 borrowedAmount = balanceAfterBorrow - balanceBeforeBorrow;
        if (borrowedAmount > 0) {
            wrappedNativeToken.withdraw(borrowedAmount);
            _safeTransferETH(borrower, borrowedAmount);
        }
    }

    /**
     * @notice Wrap Native, repay borrow in the market, and send remaining Native to the user
     * @param vToken The vToken market to interact with
     * @custom:error ZeroAddressNotAllowed is thrown if either vToken address is zero address
     * @custom:error ZeroValueNotAllowed is thrown if repayAmount is zero
     */
    function wrapAndRepay(IVToken vToken) external payable nonReentrant {
        ensureNonzeroAddress(address(vToken));

        uint256 repayAmount = msg.value;
        ensureNonzeroValue(repayAmount);

        wrappedNativeToken.deposit{ value: repayAmount }();
        wrappedNativeToken.approve(address(vToken), repayAmount);

        uint256 borrowBalanceBefore = vToken.borrowBalanceCurrent(msg.sender);

        uint256 err = vToken.repayBorrowBehalf(msg.sender, repayAmount);
        if (err != 0) {
            revert RepayBorrowBehalfFailed(err);
        }

        uint256 borrowBalanceAfter = vToken.borrowBalanceCurrent(msg.sender);

        if (borrowBalanceAfter == 0 && (repayAmount > borrowBalanceBefore)) {
            uint256 dust = repayAmount - borrowBalanceBefore;

            wrappedNativeToken.withdraw(dust);
            _safeTransferETH(msg.sender, dust);
        }
    }

    /**
     * @notice Sweeps native assets (Native) from the contract and sends them to the owner
     * @custom:access Controller by Governance
     */
    function sweepNative() external payable onlyOwner {
        uint256 balance = address(this).balance;

        if (balance > 0) {
            _safeTransferETH((owner()), balance);
            emit SweepNative((owner()), balance);
        }
    }

    /**
     * @notice Sweeps wrappedNativeToken tokens from the contract and sends them to the owner
     * @custom:event SweepToken emits on success
     * @custom:access Controller by Governance
     */
    function sweepToken() external onlyOwner {
        uint256 balance = wrappedNativeToken.balanceOf(address(this));

        if (balance > 0) {
            IERC20(address(wrappedNativeToken)).safeTransfer(owner(), balance);
            emit SweepToken(owner(), balance);
        }
    }

    /**
     * @dev transfer Native to an address, revert if it fails
     * @param to recipient of the transfer
     * @param value the amount to send
     * @custom:error NativeTokenTransferFailed is thrown if the eth transfer fails
     */
    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{ value: value }(new bytes(0));

        if (!success) {
            revert NativeTokenTransferFailed();
        }
    }

    /**
     * @dev Checks if the provided address is nonzero, reverts otherwise
     * @param address_ Address to check
     * @custom:error ZeroAddressNotAllowed is thrown if the provided address is a zero address
     **/
    function ensureNonzeroAddress(address address_) internal pure {
        if (address_ == address(0)) {
            revert ZeroAddressNotAllowed();
        }
    }

    /**
     * @dev Checks if the provided value is nonzero, reverts otherwise
     * @param value_ Value to check
     * @custom:error ZeroValueNotAllowed is thrown if the provided value is 0
     */
    function ensureNonzeroValue(uint256 value_) internal pure {
        if (value_ == 0) {
            revert ZeroValueNotAllowed();
        }
    }
}
