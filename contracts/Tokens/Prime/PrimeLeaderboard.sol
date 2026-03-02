// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { SafeCastUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import { IPrimeLeaderboard } from "./IPrimeLeaderboard.sol";
import { IPrimeV2 } from "./Interfaces/IPrimeV2.sol";
import { IXVSVault } from "./Interfaces/IXVSVault.sol";
import { PrimeLeaderboardStorageV1 } from "./PrimeLeaderboardStorage.sol";

/**
 * @title PrimeLeaderboard
 * @author Venus
 * @notice Manages the Prime V2 leaderboard with time-weighted scoring
 * @dev Tracks per-deposit timestamps for LIFO withdrawals and calculates effective stake.
 *      Called by XVSVault via the existing primeToken.xvsUpdated() callback.
 *      Admin reads getEffectiveStakeBatch() off-chain, ranks users, and calls PrimeV2.issue()/burn() directly.
 * @custom:security-contract https://github.com/VenusProtocol/venus-protocol
 */
contract PrimeLeaderboard is
    IPrimeLeaderboard,
    AccessControlledV8,
    ReentrancyGuardUpgradeable,
    PrimeLeaderboardStorageV1
{
    using SafeCastUpgradeable for uint256;

    /// @notice Address of XVSVault contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable xvsVault;

    /// @notice Reward token address in XVSVault
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable xvsVaultRewardToken;

    /// @notice Pool ID in XVSVault
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable xvsVaultPoolId;

    /// @param xvsVault_ Address of XVSVault contract
    /// @param xvsVaultRewardToken_ Reward token address in XVSVault
    /// @param xvsVaultPoolId_ Pool ID in XVSVault
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address xvsVault_, address xvsVaultRewardToken_, uint256 xvsVaultPoolId_) {
        if (xvsVault_ == address(0)) revert ZeroAddress();
        if (xvsVaultRewardToken_ == address(0)) revert ZeroAddress();

        xvsVault = xvsVault_;
        xvsVaultRewardToken = xvsVaultRewardToken_;
        xvsVaultPoolId = xvsVaultPoolId_;

        _disableInitializers();
    }

    /**
     * @notice Initialize the PrimeLeaderboard contract
     * @param accessControlManager_ Address of access control manager
     * @param minimumStake_ Minimum XVS stake to participate
     * @custom:error Throw InvalidValue if minimumStake is zero
     */
    function initialize(address accessControlManager_, uint256 minimumStake_) external initializer {
        if (minimumStake_ == 0) revert InvalidValue();

        __AccessControlled_init(accessControlManager_);
        __ReentrancyGuard_init();

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
     * @dev Reads the user's current vault balance, diffs against totalStaked,
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
        uint256 lastKnown = totalStaked[user];

        if (vaultStake > lastKnown) {
            _recordDeposit(user, vaultStake - lastKnown);
        } else if (vaultStake < lastKnown) {
            _recordWithdrawal(user, lastKnown - vaultStake);
        }

        if (primeV2 != address(0)) {
            IPrimeV2(primeV2).accrueInterestAndUpdateScore(user);
        }
    }

    // ═══════════════════ SCORE CALCULATION ═══════════════════

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
     * @notice Batch view to get effective stakes for multiple users
     * @param users Array of user addresses
     * @return scores Array of effective stake scores
     */
    function getEffectiveStakeBatch(address[] calldata users) external view override returns (uint256[] memory scores) {
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

    /**
     * @notice Get a user's current Effective Stake
     * @param user The user's address
     * @return effectiveStake The time-weighted score
     */
    function getEffectiveStake(address user) public view override returns (uint256 effectiveStake) {
        Deposit[] storage deposits = _depositStacks[user];
        uint256 depositsLength = deposits.length;
        uint256 maxCapSeconds = _multiplierDurations[_multiplierDurations.length - 1];

        // Sum score from all active deposits: amount × multiplier × min(holdSeconds, capSeconds)
        for (uint256 i; i < depositsLength; ) {
            Deposit storage d = deposits[i];
            uint256 holdingDuration = block.timestamp - uint256(d.timestamp);
            uint256 multiplier = _getMultiplier(holdingDuration);
            uint256 cappedDuration = holdingDuration > maxCapSeconds ? maxCapSeconds : holdingDuration;
            effectiveStake += (uint256(d.amount) * multiplier * cappedDuration) / EXP_SCALE;

            unchecked {
                ++i;
            }
        }

        return effectiveStake;
    }

    /**
     * @notice Get a user's currently active withdrawn stake (0 if expired)
     * @param user The user's address
     * @return stake The accumulated withdrawn stake score for the current period
     */
    function getWithdrawnStake(address user) external view override returns (uint256 stake) {
        WithdrawnStakeInfo storage info = _withdrawnStakes[user];
        if (block.timestamp >= uint256(info.expiration)) {
            return 0;
        }
        return uint256(info.stake);
    }

    // ═══════════════════ ADMIN FUNCTIONS ═══════════════════

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

        uint256 newTotalStaked = totalStaked[user] + amount;
        totalStaked[user] = newTotalStaked;

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
        uint256 scoreFromWithdrawal = 0;
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
            scoreFromWithdrawal += (toWithdraw * multiplier * cappedDuration) / EXP_SCALE;

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

        // Track withdrawn stake for current round
        _updateWithdrawnStake(user, scoreFromWithdrawal);

        emit WithdrawalRecorded(user, amount, scoreFromWithdrawal, newTotalStaked);
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
     * @notice Accumulate withdrawn stake for a user with auto-expiry at month boundary
     * @dev If the previous period has expired, starts a new period with expiration = 1st of next month.
     *      Otherwise, accumulates into the existing period.
     * @param user User address
     * @param score Score to add
     */
    function _updateWithdrawnStake(address user, uint256 score) internal {
        WithdrawnStakeInfo storage info = _withdrawnStakes[user];

        if (block.timestamp >= uint256(info.expiration)) {
            // Previous period expired (or first ever): start a new period
            info.stake = score.toUint192();
            info.expiration = _getNextMonthStart(block.timestamp).toUint64();
        } else {
            // Same period: accumulate
            info.stake = (uint256(info.stake) + score).toUint192();
        }
    }

    /**
     * @notice Compute the Unix timestamp for the 1st day of the next calendar month at 00:00 UTC
     * @dev Uses the civil calendar algorithm (adapted from BokkyPooBah's DateTime Library, MIT license)
     * @param timestamp Current Unix timestamp
     * @return The Unix timestamp for the start of the next month
     */
    function _getNextMonthStart(uint256 timestamp) internal pure returns (uint256) {
        (uint256 year, uint256 month, ) = _timestampToDate(timestamp);
        if (month == 12) {
            year += 1;
            month = 1;
        } else {
            month += 1;
        }
        return _timestampFromDate(year, month, 1);
    }

    /**
     * @notice Convert Unix timestamp to calendar date
     * @dev Adapted from BokkyPooBah's DateTime Library (MIT license)
     */
    function _timestampToDate(uint256 timestamp) private pure returns (uint256 year, uint256 month, uint256 day) {
        uint256 _days = timestamp / 86400;
        int256 L = int256(_days) + 68569 + 2440588;
        int256 N = (4 * L) / 146097;
        L = L - (146097 * N + 3) / 4;
        int256 _year = (4000 * (L + 1)) / 1461001;
        L = L - (1461 * _year) / 4 + 31;
        int256 _month = (80 * L) / 2447;
        int256 _day = L - (2447 * _month) / 80;
        L = _month / 11;
        _month = _month + 2 - 12 * L;
        _year = 100 * (N - 49) + _year + L;

        year = uint256(_year);
        month = uint256(_month);
        day = uint256(_day);
    }

    /**
     * @notice Convert calendar date to Unix timestamp
     * @dev Adapted from BokkyPooBah's DateTime Library (MIT license)
     */
    function _timestampFromDate(uint256 year, uint256 month, uint256 day) private pure returns (uint256) {
        int256 _year = int256(year);
        int256 _month = int256(month);
        int256 _day = int256(day);

        int256 __days = _day -
            32075 +
            (1461 * (_year + 4800 + (_month - 14) / 12)) /
            4 +
            (367 * (_month - 2 - ((_month - 14) / 12) * 12)) /
            12 -
            (3 * ((_year + 4900 + (_month - 14) / 12) / 100)) /
            4 -
            2440588;

        return uint256(__days) * 86400;
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
        uint64 earliestTimestamp = type(uint64).max;
        uint256 writeIndex = 0;

        for (uint256 readIndex; readIndex < depositsLength; ) {
            Deposit storage d = deposits[readIndex];
            uint256 holdingDuration = block.timestamp - uint256(d.timestamp);

            if (holdingDuration >= maxTierDuration) {
                // This deposit has max multiplier, accumulate for merging
                mergedAmount += uint256(d.amount);
                if (d.timestamp < earliestTimestamp) {
                    earliestTimestamp = d.timestamp;
                }
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

            // Insert merged deposit at index 0, preserving the earliest original timestamp
            // so that if multiplier tiers are later increased, the true hold duration is retained
            deposits[0] = Deposit({ amount: mergedAmount.toUint128(), timestamp: earliestTimestamp, _reserved: 0 });

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
}
