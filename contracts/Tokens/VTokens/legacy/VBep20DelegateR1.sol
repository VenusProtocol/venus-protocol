pragma solidity ^0.5.16;

import "../VTokenInterfaces.sol";
import { VBep20R1 } from "./VBep20R1.sol";
import { VDelegateInterface } from "./VTokenInterfaceR1.sol";

/**
 * @title Venus's VBep20Delegate Contract
 * @notice VTokens which wrap an EIP-20 underlying and are delegated to
 * @author Venus
 */
contract VBep20DelegateR1 is VBep20R1, VDelegateInterface {
    /**
     * @notice Construct an empty delegate
     */
    constructor() public {}

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
