pragma solidity ^0.5.16;

import "../Utils/SafeMath.sol";
import "../Utils/IBEP20.sol";
import "./IXVSVesting.sol";

contract VRTConverterAdminStorage {
    /**
    * @notice Administrator for this contract
    */
    address public admin;

    /**
    * @notice Pending administrator for this contract
    */
    address public pendingAdmin;

    /**
    * @notice Active brains of VRTConverter
    */
    address public implementation;

    /**
    * @notice Pending brains of VRTConverter
    */
    address public pendingImplementation;
}

contract VRTConverterStorage is VRTConverterAdminStorage {

    /// @notice Guard variable for re-entrancy checks
    bool public _notEntered;

    /// @notice The VRT TOKEN!
    IBEP20 public vrt;

    /// @notice The XVS TOKEN!
    IBEP20 public xvs;

    /// @notice XVSVesting Contract reference
    IXVSVesting public xvsVesting;

    /// @notice Conversion ratio from VRT to XVS with decimal 18
    uint256 public conversionRatio;

    /// @notice Conversion ratio from VRT to XVS with decimal 18
    uint256 public totalVrtConverted;

    /// @notice Conversion Start time in EpochSeconds
    uint256 public conversionStartTime;

    /// @notice ConversionPeriod in Seconds
    uint256 public conversionPeriod;

    /// @notice Conversion End time in EpochSeconds
    uint256 public conversionEndTime;
}