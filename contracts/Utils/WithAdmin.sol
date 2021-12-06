pragma solidity ^0.5.16;


contract WithAdmin {
    /// @notice Current admin address
    address public admin;

    /// @notice The one who can become admin by calling _acceptAdmin
    address public pendingAdmin;

    /// @notice Emitted when pendingAdmin is changed
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /// @notice Emitted when pendingAdmin is accepted, which means admin is updated
    event NewAdmin(address oldAdmin, address newAdmin);

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     */
    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin allowed");
        _;
    }

    constructor(address admin_) internal {
        admin = admin_;
        pendingAdmin = address(0);
    }

    /**
      * @notice Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
      * @dev Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
      * @param newPendingAdmin New pending admin.
      */
    function _setPendingAdmin(address newPendingAdmin) external onlyAdmin {
        emit NewPendingAdmin(pendingAdmin, newPendingAdmin);
        pendingAdmin = newPendingAdmin;
    }

    /**
      * @notice Accepts transfer of admin rights. msg.sender must be pendingAdmin
      * @dev Admin function for pending admin to accept role and update admin
      */
    function _acceptAdmin() external {
        require(msg.sender == pendingAdmin, "only pending admin allowed");

        emit NewPendingAdmin(pendingAdmin, address(0));
        emit NewAdmin(admin, pendingAdmin);

        admin = pendingAdmin;
        pendingAdmin = address(0);
    }
}
