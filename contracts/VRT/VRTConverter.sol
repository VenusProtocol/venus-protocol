pragma solidity ^0.5.16;

import "../Utils/IBEP20.sol";
import "../Utils/SafeBEP20.sol";
import "./IXVSVesting.sol";

/**
 * @title Venus's VRTConversion Contract
 * @author Venus
 */
contract VRTConverter {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Administrator for this contract
    address public admin;

    /// @notice Pending administrator for this contract
    address public pendingAdmin;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;

    /// @notice The VRT TOKEN!
    IBEP20 public vrt;

    /// @notice decimal precision for VRT
    uint256 public vrtDecimalsMultiplier = 10**18;

    /// @notice XVSVesting Contract reference
    IXVSVesting public xvsVesting;

    /// @notice decimal precision for XVS
    uint256 public xvsDecimalsMultiplier = 10**18;

    /// @notice Conversion ratio from VRT to XVS with decimal 18
    uint256 public conversionRatio;

    uint256 public vrtTotalSupply;

    uint256 public lastDayUpdated;

    uint256 public totalVrtConverted;

    /// @notice Emitted when pendingAdmin is accepted, which means admin is updated
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Emitted when pendingAdmin is changed
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /// @notice Emitted when an admin set conversion info
    event ConversionInfoSet(uint256 conversionRatio);

    /// @notice Emitted when token conversion is done
    event TokenConverted(address reedeemer, address vrtAddress, uint256 vrtAmount, uint256 xvsAmount);

    /// @notice Emitted when an admin withdraw converted token
    event TokenWithdraw(address token, address to, uint256 amount);

    /// @notice Emitted when XVSVestingAddress is set
    event XVSVestingSet(address xvsVestingAddress);

    constructor(address _vrtAddress, uint256 _conversionRatio,
                uint256 _vrtTotalSupply) public {
        admin = msg.sender;
        vrt = IBEP20(_vrtAddress);
        conversionRatio = _conversionRatio;
        emit ConversionInfoSet(conversionRatio);
        vrtTotalSupply = _vrtTotalSupply;
        totalVrtConverted = 0;
        _notEntered = true;
    }

    function _setXVSVesting(address _xvsVestingAddress) external onlyAdmin nonZeroAddress(_xvsVestingAddress)
    {
        xvsVesting = IXVSVesting(_xvsVestingAddress);
        emit XVSVestingSet(_xvsVestingAddress);
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
     * @notice Begins transfer of admin rights. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @dev Admin function to begin change of admin. The newPendingAdmin must call `_acceptAdmin` to finalize the transfer.
     * @param newPendingAdmin New pending admin.
     */
    function _setPendingAdmin(address newPendingAdmin) external {
        require(msg.sender == admin, "Only Admin can set the PendingAdmin");
        address oldPendingAdmin = pendingAdmin;
        pendingAdmin = newPendingAdmin;
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

    /**
     * @notice Transfer VRT and redeem XVS
     * @dev Note: If there is not enough XVS, we do not perform the conversion.
     * @param vrtAmount The amount of VRT
     */
    function convert(uint256 vrtAmount) external nonReentrant
    {
        require(address(xvsVesting) != address(0), "XVS-Vesting Address is not set");
        require(vrtAmount > 0, "VRT amount must be non-zero");
        require(conversionRatio > 0, "conversion ratio is incorrect");
        uint256 vrtBalanceOfUser = vrt.balanceOf(msg.sender);
        require(vrtBalanceOfUser >= vrtAmount , "Insufficient VRT-Balance for conversion");
        totalVrtConverted = totalVrtConverted.add(vrtAmount);

        uint256 redeemAmount = vrtAmount
            .mul(conversionRatio)
            .mul(xvsDecimalsMultiplier)
            .div(1e18)
            .div(vrtDecimalsMultiplier);

        emit TokenConverted(msg.sender, address(vrt), vrtAmount, redeemAmount);
        xvsVesting.deposit(msg.sender, redeemAmount);
    }
    
    /**
     * @notice Withdraw BEP20 Tokens
     * @param tokenAddress The address of token to withdraw
     * @param withdrawAmount The amount to withdraw
     * @param withdrawTo The address to withdraw
     */
    function withdraw(address tokenAddress, uint256 withdrawAmount, address withdrawTo) external onlyAdmin {
        uint256 currentBalance = IBEP20(tokenAddress).balanceOf(address(this));
        require(withdrawAmount <= currentBalance, "Insufficient funds to withdraw");
        emit TokenWithdraw(tokenAddress, withdrawTo, withdrawAmount);
        IBEP20(tokenAddress).safeTransfer(withdrawTo, withdrawAmount);
    }

    /**
     * @notice Withdraw All BEP20 Tokens
     * @param tokenAddress The address of token to withdraw
     * @param withdrawTo The address to withdraw
     */
    function withdrawAll(address tokenAddress, address withdrawTo) external onlyAdmin {
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