pragma solidity ^0.5.16;

import "../Utils/IBEP20.sol";
import "../Utils/SafeBEP20.sol";

contract XVSVesting {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    uint256 private constant BLOCKS_PER_DAY = 28800;

    /// @notice Administrator for this contract
    address public admin;

    /// @notice Pending administrator for this contract
    address public pendingAdmin;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;

    /// @notice The XVS TOKEN!
    IBEP20 public xvs;

    uint256 public vestingSpeed;

    uint256 public xvsPerDay;

    /// @notice VRTConversion Contract Address
    address public vrtConversionAddress;

    /// @notice decimal precision for XVS
    uint256 public xvsDecimalsMultiplier = 10**18;

    event VestedTokensClaimed(address recipient, uint256 amountClaimed);

    /// @notice Emitted when pendingAdmin is accepted, which means admin is updated
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Emitted when pendingAdmin is changed
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /// @notice Emitted when vrtConversionAddress is set
    event VRTConversionSet(address vrtConversionAddress);

    /// @notice Emitted when XVS is deposited for vesting
    event XVSVested(
        address indexed recipient,
        uint256 amount,
        uint256 withdrawnAmount,
        uint256 startBlock
    );

    /// @notice Emitted when XVS is withdrawn by recipient
    event XVSWithdrawn(address recipient, uint256 amount);

    struct VestingRecord {
        address recipient;
        uint256 startBlock;
        uint256 totalAmount;
        uint256 withdrawnAmount;
    }

    mapping(address => VestingRecord) public vestings;

    modifier nonZeroAddress(address _address) {
        require(_address != address(0), "Address cannot be Zero");
        _;
    }

    constructor(address _xvsAddress, uint256 _xvsPerDay) public nonZeroAddress(_xvsAddress) {
        admin = msg.sender;
        xvs = IBEP20(_xvsAddress);
        xvsPerDay = _xvsPerDay;
        vestingSpeed = xvsPerDay.div(BLOCKS_PER_DAY);
        _notEntered = true;
    }

    function _setVRTConversion(address _vrtConversionAddress)
        external
        onlyAdmin
        nonZeroAddress(_vrtConversionAddress)
    {
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

    /**
     * @notice Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @dev Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @param newPendingAdmin New pending admin.
     */
    function _setPendingAdmin(address newPendingAdmin) external {
        // Check caller = admin
        require(msg.sender == admin, "Only Admin can set the PendingAdmin");

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
        require(msg.sender == pendingAdmin, "Only PendingAdmin can accept as Admin");

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

    function deposit(address recipient, uint depositAmount) external onlyVrtConverter
        nonReentrant
        nonZeroAddress(recipient) {
        require(depositAmount > 0, "Deposit amount must be non-zero");

        VestingRecord storage vesting = vestings[recipient];

        if(vesting.startBlock == 0){
            vesting.recipient = recipient;
            vesting.startBlock = getBlockNumber();
            vesting.totalAmount = depositAmount;
        } else {
            withdrawPendingAndDeposit(recipient, depositAmount);
        }

        emit XVSVested(
            recipient,
            vesting.totalAmount,
            vesting.withdrawnAmount,
            vesting.startBlock
        );
    }

    function withdrawPendingAndDeposit(address recipient, uint256 depositAmount)
    internal
    {
        VestingRecord storage vesting = vestings[recipient];
        (uint256 toWithdraw, uint256 remainingAmount) = calculateWithdrawableAmount(recipient);
        vesting.totalAmount = remainingAmount.add(depositAmount);
        vesting.startBlock = getBlockNumber();
        
        if (depositAmount > 0) {
            xvs.safeTransferFrom(msg.sender, address(this), depositAmount);
        }

        if(toWithdraw > 0){
            uint256 xvsBalance = xvs.balanceOf(address(this));
            require(xvsBalance >= toWithdraw,"Insufficient XVS in XVSVesting Contract");
            emit XVSWithdrawn(recipient, toWithdraw);
            xvs.safeTransfer(recipient, toWithdraw);
        }
    }

    function withdraw(address recipient) external {
        require(
            vrtConversionAddress != address(0),
            "VRT-Conversion Address is not set"
        );
        require(
            vestings[recipient].startBlock > 0,
            "Address doesnot have any vested amount for withdrawal"
        );

       withdrawPendingAndDeposit(recipient, 0);
    }

    function getWithdrawableAmount(address recipient) view public nonZeroAddress(recipient) 
    returns (uint256){
       (uint256 toWithdraw, uint256 remainingAmount) = calculateWithdrawableAmount(recipient);
       return toWithdraw;
    }

    function calculateWithdrawableAmount(address recipient) view public nonZeroAddress(recipient) 
    returns (uint256 toWithdraw, uint256 remainingAmount)
    {
        VestingRecord memory vesting = vestings[recipient];
        uint256 startBlock = vesting.startBlock;
        uint256 totalAmount = vesting.totalAmount;
        uint256 blockNumber = getBlockNumber();
        uint256 unlocked = ((blockNumber.sub(startBlock)).mul(vestingSpeed)).div(xvsDecimalsMultiplier);
        uint256 amount = totalAmount;
        if (amount >= unlocked) {
            return (unlocked, amount.sub(unlocked));
        } else {
            return (amount, 0);
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

    function getBlockNumber() public view returns (uint256) {
        return block.number;
    }
}
