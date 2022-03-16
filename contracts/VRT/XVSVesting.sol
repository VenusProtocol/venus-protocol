pragma solidity ^0.5.16;

import "../Utils/IBEP20.sol";
import "../Utils/SafeBEP20.sol";
import "./XVSVestingStorage.sol";
import "./XVSVestingProxy.sol";

/**
 * @title Venus's XVSVesting Contract
 * @author Venus
 */
contract XVSVesting is XVSVestingStorage {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    /// @notice total vesting period for 1 year in seconds
    uint256 constant public TOTAL_VESTING_TIME = 365 * 24 * 60 * 60;

    /// @notice decimal precision for XVS
    uint256 constant public xvsDecimalsMultiplier = 1e18;

    /// @notice Emitted when XVSVested is claimed by recipient
    event VestedTokensClaimed(address recipient, uint256 amountClaimed);

    /// @notice Emitted when vrtConversionAddress is set
    event VRTConversionSet(address vrtConversionAddress);

    /// @notice Emitted when XVS is deposited for vesting
    event XVSVested(
        address indexed recipient,
        uint256 startTime,
        uint256 amount,
        uint256 withdrawnAmount
    );

    /// @notice Emitted when XVS is withdrawn by recipient
    event XVSWithdrawn(address recipient, uint256 amount);

    modifier nonZeroAddress(address _address) {
        require(_address != address(0), "Address cannot be Zero");
        _;
    }

    constructor() public {}

    /**
     * @notice initialize XVSVestingStorage
     * @param _xvsAddress The XVSToken address
     */
    function initialize(address _xvsAddress) public {
        require(msg.sender == admin, "only admin may initialize the XVSVesting");
        require(initialized == false, "XVSVesting is already initialized");
        require(_xvsAddress != address(0), "_xvsAddress cannot be Zero");
        xvs = IBEP20(_xvsAddress);

        _notEntered = true;
        initialized = true;
    }

    modifier isInitialized() {
        require(initialized == true, "XVSVesting is not initialized");
        _;
    }

    /**
     * @notice sets VRTConverter Address
     * @dev Note: If VRTConverter is not set, then Vesting is not allowed
     * @param _vrtConversionAddress The VRTConverterProxy Address
     */
    function setVRTConverter(address _vrtConversionAddress) public {
        require(msg.sender == admin, "only admin may initialize the Vault");
        require(_vrtConversionAddress != address(0), "vrtConversionAddress cannot be Zero");
        vrtConversionAddress = _vrtConversionAddress;
        emit VRTConversionSet(_vrtConversionAddress);
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    modifier onlyVrtConverter() {
        require(
            msg.sender == vrtConversionAddress,
            "only VRTConversion Address can call the function"
        );
        _;
    }

    modifier vestingExistCheck(address recipient) {
        require(
            vestings[recipient].length > 0,
            "recipient doesnot have any vestingRecord"
        );
        _;
    }

    /**
     * @notice Deposit XVS for Vesting
     * @param recipient The vesting recipient
     * @param depositAmount XVS amount for deposit
     */
    function deposit(address recipient, uint depositAmount) external isInitialized onlyVrtConverter
        nonZeroAddress(recipient) {
        require(depositAmount > 0, "Deposit amount must be non-zero");

        VestingRecord[] storage vestingsOfRecipient = vestings[recipient];

        VestingRecord memory vesting = VestingRecord({
            recipient: recipient,
            startTime: getCurrentTime(),
            amount: depositAmount,
            withdrawnAmount: 0
        });

        vestingsOfRecipient.push(vesting);

        emit XVSVested(
            recipient,
            vesting.startTime,
            vesting.amount,
            vesting.withdrawnAmount
        );
    }

    /**
     * @notice Withdraw Vested XVS of recipient
     */
    function withdraw() external isInitialized vestingExistCheck(msg.sender) {
        address recipient = msg.sender;
        VestingRecord[] storage vestingsOfRecipient = vestings[recipient];
        uint256 vestingCount = vestingsOfRecipient.length;
        uint256 totalWithdrawableAmount = 0;

        for(uint i = 0; i < vestingCount; ++i) {
            VestingRecord storage vesting = vestingsOfRecipient[i];
            (uint256 vestedAmount, uint256 toWithdraw) = calculateWithdrawableAmount(vesting.amount, vesting.startTime, vesting.withdrawnAmount);
            if(toWithdraw > 0){
                totalWithdrawableAmount = totalWithdrawableAmount.add(toWithdraw);
                vesting.withdrawnAmount = vesting.withdrawnAmount.add(toWithdraw);
            }
        }

       if(totalWithdrawableAmount > 0){
           uint256 xvsBalance = xvs.balanceOf(address(this));
           require(xvsBalance >= totalWithdrawableAmount, "Insufficient XVS for withdrawal");
           emit XVSWithdrawn(recipient, totalWithdrawableAmount);
           xvs.safeTransfer(recipient, totalWithdrawableAmount);
       }
    }

    /**
     * @notice get Withdrawable XVS Amount
     * @param recipient The vesting recipient
     * @return A tuple with totalWithdrawableAmount , totalVestedAmount and totalWithdrawnAmount
     */
    function getWithdrawableAmount(address recipient) view public isInitialized nonZeroAddress(recipient) vestingExistCheck(recipient)
    returns (uint256 totalWithdrawableAmount, uint256 totalVestedAmount, uint256 totalWithdrawnAmount)
    {
        VestingRecord[] storage vestingsOfRecipient = vestings[recipient];
        uint256 vestingCount = vestingsOfRecipient.length;

        for(uint i = 0; i < vestingCount; i++) {
            VestingRecord storage vesting = vestingsOfRecipient[i];
            (uint256 vestedAmount, uint256 toWithdraw) = calculateWithdrawableAmount(vesting.amount, vesting.startTime, vesting.withdrawnAmount);
            totalVestedAmount = totalVestedAmount.add(vestedAmount);
            totalWithdrawableAmount = totalWithdrawableAmount.add(toWithdraw);
            totalWithdrawnAmount = totalWithdrawnAmount.add(vesting.withdrawnAmount);
        }

        return (totalWithdrawableAmount, totalVestedAmount, totalWithdrawnAmount);
    }

    /**
     * @notice get Withdrawable XVS Amount
     * @param amount Amount deposited for vesting
     * @param vestingStartTime time in epochSeconds at the time of vestingDeposit
     * @param withdrawnAmount XVSAmount withdrawn from VestedAmount
     * @return A tuple with vestedAmount and withdrawableAmount
     */
    function calculateWithdrawableAmount(uint256 amount, uint256 vestingStartTime, uint256 withdrawnAmount)
      view internal returns (uint256, uint256) {
        uint256 vestedAmount = calculateVestedAmount(amount, vestingStartTime, getCurrentTime());
        uint toWithdraw = vestedAmount.sub(withdrawnAmount);
        return (vestedAmount, toWithdraw);
    }

    /**
     * @notice calculate total vested amount
     * @param vestingAmount Amount deposited for vesting
     * @param vestingStartTime time in epochSeconds at the time of vestingDeposit
     * @param currentTime currentTime in epochSeconds
     * @return Total XVS amount vested
     */
    function calculateVestedAmount(uint256 vestingAmount, uint256 vestingStartTime, uint256 currentTime) internal view returns (uint256) {
        if (currentTime < vestingStartTime) {
            return 0;
        } else if (currentTime > vestingStartTime.add(TOTAL_VESTING_TIME)) {
            return vestingAmount;
        } else {
            return (vestingAmount.mul(currentTime.sub(vestingStartTime))).div(TOTAL_VESTING_TIME);
        }
    }

    /**
     * @notice current block timestamp
     * @return blocktimestamp
     */
   function getCurrentTime() public view returns (uint256) {
      return block.timestamp;
   }

    /*** Admin Functions ***/
    function _become(XVSVestingProxy xvsVestingProxy) public {
        require(msg.sender == xvsVestingProxy.admin(), "only proxy admin can change brains");
        xvsVestingProxy._acceptImplementation();
    }
}