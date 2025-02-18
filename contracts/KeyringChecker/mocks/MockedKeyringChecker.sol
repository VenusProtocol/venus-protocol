// SPDX-License-Identifier: MIT

pragma solidity =0.8.19;

import { IKeyringChecker } from "../IKeyringChecker.sol";

/// @title Mocked Keyring Checker
/// @notice A mock implementation of IKeyringChecker for testing purposes
contract MockedKeyringChecker is IKeyringChecker {
    /// @notice Whether to allow the user or not.
    bool public allow = false;

    /// @notice Sets the allow flag.
    /// @param _allow Whether to allow the user or not.
    function setAllow(bool _allow) external {
        allow = _allow;
    }

    /// @notice Checks if the user satisfies the policy.
    /// @param policyId The policy ID to check against (unused in mock).
    /// @param entity The address to check.
    /// @return result True if the user satisfies the policy, false otherwise.
    /* solhint-disable-next-line no-unused-vars */
    function checkCredential(uint256 policyId, address entity) external view returns (bool) {
        return allow;
    }
}
