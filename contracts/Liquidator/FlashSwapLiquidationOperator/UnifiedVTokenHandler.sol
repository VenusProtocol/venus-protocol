// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { IWBNB } from "../../Swap/interfaces/IWBNB.sol";
import { IVToken, IVBep20, IVBNB } from "../Interfaces.sol";

/**
 * @title UnifiedVTokenHandler
 * @author Venus
 * @notice Helper contract to handle vTokens, encapsulating the differences between a vToken
 * working with a native asset and vTokens handling ERC-20 underlyings. Automatically wraps
 * native asset into a wrapped token. The inheriting contract MUST implement the receive()
 * function.
 */
contract UnifiedVTokenHandler {
    IVBNB public immutable vNative;
    IWBNB public immutable wrappedNative;

    error RedeemFailed(uint256 errorCode);

    /// @param vNative_ The vToken representing the native asset
    /// @param wrappedNative_ The wrapped native asset
    constructor(IVBNB vNative_, IWBNB wrappedNative_) {
        // Zero addresses are allowed intentionally. In case the params are zero,
        // the contract will only work with token-based vTokens, which may be desired
        // since we're sunsetting vNative.
        vNative = vNative_;
        wrappedNative = wrappedNative_;
    }

    /// @dev Redeems the given amount of vTokens and wraps the native asssets into wrapped
    /// tokens if necessary. Returns the actually received amount.
    /// @param vToken The vToken to redeem
    /// @param vTokenAmount The amount of vTokens to redeem
    /// @return The amount of underlying tokens received
    function _redeem(IVToken vToken, uint256 vTokenAmount) internal returns (uint256) {
        if (address(vToken) == address(vNative)) {
            return _wrap(_redeemNative(vTokenAmount));
        } else {
            return _redeemTokens(IVBep20(address(vToken)), vTokenAmount);
        }
    }

    /// @dev Wraps the given amount of native asset into wrapped tokens
    /// @param amount The amount of native asset to wrap
    /// @return The amount of wrapped tokens received
    function _wrap(uint256 amount) internal returns (uint256) {
        uint256 wrappedNativeBalanceBefore = wrappedNative.balanceOf(address(this));
        wrappedNative.deposit{ value: amount }();
        return wrappedNative.balanceOf(address(this)) - wrappedNativeBalanceBefore;
    }

    /// @dev Returns the either the underlying token or the wrapped native token if
    /// the vToken works with native asset
    /// @param vToken The vToken to get the underlying token for
    /// @return The underlying token
    function _underlying(IVToken vToken) internal view returns (IERC20Upgradeable) {
        if (address(vToken) == address(vNative)) {
            return IERC20Upgradeable(address(wrappedNative));
        } else {
            return IERC20Upgradeable(IVBep20(address(vToken)).underlying());
        }
    }

    /// @dev Redeems ERC-20 tokens from the given vToken
    /// @param vToken The vToken to redeem tokens from
    /// @param vTokenAmount The amount of vTokens to redeem
    /// @return The amount of underlying tokens received
    function _redeemTokens(IVBep20 vToken, uint256 vTokenAmount) private returns (uint256) {
        IERC20Upgradeable underlying = IERC20Upgradeable(vToken.underlying());
        uint256 underlyingBalanceBefore = underlying.balanceOf(address(this));
        uint256 errorCode = vToken.redeem(vTokenAmount);
        if (errorCode != 0) {
            revert RedeemFailed(errorCode);
        }
        return underlying.balanceOf(address(this)) - underlyingBalanceBefore;
    }

    /// @dev Redeems native asset from the given vToken. The inheriting contract MUST
    /// implement the receive() function for this to work.
    /// @param vTokenAmount The amount of vTokens to redeem
    /// @return The amount of native asset received
    function _redeemNative(uint256 vTokenAmount) private returns (uint256) {
        uint256 underlyingBalanceBefore = address(this).balance;
        vNative.redeem(vTokenAmount);
        return address(this).balance - underlyingBalanceBefore;
    }
}
