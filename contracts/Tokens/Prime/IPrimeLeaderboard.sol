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

    /// @notice Multiplier tier configuration
    struct MultiplierTier {
        uint256 durationThreshold; // Duration in seconds to reach this tier
        uint256 multiplier; // Multiplier value (scaled by 1e18)
    }

    /// @notice User's snapshot data for an epoch
    struct UserEpochSnapshot {
        uint256 effectiveStake; // Effective stake at snapshot
        uint256 rank; // Rank in the epoch (0 = not ranked)
        bool hasPrime; // Whether user has Prime for this epoch
    }

    /// @notice Epoch snapshot summary
    struct EpochSnapshot {
        uint256 cutoffScore; // Minimum score to qualify for Prime
        uint256 totalParticipants; // Number of users with score > 0
        uint256 primeHoldersCount; // Number of users receiving Prime
        uint256 processedAt; // Timestamp when epoch was processed
        bool finalized; // Whether epoch processing is complete
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
    event WithdrawalRecorded(address indexed user, uint256 amount, uint256 withdrawnScore, uint256 newTotalStaked);

    /// @notice Emitted when deposits are compacted
    event DepositsCompacted(address indexed user, uint256 oldCount, uint256 newCount);

    /// @notice Emitted when an epoch batch is processed
    event EpochBatchProcessed(uint256 indexed epochId, uint256 usersProcessed, uint256 totalProcessed);

    /// @notice Emitted when an epoch is finalized
    event EpochFinalized(
        uint256 indexed epochId,
        uint256 cutoffScore,
        uint256 primeHoldersCount,
        uint256 totalParticipants
    );

    /// @notice Emitted when a user gains Prime status
    event PrimeStatusGranted(address indexed user, uint256 indexed epochId, uint256 rank, uint256 effectiveStake);

    /// @notice Emitted when a user loses Prime status
    event PrimeStatusRevoked(address indexed user, uint256 indexed epochId, uint256 effectiveStake);

    /// @notice Emitted when epoch duration is updated
    event EpochDurationUpdated(uint256 oldDuration, uint256 newDuration);

    /// @notice Emitted when prime slots count is updated
    event PrimeSlotsUpdated(uint256 oldSlots, uint256 newSlots);

    /// @notice Emitted when minimum stake is updated
    event MinimumStakeUpdated(uint256 oldMinimum, uint256 newMinimum);

    /// @notice Emitted when multiplier tiers are updated
    event MultiplierTiersUpdated(uint256[] durations, uint256[] multipliers);

    /// @notice Emitted when PrimeV2 contract address is set
    event PrimeV2Set(address indexed oldPrimeV2, address indexed newPrimeV2);

    /// @notice Emitted when XVSVault address is set
    event XVSVaultSet(address indexed oldVault, address indexed newVault);

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

    /// @notice Thrown when user is below minimum stake threshold
    error BelowMinimumStake();

    /// @notice Thrown when deposit limit is exceeded
    error MaxDepositsExceeded();

    /// @notice Thrown when epoch is not ready to be processed
    error EpochNotEnded();

    /// @notice Thrown when epoch is already finalized
    error EpochAlreadyFinalized();

    /// @notice Thrown when batch processing is incomplete
    error BatchProcessingIncomplete();

    /// @notice Thrown when score verification fails
    error ScoreVerificationFailed();

    /// @notice Thrown when ranking order is invalid
    error InvalidRankingOrder();

    /// @notice Thrown when multiplier tiers are invalid
    error InvalidMultiplierTiers();

    // ═══════════════════ DEPOSIT TRACKING ═══════════════════

    /// @notice Record a new XVS deposit for a user
    /// @param user The depositor's address
    /// @param amount The amount of XVS deposited
    function recordDeposit(address user, uint256 amount) external;

    /// @notice Process a withdrawal using LIFO order
    /// @param user The withdrawer's address
    /// @param amount The amount of XVS to withdraw
    function recordWithdrawal(address user, uint256 amount) external;

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

    // ═══════════════════ LEADERBOARD QUERIES ═══════════════════

    /// @notice Check if a user is a participant (has stake >= minimum)
    /// @param user The user's address
    /// @return isParticipant Whether user is a participant
    function isParticipant(address user) external view returns (bool isParticipant);

    /// @notice Get the total number of participants
    /// @return count Number of participants
    function getParticipantCount() external view returns (uint256 count);

    /// @notice Get participants in a range (for off-chain processing)
    /// @param start Start index
    /// @param end End index (exclusive)
    /// @return users Array of participant addresses
    function getParticipants(uint256 start, uint256 end) external view returns (address[] memory users);

    /// @notice Check if a user currently has Prime status
    /// @param user The user's address
    /// @return hasPrime Whether user has Prime
    function hasPrimeStatus(address user) external view returns (bool hasPrime);

    // ═══════════════════ EPOCH MANAGEMENT ═══════════════════

    /// @notice Get the current epoch number
    /// @return epoch The current epoch (1-indexed)
    function getCurrentEpoch() external view returns (uint256 epoch);

    /// @notice Get the timestamp when current epoch ends
    /// @return endTime The epoch end timestamp
    function getEpochEndTime() external view returns (uint256 endTime);

    /// @notice Get time remaining in current epoch
    /// @return remaining Seconds until epoch ends
    function getTimeUntilEpochEnd() external view returns (uint256 remaining);

    /// @notice Check if the current epoch is ready for processing
    /// @return isReady Whether epoch can be processed
    function isEpochReadyForProcessing() external view returns (bool isReady);

    /// @notice Get epoch snapshot data
    /// @param epochId The epoch number
    /// @return snapshot The epoch snapshot data
    function getEpochSnapshot(uint256 epochId) external view returns (EpochSnapshot memory snapshot);

    /// @notice Process a batch of users for the current epoch
    /// @param users Array of user addresses to process
    /// @param scores Pre-computed effective stakes (must match on-chain calculation)
    function processEpochBatch(address[] calldata users, uint256[] calldata scores) external;

    /// @notice Finalize the epoch with ranked users
    /// @param rankedUsers Top N users in descending order by effective stake
    function finalizeEpoch(address[] calldata rankedUsers) external;

    // ═══════════════════ CONFIGURATION ═══════════════════

    /// @notice Set the epoch duration
    /// @param duration New duration in seconds
    function setEpochDuration(uint256 duration) external;

    /// @notice Set the number of Prime slots (N)
    /// @param slots New number of Prime slots
    function setPrimeSlots(uint256 slots) external;

    /// @notice Set the minimum stake to participate
    /// @param minimum New minimum stake amount
    function setMinimumStake(uint256 minimum) external;

    /// @notice Set the multiplier tiers
    /// @param durations Array of duration thresholds in seconds
    /// @param multipliers Array of multiplier values (scaled by 1e18)
    function setMultiplierTiers(uint256[] calldata durations, uint256[] calldata multipliers) external;

    /// @notice Set the PrimeV2 contract address
    /// @param primeV2 Address of PrimeV2 contract
    function setPrimeV2(address primeV2) external;

    /// @notice Set the XVSVault contract address
    /// @param xvsVault Address of XVSVault contract
    function setXVSVault(address xvsVault) external;
}
