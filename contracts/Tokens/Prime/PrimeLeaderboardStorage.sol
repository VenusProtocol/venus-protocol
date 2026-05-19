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
    uint256 internal constant MAX_DEPOSITS_PER_USER = 30;

    /// @notice Scaling factor for calculations
    uint256 internal constant EXP_SCALE = 1e18;

    // ═══════════════════ USER DEPOSIT TRACKING ═══════════════════

    /// @notice User's deposit stack (LIFO order, index 0 = oldest)
    mapping(address => IPrimeLeaderboard.Deposit[]) internal _depositStacks;

    /// @notice User's total staked XVS
    mapping(address => uint256) public totalStaked;

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

    /// @notice Whether staker initialization is complete (prevents further initialization calls)
    bool public stakersInitialized;

    /// @notice Storage gap for future upgrades
    uint256[45] private __gap;
}
