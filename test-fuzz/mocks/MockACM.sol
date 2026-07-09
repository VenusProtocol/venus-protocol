// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/// @notice Always-allow AccessControlManager stand-in. XVSVault's
/// AccessControlledV5._checkAccessAllowed calls only
/// `isAllowedToCall(address,string)`, so this single selector is all that is
/// required. Gating correctness itself is verified on-chain (see the security
/// report); here we simply let the admin wiring/handlers exercise the logic.
contract MockACM {
    function isAllowedToCall(address, string calldata) external pure returns (bool) {
        return true;
    }
}
