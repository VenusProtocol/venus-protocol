// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

/**
 * @title PrimeV2StorageV1
 * @author Venus
 * @notice Storage layout for PrimeV2 contract with leaderboard-based Prime token distribution
 */
contract PrimeV2StorageV1 {
    // ═══════════════════ CONSTANTS ═══════════════════

    /// @notice Scaling factor for calculations
    uint256 internal constant EXP_SCALE = 1e18;

    // ═══════════════════ PRIME TOKEN STATE ═══════════════════

    /// @notice Whether a user holds a Prime token
    mapping(address => bool) public isPrimeHolder;

    /// @notice Total count of Prime tokens
    uint256 public totalTokens;

    /// @notice Maximum number of Prime tokens allowed
    uint256 public tokenLimit;

    // ═══════════════════ MARKET STATE ═══════════════════

    /// @notice Struct to represent a market in Prime
    struct Market {
        uint256 supplyMultiplier; // Multiplier for supply APR boost
        uint256 borrowMultiplier; // Multiplier for borrow APR boost
        uint256 rewardIndex; // Accumulated reward per score
        uint256 sumOfMembersScore; // Total score of all Prime members in this market
        bool exists; // Whether this market is in Prime
    }

    /// @notice Struct to track user's interest in a market
    struct Interest {
        uint256 accrued; // Accrued rewards pending claim (reset to 0 on claim)
        uint256 score; // User's score in this market
        uint256 rewardIndex; // Last recorded reward index
        uint256 lifetimeAccrued; // Monotonic running total of all rewards ever accrued
        //                         to this user in this market. Incremented every time
        //                         `accrued` grows; never decremented by claim. Lets the
        //                         off-chain cycle pipeline compute per-cycle earnings as
        //                         the diff between two snapshots.
    }

    /// @notice Struct for pending reward info
    struct PendingReward {
        address vToken;
        address rewardToken;
        uint256 amount;
    }

    /// @notice Mapping of vToken to its market configuration
    mapping(address => Market) public markets;

    /// @notice Mapping of vToken -> user -> interest info
    mapping(address => mapping(address => Interest)) public interests;

    /// @notice Array of all Prime-participating markets
    address[] internal _allMarkets;

    /// @notice Mapping of underlying token to vToken address
    mapping(address => address) public vTokenForAsset;

    // ═══════════════════ SCORE PARAMETERS ═══════════════════

    /// @notice Alpha parameter numerator for score calculation
    uint128 public alphaNumerator;

    /// @notice Alpha parameter denominator for score calculation
    uint128 public alphaDenominator;

    // ═══════════════════ EXTERNAL CONTRACT REFERENCES ═══════════════════

    /// @notice Address of PrimeLiquidityProvider
    address public primeLiquidityProvider;

    /// @notice Oracle for price feeds
    ResilientOracleInterface public oracle;

    /// @notice Core pool comptroller address
    address public corePoolComptroller;

    // ═══════════════════ INCOME TRACKING ═══════════════════

    /// @notice Unreleased income from PrimeLiquidityProvider per token
    mapping(address => uint256) public unreleasedPLPIncome;

    /// @notice Income accrued while no scored members existed in the market.
    ///         Tracked per underlying so governance can reclaim the slice via
    ///         sweepUndistributed without touching user-owed funds.
    mapping(address => uint256) public undistributedReward;

    // ═══════════════════ SCORE UPDATE TRACKING ═══════════════════

    /// @notice Mapping to track if user's score was updated in a round
    mapping(uint256 => mapping(address => bool)) public isScoreUpdated;

    /// @notice Current score update round ID
    uint256 public nextScoreUpdateRoundId;

    /// @notice Number of pending score updates in current round
    uint256 public pendingScoreUpdates;

    /// @notice Address of PrimeLeaderboard contract for permissionless eligibility checks
    address public primeLeaderboard;

    /// @notice Minimum effective stake required for permissionless Prime minting
    uint256 public mintThreshold;

    /// @notice Unix timestamp after which permissionless minting is closed (0 = no deadline)
    uint256 public mintDeadline;

    /// @notice Storage gap for future upgrades
    uint256[40] private __gap;
}
