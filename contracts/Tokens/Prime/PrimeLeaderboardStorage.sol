// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IPrimeLeaderboard } from "./IPrimeLeaderboard.sol";

/**
 * @title PrimeLeaderboardStorageV1
 * @author Venus
 * @notice Storage layout for PrimeLeaderboard contract
 */
contract PrimeLeaderboardStorageV1 {
    // ═══════════════════ CONSTANTS ═══════════════════

    /// @notice Base multiplier (1.0x) scaled by 1e18
    uint256 internal constant BASE_MULTIPLIER = 1e18;

    /// @notice Maximum deposits per user (DoS protection)
    uint256 internal constant MAX_DEPOSITS_PER_USER = 100;

    /// @notice Scaling factor for calculations
    uint256 internal constant EXP_SCALE = 1e18;

    // ═══════════════════ USER DEPOSIT TRACKING ═══════════════════

    /// @notice User's deposit stack (LIFO order, index 0 = oldest)
    mapping(address => IPrimeLeaderboard.Deposit[]) internal _depositStacks;

    /// @notice User's total staked XVS
    mapping(address => uint256) public totalStaked;

    /// @notice User's withdrawn score for current epoch (resets each epoch)
    mapping(address => uint256) public withdrawnScoreCurrentEpoch;

    /// @notice Epoch number when user's withdrawn score was last updated
    mapping(address => uint256) internal _withdrawnScoreEpoch;

    // ═══════════════════ PARTICIPANT TRACKING ═══════════════════

    /// @notice Array of all participants (addresses with stake >= minimum)
    address[] internal _participants;

    /// @notice Index of participant in array (1-indexed, 0 = not participant)
    mapping(address => uint256) internal _participantIndex;

    // ═══════════════════ EPOCH STATE ═══════════════════

    /// @notice Current epoch number (1-indexed)
    uint256 public currentEpoch;

    /// @notice Timestamp when current epoch started
    uint256 public epochStartTime;

    /// @notice Duration of each epoch in seconds (default: 30 days)
    uint256 public epochDuration;

    /// @notice Number of Prime token slots (default: 500)
    uint256 public primeSlots;

    /// @notice Minimum XVS stake to be a participant (default: 500 XVS)
    uint256 public minimumStake;

    // ═══════════════════ EPOCH PROCESSING STATE ═══════════════════

    /// @notice Number of users processed in current epoch batch processing
    uint256 public epochProcessedCount;

    /// @notice Mapping of epoch => user => snapshot score (for batch verification)
    mapping(uint256 => mapping(address => uint256)) public epochScores;

    /// @notice Epoch snapshot data
    mapping(uint256 => IPrimeLeaderboard.EpochSnapshot) internal _epochSnapshots;

    // ═══════════════════ PRIME STATUS ═══════════════════

    /// @notice Users who currently have Prime status
    mapping(address => bool) public hasPrime;

    /// @notice User's rank in the last finalized epoch (0 = not ranked)
    mapping(address => uint256) public userRank;

    // ═══════════════════ MULTIPLIER CONFIGURATION ═══════════════════

    /// @notice Multiplier tier duration thresholds (in seconds)
    /// @dev [30 days, 60 days, 90 days] by default
    uint256[] internal _multiplierDurations;

    /// @notice Multiplier values corresponding to each tier (scaled by 1e18)
    /// @dev [1.3e18, 1.6e18, 2.0e18] by default
    uint256[] internal _multiplierValues;

    // ═══════════════════ EXTERNAL CONTRACTS ═══════════════════

    /// @notice Address of PrimeV2 contract
    address public primeV2;

    /// @notice Address of XVSVault contract
    address public xvsVault;

    /// @notice Storage gap for future upgrades
    uint256[40] private __gap;
}
