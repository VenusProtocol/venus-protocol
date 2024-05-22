pragma solidity ^0.5.16;

import { ComptrollerInterface } from "../../Comptroller/ComptrollerInterface.sol";

contract VAIUnitrollerAdminStorage {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     * @notice Pending administrator for this contract
     */
    address public pendingAdmin;

    /**
     * @notice Active brains of Unitroller
     */
    address public vaiControllerImplementation;

    /**
     * @notice Pending brains of Unitroller
     */
    address public pendingVAIControllerImplementation;
}

contract VAIControllerStorageG1 is VAIUnitrollerAdminStorage {
    ComptrollerInterface public comptroller;

    struct VenusVAIState {
        /// @notice The last updated venusVAIMintIndex
        uint224 index;
        /// @notice The block number the index was last updated at
        uint32 block;
    }

    /// @notice The Venus VAI state
    VenusVAIState public venusVAIState;

    /// @notice The Venus VAI state initialized
    bool public isVenusVAIInitialized;

    /// @notice The Venus VAI minter index as of the last time they accrued XVS
    mapping(address => uint256) public venusVAIMinterIndex;
}

contract VAIControllerStorageG2 is VAIControllerStorageG1 {
    /// @notice Treasury Guardian address
    address public treasuryGuardian;

    /// @notice Treasury address
    address public treasuryAddress;

    /// @notice Fee percent of accrued interest with decimal 18
    uint256 public treasuryPercent;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;

    /// @notice The base rate for stability fee
    uint256 public baseRateMantissa;

    /// @notice The float rate for stability fee
    uint256 public floatRateMantissa;

    /// @notice The address for VAI interest receiver
    address public receiver;

    /// @notice Accumulator of the total earned interest rate since the opening of the market. For example: 0.6 (60%)
    uint256 public vaiMintIndex;

    /// @notice Block number that interest was last accrued at
    uint256 internal accrualBlockNumber;

    /// @notice Global vaiMintIndex as of the most recent balance-changing action for user
    mapping(address => uint256) internal vaiMinterInterestIndex;

    /// @notice Tracks the amount of mintedVAI of a user that represents the accrued interest
    mapping(address => uint256) public pastVAIInterest;

    /// @notice VAI mint cap
    uint256 public mintCap;

    /// @notice Access control manager address
    address public accessControl;
}

contract VAIControllerStorageG3 is VAIControllerStorageG2 {
    /// @notice The address of the prime contract. It can be a ZERO address
    address public prime;

    /// @notice Tracks if minting is enabled only for prime token holders. Only used if prime is set
    bool public mintEnabledOnlyForPrimeHolder;
}

contract VAIControllerStorageG4 is VAIControllerStorageG3 {
    /// @notice The address of the VAI token
    address internal vai;
}
