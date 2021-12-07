pragma solidity ^0.5.16;

import "../Utils/IBEP20.sol";
import "../Utils/SafeBEP20.sol";

/**
 * @title Venus's VRTConversion Contract
 * @author Venus
 */
contract VRTConversion {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

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

    /// @notice The XVS TOKEN!
    IBEP20 public xvs;

    /// @notice decimal precision for XVS
    uint256 public xvsDecimalsMultiplier = 10**18;

    /// @notice Conversion ratio from VRT to XVS with decimal 18
    uint256 public conversionRatio;

    /// @notice timestamp from which VRT to XVS is allowed
    uint256 public conversionStartTime;

    /// @notice Emitted when pendingAdmin is accepted, which means admin is updated
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Emitted when pendingAdmin is changed
    event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

    /// @notice Emitted when an admin set convrsion info
    event ConversionInfoSet(
        uint256 conversionRatio,
        uint256 conversionStartTime
    );

    /// @notice Emitted when token conversion is done
    event TokenConverted(
        address reedeemer,
        address vrtAddresses,
        address xvsAddress,
        uint256 vrtAmount,
        uint256 xvsAmount
    );

    /// @notice Emitted when an admin withdraw converted token
    event TokenWithdraw(address token, address to, uint256);

    constructor(address _vrtAddress, address _xvsAddress) public {
        admin = msg.sender;
        vrtAddress = _vrtAddress;
        vrt = IBEP20(vrtAddress);
        xvsAddress = _xvsAddress;
        xvs = IBEP20(xvsAddress);
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
     * @return The amount of XVS which is converted
     */
    function convert(uint256 vrtAmount)
        external
        nonReentrant
        returns (uint256)
    {
        require(vrtAmount > 0, "VRT amount must be non-zero");
        require(conversionRatio > 0, "conversion ratio is incorrect");
        require(
            conversionStartTime <= block.timestamp,
            "conversions didnot start yet"
        );

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

        vrt.safeTransferFrom(
            address(msg.sender),
            address(this),
            vrtAmount
        );

        xvs.safeTransfer(address(msg.sender), redeemAmount);

        return redeemAmount;
    }

    /**
     * @notice Set XVS -> VRT conversion info
     * @param _conversionRatio The conversion ratio from XVS to VRT with decimal 18
     * @param _conversionStartTime The conversion available cycle with timestamp
     */
    function _setXVSVRTConversionInfo(
        uint256 _conversionRatio,
        uint256 _conversionStartTime
    ) public onlyAdmin {
        conversionRatio = _conversionRatio;
        conversionStartTime = _conversionStartTime;
        emit ConversionInfoSet(conversionRatio, conversionStartTime);
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
        uint256 actualWithdrawAmount = withdrawAmount;
        // Get Treasury Token Balance
        uint256 currentBalance = IBEP20(tokenAddress).balanceOf(address(this));

        // Check Withdraw Amount
        if (withdrawAmount > currentBalance) {
            // Update actualWithdrawAmount
            actualWithdrawAmount = currentBalance;
        }

        // Transfer BEP20 Token to withdrawTo
        IBEP20(tokenAddress).safeTransfer(withdrawTo, actualWithdrawAmount);

        emit TokenWithdraw(tokenAddress, withdrawTo, actualWithdrawAmount);
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
