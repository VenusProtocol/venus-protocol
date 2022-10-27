pragma solidity ^0.5.16;

import "./ComptrollerInterface.sol";

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

    /**
     * @notice The base rate for stability fee
     */
    uint public baseRateMantissa;

    /**
     * @notice The float rate for stability fee
     */
    uint public floatRateMantissa;

    /**
     * @notice The address for VAI receiver
     */
    address public receiver;

    /**
     * @notice The last updated VAI repay rate index. For example: 1.64 (= 164%).
     */
    uint vaiInterestIndex;

    // @notice The block number when vaiInterestIndex was updated
    uint vaiInterestBlockNumber;

    // @notice The VAI mint index of minter during mint
    mapping (address => uint) vaiMinterInterestIndex;
}
