pragma solidity ^0.5.16;

contract VRTConversionAdminStorage {
    /**
    * @notice Administrator for this contract
    */
    address public admin;

    /**
    * @notice Pending administrator for this contract
    */
    address public pendingAdmin;

    /**
    * @notice Active brains of VRTConversion
    */
    address public implementation;

    /**
    * @notice Pending brains of VRTConversion
    */
    address public pendingImplementation;
}

contract VRTConversionV1Storage is VRTConversionAdminStorage {

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;

    /**
     * @notice Conversion ratio from token A to token B with decimal 18
     */
    mapping(address => mapping(address => uint)) public conversionRatio;

    /**
     * @notice Conversion available cycle timestamp from token A to token B
     */
    mapping(address => mapping(address => uint)) public conversionCycle;
}
