pragma solidity ^0.5.16;
import "../Utils/SafeMath.sol";
import "../Utils/IBEP20.sol";

contract XVSVaultAdminStorage {
    /**
    * @notice Administrator for this contract
    */
    address public admin;

    /**
    * @notice Pending administrator for this contract
    */
    address public pendingAdmin;

    /**
    * @notice Active brains of XVS Vault
    */
    address public xvsVaultImplementation;

    /**
    * @notice Pending brains of XVS Vault
    */
    address public pendingXVSVaultImplementation;
}

contract XVSVaultStorage is XVSVaultAdminStorage {
    /// @notice The XVS TOKEN!
    IBEP20 public xvs;

    /// @notice The XVS Store
    address public xvsStore;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;

    /// @notice XVS balance of vault
    uint256 public xvsBalance;

    //// pending rewards awaiting anyone to massUpdate
    uint256 public pendingRewards;

    /// @notice Info of each user.
    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    // Info of each pool.
    struct PoolInfo {
        IBEP20 token;             // Address of token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool.
        uint256 accXVSPerShare;   // Accumulated XVSs per share, times 1e12. See below.
    }

    // Info of each user that stakes tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    // Info of each pool.
    PoolInfo[] public poolInfo;

    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
}
