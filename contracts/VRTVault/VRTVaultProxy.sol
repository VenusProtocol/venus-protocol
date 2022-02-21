pragma solidity ^0.5.16;

import "./VRTVaultStorage.sol";

contract VRTVaultProxy is VRTVaultAdminStorage {

    /**
      * @notice Emitted when pendingVRTVaultImplementation is changed
      */
    event NewPendingImplementation(address oldPendingImplementation, address newPendingImplementation);

    /**
      * @notice Emitted when pendingVRTVaultImplementation is accepted, which means VRT Vault implementation is updated
      */
    event NewImplementation(address oldImplementation, address newImplementation);

    /**
      * @notice Emitted when pendingAdmin is changed
      */
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /**
      * @notice Emitted when pendingAdmin is accepted, which means admin is updated
      */
    event NewAdmin(address oldAdmin, address newAdmin);

    constructor(address implementation_, address vrtAddress_, uint256 interestRatePerBlock_) public {
        // Creator of the contract is admin during initialization
        proxyAdmin = msg.sender;

        // First delegate gets to initialize the delegator (i.e. storage contract)
        delegateTo(implementation_, abi.encodeWithSignature("initialize(address,uint256)",
                                                            vrtAddress_,
                                                            interestRatePerBlock_));

        // New implementations always get set via the settor (post-initialize)
        _setPendingImplementation(implementation_);
    }

    /**
      * @notice Internal method to delegate execution to another contract
      * @dev It returns to the external caller whatever the implementation returns or forwards reverts
      * @param callee The contract to delegatecall
      * @param data The raw data to delegatecall
      * @return The returned bytes from the delegatecall
     */
    function delegateTo(address callee, bytes memory data) internal returns (bytes memory) {
        (bool success, bytes memory returnData) = callee.delegatecall(data);
        assembly {
            if eq(success, 0) {
                revert(add(returnData, 0x20), returndatasize)
            }
        }
        return returnData;
    }

    /*** Admin Functions ***/
    function _setPendingImplementation(address newPendingImplementation) public {

        require(msg.sender == proxyAdmin, "Only admin can set Pending Implementation");

        address oldPendingImplementation = pendingVRTVaultImplementation;

        pendingVRTVaultImplementation = newPendingImplementation;

        emit NewPendingImplementation(oldPendingImplementation, pendingVRTVaultImplementation);
    }

    /**
    * @notice Accepts new implementation of VRT Vault. msg.sender must be pendingImplementation
    * @dev Admin function for new implementation to accept it's role as implementation
    * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
    */
    function _acceptImplementation() public {
        // Check caller is pendingImplementation
        require(msg.sender == pendingVRTVaultImplementation, "only address marked as pendingImplementation can accept Implementation");

        // Save current values for inclusion in log
        address oldImplementation = vrtVaultImplementation;
        address oldPendingImplementation = pendingVRTVaultImplementation;

        vrtVaultImplementation = pendingVRTVaultImplementation;

        pendingVRTVaultImplementation = address(0);

        emit NewImplementation(oldImplementation, vrtVaultImplementation);
        emit NewPendingImplementation(oldPendingImplementation, pendingVRTVaultImplementation);
    }


    /**
      * @notice Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
      * @dev Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
      * @param newPendingProxyAdmin New pending admin.
      * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
      */
    function _setPendingAdmin(address newPendingProxyAdmin) public {
        // Check caller = admin
        require(msg.sender == proxyAdmin, "only admin can set pending admin");

        // Save current value, if any, for inclusion in log
        address oldPendingProxyAdmin = pendingProxyAdmin;

        // Store pendingAdmin with value newPendingAdmin
        pendingProxyAdmin = newPendingProxyAdmin;

        // Emit NewPendingAdmin(oldPendingAdmin, newPendingAdmin)
        emit NewPendingAdmin(oldPendingProxyAdmin, newPendingProxyAdmin);
    }

    /**
      * @notice Accepts transfer of admin rights. msg.sender must be pendingAdmin
      * @dev Admin function for pending admin to accept role and update admin
      * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
      */
    function _acceptAdmin() public {
        // Check caller is pendingAdmin
        require(msg.sender == pendingProxyAdmin, "only address marked as pendingAdmin can accept as Admin");
        
        // Save current values for inclusion in log
        address oldProxyAdmin = proxyAdmin;
        address oldPendingProxyAdmin = pendingProxyAdmin;

        // Store admin with value pendingAdmin
        proxyAdmin = pendingProxyAdmin;

        // Clear the pending value
        pendingProxyAdmin = address(0);

        emit NewAdmin(oldProxyAdmin, proxyAdmin);
        emit NewPendingAdmin(oldPendingProxyAdmin, pendingProxyAdmin);
    }

    /**
     * @dev Delegates execution to an implementation contract.
     * It returns to the external caller whatever the implementation returns
     * or forwards reverts.
     */
    function () external payable {
        // delegate all other functions to current implementation
        (bool success, ) = vrtVaultImplementation.delegatecall(msg.data);

        assembly {
              let free_mem_ptr := mload(0x40)
              returndatacopy(free_mem_ptr, 0, returndatasize)

              switch success
              case 0 { revert(free_mem_ptr, returndatasize) }
              default { return(free_mem_ptr, returndatasize) }
        }
    }
}
