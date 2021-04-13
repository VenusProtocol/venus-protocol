pragma solidity ^0.5.16;

import "./SafeMath.sol";
import "./BEP20Interface.sol";
import "./Ownable.sol";

/**
 * @dev Contract for treasury all tokens as fee and transfer to governance
 */
contract VTreasury is Ownable {
    using SafeMath for uint256;

    /**
    * @notice Withdraw Treasury Token, Only owner call it
    * @param tokenAddress The address of treasury token
    * @param withdrawAmount The withdraw amount to owner
    * @param withdrawAddress The withdraw address
    */
    function withdrawTreasury(
      address tokenAddress,
      uint256 withdrawAmount,
      address withdrawAddress
    ) external onlyOwner {
        // Get Treasury Token Balance
        uint256 treasuryBalance = BEP20Interface(tokenAddress).balanceOf(address(this));

        // Check Withdraw Amount
        require(treasuryBalance >= withdrawAmount, "The withdraw amount should be less than balance of treasury");

        // Transfer withdrawAmount to withdrawAddress
        BEP20Interface(tokenAddress).transfer(withdrawAddress, withdrawAmount);
    }
}
