pragma solidity 0.8.20;

import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VTreasuryV8
 * @author Venus
 * @notice Protocol treasury that holds tokens owned by Venus
 */
contract VTreasuryV8 is Ownable {
    using SafeERC20 for IERC20;

    // WithdrawTreasuryToken Event
    event WithdrawTreasuryToken(address tokenAddress, uint256 withdrawAmount, address withdrawAddress);

    // WithdrawTreasuryNative Event
    event WithdrawTreasuryNative(uint256 withdrawAmount, address withdrawAddress);

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
     */
    function withdrawTreasuryToken(
        address tokenAddress,
        uint256 withdrawAmount,
        address withdrawAddress
    ) external onlyOwner {
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
     */
    function withdrawTreasuryNative(
        uint256 withdrawAmount,
        address payable withdrawAddress
    ) external payable onlyOwner {
        uint256 actualWithdrawAmount = withdrawAmount;
        // Get Treasury Native Balance
        uint256 nativeBalance = address(this).balance;

        // Check Withdraw Amount
        if (withdrawAmount > nativeBalance) {
            // Update actualWithdrawAmount
            actualWithdrawAmount = nativeBalance;
        }
        // Transfer BNB to withdrawAddress
        withdrawAddress.transfer(actualWithdrawAmount);

        emit WithdrawTreasuryNative(actualWithdrawAmount, withdrawAddress);
    }

    /**
     * @notice Empty implementation to avoid any mishappening.
     */
    function renounceOwnership() public override onlyOwner {}
}
