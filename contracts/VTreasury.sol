pragma solidity ^0.5.16;

import "./Utils/IBEP20.sol";
import "./Utils/SafeBEP20.sol";
import "./Ownable.sol";

/**
 * @dev Contract for treasury all tokens as fee and transfer to governance
 */
contract VTreasury is Ownable {
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;

    // WithdrawTreasuryBEP20 Event
    event WithdrawTreasuryBEP20(address tokenAddress, uint256 withdrawAmount, address withdrawAddress);

    // WithdrawTreasuryBNB Event
    event WithdrawTreasuryBNB(uint256 withdrawAmount, address withdrawAddress);

    /**
     * @notice To receive BNB
     */
    function () external payable {}

    /**
    * @notice Withdraw Treasury BEP20 Tokens, Only owner call it
    * @param tokenAddress The address of treasury token
    * @param withdrawAmount The withdraw amount to owner
    * @param withdrawAddress The withdraw address
    */
    function withdrawTreasuryBEP20(
      address tokenAddress,
      uint256 withdrawAmount,
      address withdrawAddress
    ) external onlyOwner {
        uint256 actualWithdrawAmount = withdrawAmount;
        // Get Treasury Token Balance
        uint256 treasuryBalance = IBEP20(tokenAddress).balanceOf(address(this));

        // Check Withdraw Amount
        if (withdrawAmount > treasuryBalance) {
            // Update actualWithdrawAmount
            actualWithdrawAmount = treasuryBalance;
        }

        // Transfer BEP20 Token to withdrawAddress
        IBEP20(tokenAddress).safeTransfer(withdrawAddress, actualWithdrawAmount);

        emit WithdrawTreasuryBEP20(tokenAddress, actualWithdrawAmount, withdrawAddress);
    }

    /**
    * @notice Withdraw Treasury BNB, Only owner call it
    * @param withdrawAmount The withdraw amount to owner
    * @param withdrawAddress The withdraw address
    */
    function withdrawTreasuryBNB(
      uint256 withdrawAmount,
      address payable withdrawAddress
    ) external payable onlyOwner {
        uint256 actualWithdrawAmount = withdrawAmount;
        // Get Treasury BNB Balance
        uint256 bnbBalance = address(this).balance;

        // Check Withdraw Amount
        if (withdrawAmount > bnbBalance) {
            // Update actualWithdrawAmount
            actualWithdrawAmount = bnbBalance;
        }
        // Transfer BNB to withdrawAddress
        withdrawAddress.transfer(actualWithdrawAmount);

        emit WithdrawTreasuryBNB(actualWithdrawAmount, withdrawAddress);
    }
}
