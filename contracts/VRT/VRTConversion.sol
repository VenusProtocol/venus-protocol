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
    event ConversionInfoSet(address tokenA, address tokenB, uint ratio, uint cycle);

    /// @notice Emitted when token conversion is done
    event TokenConverted(address,  address tokenA, address tokenB, uint amountA, uint amountB);

    /// @notice Emitted when an admin withdraw converted token
    event TokenWithdraw(address token, address to, uint);

    constructor() public {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    /**
     * @notice Transfer tokenA and redeem tokenB
     * @dev Note: If there is not enough tokenB, we do not perform the conversion.
     * @param tokenA The address of the token to convert
     * @param tokenB The address of the token to redeem
     * @param amountA The amount of tokenA
     * @return The amount of tokenB which is converted
     */
    function convertToken(address tokenA, address tokenB, uint amountA) external nonReentrant returns (uint) {
        uint ratio = conversionRatio[tokenA][tokenB];
        uint cycle = conversionCycle[tokenA][tokenB];

        require(ratio != 0, "conversion ratio is incorrect");
        require(cycle > block.timestamp, "conversion cycle is incorrect");

        uint beforeAmount = IBEP20(tokenA).balanceOf(address(this));
        IBEP20(tokenA).transferFrom(msg.sender, address(this), amountA);
        uint afterAmount = IBEP20(tokenA).balanceOf(address(this));

        uint actualAmount = afterAmount.sub(beforeAmount);
        require(actualAmount > 0, "token A transfer failed");

        uint tokenADecimals = 10**(uint256(IBEP20(tokenA).decimals()));
        uint tokenBDecimals = 10**(uint256(IBEP20(tokenB).decimals()));
        uint redeemAmount = actualAmount.mul(ratio).mul(tokenBDecimals).div(1e18).div(tokenADecimals);
        require(redeemAmount <= IBEP20(tokenB).balanceOf(address(this)), "token B is not enough");
        IBEP20(tokenB).safeTransfer(msg.sender, redeemAmount);

        emit TokenConverted(msg.sender, tokenA, tokenB, actualAmount, redeemAmount);
        return redeemAmount;
    }

    /**
     * @notice Return the address of the VRT token
     * @return The address of VRT
     */
    function getVRTAddress() public pure returns (address) {
        return 0x5F84ce30DC3cF7909101C69086c50De191895883;
    }

    /**
     * @notice Return the address of the XVS token
     * @return The address of XVS
     */
    function getXVSAddress() public pure returns (address) {
        return 0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63;
    }

    /*** VRTConversion Admin Functions ***/

    function _become(VRTConversionProxy proxy) external {
        require(msg.sender == proxy.admin(), "only proxy admin can change brains");
        require(proxy._acceptImplementation() == 0, "change not authorized");
    }

    function initialize() onlyAdmin public {
        // The counter starts true to prevent changing it from zero to non-zero (i.e. smaller cost/refund)
        _notEntered = true;
    }

    /**
     * @notice Set tokenA -> tokenB conversion info
     * @param tokenA The address of the token which will be converted from
     * @param tokenB The address of the token which will be converted to
     * @param ratio The conversion ratio from tokenA to tokenB with decimal 18
     * @param cycle The conversion available cycle with timestamp
     */
    function _setConversionInfo(address tokenA, address tokenB, uint256 ratio, uint256 cycle) public onlyAdmin {
        require(tokenA != address(0), "tokenA is invalid");
        require(tokenB != address(0), "tokenB is invalid");

        conversionRatio[tokenA][tokenB] = ratio;
        conversionCycle[tokenA][tokenB] = cycle;
        emit ConversionInfoSet(tokenA, tokenB, ratio, cycle);
    }

    /**
     * @notice Set XVS -> VRT conversion info
     * @param ratio The conversion ratio from XVS to VRT with decimal 18
     * @param cycle The conversion available cycle with timestamp
     */
    function _setXVSVRTConversionInfo(uint256 ratio, uint256 cycle) public onlyAdmin {
        address xvs = getXVSAddress();
        address vrt = getVRTAddress();

        _setConversionInfo(xvs, vrt, ratio, cycle);
        emit ConversionInfoSet(xvs, vrt, ratio, cycle);
    }

    /**
     * @notice Set VRT -> XVS conversion info
     * @param ratio The conversion ratio from tokenA to tokenB with decimal 18
     * @param cycle The conversion available cycle with timestamp
     */
    function _setVRTXVSConversionInfo(uint256 ratio, uint256 cycle) public onlyAdmin {
        address xvs = getXVSAddress();
        address vrt = getVRTAddress();

        _setConversionInfo(vrt, xvs, ratio, cycle);
        emit ConversionInfoSet(vrt, xvs, ratio, cycle);
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
