// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/**
 * @title IPrimeV2
 * @author Venus
 * @notice Interface for PrimeV2 Token with leaderboard-based distribution
 */
interface IPrimeV2 {
    struct PendingReward {
        address vToken;
        address rewardToken;
        uint256 amount;
    }

    // ═══════════════════ PRIME TOKEN MANAGEMENT ═══════════════════

    /**
     * @notice Mint a Prime token for a user permissionlessly (requires mintThreshold to be set)
     * @param user Address to mint token for
     */
    function claimPrime(address user) external;

    /**
     * @notice Mint Prime tokens for multiple users permissionlessly
     * @param users Array of addresses to mint tokens for
     */
    function claimPrimeBatch(address[] calldata users) external;

    /**
     * @notice Issue a Prime token to a single user
     * @param user Address to issue token to
     */
    function issue(address user) external;

    /**
     * @notice Issue Prime tokens to multiple users
     * @param users List of addresses to issue tokens to
     */
    function issueBatch(address[] calldata users) external;

    /**
     * @notice Burn a user's Prime token
     * @param user User address
     */
    function burn(address user) external;

    /**
     * @notice Burn Prime tokens for multiple users
     * @param users Array of user addresses
     */
    function burnBatch(address[] calldata users) external;

    /**
     * @notice Check if user has Prime token
     * @param user User address
     * @return isPrimeHolder true if user has Prime token
     */
    function isUserPrimeHolder(address user) external view returns (bool);

    // ═══════════════════ INTEREST FUNCTIONS ═══════════════════

    /**
     * @notice Claim accrued interest for a market
     * @param vToken Market address
     * @return amount Amount claimed
     */
    function claimInterest(address vToken) external returns (uint256);

    /**
     * @notice Claim accrued interest for a market to a specific address
     * @param vToken Market address
     * @param user Recipient address
     * @return amount Amount claimed
     */
    function claimInterest(address vToken, address user) external returns (uint256);

    /**
     * @notice Accrue interest for a market
     * @param vToken Market address
     */
    function accrueInterest(address vToken) external;

    /**
     * @notice Accrue interest and update score for a user in a specific market
     * @param user User address
     * @param market Market address
     */
    function accrueInterestAndUpdateScore(address user, address market) external;

    /**
     * @notice Accrue interest and update score for a user across all markets
     * @param user User address
     */
    function accrueInterestAndUpdateScore(address user) external;

    /**
     * @notice Get pending rewards for a user (triggers accrual)
     * @param user User address
     * @return pendingRewards Array of pending rewards per market
     */
    function getPendingRewards(address user) external returns (PendingReward[] memory pendingRewards);

    /**
     * @notice Get pending rewards for a user (view-only, does not accrue)
     * @param user User address
     * @return pendingRewards Array of pending rewards per market
     */
    function getPendingRewardsStatic(address user) external view returns (PendingReward[] memory pendingRewards);

    /**
     * @notice Lifetime accrued rewards for many users in a single market
     * @param market vToken address
     * @param users Array of user addresses
     * @return amounts Lifetime accrued amounts, indexed parallel to users
     */
    function getLifetimeAccruedByMarket(
        address market,
        address[] calldata users
    ) external view returns (uint256[] memory amounts);

    /**
     * @notice Lifetime accrued rewards for one user across many markets
     * @param user User address
     * @param markets_ Array of vToken addresses
     * @return amounts Lifetime accrued amounts, indexed parallel to markets_
     */
    function getLifetimeAccruedByUser(
        address user,
        address[] calldata markets_
    ) external view returns (uint256[] memory amounts);

    /**
     * @notice Record the start block of a reward cycle (idempotent, ACM-gated)
     * @param cycleId Identifier of the cycle whose start is being recorded
     */
    function recordCycleSnapshot(uint256 cycleId) external;

    // ═══════════════════ SCORE FUNCTIONS ═══════════════════

    /**
     * @notice Update scores for a batch of users
     * @param users Array of user addresses
     */
    function updateScores(address[] calldata users) external;

    // ═══════════════════ VIEW FUNCTIONS ═══════════════════

    /**
     * @notice Retrieves all Prime-participating markets
     * @return Array of vToken addresses
     */
    function getAllMarkets() external view returns (address[] memory);

    /**
     * @notice Get XVS balance of a user from the vault
     * @param user User address
     * @return XVS balance
     */
    function xvsBalanceOfUser(address user) external view returns (uint256);

    /**
     * @notice Get number of pending score updates
     * @return Number of pending updates
     */
    function pendingScoreUpdates() external view returns (uint256);

    // ═══════════════════ ADMIN FUNCTIONS ═══════════════════

    /**
     * @notice Add a market to the Prime program
     * @param market Market vToken address
     * @param supplyMultiplier Supply multiplier (scaled by 1e18)
     * @param borrowMultiplier Borrow multiplier (scaled by 1e18)
     */
    function addMarket(address market, uint256 supplyMultiplier, uint256 borrowMultiplier) external;

    /**
     * @notice Remove a market from the Prime program
     * @param market Market vToken address to remove
     */
    function removeMarket(address market) external;

    /**
     * @notice Set maximum token limit
     * @param tokenLimit Maximum number of Prime tokens
     */
    function setLimit(uint256 tokenLimit) external;

    /**
     * @notice Update alpha parameters for score calculation
     * @param alphaNumerator Numerator of alpha
     * @param alphaDenominator Denominator of alpha
     */
    function updateAlpha(uint128 alphaNumerator, uint128 alphaDenominator) external;

    /**
     * @notice Update multipliers for a market
     * @param market Market vToken address
     * @param supplyMultiplier New supply multiplier (scaled by 1e18)
     * @param borrowMultiplier New borrow multiplier (scaled by 1e18)
     */
    function updateMultipliers(address market, uint256 supplyMultiplier, uint256 borrowMultiplier) external;

    /**
     * @notice Pause the contract
     */
    function pause() external;

    /**
     * @notice Unpause the contract
     */
    function unpause() external;

    /**
     * @notice Set the max loops limit
     * @param loopsLimit Number of loops limit
     */
    function setMaxLoopsLimit(uint256 loopsLimit) external;

    /**
     * @notice Set the PrimeLeaderboard contract address
     * @param primeLeaderboard_ Address of PrimeLeaderboard contract
     */
    function setPrimeLeaderboard(address primeLeaderboard_) external;

    /**
     * @notice Set the minimum effective stake threshold and minting deadline for permissionless minting
     * @param mintThreshold_ New mint threshold (0 = disable permissionless minting)
     * @param mintDeadline_ Unix timestamp after which minting is closed (0 = no deadline)
     */
    function setMintThreshold(uint256 mintThreshold_, uint256 mintDeadline_) external;
}
