// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { VBep20 } from "./VBep20.sol";
import { VDelegateInterface } from "./VTokenInterfaces.sol";

/**
 * @title Venus's VBep20Delegate Contract
 * @notice VTokens which wrap an EIP-20 underlying and are delegated to
 * @author Venus
 */
contract VBep20Delegate is VBep20, VDelegateInterface {
    /**
     * @notice Construct an empty delegate
     */
    constructor() {}

    /**
     * @notice Called by the delegator on a delegate to initialize it for duty
     * @param data The encoded bytes data for any initialization
     */
    function _becomeImplementation(bytes memory data) public {
        // Shh -- currently unused
        data;

        // Shh -- we don't ever want this hook to be marked pure
        if (false) {
            implementation = address(0);
        }

        require(msg.sender == admin, "only the admin may call _becomeImplementation");
    }

    /**
     * @notice Called by the delegator on a delegate to forfeit its responsibility
     */
    function _resignImplementation() public {
        // Shh -- we don't ever want this hook to be marked pure
        if (false) {
            implementation = address(0);
        }

        require(msg.sender == admin, "only the admin may call _resignImplementation");
    }
}
