pragma solidity ^0.5.16;

import { Comptroller } from "../../Comptroller/Comptroller.sol";

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
    Comptroller public comptroller;

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
    mapping(address => uint) public venusVAIMinterIndex;
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
    uint public baseRateMantissa;

    /// @notice The float rate for stability fee
    uint public floatRateMantissa;

    /// @notice The address for VAI interest receiver
    address public receiver;

    /// @notice Accumulator of the total earned interest rate since the opening of the market. For example: 0.6 (60%)
    uint public vaiMintIndex;

    /// @notice Block number that interest was last accrued at
    uint internal accrualBlockNumber;

    /// @notice Global vaiMintIndex as of the most recent balance-changing action for user
    mapping(address => uint) internal vaiMinterInterestIndex;

    /// @notice Tracks the amount of mintedVAI of a user that represents the accrued interest
    mapping(address => uint) public pastVAIInterest;

    /// @notice VAI mint cap
    uint public mintCap;

    /// @notice Access control manager address
    address public accessControl;
}
