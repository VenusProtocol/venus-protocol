pragma solidity ^0.5.16;

import "../Utils/IBEP20.sol";
import "../Utils/SafeBEP20.sol";

contract XVSVesting {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    uint256 public SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

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

    uint256 public vestingDuration;

    /// @notice decimal precision for XVS
    uint256 public xvsDecimalsMultiplier = 10**18;

    event XVSVested(
        address indexed recipient,
        uint8 indexed vestingAction,
        uint256 vestingStartTime,
        uint256 vestingEndTime,
        uint256 amount,
        uint256 vestingDuration
    );

    event VestedTokensClaimed(address recipient, uint256 amountClaimed);

    /// @notice Emitted when pendingAdmin is accepted, which means admin is updated
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Emitted when pendingAdmin is changed
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    struct VestingRecord {
        address recipient;
        uint256 vestingStartTime;
        uint256 vestingEndTime;
        uint256 amount;
        uint256 vestingDuration;
        uint256 totalClaimed;
    }

    mapping(address => VestingRecord) public vestings;

    modifier nonZeroAddress(address x) {
        require(x != address(0), "Address cannot be Zero");
        _;
    }

    constructor(address _xvsAddress, uint256 _vestingDuration)
        public
        nonZeroAddress(_xvsAddress)
    {
        admin = msg.sender;
        require(
            _vestingDuration > 0,
            "VestingDuration should be greater than zero"
        );
        xvsAddress = _xvsAddress;
        xvs = IBEP20(xvsAddress);
        vestingDuration = _vestingDuration;
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

    /// @notice Add a new VestingRecord for user `_recipient`. Only one Vesting per user is allowed
    /// The amount of XVS tokens here need to be preapproved for transfer by this `Vesting` contract before this call
    /// @param _recipient Address of the Vesting. recipient entitled to claim the vested funds
    /// @param _amount Total number of tokens Vested
    function addVesting(address _recipient, uint128 _amount)
        external
        onlyAdmin
        nonZeroAddress(_recipient)
    {
        require(_amount > 0, "Vested XVS tokens must be greater than zero");

        uint8 _vestionAction;
        uint256 _vestingStartTime;
        uint256 _vestingEndTime;

        if (vestings[_recipient].vestingStartTime == 0) {
            _vestionAction = 0;
            _vestingStartTime = block.timestamp;
            _vestingEndTime = _vestingStartTime.add(vestingDuration);

            VestingRecord memory vestingRecord = VestingRecord({
                recipient: _recipient,
                vestingStartTime: block.timestamp,
                vestingEndTime: _vestingEndTime,
                amount: _amount,
                vestingDuration: vestingDuration,
                totalClaimed: 0
            });

            vestings[_recipient] = vestingRecord;
        } else {
            _vestionAction = 1;
            VestingRecord storage vestingForUpdate = vestings[_recipient];
            _vestingStartTime = vestingForUpdate.vestingStartTime;
            _vestingEndTime = vestingForUpdate.vestingEndTime;
            vestingForUpdate.amount = _amount;
        }

        emit XVSVested(
            _recipient,
            _vestionAction,
            _vestingStartTime,
            _vestingEndTime,
            _amount,
            vestingDuration
        );

        // Transfer the XVStokens to vesting contract
        xvs.safeTransferFrom(address(msg.sender), address(this), _amount);
    }

    /// @notice Allows a recipient to claim their vested tokens. Errors if no tokens have vested
    function claimVestedTokens() external nonReentrant {
        uint256 amountVested = calculateClaim(msg.sender);
        require(amountVested > 0, "zero-amount-vested");

        VestingRecord storage vestingRecord = vestings[msg.sender];
        vestingRecord.totalClaimed = amountVested;

        xvs.safeTransferFrom(address(this), msg.sender, amountVested);

        emit VestedTokensClaimed(msg.sender, amountVested);
    }

    /// @notice Calculate the vested tokens available for `_recepient` to claim
    /// Returns 0 if vesting-period is not completed
    function calculateClaim(address _recipient) public view returns (uint256) {
        VestingRecord memory vestingRecord = vestings[_recipient];

        uint256 elapsedTime = block.timestamp.sub(vestingRecord.vestingStartTime);

        // For Vesting created with a future start date, that hasn't been reached, return 0
        if (elapsedTime < SECONDS_PER_YEAR) {
            return 0;
        }

        // If over vesting duration, all tokens vested
        return vestingRecord.amount;
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
