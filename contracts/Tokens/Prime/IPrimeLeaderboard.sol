// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

/**
 * @title IPrimeLeaderboard
 * @author Venus
 * @notice Interface for Prime V2 Leaderboard with time-weighted scoring
 */
interface IPrimeLeaderboard {
    // ═══════════════════ STRUCTS ═══════════════════

    /// @notice Individual deposit record for LIFO tracking
    struct Deposit {
        uint128 amount; // Amount deposited
        uint64 timestamp; // Deposit timestamp
        uint64 _reserved; // Reserved for future use
    }

    // ═══════════════════ EVENTS ═══════════════════

    /// @notice Emitted when a user deposits XVS
    event DepositRecorded(
        address indexed user,
        uint256 amount,
        uint256 timestamp,
        uint256 newTotalStaked,
        uint256 depositCount
    );

    /// @notice Emitted when a user withdraws XVS
    event WithdrawalRecorded(address indexed user, uint256 amount, uint256 newTotalStaked);

    /// @notice Emitted when deposits are compacted
    event DepositsCompacted(address indexed user, uint256 oldCount, uint256 newCount);

    /// @notice Emitted when multiplier tiers are updated
    event MultiplierTiersUpdated(uint256[] durations, uint256[] multipliers);

    /// @notice Emitted when PrimeV2 contract address is set
    event PrimeV2Set(address indexed oldPrimeV2, address indexed newPrimeV2);

    /// @notice Emitted when a staker is seeded during initialization
    event StakerInitialized(address indexed user, uint256 amount, uint64 timestamp);

    /// @notice Emitted when staker initialization is finalized
    event StakersInitializationFinalized();

    // ═══════════════════ ERRORS ═══════════════════

    /// @notice Thrown when caller is not the XVSVault
    error OnlyXVSVaultAllowed();

    /// @notice Thrown when address is zero
    error ZeroAddress();

    /// @notice Thrown when value is invalid
    error InvalidValue();

    /// @notice Thrown when array lengths don't match
    error LengthMismatch();

    /// @notice Thrown when user has insufficient stake
    error InsufficientStake();

    /// @notice Thrown when multiplier tiers are invalid
    error InvalidMultiplierTiers();

    /// @notice Thrown when staker initialization has already been finalized
    error StakersAlreadyInitialized();

    /// @notice Thrown when a seeded staker timestamp is zero or in the future
    error InvalidTimestamp();

    // ═══════════════════ XVS VAULT CALLBACK ═══════════════════

    /// @notice Called by XVSVault on deposit/withdrawal to update deposit tracking
    /// @param user The user whose stake changed
    function xvsUpdated(address user) external;

    // ═══════════════════ SCORE QUERIES ═══════════════════

    /// @notice Get a user's current Effective Stake
    /// @param user The user's address
    /// @return effectiveStake The time-weighted score
    function getEffectiveStake(address user) external view returns (uint256 effectiveStake);

    /// @notice Get a user's total staked amount
    /// @param user The user's address
    /// @return totalStaked The total XVS staked
    function getTotalStaked(address user) external view returns (uint256 totalStaked);

    /// @notice Get a user's deposit stack
    /// @param user The user's address
    /// @return deposits Array of deposits (index 0 = oldest)
    function getDeposits(address user) external view returns (Deposit[] memory deposits);

    /// @notice Get the number of deposits for a user
    /// @param user The user's address
    /// @return count Number of deposit tranches
    function getDepositCount(address user) external view returns (uint256 count);

    /// @notice Calculate multiplier for a given holding duration
    /// @param holdingDuration Duration in seconds
    /// @return multiplier The multiplier (scaled by 1e18)
    function getMultiplier(uint256 holdingDuration) external view returns (uint256 multiplier);

    /// @notice Batch view to get effective stakes for multiple users
    /// @param users Array of user addresses
    /// @return scores Array of effective stake scores
    function getEffectiveStakeBatch(address[] calldata users) external view returns (uint256[] memory scores);

    // ═══════════════════ CONFIGURATION ═══════════════════

    /// @notice Set the multiplier tiers
    /// @param durations Array of duration thresholds in seconds
    /// @param multipliers Array of multiplier values (scaled by 1e18)
    function setMultiplierTiers(uint256[] calldata durations, uint256[] calldata multipliers) external;

    /// @notice Set the PrimeV2 contract address
    /// @param primeV2 Address of PrimeV2 contract
    function setPrimeV2(address primeV2) external;

    /// @notice Get multiplier tier configuration
    /// @return durations Array of duration thresholds
    /// @return multipliers Array of multiplier values
    function getMultiplierTiers() external view returns (uint256[] memory durations, uint256[] memory multipliers);
}
