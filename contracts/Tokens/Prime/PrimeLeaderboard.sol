// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { SafeCastUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import { MaxLoopsLimitHelper } from "@venusprotocol/solidity-utilities/contracts/MaxLoopsLimitHelper.sol";

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
    MaxLoopsLimitHelper,
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

    /// @notice Initializes immutable references; disables further initialization
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
     * @param loopsLimit_ Maximum number of loops allowed in a single transaction
     */
    function initialize(address accessControlManager_, uint256 loopsLimit_) external initializer {
        __AccessControlled_init(accessControlManager_);
        __ReentrancyGuard_init();
        _setMaxLoopsLimit(loopsLimit_);

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

    // ═══════════════════ STAKER INITIALIZATION ═══════════════════

    /**
     * @notice Batch-seed existing stakers' deposit data during migration
     * @dev Deployment process:
     *   1. Deploy PrimeLeaderboard (paused or before vault integration)
     *   2. Call initializeStakers() in batches to seed existing staker data
     *   3. Call finalizeInitialization() to lock seeding permanently
     *   4. Point XVSVault.primeToken to this contract to begin live tracking
     *
     * Idempotent: skips users with totalStaked[user] != 0 (already seeded).
     * @dev Caller must batch appropriately to avoid exceeding block gas limits.
     * @param users Array of user addresses to initialize
     * @param amounts Array of staked amounts (in XVS wei)
     * @param timestamps Array of deposit timestamps
     * @custom:event Emits StakerInitialized for each user successfully seeded
     * @custom:error Throw StakersAlreadyInitialized if finalizeInitialization was already called
     * @custom:error Throw LengthMismatch if array lengths don't match
     * @custom:access Controlled by ACM
     */
    function initializeStakers(
        address[] calldata users,
        uint256[] calldata amounts,
        uint64[] calldata timestamps
    ) external {
        _checkAccessAllowed("initializeStakers(address[],uint256[],uint64[])");
        if (stakersInitialized) revert StakersAlreadyInitialized();
        if (users.length != amounts.length || users.length != timestamps.length) revert LengthMismatch();

        uint256 usersLength = users.length;
        _ensureMaxLoops(usersLength);

        for (uint256 i; i < usersLength; ) {
            address user = users[i];

            // Idempotent: skip users already seeded
            if (totalStaked[user] == 0 && amounts[i] > 0) {
                uint64 ts = timestamps[i];
                if (ts == 0 || ts > block.timestamp) revert InvalidTimestamp();

                _depositStacks[user].push(
                    Deposit({ amount: SafeCastUpgradeable.toUint128(amounts[i]), timestamp: ts, _reserved: 0 })
                );
                totalStaked[user] = amounts[i];

                emit StakerInitialized(user, amounts[i], ts);
            }

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Finalize staker initialization, preventing further seeding
     * @dev Must be called after all initializeStakers batches are complete
     * @custom:event Emits StakersInitializationFinalized
     * @custom:error Throw StakersAlreadyInitialized if already finalized
     * @custom:access Controlled by ACM
     */
    function finalizeInitialization() external {
        _checkAccessAllowed("finalizeInitialization()");
        if (stakersInitialized) revert StakersAlreadyInitialized();

        stakersInitialized = true;

        emit StakersInitializationFinalized();
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
     * @custom:access Only callable by XVSVault
     */
    function xvsUpdated(address user) external override nonReentrant {
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

    // ═══════════════════ ADMIN FUNCTIONS ═══════════════════

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

        // Clear and set new tiers
        delete _multiplierDurations;
        delete _multiplierValues;

        // Validate and push in a single loop
        for (uint256 i; i < durations.length; ) {
            if (multipliers[i] < BASE_MULTIPLIER) revert InvalidMultiplierTiers();
            if (i > 0) {
                if (durations[i] <= durations[i - 1]) revert InvalidMultiplierTiers();
                if (multipliers[i] <= multipliers[i - 1]) revert InvalidMultiplierTiers();
            }

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
     * @notice Set the limit for the loops can iterate to avoid the DOS
     * @param loopsLimit Limit for the max loops can execute at a time
     * @custom:event Emits MaxLoopsLimitUpdated event
     * @custom:access Controlled by ACM
     */
    function setMaxLoopsLimit(uint256 loopsLimit) external {
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

        totalStaked[user] += amount;

        emit DepositRecorded(user, amount, block.timestamp, totalStaked[user], deposits.length);
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

        // Process LIFO (from newest to oldest)
        while (remaining > 0 && deposits.length > 0) {
            uint256 lastIdx = deposits.length - 1;
            Deposit storage deposit = deposits[lastIdx];

            uint256 depositAmount = uint256(deposit.amount);
            uint256 toWithdraw = remaining > depositAmount ? depositAmount : remaining;

            remaining -= toWithdraw;

            if (toWithdraw == depositAmount) {
                deposits.pop();
            } else {
                deposit.amount = (depositAmount - toWithdraw).toUint128();
            }
        }

        totalStaked[user] -= amount;

        emit WithdrawalRecorded(user, amount, totalStaked[user]);
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
     * @notice Compact deposits using a two-pass approach
     * @dev Pass 1 (lossless): Merge deposits that have reached the max multiplier tier.
     *      Pass 2 (fallback): If still at limit, merge all deposits within the same
     *      multiplier tier using the earliest timestamp per group. Guarantees reduction
     *      to at most (tiersCount) deposits. Minor score overestimate within a tier
     *      is acceptable since the score is only used for off-chain ranking.
     * @param user User address
     */
    function _compactDeposits(address user) internal {
        Deposit[] storage deposits = _depositStacks[user];
        uint256 depositsLength = deposits.length;

        if (depositsLength < 2) return;

        uint256 oldCount = depositsLength;

        // ── Pass 1: merge deposits that have reached max multiplier tier (lossless) ──
        uint256 maxTierDuration = _multiplierDurations[_multiplierDurations.length - 1];

        uint256 mergedAmount = 0;
        uint256 weightedTimestampSum = 0;
        uint256 writeIndex = 0;

        for (uint256 readIndex; readIndex < depositsLength; ) {
            Deposit storage d = deposits[readIndex];
            uint256 holdingDuration = block.timestamp - uint256(d.timestamp);

            if (holdingDuration >= maxTierDuration) {
                // This deposit has max multiplier, accumulate for merging.
                // Track amount-weighted timestamp sum so that if multiplier tiers are later
                // extended with a longer top duration, the merged entry's effective age
                // reflects the true mean of its constituents instead of over-crediting the
                // entire amount at the new top-tier multiplier.
                // Overflow safe: amount * timestamp <= 2^128 * 2^64 = 2^192, and the sum is
                // bounded by MAX_DEPOSITS_PER_USER * 2^192 < 2^256.
                mergedAmount += uint256(d.amount);
                weightedTimestampSum += uint256(d.amount) * uint256(d.timestamp);
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

        // If we merged any deposits, add a single merged deposit at the beginning.
        // The O(n) shift preserves oldest-first ordering required for LIFO withdrawals:
        // _recordWithdrawal pops from the end (newest first), so the merged max-tier
        // deposit must stay at index 0 to be withdrawn last.
        if (mergedAmount > 0) {
            for (uint256 i = writeIndex; i > 0; ) {
                unchecked {
                    --i;
                }
                deposits[i + 1] = deposits[i];
            }

            // Insert merged deposit at index 0 with the amount-weighted average timestamp
            // of its constituents.
            // Ceil the weighted timestamp so the merged deposit's duration rounds down conservatively.
            uint64 mergedTimestamp = uint64((weightedTimestampSum + mergedAmount - 1) / mergedAmount);
            deposits[0] = Deposit({ amount: mergedAmount.toUint128(), timestamp: mergedTimestamp, _reserved: 0 });

            writeIndex++;
        }

        // Pop excess entries from pass 1
        while (deposits.length > writeIndex) {
            deposits.pop();
        }

        // ── Pass 2 (fallback): if still at limit, merge deposits by multiplier tier ──
        if (deposits.length >= MAX_DEPOSITS_PER_USER) {
            _compactByTier(deposits);
        }

        if (deposits.length < oldCount) {
            emit DepositsCompacted(user, oldCount, deposits.length);
        }
    }

    /**
     * @notice Fallback compaction: merge deposits within the same multiplier tier
     * @dev Groups deposits by their current multiplier tier and merges each group
     *      into a single deposit using amount-weighted average timestamp. With N
     *      configured tiers, this guarantees at most N+1 deposits (one per tier
     *      bucket including base). The weighted average gives proportional time
     *      credit rather than overestimating with the earliest timestamp.
     *      Overflow safe: max_amount * max_timestamp ≈ 2^128 * 2^64 = 2^192 < 2^256.
     * @param deposits Storage reference to the user's deposit array
     */
    function _compactByTier(Deposit[] storage deposits) internal {
        uint256 tiersCount = _multiplierDurations.length + 1; // base tier + configured tiers
        uint256[] memory tierAmounts = new uint256[](tiersCount);
        uint256[] memory tierWeightedTimestamps = new uint256[](tiersCount);

        // Group deposits by tier using weighted timestamp sum
        uint256 depositsLength = deposits.length;
        for (uint256 i; i < depositsLength; ) {
            Deposit storage d = deposits[i];
            uint256 holdingDuration = block.timestamp - uint256(d.timestamp);
            uint256 tierIndex = _getTierIndex(holdingDuration);

            tierAmounts[tierIndex] += uint256(d.amount);
            tierWeightedTimestamps[tierIndex] += uint256(d.amount) * uint256(d.timestamp);

            unchecked {
                ++i;
            }
        }

        // Write back non-empty tiers, oldest first (highest tier index = longest duration)
        uint256 newCount = 0;
        for (uint256 i = tiersCount; i > 0; ) {
            unchecked {
                --i;
            }
            if (tierAmounts[i] > 0) {
                // Ceil the weighted timestamp so the merged deposit's duration rounds down conservatively.
                uint64 avgTimestamp = uint64((tierWeightedTimestamps[i] + tierAmounts[i] - 1) / tierAmounts[i]);
                deposits[newCount] = Deposit({
                    amount: tierAmounts[i].toUint128(),
                    timestamp: avgTimestamp,
                    _reserved: 0
                });
                unchecked {
                    ++newCount;
                }
            }
        }

        while (deposits.length > newCount) {
            deposits.pop();
        }
    }

    /**
     * @notice Determine which multiplier tier a holding duration falls into
     * @param holdingDuration Duration in seconds
     * @return tierIndex Index of the tier (0 = base, 1+ = configured tiers)
     */
    function _getTierIndex(uint256 holdingDuration) internal view returns (uint256 tierIndex) {
        uint256 tiersLength = _multiplierDurations.length;
        for (uint256 i = tiersLength; i > 0; ) {
            unchecked {
                --i;
            }
            if (holdingDuration >= _multiplierDurations[i]) {
                return i + 1;
            }
        }
        return 0;
    }
}
