// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.13;

import "../interfaces/CustomErrors.sol";

// helper methods for interacting with ERC20 tokens and sending ETH that do not consistently return true/false
library TransferHelper {
    function safeApprove(address token, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('approve(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x095ea7b3, to, value));
        if (!(success && (data.length == 0 || abi.decode(data, (bool))))) {
            revert SafeApproveFailed();
        }
    }

    function safeTransfer(address token, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('transfer(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        if (!(success && (data.length == 0 || abi.decode(data, (bool))))) {
            revert SafeTransferFailed();
        }
    }

    function safeTransferFrom(address token, address from, address to, uint256 value) internal {
        // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        if (!(success && (data.length == 0 || abi.decode(data, (bool))))) {
            revert TransferFromFailed();
        }
    }

    function safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{ value: value }(new bytes(0));
        if (!success) {
            revert SafeTransferETHFailed();
        }
    }
}
