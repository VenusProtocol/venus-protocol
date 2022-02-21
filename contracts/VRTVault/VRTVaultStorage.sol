pragma solidity ^0.5.16;
import "../Utils/SafeMath.sol";
import "../Utils/IBEP20.sol";

contract VRTVaultAdminStorage {
    /**
    * @notice Administrator for this contract
    */
    address public proxyAdmin;

    /**
    * @notice Pending administrator for this contract
    */
    address public pendingProxyAdmin;

    /**
    * @notice Active brains of VRT Vault
    */
    address public vrtVaultImplementation;

    /**
    * @notice Pending brains of VAI Vault
    */
    address public pendingVRTVaultImplementation;
}

contract VRTVaultStorage is VRTVaultAdminStorage {

    /// @notice The VRT TOKEN!
    IBEP20 public vrt;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;

    /// @notice interestRate for accrual - per Block
    uint256 public interestRatePerBlock;

    /// @notice Info of each user.
    struct UserInfo {
        address userAddress;
        uint256 accrualStartBlockNumber;
        uint256 totalInterestAmount;
        uint256 totalPrincipalAmount;
        uint256 totalWithdrawnAmount;
        uint256 lastWithdrawnBlockNumber;
    }

    // Info of each user that stakes tokens.
    mapping(address => UserInfo) public userInfo;
}
