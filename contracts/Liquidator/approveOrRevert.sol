// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/// @notice Thrown if a contract is unable to approve a transfer
error ApproveFailed();

/// @notice Approves a transfer, ensuring that it is successful. This function supports non-compliant
/// tokens like the ones that don't return a boolean value on success. Thus, such approve call supports
/// three different kinds of tokens:
///   * Compliant tokens that revert on failure
///   * Compliant tokens that return false on failure
///   * Non-compliant tokens that don't return a value
/// @param token The contract address of the token which will be transferred
/// @param spender The spender contract address
/// @param amount The value of the transfer
function approveOrRevert(IERC20Upgradeable token, address spender, uint256 amount) {
    bytes memory callData = abi.encodeCall(token.approve, (spender, amount));

    // solhint-disable-next-line avoid-low-level-calls
    (bool success, bytes memory result) = address(token).call(callData);

    if (!success || (result.length != 0 && !abi.decode(result, (bool)))) {
        revert ApproveFailed();
    }
}
