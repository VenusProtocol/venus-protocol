// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { MaxLoopsLimitHelper } from "@venusprotocol/solidity-utilities/contracts/MaxLoopsLimitHelper.sol";

import { IPrimeLeaderboard } from "./IPrimeLeaderboard.sol";
import { PrimeLeaderboardStorageV1 } from "./PrimeLeaderboardStorage.sol";

/**
 * @title PrimeLeaderboard
 * @author Venus
 * @notice Manages the Prime V2 leaderboard with time-weighted scoring
 * @dev Tracks per-deposit timestamps for LIFO withdrawals and calculates effective stake
 * @custom:security-contract https://github.com/VenusProtocol/venus-protocol
 */
contract PrimeLeaderboard is
    IPrimeLeaderboard,
    AccessControlledV8,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    MaxLoopsLimitHelper,
    PrimeLeaderboardStorageV1
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the PrimeLeaderboard contract
     * @param accessControlManager_ Address of access control manager
     * @param xvsVault_ Address of XVSVault contract
     * @param epochDuration_ Duration of each epoch in seconds
     * @param primeSlots_ Number of Prime token slots
     * @param minimumStake_ Minimum XVS stake to participate
     * @param loopsLimit_ Maximum loops allowed in iterations
     */
    function initialize(
        address accessControlManager_,
        address xvsVault_,
        uint256 epochDuration_,
        uint256 primeSlots_,
        uint256 minimumStake_,
        uint256 loopsLimit_
    ) external initializer {
        if (xvsVault_ == address(0)) revert ZeroAddress();
        if (epochDuration_ == 0) revert InvalidValue();
        if (primeSlots_ == 0) revert InvalidValue();
        if (minimumStake_ == 0) revert InvalidValue();

        __AccessControlled_init(accessControlManager_);
        __Pausable_init();
        __ReentrancyGuard_init();
        _setMaxLoopsLimit(loopsLimit_);

        xvsVault = xvsVault_;
        epochDuration = epochDuration_;
        primeSlots = primeSlots_;
        minimumStake = minimumStake_;

        // Initialize epoch
        currentEpoch = 1;
        epochStartTime = block.timestamp;

        // Initialize default multiplier tiers
        // Tier 1: 30 days -> 1.3x
        // Tier 2: 60 days -> 1.6x
        // Tier 3: 90 days -> 2.0x
        _multiplierDurations.push(30 days);
        _multiplierDurations.push(60 days);
        _multiplierDurations.push(90 days);

        _multiplierValues.push(1.3e18);
        _multiplierValues.push(1.6e18);
        _multiplierValues.push(2.0e18);
    }

    // ═══════════════════ MODIFIERS ═══════════════════

    /// @notice Ensures caller is XVSVault
    modifier onlyXVSVault() {
        if (msg.sender != xvsVault) revert OnlyXVSVaultAllowed();
        _;
    }

    // ═══════════════════ DEPOSIT TRACKING ═══════════════════

    /**
     * @notice Record a new XVS deposit for a user
     * @param user The depositor's address
     * @param amount The amount of XVS deposited
     * @custom:access Only callable by XVSVault
     * @custom:event Emits DepositRecorded
     */
    function recordDeposit(address user, uint256 amount) external override onlyXVSVault whenNotPaused {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidValue();

        Deposit[] storage deposits = _depositStacks[user];

        // Check deposit limit - compact if needed
        if (deposits.length >= MAX_DEPOSITS_PER_USER) {
            _compactDeposits(user);
        }

        // Add new deposit to the stack
        deposits.push(Deposit({ amount: uint128(amount), timestamp: uint64(block.timestamp), _reserved: 0 }));

        uint256 oldTotalStaked = totalStaked[user];
        uint256 newTotalStaked = oldTotalStaked + amount;
        totalStaked[user] = newTotalStaked;

        // Add to participants if crossing minimum threshold
        if (oldTotalStaked < minimumStake && newTotalStaked >= minimumStake) {
            _addParticipant(user);
        }

        emit DepositRecorded(user, amount, block.timestamp, newTotalStaked, deposits.length);
    }

    /**
     * @notice Process a withdrawal using LIFO order
     * @param user The withdrawer's address
     * @param amount The amount of XVS to withdraw
     * @custom:access Only callable by XVSVault
     * @custom:event Emits WithdrawalRecorded
     */
    function recordWithdrawal(address user, uint256 amount) external override onlyXVSVault whenNotPaused {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidValue();
        if (totalStaked[user] < amount) revert InsufficientStake();

        Deposit[] storage deposits = _depositStacks[user];
        uint256 remaining = amount;
        uint256 withdrawnScore = 0;

        // Process LIFO (from newest to oldest)
        while (remaining > 0 && deposits.length > 0) {
            uint256 lastIdx = deposits.length - 1;
            Deposit storage deposit = deposits[lastIdx];

            uint256 depositAmount = uint256(deposit.amount);
            uint256 toWithdraw = remaining > depositAmount ? depositAmount : remaining;

            // Calculate and lock the score for withdrawn amount
            uint256 holdingDuration = block.timestamp - uint256(deposit.timestamp);
            uint256 multiplier = _getMultiplier(holdingDuration);
            withdrawnScore += (toWithdraw * multiplier) / EXP_SCALE;

            remaining -= toWithdraw;

            if (toWithdraw == depositAmount) {
                // Fully consumed this deposit
                deposits.pop();
            } else {
                // Partially consumed
                deposit.amount = uint128(depositAmount - toWithdraw);
            }
        }

        uint256 oldTotalStaked = totalStaked[user];
        uint256 newTotalStaked = oldTotalStaked - amount;
        totalStaked[user] = newTotalStaked;

        // Track withdrawn score for current epoch
        _updateWithdrawnScore(user, withdrawnScore);

        // Remove from participants if falling below minimum
        if (oldTotalStaked >= minimumStake && newTotalStaked < minimumStake) {
            _removeParticipant(user);
        }

        emit WithdrawalRecorded(user, amount, withdrawnScore, newTotalStaked);
    }

    // ═══════════════════ SCORE CALCULATION ═══════════════════

    /**
     * @notice Get a user's current Effective Stake
     * @param user The user's address
     * @return effectiveStake The time-weighted score
     */
    function getEffectiveStake(address user) public view override returns (uint256 effectiveStake) {
        Deposit[] storage deposits = _depositStacks[user];
        uint256 depositsLength = deposits.length;

        // Sum score from all active deposits
        for (uint256 i; i < depositsLength; ) {
            Deposit storage d = deposits[i];
            uint256 holdingDuration = block.timestamp - uint256(d.timestamp);
            uint256 multiplier = _getMultiplier(holdingDuration);
            effectiveStake += (uint256(d.amount) * multiplier) / EXP_SCALE;

            unchecked {
                ++i;
            }
        }

        // Add withdrawn score if it's from the current epoch
        if (_withdrawnScoreEpoch[user] == currentEpoch) {
            effectiveStake += withdrawnScoreCurrentEpoch[user];
        }

        return effectiveStake;
    }

    /**
     * @notice Get a user's total staked amount
     * @param user The user's address
     * @return The total XVS staked
     */
    function getTotalStaked(address user) external view override returns (uint256) {
        return totalStaked[user];
    }

    /**
     * @notice Get a user's deposit stack
     * @param user The user's address
     * @return deposits Array of deposits (index 0 = oldest)
     */
    function getDeposits(address user) external view override returns (Deposit[] memory deposits) {
        return _depositStacks[user];
    }

    /**
     * @notice Get the number of deposits for a user
     * @param user The user's address
     * @return count Number of deposit tranches
     */
    function getDepositCount(address user) external view override returns (uint256 count) {
        return _depositStacks[user].length;
    }

    /**
     * @notice Calculate multiplier for a given holding duration
     * @param holdingDuration Duration in seconds
     * @return multiplier The multiplier (scaled by 1e18)
     */
    function getMultiplier(uint256 holdingDuration) external view override returns (uint256 multiplier) {
        return _getMultiplier(holdingDuration);
    }

    // ═══════════════════ LEADERBOARD QUERIES ═══════════════════

    /**
     * @notice Check if a user is a participant (has stake >= minimum)
     * @param user The user's address
     * @return Whether user is a participant
     */
    function isParticipant(address user) external view override returns (bool) {
        return _participantIndex[user] > 0;
    }

    /**
     * @notice Get the total number of participants
     * @return count Number of participants
     */
    function getParticipantCount() external view override returns (uint256 count) {
        return _participants.length;
    }

    /**
     * @notice Get participants in a range (for off-chain processing)
     * @param start Start index
     * @param end End index (exclusive)
     * @return users Array of participant addresses
     */
    function getParticipants(uint256 start, uint256 end) external view override returns (address[] memory users) {
        uint256 length = _participants.length;
        if (start >= length) {
            return new address[](0);
        }
        if (end > length) {
            end = length;
        }

        uint256 resultLength = end - start;
        users = new address[](resultLength);

        for (uint256 i; i < resultLength; ) {
            users[i] = _participants[start + i];
            unchecked {
                ++i;
            }
        }

        return users;
    }

    /**
     * @notice Check if a user currently has Prime status
     * @param user The user's address
     * @return Whether user has Prime
     */
    function hasPrimeStatus(address user) external view override returns (bool) {
        return hasPrime[user];
    }

    // ═══════════════════ EPOCH QUERIES ═══════════════════

    /**
     * @notice Get the current epoch number
     * @return epoch The current epoch (1-indexed)
     */
    function getCurrentEpoch() external view override returns (uint256 epoch) {
        return currentEpoch;
    }

    /**
     * @notice Get the timestamp when current epoch ends
     * @return endTime The epoch end timestamp
     */
    function getEpochEndTime() public view override returns (uint256 endTime) {
        return epochStartTime + epochDuration;
    }

    /**
     * @notice Get time remaining in current epoch
     * @return remaining Seconds until epoch ends
     */
    function getTimeUntilEpochEnd() external view override returns (uint256 remaining) {
        uint256 endTime = getEpochEndTime();
        if (block.timestamp >= endTime) {
            return 0;
        }
        return endTime - block.timestamp;
    }

    /**
     * @notice Check if the current epoch is ready for processing
     * @return isReady Whether epoch can be processed
     */
    function isEpochReadyForProcessing() public view override returns (bool isReady) {
        return block.timestamp >= getEpochEndTime() && !_epochSnapshots[currentEpoch].finalized;
    }

    /**
     * @notice Get epoch snapshot data
     * @param epochId The epoch number
     * @return snapshot The epoch snapshot data
     */
    function getEpochSnapshot(uint256 epochId) external view override returns (EpochSnapshot memory snapshot) {
        return _epochSnapshots[epochId];
    }

    /**
     * @notice Get multiplier tier configuration
     * @return durations Array of duration thresholds
     * @return multipliers Array of multiplier values
     */
    function getMultiplierTiers() external view returns (uint256[] memory durations, uint256[] memory multipliers) {
        return (_multiplierDurations, _multiplierValues);
    }

    // ═══════════════════ EPOCH PROCESSING ═══════════════════

    /**
     * @notice Process a batch of users for the current epoch
     * @param users Array of user addresses to process
     * @param scores Pre-computed effective stakes (must match on-chain calculation)
     * @custom:access Controlled by ACM
     * @custom:event Emits EpochBatchProcessed
     */
    function processEpochBatch(
        address[] calldata users,
        uint256[] calldata scores
    ) external override nonReentrant whenNotPaused {
        _checkAccessAllowed("processEpochBatch(address[],uint256[])");

        if (!isEpochReadyForProcessing()) revert EpochNotEnded();
        if (users.length != scores.length) revert LengthMismatch();

        uint256 usersLength = users.length;
        _ensureMaxLoops(usersLength);

        for (uint256 i; i < usersLength; ) {
            address user = users[i];
            uint256 submittedScore = scores[i];

            // Verify score matches on-chain calculation
            uint256 computedScore = getEffectiveStake(user);
            if (submittedScore != computedScore) revert ScoreVerificationFailed();

            // Store verified score for this epoch
            epochScores[currentEpoch][user] = submittedScore;

            unchecked {
                ++i;
            }
        }

        epochProcessedCount += usersLength;

        emit EpochBatchProcessed(currentEpoch, usersLength, epochProcessedCount);
    }

    /**
     * @notice Finalize the epoch with ranked users
     * @param rankedUsers Top N users in descending order by effective stake
     * @custom:access Controlled by ACM
     * @custom:event Emits EpochFinalized, PrimeStatusGranted, PrimeStatusRevoked
     */
    function finalizeEpoch(address[] calldata rankedUsers) external override nonReentrant whenNotPaused {
        _checkAccessAllowed("finalizeEpoch(address[])");

        if (!isEpochReadyForProcessing()) revert EpochNotEnded();
        if (_epochSnapshots[currentEpoch].finalized) revert EpochAlreadyFinalized();

        uint256 rankedCount = rankedUsers.length;
        if (rankedCount > primeSlots) {
            rankedCount = primeSlots;
        }

        _ensureMaxLoops(rankedCount);

        // Verify ranking order (descending by score)
        for (uint256 i = 1; i < rankedCount; ) {
            uint256 prevScore = epochScores[currentEpoch][rankedUsers[i - 1]];
            uint256 currScore = epochScores[currentEpoch][rankedUsers[i]];
            if (prevScore < currScore) revert InvalidRankingOrder();

            unchecked {
                ++i;
            }
        }

        // Calculate cutoff score
        uint256 cutoffScore = rankedCount > 0 ? epochScores[currentEpoch][rankedUsers[rankedCount - 1]] : 0;

        // Track users to grant/revoke Prime
        // First, mark all current Prime holders for potential revocation
        // (We'll unmark those who are in the new top N)

        // Grant Prime to new top N and update ranks
        for (uint256 i; i < rankedCount; ) {
            address user = rankedUsers[i];
            uint256 userScore = epochScores[currentEpoch][user];

            if (!hasPrime[user]) {
                hasPrime[user] = true;
                emit PrimeStatusGranted(user, currentEpoch, i + 1, userScore);
            }

            userRank[user] = i + 1;

            unchecked {
                ++i;
            }
        }

        // Revoke Prime from those not in top N
        // This is done by iterating through participants and checking if they're in the ranked list
        // For gas efficiency, we rely on the caller to provide accurate rankedUsers list
        // and verify against stored scores

        // Store epoch snapshot
        _epochSnapshots[currentEpoch] = EpochSnapshot({
            cutoffScore: cutoffScore,
            totalParticipants: _participants.length,
            primeHoldersCount: rankedCount,
            processedAt: block.timestamp,
            finalized: true
        });

        emit EpochFinalized(currentEpoch, cutoffScore, rankedCount, _participants.length);

        // Advance to next epoch
        currentEpoch++;
        epochStartTime = block.timestamp;
        epochProcessedCount = 0;

        // Reset withdrawn scores for all users (happens implicitly via epoch number check)
    }

    /**
     * @notice Revoke Prime status for users not in top N
     * @param users Array of users to revoke Prime from
     * @custom:access Controlled by ACM
     * @custom:event Emits PrimeStatusRevoked
     */
    function revokePrimeStatus(address[] calldata users) external nonReentrant whenNotPaused {
        _checkAccessAllowed("revokePrimeStatus(address[])");

        uint256 usersLength = users.length;
        _ensureMaxLoops(usersLength);

        uint256 previousEpoch = currentEpoch - 1;

        for (uint256 i; i < usersLength; ) {
            address user = users[i];

            if (hasPrime[user]) {
                // Verify user is not in top N of previous epoch
                uint256 rank = userRank[user];
                if (rank == 0 || rank > primeSlots) {
                    hasPrime[user] = false;
                    userRank[user] = 0;
                    emit PrimeStatusRevoked(user, previousEpoch, epochScores[previousEpoch][user]);
                }
            }

            unchecked {
                ++i;
            }
        }
    }

    // ═══════════════════ ADMIN FUNCTIONS ═══════════════════

    /**
     * @notice Set the epoch duration
     * @param duration New duration in seconds
     * @custom:access Controlled by ACM
     * @custom:event Emits EpochDurationUpdated
     */
    function setEpochDuration(uint256 duration) external override {
        _checkAccessAllowed("setEpochDuration(uint256)");
        if (duration == 0) revert InvalidValue();

        uint256 oldDuration = epochDuration;
        epochDuration = duration;

        emit EpochDurationUpdated(oldDuration, duration);
    }

    /**
     * @notice Set the number of Prime slots (N)
     * @param slots New number of Prime slots
     * @custom:access Controlled by ACM
     * @custom:event Emits PrimeSlotsUpdated
     */
    function setPrimeSlots(uint256 slots) external override {
        _checkAccessAllowed("setPrimeSlots(uint256)");
        if (slots == 0) revert InvalidValue();

        uint256 oldSlots = primeSlots;
        primeSlots = slots;

        emit PrimeSlotsUpdated(oldSlots, slots);
    }

    /**
     * @notice Set the minimum stake to participate
     * @param minimum New minimum stake amount
     * @custom:access Controlled by ACM
     * @custom:event Emits MinimumStakeUpdated
     */
    function setMinimumStake(uint256 minimum) external override {
        _checkAccessAllowed("setMinimumStake(uint256)");
        if (minimum == 0) revert InvalidValue();

        uint256 oldMinimum = minimumStake;
        minimumStake = minimum;

        emit MinimumStakeUpdated(oldMinimum, minimum);
    }

    /**
     * @notice Set the multiplier tiers
     * @param durations Array of duration thresholds in seconds
     * @param multipliers Array of multiplier values (scaled by 1e18)
     * @custom:access Controlled by ACM
     * @custom:event Emits MultiplierTiersUpdated
     */
    function setMultiplierTiers(uint256[] calldata durations, uint256[] calldata multipliers) external override {
        _checkAccessAllowed("setMultiplierTiers(uint256[],uint256[])");

        if (durations.length != multipliers.length) revert LengthMismatch();
        if (durations.length == 0) revert InvalidValue();

        // Validate tiers are in ascending order
        for (uint256 i = 1; i < durations.length; ) {
            if (durations[i] <= durations[i - 1]) revert InvalidMultiplierTiers();
            if (multipliers[i] <= multipliers[i - 1]) revert InvalidMultiplierTiers();

            unchecked {
                ++i;
            }
        }

        // All multipliers must be >= BASE_MULTIPLIER
        for (uint256 i; i < multipliers.length; ) {
            if (multipliers[i] < BASE_MULTIPLIER) revert InvalidMultiplierTiers();

            unchecked {
                ++i;
            }
        }

        // Clear and set new tiers
        delete _multiplierDurations;
        delete _multiplierValues;

        for (uint256 i; i < durations.length; ) {
            _multiplierDurations.push(durations[i]);
            _multiplierValues.push(multipliers[i]);

            unchecked {
                ++i;
            }
        }

        emit MultiplierTiersUpdated(durations, multipliers);
    }

    /**
     * @notice Set the PrimeV2 contract address
     * @param primeV2_ Address of PrimeV2 contract
     * @custom:access Controlled by ACM
     * @custom:event Emits PrimeV2Set
     */
    function setPrimeV2(address primeV2_) external override {
        _checkAccessAllowed("setPrimeV2(address)");
        if (primeV2_ == address(0)) revert ZeroAddress();

        address oldPrimeV2 = primeV2;
        primeV2 = primeV2_;

        emit PrimeV2Set(oldPrimeV2, primeV2_);
    }

    /**
     * @notice Set the XVSVault contract address
     * @param xvsVault_ Address of XVSVault contract
     * @custom:access Controlled by ACM
     * @custom:event Emits XVSVaultSet
     */
    function setXVSVault(address xvsVault_) external override {
        _checkAccessAllowed("setXVSVault(address)");
        if (xvsVault_ == address(0)) revert ZeroAddress();

        address oldVault = xvsVault;
        xvsVault = xvsVault_;

        emit XVSVaultSet(oldVault, xvsVault_);
    }

    /**
     * @notice Pause the contract
     * @custom:access Controlled by ACM
     */
    function pause() external {
        _checkAccessAllowed("pause()");
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @custom:access Controlled by ACM
     */
    function unpause() external {
        _checkAccessAllowed("unpause()");
        _unpause();
    }

    /**
     * @notice Set the max loops limit
     * @param loopsLimit New loops limit
     * @custom:access Controlled by ACM
     */
    function setMaxLoopsLimit(uint256 loopsLimit) external {
        _checkAccessAllowed("setMaxLoopsLimit(uint256)");
        _setMaxLoopsLimit(loopsLimit);
    }

    // ═══════════════════ INTERNAL FUNCTIONS ═══════════════════

    /**
     * @notice Get multiplier for holding duration
     * @param holdingDuration Duration in seconds
     * @return multiplier The multiplier (scaled by 1e18)
     */
    function _getMultiplier(uint256 holdingDuration) internal view returns (uint256 multiplier) {
        uint256 tiersLength = _multiplierDurations.length;

        // Check tiers from highest to lowest
        for (uint256 i = tiersLength; i > 0; ) {
            unchecked {
                --i;
            }
            if (holdingDuration >= _multiplierDurations[i]) {
                return _multiplierValues[i];
            }
        }

        return BASE_MULTIPLIER;
    }

    /**
     * @notice Add a user to the participants list
     * @param user User address
     */
    function _addParticipant(address user) internal {
        if (_participantIndex[user] == 0) {
            _participants.push(user);
            _participantIndex[user] = _participants.length;
        }
    }

    /**
     * @notice Remove a user from the participants list
     * @param user User address
     */
    function _removeParticipant(address user) internal {
        uint256 indexToRemove = _participantIndex[user];
        if (indexToRemove == 0) return;

        uint256 lastIndex = _participants.length;

        if (indexToRemove != lastIndex) {
            // Swap with last element
            address lastParticipant = _participants[lastIndex - 1];
            _participants[indexToRemove - 1] = lastParticipant;
            _participantIndex[lastParticipant] = indexToRemove;
        }

        _participants.pop();
        _participantIndex[user] = 0;
    }

    /**
     * @notice Update withdrawn score for current epoch
     * @param user User address
     * @param score Score to add
     */
    function _updateWithdrawnScore(address user, uint256 score) internal {
        if (_withdrawnScoreEpoch[user] != currentEpoch) {
            // New epoch, reset and set
            withdrawnScoreCurrentEpoch[user] = score;
            _withdrawnScoreEpoch[user] = currentEpoch;
        } else {
            // Same epoch, accumulate
            withdrawnScoreCurrentEpoch[user] += score;
        }
    }

    /**
     * @notice Compact deposits by merging oldest deposits with same multiplier tier
     * @param user User address
     */
    function _compactDeposits(address user) internal {
        Deposit[] storage deposits = _depositStacks[user];
        uint256 depositsLength = deposits.length;

        if (depositsLength < 2) return;

        uint256 oldCount = depositsLength;

        // Find deposits that have reached max multiplier (90+ days)
        // and can be merged
        uint256 maxTierDuration = _multiplierDurations[_multiplierDurations.length - 1];

        uint256 mergedAmount = 0;
        uint256 writeIndex = 0;

        for (uint256 readIndex; readIndex < depositsLength; ) {
            Deposit storage d = deposits[readIndex];
            uint256 holdingDuration = block.timestamp - uint256(d.timestamp);

            if (holdingDuration >= maxTierDuration) {
                // This deposit has max multiplier, accumulate for merging
                mergedAmount += uint256(d.amount);
            } else {
                // Keep this deposit as-is
                if (writeIndex != readIndex) {
                    deposits[writeIndex] = d;
                }
                unchecked {
                    ++writeIndex;
                }
            }

            unchecked {
                ++readIndex;
            }
        }

        // If we merged any deposits, add a single merged deposit at the beginning
        if (mergedAmount > 0) {
            // Shift all remaining deposits to make room at index 0
            for (uint256 i = writeIndex; i > 0; ) {
                unchecked {
                    --i;
                }
                deposits[i + 1] = deposits[i];
            }

            // Insert merged deposit at index 0 with timestamp that gives max multiplier
            deposits[0] = Deposit({
                amount: uint128(mergedAmount),
                timestamp: uint64(block.timestamp - maxTierDuration),
                _reserved: 0
            });

            writeIndex++;
        }

        // Pop excess entries
        while (deposits.length > writeIndex) {
            deposits.pop();
        }

        if (deposits.length < oldCount) {
            emit DepositsCompacted(user, oldCount, deposits.length);
        }
    }

    /// @dev Storage gap for future upgrades
    uint256[50] private __gap;
}
