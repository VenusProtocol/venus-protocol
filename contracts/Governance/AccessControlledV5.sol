// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.5.16;

import "./IAccessControlManagerV5.sol";

/**
 * @title Venus Access Control Contract.
 * @dev This contract is helper between access control manager and actual contract
 * This contract further inherited by other contract to integrate access controlled mechanism
 * It provides initialise methods and verifying access methods
 */

contract AccessControlledV5 {
    /// @notice Access control manager contract
    IAccessControlManagerV5 private _accessControlManager;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    /// @notice Emitted when access control manager contract address is changed
    event NewAccessControlManager(address oldAccessControlManager, address newAccessControlManager);

    /**
     * @notice Returns the address of the access control manager contract
     */
    function accessControlManager() external view returns (IAccessControlManagerV5) {
        return _accessControlManager;
    }

    /**
     * @dev Internal function to set address of AccessControlManager
     * @param accessControlManager_ The new address of the AccessControlManager
     */
    function _setAccessControlManager(address accessControlManager_) internal {
        require(address(accessControlManager_) != address(0), "invalid acess control manager address");
        address oldAccessControlManager = address(_accessControlManager);
        _accessControlManager = IAccessControlManagerV5(accessControlManager_);
        emit NewAccessControlManager(oldAccessControlManager, accessControlManager_);
    }

    /**
     * @notice Reverts if the call is not allowed by AccessControlManager
     * @param signature Method signature
     */
    function _checkAccessAllowed(string memory signature) internal view {
        bool isAllowedToCall = _accessControlManager.isAllowedToCall(msg.sender, signature);

        if (!isAllowedToCall) {
            revert("Unauthorized");
        }
    }
}
