pragma solidity ^0.5.16;

import "../Utils/IBEP20.sol";
import "../Utils/SafeBEP20.sol";

contract XVSVesting {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    uint256 public SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
    uint256 private constant BLOCKS_PER_DAY = (24 * 3600) / 3;
    uint256 public constant VESTING_PERIOD = 360 * BLOCKS_PER_DAY;

    /// @notice Administrator for this contract
    address public admin;

    /// @notice Pending administrator for this contract
    address public pendingAdmin;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;

    /// @notice XVSToken address
    address public xvsAddress;

    /// @notice The XVS TOKEN!
    IBEP20 public xvs;

    /// @notice VRTConversion Contract Address
    address public vrtConversionAddress;

    uint256 public vestingDuration;

    /// @notice decimal precision for XVS
    uint256 public xvsDecimalsMultiplier = 10**18;

    uint256 public vestingFrequency;

    event XVSVested(
        address indexed recipient,
        uint8 indexed vestingStartBlock,
        uint256 vestingEndBlock,
        uint256 totalVestedAmount,
        uint256 createdAt
    );

    event VestedTokensClaimed(address recipient, uint256 amountClaimed);

    /// @notice Emitted when pendingAdmin is accepted, which means admin is updated
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Emitted when pendingAdmin is changed
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /// @notice Emitted when vrtConversionAddress is set
    event vrtConversionAddressSet(address vrtConversionAddress);

    struct VestingRecord {
        address recipient;
        uint256 vestingStartBlock;
        uint256 totalVestedAmount;
        uint256 withdrawnAmount;
        uint256 createdAt;
    }

    mapping(address => VestingRecord) public vestings;

    modifier nonZeroAddress(address _address) {
        require(_address != address(0), "Address cannot be Zero");
        _;
    }

    constructor(address _xvsAddress) public nonZeroAddress(_xvsAddress) {
        admin = msg.sender;
        xvsAddress = _xvsAddress;
        xvs = IBEP20(xvsAddress);
        _notEntered = true;
    }

    function _setVrtConversion(address _vrtConversionAddress)
        external
        onlyAdmin
        nonZeroAddress(_vrtConversionAddress)
    {
        vrtConversionAddress = _vrtConversionAddress;
        emit vrtConversionAddressSet(_vrtConversionAddress);
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

    function deposit(address recipient, uint256 amount)
        external
        onlyVrtConverter nonReentrant 
        nonZeroAddress(recipient)
    {
        VestingRecord storage vesting = vestings[recipient];
        uint256 toWithdraw = calculateWithdrawal(vesting);
        uint256 remainingAmount = (vesting.totalVestedAmount.sub(vesting.withdrawnAmount)).sub(toWithdraw);
        vesting.totalVestedAmount = remainingAmount.add(amount);
        vesting.withdrawnAmount = 0;

        // Note that we reset the start date after we compute the withdrawn amount
        vesting.totalVestedAmount += amount;
        vesting.vestingStartBlock = block.number;

        xvs.safeTransferFrom(msg.sender, address(this), amount);

        if (toWithdraw > 0) {
            xvs.safeTransfer(recipient, toWithdraw);
        }
    }

    function withdraw(address recipient) external nonZeroAddress(recipient) nonReentrant {
        require(msg.sender == recipient, "Only recipient can withdraw");
        VestingRecord storage vesting = vestings[recipient];
        uint256 toWithdraw = calculateWithdrawal(vesting);

        if(toWithdraw > 0){
            vesting.withdrawnAmount = vesting.withdrawnAmount.add(toWithdraw);
            xvs.safeTransfer(recipient, toWithdraw);
        }
    }

    function calculateWithdrawal(VestingRecord storage vesting)
        internal
        view
        returns (uint256 toWithdraw)
    {
        uint256 unlocked = (vesting.totalVestedAmount.mul(block.number.sub(vesting.vestingStartBlock))).div(VESTING_PERIOD);
        uint256 amount = vesting.totalVestedAmount.sub(vesting.withdrawnAmount);
        return (amount >= unlocked ? unlocked : amount);
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
