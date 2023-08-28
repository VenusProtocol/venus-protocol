// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.13;

import "../interfaces/CustomErrors.sol";

// helper methods for interacting with ERC20 tokens and sending ETH that do not consistently return true/false
library TransferHelper {
    /**
     * @dev `value` as the allowance of `spender` over the caller's tokens.
     * @param token Address of the token
     * @param to Address of the spender
     * @param value Amount as allowance
     */
    function safeApprove(address token, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('approve(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x095ea7b3, to, value));
        if (!(success && (data.length == 0 || abi.decode(data, (bool))))) {
            revert SafeApproveFailed();
        }
    }

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     * @param token Address of the token
     * @param to Address of the receiver
     * @param value Amount need to transfer
     */
    function safeTransfer(address token, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('transfer(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        if (!(success && (data.length == 0 || abi.decode(data, (bool))))) {
            revert SafeTransferFailed();
        }
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     * @param token Address of the token
     * @param from Address of the asset'sowner
     * @param to Address of the receiver
     * @param value Amount need to transfer
     */
    function safeTransferFrom(address token, address from, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        if (!(success && (data.length == 0 || abi.decode(data, (bool))))) {
            revert SafeTransferFromFailed();
        }
    }

    /**
     * @dev Transfer `value` amount of `BNB` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     * @param to Address of the receiver
     * @param value Amount need to transfer
     */
    function safeTransferBNB(address to, uint256 value) internal {
        (bool success, ) = to.call{ value: value }(new bytes(0));
        if (!success) {
            revert SafeTransferBNBFailed();
        }
    }
}
