pragma solidity ^0.5.16;

import "../Utils/IBEP20.sol";
import "../Utils/SafeBEP20.sol";
import "../Ownable.sol";
import "./VRTConversionProxy.sol";
import "./VRTConversionStorage.sol";

/**
 * @title Venus's VRTConversion Contract
 * @author Venus
 */
contract VRTConversion is VRTConversionV1Storage {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

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
        vrtAddresses = _xvsAddress;
        xvsAddress = _xvsAddress;
        vrtDecimalsMultiplier = 10**(uint256(IBEP20(vrtAddresses).decimals()));
        xvsDecimalsMultiplier = 10**(uint256(IBEP20(xvsAddress).decimals()));
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    /**
     * @notice Transfer tokenA and redeem tokenB
     * @dev Note: If there is not enough tokenB, we do not perform the conversion.
     * @param vrtAmount The amount of VRT
     * @return The amount of XVS which is converted
     */
    function convert(uint256 vrtAmount)
        external
        nonReentrant
        returns (uint256)
    {
        require(conversionRatio > 0, "conversion ratio is incorrect");
        require(
            conversionStartTime > block.timestamp,
            "conversions didn't start yet"
        );

        uint256 beforeAmount = IBEP20(vrtAddresses).balanceOf(address(this));
        IBEP20(vrtAddresses).transferFrom(msg.sender, address(this), vrtAmount);
        uint256 afterAmount = IBEP20(vrtAddresses).balanceOf(address(this));

        uint256 actualAmount = afterAmount.sub(beforeAmount);
        require(actualAmount > 0, "token A transfer failed");

        uint256 redeemAmount = actualAmount
            .mul(conversionRatio)
            .mul(xvsDecimalsMultiplier)
            .div(1e18)
            .div(vrtDecimalsMultiplier);
        require(
            redeemAmount <= IBEP20(xvsAddress).balanceOf(address(this)),
            "not enough XVSTokens"
        );

        IBEP20(xvsAddress).safeTransfer(msg.sender, redeemAmount);

        emit TokenConverted(
            msg.sender,
            vrtAddresses,
            xvsAddress,
            actualAmount,
            redeemAmount
        );
        return redeemAmount;
    }

    /*** VRTConversion Admin Functions ***/

    function _become(VRTConversionProxy proxy) external {
        require(
            msg.sender == proxy.admin(),
            "only proxy admin can change brains"
        );
        require(proxy._acceptImplementation() == 0, "change not authorized");
    }

    function initialize() public onlyAdmin {
        // The counter starts true to prevent changing it from zero to non-zero (i.e. smaller cost/refund)
        _notEntered = true;
    }

    /**
     * @notice Set XVS -> VRT conversion info
     * @param _conversionRatio The conversion ratio from XVS to VRT with decimal 18
     * @param _conversionStartTime The conversion available cycle with timestamp
     */
    function _setXVSVRTConversionInfo(
        uint _conversionRatio,
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
