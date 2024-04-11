// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

// This library is heavily inspired by Uniswap v4 Currency lib
// (https://github.com/Uniswap/v4-core/blob/b230769238879e1d4f58ffa57a4696b0c390d188/src/types/Currency.sol)
// Contrary to the implementation above, this library does not
// use assembly to save gas. It rather relies on OpenZeppelin's
// SafeERC20 to simplify the review and audits. This might change
// in future if it's more heavily used by Venus contracts.

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

type Currency is address;

library CurrencyLibrary {
    using CurrencyLibrary for Currency;

    /// @notice Thrown when a native transfer fails
    error NativeTransferFailed();

    Currency public constant NATIVE = Currency.wrap(0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB);

    /**
     * @dev If currency is a token, invokes SafeERC20.forceApprove to allow spender
     *   to spend the amount of tokens on behalf of the current contract. Otherwise,
     *   does nothing.
     * @param currency Currency
     * @param spender The account approved to spend the tokens
     * @param amount The approved amount
     */
    function approve(Currency currency, address spender, uint256 amount) internal {
        if (!currency.isNative()) {
            // I'd rather use approveOrRevert instead of forceApprove
            // once we migrate to OZ v5: force-approve does approve(0)
            // before approving the amount, and it's not always
            // desirable. The users will need to pay gas unnecessarily,
            // and using just approve() is safe as long as we revert on
            // errors (approveOrRevert handles that) and reset the approvals
            // after transfers (which is a best practice recommended by
            // auditors anyway).
            SafeERC20.forceApprove(IERC20(Currency.unwrap(currency)), spender, amount);
        }
    }

    /**
     * @dev Transfers an amount of currency to the receiver. If currency is a token,
     *   uses SafeERC20.safeTransfer, otherwise transfers the native currency using
     *   the recommended approach (`receiver.call{value: amount}("")`).
     * @param currency Currency
     * @param receiver The account that would receive the tokens
     * @param amount The amount to transfer
     */
    function transfer(Currency currency, address receiver, uint256 amount) internal {
        if (currency.isNative()) {
            (bool success, ) = receiver.call{ value: amount }("");
            if (!success) {
                revert NativeTransferFailed();
            }
        } else {
            SafeERC20.safeTransfer(IERC20(Currency.unwrap(currency)), receiver, amount);
        }
    }

    function transferAll(Currency currency, address receiver) internal {
        uint256 balance = currency.balanceOfSelf();
        if (balance > 0) {
            currency.transfer(receiver, balance);
        }
    }

    function balanceOfSelf(Currency currency) internal view returns (uint256) {
        if (currency.isNative()) {
            return address(this).balance;
        }
        return IERC20(Currency.unwrap(currency)).balanceOf(address(this));
    }

    function isNative(Currency currency) internal pure returns (bool) {
        return Currency.unwrap(currency) == Currency.unwrap(NATIVE);
    }
}
