pragma solidity 0.8.20;

import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title VTreasuryV8
 * @author Venus
 * @notice Protocol treasury that holds tokens owned by Venus
 */
contract VTreasuryV8 is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // WithdrawTreasuryToken Event
    event WithdrawTreasuryToken(address indexed tokenAddress, uint256 withdrawAmount, address indexed withdrawAddress);

    // WithdrawTreasuryNative Event
    event WithdrawTreasuryNative(uint256 withdrawAmount, address indexed withdrawAddress);

    /// @notice Thrown if the supplied address is a zero address where it is not allowed
    error ZeroAddressNotAllowed();

    /**
     * @notice To receive Native when msg.data is not empty
     */
    fallback() external payable {}

    /**
     * @notice To receive Native when msg.data is empty
     */
    receive() external payable {}

    /**
     * @notice Withdraw Treasury  Tokens, Only owner call it
     * @param tokenAddress The address of treasury token
     * @param withdrawAmount The withdraw amount to owner
     * @param withdrawAddress The withdraw address
     * @custom:error ZeroAddressNotAllowed thrown when token or withdrawAddress is zero.
     */
    function withdrawTreasuryToken(
        address tokenAddress,
        uint256 withdrawAmount,
        address withdrawAddress
    ) external onlyOwner nonReentrant {
        ensureNonzeroAddress(tokenAddress);
        ensureNonzeroAddress(withdrawAddress);
        require(withdrawAmount > 0, "withdrawAmount must not be zero");

        uint256 actualWithdrawAmount = withdrawAmount;
        // Get Treasury Token Balance
        uint256 treasuryBalance = IERC20(tokenAddress).balanceOf(address(this));

        // Check Withdraw Amount
        if (withdrawAmount > treasuryBalance) {
            // Update actualWithdrawAmount
            actualWithdrawAmount = treasuryBalance;
        }

        // Transfer Token to withdrawAddress
        IERC20(tokenAddress).safeTransfer(withdrawAddress, actualWithdrawAmount);

        emit WithdrawTreasuryToken(tokenAddress, actualWithdrawAmount, withdrawAddress);
    }

    /**
     * @notice Withdraw Treasury Native, Only owner call it
     * @param withdrawAmount The withdraw amount to owner
     * @param withdrawAddress The withdraw address
     * @custom:error ZeroAddressNotAllowed thrown when withdrawAddress is zero.
     */
    function withdrawTreasuryNative(
        uint256 withdrawAmount,
        address payable withdrawAddress
    ) external payable onlyOwner nonReentrant {
        ensureNonzeroAddress(withdrawAddress);
        require(withdrawAmount > 0, "withdrawAmount must not be zero");
        uint256 actualWithdrawAmount = withdrawAmount;
        // Get Treasury Native Balance
        uint256 nativeBalance = address(this).balance;

        // Check Withdraw Amount
        if (withdrawAmount > nativeBalance) {
            // Update actualWithdrawAmount
            actualWithdrawAmount = nativeBalance;
        }
        // Transfer the native token to withdrawAddress
        (bool sent, ) = withdrawAddress.call{ value: actualWithdrawAmount }("");
        require(sent, "Call failed");
        emit WithdrawTreasuryNative(actualWithdrawAmount, withdrawAddress);
    }

    /// @notice Checks if the provided address is nonzero, reverts otherwise
    /// @param address_ Address to check
    /// @custom:error ZeroAddressNotAllowed is thrown if the provided address is a zero address
    function ensureNonzeroAddress(address address_) internal pure {
        if (address_ == address(0)) {
            revert ZeroAddressNotAllowed();
        }
    }
}
