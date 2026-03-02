// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { MaxLoopsLimitHelper } from "@venusprotocol/solidity-utilities/contracts/MaxLoopsLimitHelper.sol";

import { IPrimeLeaderboard } from "./IPrimeLeaderboard.sol";
import { IPrimeV2 } from "./Interfaces/IPrimeV2.sol";

/**
 * @title PrimeV2Keeper
 * @author Venus
 * @notice Automates the operational tasks of the PrimeV2 system:
 *
 * 1. SCORE UPDATES: processScoreUpdates()
 *    - When pendingScoreUpdates > 0 (after alpha/multiplier changes)
 *    - Calls PrimeV2.updateScores() in batches
 *
 * 2. INTEREST ACCRUAL: accrueAllMarkets()
 *    - Calls accrueInterest() on all Prime markets to keep rewards current
 *
 * Designed for use with:
 * - OpenZeppelin Defender Relayer (recommended)
 * - Chainlink Keepers / Automation
 * - Custom keeper bots
 *
 * @custom:security-contract https://github.com/VenusProtocol/venus-protocol
 */
contract PrimeV2Keeper is AccessControlledV8, MaxLoopsLimitHelper {
    /// @notice PrimeV2 contract
    IPrimeV2 public primeV2;

    /// @notice PrimeLeaderboard contract
    IPrimeLeaderboard public primeLeaderboard;

    /// @notice Batch size for operations
    uint256 public batchSize;

    // ═══════════════════ EVENTS ═══════════════════

    /// @notice Emitted when score updates are processed for a batch of users
    event ScoreUpdatesProcessed(uint256 count);

    /// @notice Emitted when interest is accrued on all Prime markets
    event AllMarketsAccrued(uint256 marketCount);

    /// @notice Emitted when the batch size is updated
    event BatchSizeUpdated(uint256 oldSize, uint256 newSize);

    /// @notice Emitted when PrimeV2 or PrimeLeaderboard contract references are updated
    event ContractsUpdated(address primeV2, address primeLeaderboard);

    // ═══════════════════ ERRORS ═══════════════════

    /// @notice Error thrown when a zero address is passed
    error InvalidAddress();

    /// @notice Error thrown when batch size is zero or users array exceeds batch size
    error InvalidBatchSize();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the keeper
     * @param accessControlManager_ ACM address
     * @param primeV2_ PrimeV2 address
     * @param primeLeaderboard_ PrimeLeaderboard address
     * @param batchSize_ Number of users to process per batch
     * @param loopsLimit_ Maximum loops allowed
     * @custom:error Throw InvalidAddress if any address is zero
     * @custom:error Throw InvalidBatchSize if batch size is zero
     */
    function initialize(
        address accessControlManager_,
        address primeV2_,
        address primeLeaderboard_,
        uint256 batchSize_,
        uint256 loopsLimit_
    ) external initializer {
        if (primeV2_ == address(0) || primeLeaderboard_ == address(0)) revert InvalidAddress();
        if (batchSize_ == 0) revert InvalidBatchSize();

        __AccessControlled_init(accessControlManager_);
        _setMaxLoopsLimit(loopsLimit_);

        primeV2 = IPrimeV2(primeV2_);
        primeLeaderboard = IPrimeLeaderboard(primeLeaderboard_);
        batchSize = batchSize_;
    }

    // ═══════════════════ KEEPER OPERATIONS ═══════════════════

    /**
     * @notice Process pending score updates on PrimeV2 in batches
     * @param users Array of Prime holders whose scores need updating
     * @dev Called when pendingScoreUpdates > 0 (after alpha or multiplier changes)
     * @custom:event Emits ScoreUpdatesProcessed event
     * @custom:error Throw InvalidBatchSize if users array exceeds batch size
     * @custom:access Controlled by ACM
     */
    function processScoreUpdates(address[] calldata users) external {
        _checkAccessAllowed("processScoreUpdates(address[])");

        uint256 usersLength = users.length;
        if (usersLength > batchSize) revert InvalidBatchSize();

        primeV2.updateScores(users);

        emit ScoreUpdatesProcessed(usersLength);
    }

    /**
     * @notice Accrue interest on all Prime markets
     * @dev Should be called periodically to keep reward indexes up to date
     * @custom:event Emits AllMarketsAccrued event
     * @custom:access Controlled by ACM
     */
    function accrueAllMarkets() external {
        _checkAccessAllowed("accrueAllMarkets()");

        address[] memory markets = primeV2.getAllMarkets();
        uint256 marketsLength = markets.length;
        _ensureMaxLoops(marketsLength);

        for (uint256 i; i < marketsLength; ) {
            primeV2.accrueInterest(markets[i]);
            unchecked {
                ++i;
            }
        }

        emit AllMarketsAccrued(marketsLength);
    }

    // ═══════════════════ VIEW FUNCTIONS ═══════════════════

    /**
     * @notice Check if there are pending score updates
     * @return pending Number of pending updates
     */
    function getPendingScoreUpdates() external view returns (uint256) {
        return primeV2.pendingScoreUpdates();
    }

    // ═══════════════════ ADMIN FUNCTIONS ═══════════════════

    /**
     * @notice Update batch size
     * @param batchSize_ New batch size
     * @custom:event Emits BatchSizeUpdated event
     * @custom:error Throw InvalidBatchSize if batch size is zero
     * @custom:access Controlled by ACM
     */
    function setBatchSize(uint256 batchSize_) external {
        _checkAccessAllowed("setBatchSize(uint256)");
        if (batchSize_ == 0) revert InvalidBatchSize();

        uint256 oldSize = batchSize;
        batchSize = batchSize_;

        emit BatchSizeUpdated(oldSize, batchSize_);
    }

    /**
     * @notice Update contract references
     * @param primeV2_ New PrimeV2 address
     * @param primeLeaderboard_ New PrimeLeaderboard address
     * @custom:event Emits ContractsUpdated event
     * @custom:error Throw InvalidAddress if any address is zero
     * @custom:access Controlled by ACM
     */
    function setContracts(address primeV2_, address primeLeaderboard_) external {
        _checkAccessAllowed("setContracts(address,address)");
        if (primeV2_ == address(0) || primeLeaderboard_ == address(0)) revert InvalidAddress();

        primeV2 = IPrimeV2(primeV2_);
        primeLeaderboard = IPrimeLeaderboard(primeLeaderboard_);

        emit ContractsUpdated(primeV2_, primeLeaderboard_);
    }

    /**
     * @notice Update max loops limit
     * @param loopsLimit New loops limit
     * @custom:event Emits MaxLoopsLimitUpdated event
     * @custom:access Controlled by ACM
     */
    function setMaxLoopsLimit(uint256 loopsLimit) external {
        _checkAccessAllowed("setMaxLoopsLimit(uint256)");
        _setMaxLoopsLimit(loopsLimit);
    }

    /// @dev Storage gap for future upgrades
    uint256[47] private __gap;
}
