pragma solidity ^0.5.16;

/**
 * @title IPrimeLeaderboard
 * @notice Interface for PrimeLeaderboard contract (Solidity 0.5.16 compatible)
 */
interface IPrimeLeaderboard {
    /**
     * @notice Record a new XVS deposit for a user
     * @param user The depositor's address
     * @param amount The amount of XVS deposited
     */
    function recordDeposit(address user, uint256 amount) external;

    /**
     * @notice Process a withdrawal using LIFO order
     * @param user The withdrawer's address
     * @param amount The amount of XVS to withdraw
     */
    function recordWithdrawal(address user, uint256 amount) external;
}
