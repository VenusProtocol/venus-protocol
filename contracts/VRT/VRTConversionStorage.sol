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

    /// @notice VRTToken Address
    address public vrtAddresses;

    /// @notice decimal precision for VRT
    uint public vrtDecimals;
    
    /// @notice XVSToken address
    address public xvsAddress;

    /// @notice decimal precision for XVS
    uint public xvsDecimals;

    /**
     * @notice Conversion ratio from VRT to XVS with decimal 18
     */
     uint256 public conversionRatio;

    /**
     * @notice timestamp from which VRT to XVS is allowed
     */
    uint256 public conversionStartTime;
}
