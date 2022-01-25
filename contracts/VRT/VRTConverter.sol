pragma solidity ^0.5.16;

import "../Utils/IBEP20.sol";
import "../Utils/SafeBEP20.sol";

interface IXVSVesting {
  
    /// @param _recipient Address of the Vesting. recipient entitled to claim the vested funds
    /// @param _amount Total number of tokens Vested
    function deposit(address _recipient, uint256 _amount) external;
}

/**
 * @title Venus's VRTConversion Contract
 * @author Venus
 */
contract VRTConverter {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    uint256 public constant ONE_YEAR = 360 * 24 * 60 * 60;
    uint256 public constant ONE_DAY = 24 * 60 * 60;
    uint256 public constant TOTAL_PERIODS = 360;
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Administrator for this contract
    address public admin;

    /// @notice Pending administrator for this contract
    address public pendingAdmin;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;

    /// @notice VRTToken Address
    address public vrtAddress;

    /// @notice The VRT TOKEN!
    IBEP20 public vrt;

    /// @notice decimal precision for VRT
    uint256 public vrtDecimalsMultiplier = 10**18;
    
    /// @notice XVSToken address
    address public xvsAddress;

    /// @notice XVSVesting address
    address public xvsVestingAddress;

    /// @notice XVSVesting Contract reference
    IXVSVesting public xvsVesting;

    /// @notice The XVS TOKEN!
    IBEP20 public xvs;

    /// @notice decimal precision for XVS
    uint256 public xvsDecimalsMultiplier = 10**18;

    /// @notice Conversion ratio from VRT to XVS with decimal 18
    uint256 public conversionRatio;

    /// @notice timestamp from which VRT to XVS is allowed
    uint256 public conversionStartTime;

    /// @notice timestamp at which VRT to XVS is disabled
    uint256 public conversionEndTime;

    uint256 public vrtTotalSupply;

    uint256 public vrtDailyUtilised;

    uint256 public lastDayUpdated;

    uint256 public totalVrtConverted;

    /// @notice Emitted when pendingAdmin is accepted, which means admin is updated
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Emitted when pendingAdmin is changed
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /// @notice Emitted when an admin set conversion info
    event ConversionInfoSet(
        uint256 conversionRatio,
        uint256 conversionStartTime,
        uint256 conversionEndTime
    );

    /// @notice Emitted when token conversion is done
    event TokenConverted(
        address reedeemer,
        address vrtAddress,
        address xvsAddress,
        uint256 vrtAmount,
        uint256 xvsAmount
    );

    /// @notice Emitted when an admin withdraw converted token
    event TokenWithdraw(address token, address to, uint256 amount);

    constructor(address _vrtAddress, address _xvsAddress, address _xvsVestingAddress, uint256 _conversionRatio, uint256 _conversionStartTime, uint256 _vrtTotalSupply) public {
        admin = msg.sender;
        vrtAddress = _vrtAddress;
        vrt = IBEP20(vrtAddress);
        xvsAddress = _xvsAddress;
        xvs = IBEP20(xvsAddress);
        xvsVestingAddress = _xvsVestingAddress;
        xvsVesting = IXVSVesting(xvsVestingAddress);
        conversionRatio = _conversionRatio;
        conversionStartTime = _conversionStartTime;
        conversionEndTime = conversionStartTime.add(ONE_YEAR);
        emit ConversionInfoSet(conversionRatio, conversionStartTime, conversionEndTime);
        vrtTotalSupply = _vrtTotalSupply;
        vrtDailyUtilised = 0;
        totalVrtConverted = 0;
        _notEntered = true;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    /**
     * @notice Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @dev Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @param newPendingAdmin New pending admin.
     */
    function _setPendingAdmin(address newPendingAdmin) external {
        // Check caller = admin
        require(msg.sender == admin, "SET_PENDING_ADMIN_OWNER_CHECK");

        // Save current value, if any, for inclusion in log
        address oldPendingAdmin = pendingAdmin;

        // Store pendingAdmin with value newPendingAdmin
        pendingAdmin = newPendingAdmin;

        // Emit NewPendingAdmin(oldPendingAdmin, newPendingAdmin)
        emit NewPendingAdmin(oldPendingAdmin, newPendingAdmin);
    }

    /**
     * @notice Accepts transfer of admin rights. msg.sender must be pendingAdmin
     * @dev Admin function for pending admin to accept role and update admin
     */
    function _acceptAdmin() external {
        // Check caller is pendingAdmin
        require(msg.sender == pendingAdmin, "ACCEPT_ADMIN_PENDING_ADMIN_CHECK");

        // Save current values for inclusion in log
        address oldAdmin = admin;
        address oldPendingAdmin = pendingAdmin;

        // Store admin with value pendingAdmin
        admin = pendingAdmin;

        // Clear the pending value
        pendingAdmin = address(0);

        emit NewAdmin(oldAdmin, admin);
        emit NewPendingAdmin(oldPendingAdmin, pendingAdmin);
    }

    /**
     * @notice Transfer VRT and redeem XVS
     * @dev Note: If there is not enough XVS, we do not perform the conversion.
     * @param vrtAmount The amount of VRT
     */
    function convert(uint256 vrtAmount)
        external
        nonReentrant
    {
        require(xvsVestingAddress != address(0), "XVS-Vesting Address is not set");
        require(block.timestamp <= conversionEndTime, "VRT conversion period ended");
        require(vrtAmount > 0, "VRT amount must be non-zero");
        require(conversionRatio > 0, "conversion ratio is incorrect");
        require(
            conversionStartTime <= block.timestamp,
            "VRT conversion didnot start yet"
        );
        uint256 vrtBalanceOfUser = vrt.balanceOf(msg.sender);
        require(vrtBalanceOfUser >= vrtAmount , "Insufficient VRT-Balance for conversion");

        uint256 _currentDayNumber = ((block.timestamp).sub(conversionStartTime)).div(ONE_DAY);
        uint256 vrtDailyLimit = computeVrtDailyLimit();

        if(_currentDayNumber > lastDayUpdated) {
            lastDayUpdated = _currentDayNumber;
            require(vrtAmount <= vrtDailyLimit , "cannot convert more than daily limit for VRT-Conversion");
            vrtDailyUtilised = vrtAmount;
        } else {
           require(vrtAmount <= vrtDailyLimit.sub(vrtDailyUtilised) , "daily limit reached for VRT-Conversion");
            vrtDailyUtilised = vrtDailyUtilised.add(vrtAmount);
        }

        totalVrtConverted = totalVrtConverted.add(vrtAmount);

        uint256 redeemAmount = vrtAmount
            .mul(conversionRatio)
            .mul(xvsDecimalsMultiplier)
            .div(1e18)
            .div(vrtDecimalsMultiplier);
        require(
            redeemAmount <= IBEP20(xvsAddress).balanceOf(address(this)),
            "not enough XVSTokens"
        );

        emit TokenConverted(
            msg.sender,
            vrtAddress,
            xvsAddress,
            vrtAmount,
            redeemAmount
        );

        vrt.transferFrom(
            msg.sender,
            DEAD_ADDRESS,
            vrtAmount
        );

        xvs.approve(xvsVestingAddress, redeemAmount);
        xvsVesting.deposit(msg.sender, redeemAmount);
    }

    function computeVrtDailyLimit() public view returns (uint256) {

        // numberOfPeriodsPassed = (currentTime - conversionStartTime) / (1 Day Period)
        uint256 numberOfPeriodsPassed = (block.timestamp.sub(conversionStartTime)).div(ONE_DAY);

        // remainingPeriods = totalPeriods - numberOfPeriodsPassed
        uint256 remainingPeriods = TOTAL_PERIODS.sub(numberOfPeriodsPassed);

        if(remainingPeriods <= 0){
            return 0;
        } else {
            //remainingVRTForSwap = vrtTotalSupply - totalVrtConverted
            uint256 remainingVRTForSwap = vrtTotalSupply.sub(totalVrtConverted);

            // vrtDailyLimit = remainingVRTForSwap / remainingPeriods
            return remainingVRTForSwap.div(remainingPeriods);
        }
    }

    /**
     * @notice Withdraw BEP20 Tokens
     * @param tokenAddress The address of token to withdraw
     * @param withdrawAmount The amount to withdraw
     * @param withdrawTo The address to withdraw
     */
    function withdraw(
        address tokenAddress,
        uint256 withdrawAmount,
        address withdrawTo
    ) external onlyAdmin {

        // Get Treasury Token Balance
        uint256 currentBalance = IBEP20(tokenAddress).balanceOf(address(this));
        require(withdrawAmount <= currentBalance, "Insufficient funds to withdraw");

        // Transfer BEP20 Token to withdrawTo
        IBEP20(tokenAddress).safeTransfer(withdrawTo, withdrawAmount);

        emit TokenWithdraw(tokenAddress, withdrawTo, withdrawAmount);
    }

    /**
     * @notice Withdraw All BEP20 Tokens
     * @param tokenAddress The address of token to withdraw
     * @param withdrawTo The address to withdraw
     */
    function withdrawAll(
        address tokenAddress,
        address withdrawTo
    ) external onlyAdmin {

        // Get Treasury Token Balance
        uint256 currentBalance = IBEP20(tokenAddress).balanceOf(address(this));

        if(currentBalance > 0){
            emit TokenWithdraw(tokenAddress, withdrawTo, currentBalance);
            // Transfer BEP20 Token to withdrawTo
            IBEP20(tokenAddress).safeTransfer(withdrawTo, currentBalance);
        }
    }

    /*** Reentrancy Guard ***/

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     */
    modifier nonReentrant() {
        require(_notEntered, "re-entered");
        _notEntered = false;
        _;
        _notEntered = true; // get a gas-refund post-Istanbul
    }
}
