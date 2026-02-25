// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { MaxLoopsLimitHelper } from "@venusprotocol/solidity-utilities/contracts/MaxLoopsLimitHelper.sol";
import { SafeCastUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import { IPrimeLeaderboard } from "./IPrimeLeaderboard.sol";
import { IXVSVault } from "./Interfaces/IXVSVault.sol";
import { PrimeLeaderboardStorageV1 } from "./PrimeLeaderboardStorage.sol";

/**
 * @title PrimeLeaderboard
 * @author Venus
 * @notice Manages the Prime V2 leaderboard with time-weighted scoring
 * @dev Tracks per-deposit timestamps for LIFO withdrawals and calculates effective stake.
 *      Called by XVSVault via the existing primeToken.xvsUpdated() callback.
 *      Admin reads getScores() off-chain, ranks users, and calls PrimeV2.issue()/burn() directly.
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
    using SafeCastUpgradeable for uint256;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the PrimeLeaderboard contract
     * @param accessControlManager_ Address of access control manager
     * @param xvsVault_ Address of XVSVault contract
     * @param xvsVaultRewardToken_ Reward token address in XVSVault
     * @param xvsVaultPoolId_ Pool ID in XVSVault
     * @param minimumStake_ Minimum XVS stake to participate
     * @param loopsLimit_ Maximum loops allowed in iterations
     * @custom:error Throw ZeroAddress if any address is zero
     * @custom:error Throw InvalidValue if minimumStake is zero
     */
    function initialize(
        address accessControlManager_,
        address xvsVault_,
        address xvsVaultRewardToken_,
        uint256 xvsVaultPoolId_,
        uint256 minimumStake_,
        uint256 loopsLimit_
    ) external initializer {
        if (xvsVault_ == address(0)) revert ZeroAddress();
        if (xvsVaultRewardToken_ == address(0)) revert ZeroAddress();
        if (minimumStake_ == 0) revert InvalidValue();

        __AccessControlled_init(accessControlManager_);
        __Pausable_init();
        __ReentrancyGuard_init();
        _setMaxLoopsLimit(loopsLimit_);

        xvsVault = xvsVault_;
        xvsVaultRewardToken = xvsVaultRewardToken_;
        xvsVaultPoolId = xvsVaultPoolId_;
        minimumStake = minimumStake_;

        // Initialize default multiplier tiers
        // Tier 1: 30 days -> 1.3x
        // Tier 2: 60 days -> 1.6x
        // Tier 3: 90 days -> 2.0x (cap)
        _multiplierDurations.push(30 days);
        _multiplierDurations.push(60 days);
        _multiplierDurations.push(90 days);

        _multiplierValues.push(1.3e18);
        _multiplierValues.push(1.6e18);
        _multiplierValues.push(2.0e18);
    }

    // ═══════════════════ XVS VAULT CALLBACK ═══════════════════

    /**
     * @notice Called by XVSVault (via primeToken.xvsUpdated) when a user's stake changes
     * @dev Reads the user's current vault balance, diffs against _lastKnownStake,
     *      and records the appropriate deposit or withdrawal internally.
     * @param user The user whose stake changed
     * @custom:event Emits DepositRecorded event on deposit
     * @custom:event Emits WithdrawalRecorded event on withdrawal
     * @custom:event Emits DepositsCompacted event if deposits are compacted
     * @custom:error Throw OnlyXVSVaultAllowed if caller is not XVSVault
     * @custom:error Throw ZeroAddress if user address is zero
     */
    function xvsUpdated(address user) external override {
        if (msg.sender != xvsVault) revert OnlyXVSVaultAllowed();
        if (user == address(0)) revert ZeroAddress();

        (uint256 xvs, , uint256 pendingWithdrawals) = IXVSVault(xvsVault).getUserInfo(
            xvsVaultRewardToken,
            xvsVaultPoolId,
            user
        );
        uint256 vaultStake = xvs - pendingWithdrawals;
        uint256 lastKnown = _lastKnownStake[user];
        _lastKnownStake[user] = vaultStake;

        if (vaultStake > lastKnown) {
            _recordDeposit(user, vaultStake - lastKnown);
        } else if (vaultStake < lastKnown) {
            _recordWithdrawal(user, lastKnown - vaultStake);
        }
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
        uint256 maxCapSeconds = _multiplierDurations[_multiplierDurations.length - 1];

        // Sum score from all active deposits: amount × multiplier × min(holdDays, capDays)
        for (uint256 i; i < depositsLength; ) {
            Deposit storage d = deposits[i];
            uint256 holdingDuration = block.timestamp - uint256(d.timestamp);
            uint256 multiplier = _getMultiplier(holdingDuration);
            uint256 cappedDuration = holdingDuration > maxCapSeconds ? maxCapSeconds : holdingDuration;
            uint256 durationDays = cappedDuration / 1 days;
            effectiveStake += (uint256(d.amount) * multiplier * durationDays) / EXP_SCALE;

            unchecked {
                ++i;
            }
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
     * @notice Alias for getEffectiveStake - calculates current time-weighted score
     * @param user The user's address
     * @return score The current effective stake score
     */
    function calculateCurrentScore(address user) external view override returns (uint256 score) {
        return getEffectiveStake(user);
    }

    /**
     * @notice Batch view to get effective stakes for multiple users
     * @param users Array of user addresses
     * @return scores Array of effective stake scores
     */
    function getScores(address[] calldata users) external view override returns (uint256[] memory scores) {
        uint256 usersLength = users.length;
        scores = new uint256[](usersLength);

        for (uint256 i; i < usersLength; ) {
            scores[i] = getEffectiveStake(users[i]);

            unchecked {
                ++i;
            }
        }

        return scores;
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
     * @notice Get multiplier tier configuration
     * @return durations Array of duration thresholds
     * @return multipliers Array of multiplier values
     */
    function getMultiplierTiers()
        external
        view
        override
        returns (uint256[] memory durations, uint256[] memory multipliers)
    {
        return (_multiplierDurations, _multiplierValues);
    }

    // ═══════════════════ ADMIN FUNCTIONS ═══════════════════

    /**
     * @notice Reset withdrawn score for a user to zero (called by backend after processing)
     * @param user The user whose withdrawn score should be reset
     * @custom:event Emits WithdrawnScoreReset event
     * @custom:error Throw ZeroAddress if user address is zero
     * @custom:access Controlled by ACM
     */
    function resetWithdrawnScore(address user) external override {
        _checkAccessAllowed("resetWithdrawnScore(address)");
        if (user == address(0)) revert ZeroAddress();

        uint256 oldScore = withdrawnScore[user];
        withdrawnScore[user] = 0;

        emit WithdrawnScoreReset(user, oldScore);
    }

    /**
     * @notice Set the minimum stake to participate
     * @param minimum New minimum stake amount
     * @custom:event Emits MinimumStakeUpdated event
     * @custom:error Throw InvalidValue if minimum is zero
     * @custom:access Controlled by ACM
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
     * @custom:event Emits MultiplierTiersUpdated event
     * @custom:error Throw LengthMismatch if durations and multipliers arrays have different lengths
     * @custom:error Throw InvalidValue if durations array is empty
     * @custom:error Throw InvalidMultiplierTiers if tiers are not in ascending order or multipliers below base
     * @custom:access Controlled by ACM
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
     * @custom:event Emits PrimeV2Set event
     * @custom:error Throw ZeroAddress if address is zero
     * @custom:access Controlled by ACM
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
     * @custom:event Emits XVSVaultSet event
     * @custom:error Throw ZeroAddress if address is zero
     * @custom:access Controlled by ACM
     */
    function setXVSVault(address xvsVault_) external override {
        _checkAccessAllowed("setXVSVault(address)");
        if (xvsVault_ == address(0)) revert ZeroAddress();

        address oldVault = xvsVault;
        xvsVault = xvsVault_;

        emit XVSVaultSet(oldVault, xvsVault_);
    }

    /**
     * @notice Set the XVSVault pool configuration for getUserInfo calls
     * @param rewardToken_ Reward token address in XVSVault
     * @param poolId_ Pool ID in XVSVault
     * @custom:event Emits XVSVaultPoolConfigSet event
     * @custom:error Throw ZeroAddress if rewardToken address is zero
     * @custom:access Controlled by ACM
     */
    function setXVSVaultPoolConfig(address rewardToken_, uint256 poolId_) external override {
        _checkAccessAllowed("setXVSVaultPoolConfig(address,uint256)");
        if (rewardToken_ == address(0)) revert ZeroAddress();

        xvsVaultRewardToken = rewardToken_;
        xvsVaultPoolId = poolId_;

        emit XVSVaultPoolConfigSet(rewardToken_, poolId_);
    }

    /**
     * @notice Pause the contract
     * @custom:event Emits Paused event
     * @custom:access Controlled by ACM
     */
    function pause() external override {
        _checkAccessAllowed("pause()");
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @custom:event Emits Unpaused event
     * @custom:access Controlled by ACM
     */
    function unpause() external override {
        _checkAccessAllowed("unpause()");
        _unpause();
    }

    /**
     * @notice Set the max loops limit
     * @param loopsLimit New loops limit
     * @custom:event Emits MaxLoopsLimitUpdated event
     * @custom:access Controlled by ACM
     */
    function setMaxLoopsLimit(uint256 loopsLimit) external override {
        _checkAccessAllowed("setMaxLoopsLimit(uint256)");
        _setMaxLoopsLimit(loopsLimit);
    }

    // ═══════════════════ INTERNAL FUNCTIONS ═══════════════════

    /**
     * @notice Record a new XVS deposit for a user
     * @param user The depositor's address
     * @param amount The amount of XVS deposited
     */
    function _recordDeposit(address user, uint256 amount) internal {
        if (amount == 0) return;

        Deposit[] storage deposits = _depositStacks[user];

        // Check deposit limit - compact if needed
        if (deposits.length >= MAX_DEPOSITS_PER_USER) {
            _compactDeposits(user);
        }

        // Add new deposit to the stack
        deposits.push(Deposit({ amount: amount.toUint128(), timestamp: block.timestamp.toUint64(), _reserved: 0 }));

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
     * @param amount The amount of XVS withdrawn
     */
    function _recordWithdrawal(address user, uint256 amount) internal {
        if (totalStaked[user] < amount) revert InsufficientStake();

        Deposit[] storage deposits = _depositStacks[user];
        uint256 remaining = amount;
        uint256 withdrawnScore = 0;
        uint256 maxCapSeconds = _multiplierDurations[_multiplierDurations.length - 1];

        // Process LIFO (from newest to oldest)
        while (remaining > 0 && deposits.length > 0) {
            uint256 lastIdx = deposits.length - 1;
            Deposit storage deposit = deposits[lastIdx];

            uint256 depositAmount = uint256(deposit.amount);
            uint256 toWithdraw = remaining > depositAmount ? depositAmount : remaining;

            // Calculate and lock the score for withdrawn amount (includes hold_duration)
            uint256 holdingDuration = block.timestamp - uint256(deposit.timestamp);
            uint256 multiplier = _getMultiplier(holdingDuration);
            uint256 cappedDuration = holdingDuration > maxCapSeconds ? maxCapSeconds : holdingDuration;
            uint256 durationDays = cappedDuration / 1 days;
            withdrawnScore += (toWithdraw * multiplier * durationDays) / EXP_SCALE;

            remaining -= toWithdraw;

            if (toWithdraw == depositAmount) {
                // Fully consumed this deposit
                deposits.pop();
            } else {
                // Partially consumed
                deposit.amount = (depositAmount - toWithdraw).toUint128();
            }
        }

        uint256 oldTotalStaked = totalStaked[user];
        uint256 newTotalStaked = oldTotalStaked - amount;
        totalStaked[user] = newTotalStaked;

        // Track withdrawn score for current round
        _updateWithdrawnScore(user, withdrawnScore);

        // Remove from participants if falling below minimum
        if (oldTotalStaked >= minimumStake && newTotalStaked < minimumStake) {
            _removeParticipant(user);
        }

        emit WithdrawalRecorded(user, amount, withdrawnScore, newTotalStaked);
    }

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
     * @notice Accumulate withdrawn score for a user (backend queries this separately)
     * @param user User address
     * @param score Score to add
     */
    function _updateWithdrawnScore(address user, uint256 score) internal {
        withdrawnScore[user] += score;
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
                amount: mergedAmount.toUint128(),
                timestamp: (block.timestamp - maxTierDuration).toUint64(),
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
