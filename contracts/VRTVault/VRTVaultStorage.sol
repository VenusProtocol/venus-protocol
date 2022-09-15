pragma solidity ^0.5.16;
import "../Utils/SafeMath.sol";
import "../Utils/IBEP20.sol";

contract VRTVaultAdminStorage {
    /**
    * @notice Administrator for this contract
    */
    address public admin;

    /**
    * @notice Pending administrator for this contract
    */
    address public pendingAdmin;

    /**
    * @notice Active brains of VRT Vault
    */
    address public implementation;

    /**
    * @notice Pending brains of VAI Vault
    */
    address public pendingImplementation;
}

contract VRTVaultStorage is VRTVaultAdminStorage {

    /// @notice Guard variable for re-entrancy checks
    bool public _notEntered;

    /// @notice pause indicator for Vault
    bool public vaultPaused;

    /// @notice The VRT TOKEN!
    IBEP20 public vrt;

    /// @notice interestRate for accrual - per Block
    uint256 public interestRatePerBlock;

    /// @notice Info of each user.
    struct UserInfo {
        address userAddress;
        uint256 accrualStartBlockNumber;
        uint256 totalPrincipalAmount;
        uint256 lastWithdrawnBlockNumber;
    }

    // Info of each user that stakes tokens.
    mapping(address => UserInfo) public userInfo;
}
