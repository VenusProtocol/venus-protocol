pragma solidity ^0.5.16;

import "../Utils/IBEP20.sol";
import "../Utils/SafeBEP20.sol";
import "./IXVSVesting.sol";
import "./VRTConverterStorage.sol";
import "./VRTConverterProxy.sol";

/**
 * @title Venus's VRTConversion Contract
 * @author Venus
 */
contract VRTConverter is VRTConverterStorage {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice decimal precision for VRT
    uint256 public constant vrtDecimalsMultiplier = 10**18;

    /// @notice decimal precision for XVS
    uint256 public constant xvsDecimalsMultiplier = 10**18;

    /// @notice Emitted when an admin set conversion info
    event ConversionInfoSet(uint256 conversionRatio, uint256 conversionStartTime, uint256 conversionPeriod, uint256 conversionEndTime);

    /// @notice Emitted when token conversion is done
    event TokenConverted(address reedeemer, address vrtAddress, uint256 vrtAmount, address xvsAddress, uint256 xvsAmount);

    /// @notice Emitted when an admin withdraw converted token
    event TokenWithdraw(address token, address to, uint256 amount);

    /// @notice Emitted when XVSVestingAddress is set
    event XVSVestingSet(address xvsVestingAddress);

    constructor() public {
        admin = msg.sender;
    }

    function initialize(address _vrtAddress,
                address _xvsAddress,
                uint256 _conversionRatio,
                uint256 _conversionStartTime,
                uint256 _conversionPeriod) public {
        require(msg.sender == admin, "only admin may initialize the Vault");

        require(_vrtAddress != address(0), "vrtAddress cannot be Zero");
        vrt = IBEP20(_vrtAddress);
        
        require(_xvsAddress != address(0), "xvsAddress cannot be Zero");
        xvs = IBEP20(_xvsAddress);
        
        require(_conversionRatio > 0, "conversionRatio cannot be Zero");
        conversionRatio = _conversionRatio;

        require(_conversionStartTime >= block.timestamp, "conversionStartTime must be time in the future");
        require(_conversionPeriod > 0, "_conversionPeriod is invalid");

        conversionStartTime = _conversionStartTime;
        conversionPeriod = _conversionPeriod;
        conversionEndTime = conversionStartTime.add(conversionPeriod);
        emit ConversionInfoSet(conversionRatio, conversionStartTime, conversionPeriod, conversionEndTime);
        
        totalVrtConverted = 0;
        _notEntered = true;
    }

    /**
     * @notice sets XVSVestingProxy Address
     * @dev Note: If XVSVestingProxy is not set, then Conversion is not allowed
     * @param _xvsVestingAddress The XVSVestingProxy Address
     */
    function setXVSVesting(address _xvsVestingAddress) public {
        require(msg.sender == admin, "only admin may initialize the Vault");
        require(_xvsVestingAddress != address(0), "xvsVestingAddress cannot be Zero");
        xvsVesting = IXVSVesting(_xvsVestingAddress);
        emit XVSVestingSet(_xvsVestingAddress);
    }

    modifier isInitialized() {
        require(address(xvsVesting) != address(0), "VRTConverter is not initialized");
        _;
    }

    function isConversionActive() public view returns(bool) {
        uint256 currentTime = block.timestamp;
        if(currentTime >= conversionStartTime && currentTime <= conversionEndTime){
            return true;
        }
        return false;
    }

    modifier checkForActiveConversionPeriod(){
        uint256 currentTime = block.timestamp;
        require(currentTime >= conversionStartTime, "Conversion did not start yet");
        require(currentTime <= conversionEndTime, "Conversion Period Ended");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    modifier nonZeroAddress(address _address) {
        require(_address != address(0), "Address cannot be Zero");
        _;
    }

    /**
     * @notice Transfer VRT and redeem XVS
     * @dev Note: If there is not enough XVS, we do not perform the conversion.
     * @param vrtAmount The amount of VRT
     */
    function convert(uint256 vrtAmount) external isInitialized checkForActiveConversionPeriod
    {
        require(address(xvsVesting) != address(0) && address(xvsVesting) != DEAD_ADDRESS, "XVS-Vesting Address is not set");
        require(vrtAmount > 0, "VRT amount must be non-zero");
        require(vrt.allowance(msg.sender, address(this)) >= vrtAmount , "Insufficient VRT allowance");
        totalVrtConverted = totalVrtConverted.add(vrtAmount);

        uint256 redeemAmount = vrtAmount
            .mul(conversionRatio)
            .mul(xvsDecimalsMultiplier)
            .div(1e18)
            .div(vrtDecimalsMultiplier);

        emit TokenConverted(msg.sender, address(vrt), vrtAmount, address(xvs), redeemAmount);
        vrt.transferFrom(msg.sender, DEAD_ADDRESS, vrtAmount);
        xvsVesting.deposit(msg.sender, redeemAmount);
    }

    /*** Admin Functions ***/
    function _become(VRTConverterProxy vrtConverterProxy) public {
        require(msg.sender == vrtConverterProxy.admin(), "only proxy admin can change brains");
        vrtConverterProxy._acceptImplementation();
    }
}