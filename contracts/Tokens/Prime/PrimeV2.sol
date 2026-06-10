// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { MaxLoopsLimitHelper } from "@venusprotocol/solidity-utilities/contracts/MaxLoopsLimitHelper.sol";
import { TimeManagerV8 } from "@venusprotocol/solidity-utilities/contracts/TimeManagerV8.sol";
import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";

import { PrimeV2StorageV1 } from "./PrimeV2Storage.sol";
import { Scores } from "./libs/Scores.sol";
import { IPrimeLiquidityProvider } from "./Interfaces/IPrimeLiquidityProvider.sol";
import { IPrimeLeaderboard } from "./IPrimeLeaderboard.sol";
import { IXVSVault } from "./Interfaces/IXVSVault.sol";
import { IVToken } from "./Interfaces/IVToken.sol";
import { InterfaceComptroller } from "./Interfaces/InterfaceComptroller.sol";

/**
 * @title PrimeV2
 * @author Venus
 * @notice Prime V2 Token with leaderboard-based distribution
 * @dev Prime status is determined by PrimeLeaderboard contract based on time-weighted XVS staking
 * @custom:security-contract https://github.com/VenusProtocol/venus-protocol
 */
contract PrimeV2 is
    AccessControlledV8,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    MaxLoopsLimitHelper,
    TimeManagerV8,
    PrimeV2StorageV1
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Address of wrapped native token
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable WRAPPED_NATIVE_TOKEN;

    /// @notice Address of native market vToken
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable NATIVE_MARKET;

    /// @notice Address of XVSVault contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable xvsVault;

    /// @notice Reward token address in XVSVault
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable xvsVaultRewardToken;

    /// @notice Pool ID in XVSVault
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable xvsVaultPoolId;

    // ═══════════════════ EVENTS ═══════════════════

    /// @notice Emitted when prime token is minted
    event Mint(address indexed user);

    /// @notice Emitted when prime token is burned
    event Burn(address indexed user);

    /// @notice Emitted when a market is added to prime program
    event MarketAdded(address indexed market, uint256 supplyMultiplier, uint256 borrowMultiplier);

    /// @notice Emitted when a market is removed from Prime
    event MarketRemoved(address indexed market);

    /// @notice Emitted when mint limit is updated
    event MintLimitUpdated(uint256 oldLimit, uint256 newLimit);

    /// @notice Emitted when user score is updated
    event UserScoreUpdated(address indexed user);

    /// @notice Emitted when alpha is updated
    event AlphaUpdated(uint128 oldNumerator, uint128 oldDenominator, uint128 newNumerator, uint128 newDenominator);

    /// @notice Emitted when multiplier is updated
    event MultiplierUpdated(
        address indexed market,
        uint256 oldSupplyMultiplier,
        uint256 oldBorrowMultiplier,
        uint256 newSupplyMultiplier,
        uint256 newBorrowMultiplier
    );

    /// @notice Emitted when interest is claimed
    event InterestClaimed(address indexed user, address indexed market, uint256 amount);

    /// @notice Emitted when an incomplete score update round is discarded
    event IncompleteRoundDiscarded(uint256 indexed roundId, uint256 remainingUpdates);

    /// @notice Emitted when mint threshold and deadline are updated
    event MintThresholdUpdated(uint256 oldThreshold, uint256 newThreshold, uint256 deadline);

    /// @notice Emitted when prime leaderboard address is updated
    event PrimeLeaderboardSet(address indexed oldLeaderboard, address indexed newLeaderboard);

    /// @notice Emitted when a user is skipped in claimPrimeBatch due to insufficient score
    event SkippedIneligibleUser(address indexed user, uint256 score, uint256 threshold);

    /// @notice Emitted when governance reclaims an undistributed reward slice for a market
    event UndistributedSwept(address indexed underlying, address indexed to, uint256 amount);

    /// @notice Emitted when the keeper records the on-chain start of a reward cycle.
    event CycleSnapshotRecorded(uint256 indexed cycleId, uint256 blockNumber, uint256 timestamp);

    // ═══════════════════ ERRORS ═══════════════════

    /// @notice Error thrown when market is not supported
    error MarketNotSupported();

    /// @notice Error thrown when mint limit is reached
    error InvalidLimit();

    /// @notice Error thrown when user has no prime token
    error UserHasNoPrimeToken();

    /// @notice Error thrown when user already has prime token
    error UserAlreadyHasPrimeToken();

    /// @notice Error thrown when no score updates are required
    error NoScoreUpdatesRequired();

    /// @notice Error thrown when market already exists
    error MarketAlreadyExists();

    /// @notice Error thrown when asset already exists
    error AssetAlreadyExists();

    /// @notice Error thrown when invalid address is passed
    error InvalidAddress();

    /// @notice Error thrown when invalid alpha arguments are passed
    error InvalidAlphaArguments();

    /// @notice Error thrown when invalid vToken is passed
    error InvalidVToken();

    /// @notice Error thrown when both market multipliers are zero
    error InvalidMultipliers();

    /// @notice Error thrown when issue/burn is attempted during an active score update round
    error ScoreUpdateInProgress();

    /// @notice Error thrown when trying to remove a market that still has active members with scores
    error MarketHasActiveMembers();

    /// @notice Error thrown when user's effective stake is below the mint threshold
    error EligibilityBelowThreshold(address user, uint256 score, uint256 threshold);

    /// @notice Error thrown when primeLeaderboard address is not set
    error LeaderboardNotSet();

    /// @notice Error thrown when mintThreshold is zero (not configured for this epoch)
    error MintThresholdNotSet();

    /// @notice Error thrown when the permissionless minting window has expired
    error MintWindowClosed();

    /// @notice Error thrown when mintDeadline is not strictly in the future
    error InvalidDeadline();

    /// @notice Error thrown when caller is not the PrimeLeaderboard contract
    error OnlyPrimeLeaderboard();

    /// @notice Error thrown when underlying token decimals exceed 18
    error UnsupportedUnderlyingDecimals(uint256 decimals);

    /**
     * @notice PrimeV2 constructor
     * @param wrappedNativeToken_ Address of wrapped native token
     * @param nativeMarket_ Address of native market
     * @param xvsVault_ Address of XVSVault contract
     * @param xvsVaultRewardToken_ Reward token address in XVSVault
     * @param xvsVaultPoolId_ Pool ID in XVSVault
     * @param timeBased_ A boolean indicating whether the contract is based on time or block
     * @param blocksPerYear_ Total blocks per year
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address wrappedNativeToken_,
        address nativeMarket_,
        address xvsVault_,
        address xvsVaultRewardToken_,
        uint256 xvsVaultPoolId_,
        bool timeBased_,
        uint256 blocksPerYear_
    ) TimeManagerV8(timeBased_, blocksPerYear_) {
        if (xvsVault_ == address(0)) revert InvalidAddress();
        if (xvsVaultRewardToken_ == address(0)) revert InvalidAddress();

        WRAPPED_NATIVE_TOKEN = wrappedNativeToken_;
        NATIVE_MARKET = nativeMarket_;
        xvsVault = xvsVault_;
        xvsVaultRewardToken = xvsVaultRewardToken_;
        xvsVaultPoolId = xvsVaultPoolId_;

        _disableInitializers();
    }

    /**
     * @notice PrimeV2 initializer
     * @param alphaNumerator_ Numerator of alpha (if alpha is 0.5 then numerator is 1)
     * @param alphaDenominator_ Denominator of alpha (if alpha is 0.5 then denominator is 2)
     * @param accessControlManager_ Address of AccessControlManager
     * @param primeLiquidityProvider_ Address of PrimeLiquidityProvider
     * @param corePoolComptroller_ Address of core pool comptroller
     * @param oracle_ Address of Oracle
     * @param loopsLimit_ Maximum number of loops allowed in a single transaction
     * @custom:error Throw InvalidAddress if any of the address is zero
     * @custom:error Throw InvalidAlphaArguments if alpha arguments are invalid
     */
    function initialize(
        uint128 alphaNumerator_,
        uint128 alphaDenominator_,
        address accessControlManager_,
        address primeLiquidityProvider_,
        address corePoolComptroller_,
        address oracle_,
        uint256 loopsLimit_
    ) external initializer {
        if (primeLiquidityProvider_ == address(0)) revert InvalidAddress();
        if (corePoolComptroller_ == address(0)) revert InvalidAddress();
        if (oracle_ == address(0)) revert InvalidAddress();

        _checkAlphaArguments(alphaNumerator_, alphaDenominator_);

        __AccessControlled_init(accessControlManager_);
        __Pausable_init();
        __ReentrancyGuard_init();
        _setMaxLoopsLimit(loopsLimit_);

        alphaNumerator = alphaNumerator_;
        alphaDenominator = alphaDenominator_;
        primeLiquidityProvider = primeLiquidityProvider_;
        corePoolComptroller = corePoolComptroller_;
        oracle = ResilientOracleInterface(oracle_);

        // Default limit
        tokenLimit = 500;
    }

    // ═══════════════════ PRIME TOKEN MANAGEMENT ═══════════════════

    /**
     * @notice Mint a Prime token for a user in a permissionless way
     * @dev Checks user's effective stake from PrimeLeaderboard against mintThreshold.
     *      Anyone can call this on behalf of an eligible user. No ACM required.
     *      mintThreshold must be set by governance after each epoch before this is usable.
     * @param user User address to mint for
     * @custom:event Emits Mint event on new token issuance
     * @custom:error Throw ScoreUpdateInProgress if a score update round is active
     * @custom:error Throw UserAlreadyHasPrimeToken if user already has a token
     * @custom:error Throw LeaderboardNotSet if primeLeaderboard address is not configured
     * @custom:error Throw MintThresholdNotSet if mintThreshold is zero
     * @custom:error Throw EligibilityBelowThreshold if user's effective stake < mintThreshold
     * @custom:error Throw InvalidLimit if mint limit would be exceeded
     * @custom:error Throw MintWindowClosed if the minting deadline has passed
     */
    function claimPrime(address user) external nonReentrant whenNotPaused {
        if (user == address(0)) revert InvalidAddress();
        if (pendingScoreUpdates > 0) revert ScoreUpdateInProgress();
        if (isPrimeHolder[user]) revert UserAlreadyHasPrimeToken();

        address leaderboard = primeLeaderboard;
        if (leaderboard == address(0)) revert LeaderboardNotSet();

        uint256 threshold = mintThreshold;
        if (threshold == 0) revert MintThresholdNotSet();

        uint256 deadline = mintDeadline;
        if (deadline != 0 && block.timestamp > deadline) revert MintWindowClosed();

        uint256 score = IPrimeLeaderboard(leaderboard).getEffectiveStake(user);
        if (score < threshold) revert EligibilityBelowThreshold(user, score, threshold);

        _mint(user);
        _initializeMarkets(user);
    }

    /**
     * @notice Mint Prime tokens for multiple users in a permissionless way
     * @dev Non-holders below mintThreshold are skipped with a SkippedIneligibleUser event
     *      (not reverted), so one ineligible user cannot block the rest of the batch.
     *      Existing Prime holders are silently skipped. Anyone can call this. No ACM required.
     * @param users Array of user addresses to mint for
     * @custom:event Emits Mint event for each new token issuance
     * @custom:event Emits SkippedIneligibleUser for each non-holder below threshold
     * @custom:error Throw ScoreUpdateInProgress if a score update round is active
     * @custom:error Throw LeaderboardNotSet if primeLeaderboard address is not configured
     * @custom:error Throw MintThresholdNotSet if mintThreshold is zero
     * @custom:error Throw MintWindowClosed if the minting deadline has passed
     * @custom:error Throw InvalidLimit if mint limit would be exceeded
     */
    function claimPrimeBatch(address[] calldata users) external nonReentrant whenNotPaused {
        if (pendingScoreUpdates > 0) revert ScoreUpdateInProgress();

        address leaderboard = primeLeaderboard;
        if (leaderboard == address(0)) revert LeaderboardNotSet();

        uint256 threshold = mintThreshold;
        if (threshold == 0) revert MintThresholdNotSet();

        uint256 deadline = mintDeadline;
        if (deadline != 0 && block.timestamp > deadline) revert MintWindowClosed();

        uint256 usersLength = users.length;
        _ensureMaxLoops(usersLength);

        _accrueAllMarkets();

        for (uint256 i; i < usersLength; ) {
            address user = users[i];

            if (!isPrimeHolder[user]) {
                uint256 score = IPrimeLeaderboard(leaderboard).getEffectiveStake(user);
                if (score < threshold) {
                    emit SkippedIneligibleUser(user, score, threshold);
                } else {
                    _mint(user);
                    _initializeMarketsWithoutAccrual(user);
                }
            }

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Issue a Prime token to a single user (admin function)
     * @param user User address
     * @custom:event Emits Mint event on new token issuance
     * @custom:error Throw InvalidAddress if user is zero address
     * @custom:error Throw InvalidLimit if mint limit would be exceeded
     * @custom:error Throw UserAlreadyHasPrimeToken if user already has a token
     * @custom:error Throw ScoreUpdateInProgress if a score update round is active
     * @custom:access Controlled by ACM
     */
    function issue(address user) external {
        _checkAccessAllowed("issue(address)");
        if (user == address(0)) revert InvalidAddress();
        if (pendingScoreUpdates > 0) revert ScoreUpdateInProgress();
        if (isPrimeHolder[user]) revert UserAlreadyHasPrimeToken();

        _mint(user);
        _initializeMarkets(user);
    }

    /**
     * @notice Issue Prime tokens to multiple users (admin function)
     * @param users Array of user addresses
     * @custom:event Emits Mint event on new token issuance
     * @custom:error Throw InvalidAddress if any user in the batch is zero address
     * @custom:error Throw InvalidLimit if mint limit would be exceeded
     * @custom:error Throw ScoreUpdateInProgress if a score update round is active
     * @custom:access Controlled by ACM
     */
    function issueBatch(address[] calldata users) external {
        _checkAccessAllowed("issueBatch(address[])");
        if (pendingScoreUpdates > 0) revert ScoreUpdateInProgress();

        uint256 usersLength = users.length;
        _ensureMaxLoops(usersLength);

        _accrueAllMarkets();

        for (uint256 i; i < usersLength; ) {
            address user = users[i];
            if (user == address(0)) revert InvalidAddress();

            if (!isPrimeHolder[user]) {
                _mint(user);
                _initializeMarketsWithoutAccrual(user);
            }

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Burn a user's Prime token (admin function)
     * @param user User address
     * @custom:event Emits Burn event
     * @custom:error Throw UserHasNoPrimeToken if user has no prime token
     * @custom:error Throw ScoreUpdateInProgress if a score update round is active
     * @custom:access Controlled by ACM
     */
    function burn(address user) external {
        _checkAccessAllowed("burn(address)");
        if (pendingScoreUpdates > 0) revert ScoreUpdateInProgress();
        if (!isPrimeHolder[user]) revert UserHasNoPrimeToken();
        _burn(user);
    }

    /**
     * @notice Burn Prime tokens for multiple users (admin function)
     * @param users Array of user addresses
     * @custom:event Emits Burn event for each user
     * @custom:error Throw ScoreUpdateInProgress if a score update round is active
     * @custom:access Controlled by ACM
     */
    function burnBatch(address[] calldata users) external {
        _checkAccessAllowed("burnBatch(address[])");
        if (pendingScoreUpdates > 0) revert ScoreUpdateInProgress();

        uint256 usersLength = users.length;
        _ensureMaxLoops(usersLength);

        _accrueAllMarkets();

        for (uint256 i; i < usersLength; ) {
            if (isPrimeHolder[users[i]]) {
                _burnWithoutAccrual(users[i]);
            }

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Check if user has Prime token
     * @param user User address
     * @return exists Whether user has Prime token
     */
    function isUserPrimeHolder(address user) external view returns (bool) {
        return isPrimeHolder[user];
    }

    // ═══════════════════ INTEREST FUNCTIONS ═══════════════════

    /**
     * @notice Claim accrued interest for a market
     * @param vToken Market address
     * @return amount Amount claimed
     * @custom:event Emits InterestClaimed event
     * @custom:error Throw MarketNotSupported if market is not supported
     */
    function claimInterest(address vToken) external nonReentrant whenNotPaused returns (uint256) {
        return _claimInterest(vToken, msg.sender);
    }

    /**
     * @notice Claim accrued interest for a market to a specific address
     * @dev Permissionless: anyone can trigger a claim on behalf of a user.
     *      Tokens are always sent to the user address, never to msg.sender.
     * @param vToken Market address
     * @param user Recipient address
     * @return amount Amount claimed
     * @custom:event Emits InterestClaimed event
     * @custom:error Throw MarketNotSupported if market is not supported
     */
    function claimInterest(address vToken, address user) external nonReentrant whenNotPaused returns (uint256) {
        return _claimInterest(vToken, user);
    }

    /**
     * @notice Accrue interest for a market
     * @dev Intentionally not gated by whenNotPaused to ensure fair reward distribution during pauses
     * @param vToken Market address
     * @custom:error Throw MarketNotSupported if market is not supported
     */
    function accrueInterest(address vToken) public {
        Market storage market = markets[vToken];
        if (!market.exists) revert MarketNotSupported();

        address underlying = _getUnderlying(vToken);

        IPrimeLiquidityProvider _primeLiquidityProvider = IPrimeLiquidityProvider(primeLiquidityProvider);
        _primeLiquidityProvider.accrueTokens(underlying);
        uint256 totalAccruedInPLP = _primeLiquidityProvider.tokenAmountAccrued(underlying);
        uint256 distributionIncome = totalAccruedInPLP - unreleasedPLPIncome[underlying];

        if (distributionIncome == 0) return;

        if (market.sumOfMembersScore != 0) {
            uint256 indexDelta = (distributionIncome * EXP_SCALE) / market.sumOfMembersScore;

            // The slice is too small to move the index by a full unit. Leave it
            // pending (do not advance the anchor) so it is retried on the next
            // accrual once enough income accumulates, instead of being marked
            // consumed and permanently stranded (precision-truncation leak).
            if (indexDelta == 0) return;

            market.rewardIndex += indexDelta;

            // Advance the anchor only by the income actually reflected in the
            // index; the truncation remainder stays pending for the next accrual.
            uint256 indexedIncome = (indexDelta * market.sumOfMembersScore) / EXP_SCALE;
            unreleasedPLPIncome[underlying] += indexedIncome;
        } else {
            // No scored members yet: record the slice so governance can
            // reclaim it later via sweepUndistributed instead of stranding it.
            unreleasedPLPIncome[underlying] = totalAccruedInPLP;
            undistributedReward[underlying] += distributionIncome;
        }
    }

    /**
     * @notice Accrue interest and update score for a user in a specific market
     * @dev Intentionally not gated by whenNotPaused — called by Comptroller hooks
     * @param user User address
     * @param market Market address
     */
    function accrueInterestAndUpdateScore(address user, address market) external {
        _executeBoost(user, market);
        _updateScore(user, market);
    }

    /**
     * @notice Accrue interest and update score for a user across all markets
     * @dev Called by PrimeLeaderboard when a user's XVS stake changes to ensure
     *      rewards are accrued at the old score before the score is recalculated
     * @param user User address
     * @custom:error Throw OnlyPrimeLeaderboard if caller is not the PrimeLeaderboard contract
     */
    function accrueInterestAndUpdateScore(address user) external {
        if (msg.sender != primeLeaderboard) revert OnlyPrimeLeaderboard();
        _accrueInterestAndUpdateScore(user);
    }

    /**
     * @notice Get pending rewards for a user
     * @param user User address
     * @return pendingRewards Array of pending rewards per market
     */
    function getPendingRewards(address user) external returns (PendingReward[] memory pendingRewards) {
        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;
        pendingRewards = new PendingReward[](marketsLength);

        for (uint256 i; i < marketsLength; ) {
            address vToken = allMarkets[i];
            accrueInterest(vToken);

            uint256 accrued = interests[vToken][user].accrued;
            uint256 pending = _interestAccrued(vToken, user);
            uint256 total = accrued + pending;

            address underlying = _getUnderlying(vToken);

            pendingRewards[i] = PendingReward({ vToken: vToken, rewardToken: underlying, amount: total });

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Get pending rewards for a user (view-only, does not accrue)
     * @dev Returns rewards based on last accrued state without triggering new accrual
     * @param user User address
     * @return pendingRewards Array of pending rewards per market
     */
    function getPendingRewardsStatic(address user) external view returns (PendingReward[] memory pendingRewards) {
        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;
        pendingRewards = new PendingReward[](marketsLength);

        for (uint256 i; i < marketsLength; ) {
            address vToken = allMarkets[i];

            uint256 accrued = interests[vToken][user].accrued;
            uint256 pending = _interestAccrued(vToken, user);
            uint256 total = accrued + pending;

            address underlying = _getUnderlying(vToken);

            pendingRewards[i] = PendingReward({ vToken: vToken, rewardToken: underlying, amount: total });

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Lifetime accrued rewards for many users in a single market
     * @dev Pure view over the lifetimeAccrued mapping; intended for the off-chain cycle
     *      pipeline to snapshot per-(market, user) earnings without indexing events.
     * @param market vToken address
     * @param users Array of user addresses
     * @return amounts Array of lifetime accrued amounts, indexed parallel to users
     */
    function getLifetimeAccruedByMarket(
        address market,
        address[] calldata users
    ) external view returns (uint256[] memory amounts) {
        uint256 usersLength = users.length;
        amounts = new uint256[](usersLength);
        for (uint256 i; i < usersLength; ) {
            amounts[i] = interests[market][users[i]].lifetimeAccrued;
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Lifetime accrued rewards for one user across many markets
     * @param user User address
     * @param markets_ Array of vToken addresses
     * @return amounts Array of lifetime accrued amounts, indexed parallel to markets_
     */
    function getLifetimeAccruedByUser(
        address user,
        address[] calldata markets_
    ) external view returns (uint256[] memory amounts) {
        uint256 marketsLength = markets_.length;
        amounts = new uint256[](marketsLength);
        for (uint256 i; i < marketsLength; ) {
            amounts[i] = interests[markets_[i]][user].lifetimeAccrued;
            unchecked {
                ++i;
            }
        }
    }

    // ═══════════════════ SCORE FUNCTIONS ═══════════════════

    /**
     * @notice Update scores for a batch of users
     * @dev Intentionally not gated by whenNotPaused — keeper must complete rounds even during pauses
     * @param users Array of user addresses
     * @custom:event Emits UserScoreUpdated event
     * @custom:error Throw NoScoreUpdatesRequired if no score updates are required
     */
    function updateScores(address[] calldata users) external {
        if (pendingScoreUpdates == 0) revert NoScoreUpdatesRequired();

        uint256 usersLength = users.length;
        _ensureMaxLoops(usersLength);

        _accrueAllMarkets();

        for (uint256 i; i < usersLength; ) {
            address user = users[i];

            if (!isPrimeHolder[user]) {
                unchecked {
                    ++i;
                }
                continue;
            }

            if (isScoreUpdated[nextScoreUpdateRoundId][user]) {
                unchecked {
                    ++i;
                }
                continue;
            }

            _accrueInterestAndUpdateScoreWithoutAccrual(user);
            isScoreUpdated[nextScoreUpdateRoundId][user] = true;

            unchecked {
                --pendingScoreUpdates;
                ++i;
            }

            emit UserScoreUpdated(user);
        }
    }

    // ═══════════════════ VIEW FUNCTIONS ═══════════════════

    /**
     * @notice Get all Prime markets
     * @return Array of market addresses
     */
    function getAllMarkets() external view returns (address[] memory) {
        return _allMarkets;
    }

    /**
     * @notice Get user's XVS balance from vault
     * @param user User address
     * @return xvsBalance User's XVS balance
     */
    function xvsBalanceOfUser(address user) external view returns (uint256) {
        return _xvsBalanceOfUser(user);
    }

    // ═══════════════════ ADMIN FUNCTIONS ═══════════════════

    /**
     * @notice Add a market to Prime
     * @param market Market address
     * @param supplyMultiplier Supply multiplier
     * @param borrowMultiplier Borrow multiplier
     * @custom:event Emits MarketAdded event
     * @custom:error Throw MarketAlreadyExists if market already exists
     * @custom:error Throw InvalidMultipliers if both multipliers are zero
     * @custom:error Throw InvalidVToken if market is not listed
     * @custom:error Throw AssetAlreadyExists if asset already has a market
     * @custom:error Throw MaxLoopsLimitExceeded if listing this market would exceed loopsLimit
     * @custom:error Throw UnsupportedUnderlyingDecimals if underlying token has decimals > 18
     * @custom:access Controlled by ACM
     */
    function addMarket(address market, uint256 supplyMultiplier, uint256 borrowMultiplier) external {
        _checkAccessAllowed("addMarket(address,uint256,uint256)");

        if (markets[market].exists) revert MarketAlreadyExists();
        if (supplyMultiplier == 0 && borrowMultiplier == 0) revert InvalidMultipliers();

        bool isListed = InterfaceComptroller(corePoolComptroller).markets(market);
        if (!isListed) revert InvalidVToken();

        address underlying = _getUnderlying(market);
        if (vTokenForAsset[underlying] != address(0)) revert AssetAlreadyExists();

        uint256 underlyingDecimals = IERC20MetadataUpgradeable(underlying).decimals();
        if (underlyingDecimals > 18) revert UnsupportedUnderlyingDecimals(underlyingDecimals);

        markets[market] = Market({
            supplyMultiplier: supplyMultiplier,
            borrowMultiplier: borrowMultiplier,
            rewardIndex: 0,
            sumOfMembersScore: 0,
            exists: true
        });

        vTokenForAsset[underlying] = market;
        _allMarkets.push(market);
        _ensureMaxLoops(_allMarkets.length);

        _queueScoreUpdates();

        emit MarketAdded(market, supplyMultiplier, borrowMultiplier);
    }

    /**
     * @notice Remove a market from the Prime program
     * @param market Market vToken address to remove
     * @custom:event Emits MarketRemoved event
     * @custom:error Throw MarketNotSupported if market doesn't exist
     * @custom:error Throw MarketHasActiveMembers if market still has members with scores
     * @custom:access Controlled by ACM
     */
    function removeMarket(address market) external {
        _checkAccessAllowed("removeMarket(address)");

        if (!markets[market].exists) revert MarketNotSupported();
        if (markets[market].sumOfMembersScore > 0) revert MarketHasActiveMembers();

        // Flush any pending PLP slice before deletion. sumOfMembersScore is 0
        // here, so accrueInterest routes the slice into undistributedReward
        // (recoverable via sweepUndistributed) instead of stranding it once the
        // market is deleted and accrueInterest can no longer run for it.
        accrueInterest(market);

        address underlying = _getUnderlying(market);

        // Clear market state
        delete markets[market];
        delete vTokenForAsset[underlying];

        // Swap-and-pop from _allMarkets array
        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;
        for (uint256 i; i < marketsLength; ) {
            if (allMarkets[i] == market) {
                allMarkets[i] = allMarkets[marketsLength - 1];
                allMarkets.pop();
                break;
            }
            unchecked {
                ++i;
            }
        }

        emit MarketRemoved(market);
    }

    /**
     * @notice Update mint limit
     * @param tokenLimit_ New token limit
     * @custom:event Emits MintLimitUpdated event
     * @custom:error Throw InvalidLimit if limit is less than current count
     * @custom:access Controlled by ACM
     */
    function setLimit(uint256 tokenLimit_) external {
        _checkAccessAllowed("setLimit(uint256)");

        if (tokenLimit_ < totalTokens) {
            revert InvalidLimit();
        }

        emit MintLimitUpdated(tokenLimit, tokenLimit_);

        tokenLimit = tokenLimit_;
    }

    /**
     * @notice Update alpha parameter
     * @param alphaNumerator_ New alpha numerator
     * @param alphaDenominator_ New alpha denominator
     * @custom:event Emits AlphaUpdated event
     * @custom:error Throw InvalidAlphaArguments if alpha arguments are invalid
     * @custom:access Controlled by ACM
     */
    function updateAlpha(uint128 alphaNumerator_, uint128 alphaDenominator_) external {
        _checkAccessAllowed("updateAlpha(uint128,uint128)");
        _checkAlphaArguments(alphaNumerator_, alphaDenominator_);

        emit AlphaUpdated(alphaNumerator, alphaDenominator, alphaNumerator_, alphaDenominator_);

        alphaNumerator = alphaNumerator_;
        alphaDenominator = alphaDenominator_;

        _queueScoreUpdates();
    }

    /**
     * @notice Update market multipliers
     * @param market Market address
     * @param supplyMultiplier New supply multiplier
     * @param borrowMultiplier New borrow multiplier
     * @custom:event Emits MultiplierUpdated event
     * @custom:error Throw MarketNotSupported if market is not supported
     * @custom:error Throw InvalidMultipliers if both multipliers are zero
     * @custom:access Controlled by ACM
     */
    function updateMultipliers(address market, uint256 supplyMultiplier, uint256 borrowMultiplier) external {
        _checkAccessAllowed("updateMultipliers(address,uint256,uint256)");

        Market storage marketData = markets[market];

        if (!marketData.exists) revert MarketNotSupported();
        if (supplyMultiplier == 0 && borrowMultiplier == 0) revert InvalidMultipliers();

        accrueInterest(market);

        emit MultiplierUpdated(
            market,
            marketData.supplyMultiplier,
            marketData.borrowMultiplier,
            supplyMultiplier,
            borrowMultiplier
        );

        marketData.supplyMultiplier = supplyMultiplier;
        marketData.borrowMultiplier = borrowMultiplier;

        _queueScoreUpdates();
    }

    /**
     * @notice Pause the contract
     * @custom:event Emits Paused event
     * @custom:access Controlled by ACM
     */
    function pause() external {
        _checkAccessAllowed("pause()");
        _pause();
    }

    /**
     * @notice Unpause the contract
     * @custom:event Emits Unpaused event
     * @custom:access Controlled by ACM
     */
    function unpause() external {
        _checkAccessAllowed("unpause()");
        _unpause();
    }

    /**
     * @notice Set max loops limit
     * @param loopsLimit New loops limit
     * @custom:event Emits MaxLoopsLimitUpdated event
     * @custom:access Controlled by ACM
     */
    function setMaxLoopsLimit(uint256 loopsLimit) external {
        _checkAccessAllowed("setMaxLoopsLimit(uint256)");
        _setMaxLoopsLimit(loopsLimit);
    }

    /**
     * @notice Set the PrimeLeaderboard contract address used for permissionless mint eligibility
     * @param primeLeaderboard_ Address of PrimeLeaderboard contract
     * @custom:event Emits PrimeLeaderboardSet event
     * @custom:error Throw InvalidAddress if address is zero
     * @custom:access Controlled by ACM
     */
    function setPrimeLeaderboard(address primeLeaderboard_) external {
        _checkAccessAllowed("setPrimeLeaderboard(address)");
        if (primeLeaderboard_ == address(0)) revert InvalidAddress();

        emit PrimeLeaderboardSet(primeLeaderboard, primeLeaderboard_);
        primeLeaderboard = primeLeaderboard_;
    }

    /**
     * @notice Set the minimum effective stake threshold and minting deadline for permissionless Prime minting
     * @dev Governance calls this after each epoch. Pass mintThreshold_ = 0 to disable the permissionless
     *      minting window immediately. Pass mintDeadline_ = 0 for no expiry.
     *      The window auto-closes once block.timestamp exceeds mintDeadline_.
     * @param mintThreshold_ New mint threshold (set to 0 to close the window)
     * @param mintDeadline_ Unix timestamp after which minting is closed (0 = no deadline)
     * @custom:event Emits MintThresholdUpdated event
     * @custom:error Throw InvalidDeadline if mintDeadline_ is non-zero and not strictly in the future
     * @custom:access Controlled by ACM
     */
    function setMintThreshold(uint256 mintThreshold_, uint256 mintDeadline_) external {
        _checkAccessAllowed("setMintThreshold(uint256,uint256)");
        if (mintDeadline_ != 0 && mintDeadline_ <= block.timestamp) revert InvalidDeadline();

        emit MintThresholdUpdated(mintThreshold, mintThreshold_, mintDeadline_);
        mintThreshold = mintThreshold_;
        mintDeadline = mintDeadline_;
    }

    /**
     * @notice Emit a cycle-start anchor event so the off-chain pipeline can recover cycle
     *         boundaries by indexing the event log
     * @dev Operational hook, not a policy lever. Grant the ACM permission
     *      "recordCycleSnapshot(uint256)" to a keeper EOA/bot at deploy, not to the Timelock —
     *      cycles fire on a recurring schedule (e.g. monthly) and routing each call through
     *      governance is too slow. Not idempotent on-chain: duplicate cycleIds emit duplicate
     *      events and must be de-duplicated by the indexer.
     * @param cycleId Identifier of the cycle whose start is being recorded
     * @custom:event Emits CycleSnapshotRecorded
     * @custom:access Controlled by ACM — grant to keeper, not Timelock
     */
    function recordCycleSnapshot(uint256 cycleId) external {
        _checkAccessAllowed("recordCycleSnapshot(uint256)");
        emit CycleSnapshotRecorded(cycleId, block.number, block.timestamp);
    }

    /**
     * @notice Reclaim PLP income that accrued for a market while no scored
     *         members existed in it
     * @dev Flushes any pending PLP delta via accrueInterest first so the
     *      slice is fully captured in undistributedReward, then pulls funds
     *      from PrimeLiquidityProvider when Prime's local balance is short,
     *      mirroring the _claimInterest pattern (delete unreleasedPLPIncome
     *      then call releaseFunds, both sides reset atomically).
     * @param vToken Market address whose underlying slice should be swept
     * @param to Recipient of the swept tokens
     * @custom:event Emits UndistributedSwept on a non-zero transfer
     * @custom:error Throw MarketNotSupported if vToken is not a Prime market
     * @custom:error Throw InvalidAddress if to is the zero address
     * @custom:access Controlled by ACM
     */
    function sweepUndistributed(address vToken, address to) external {
        _checkAccessAllowed("sweepUndistributed(address,address)");
        if (to == address(0)) revert InvalidAddress();

        address underlying = _getUnderlying(vToken);

        // Skip accrual for removed markets: accrueInterest reverts on !exists,
        // and their pending slice was already flushed into undistributedReward
        // by removeMarket before deletion. Active markets still flush here.
        if (markets[vToken].exists) {
            accrueInterest(vToken);
        }

        uint256 amount = undistributedReward[underlying];
        if (amount == 0) return;

        IERC20Upgradeable asset = IERC20Upgradeable(underlying);
        uint256 available = asset.balanceOf(address(this));
        if (amount > available) {
            delete unreleasedPLPIncome[underlying];
            IPrimeLiquidityProvider(primeLiquidityProvider).releaseFunds(underlying);
        }

        delete undistributedReward[underlying];
        asset.safeTransfer(to, amount);

        emit UndistributedSwept(underlying, to, amount);
    }

    // ═══════════════════ INTERNAL FUNCTIONS ═══════════════════

    /**
     * @notice Mint a Prime token
     * @dev Caller must ensure user does not already have a token (e.g. issue() checks this)
     * @param user User address
     */
    function _mint(address user) internal {
        isPrimeHolder[user] = true;

        ++totalTokens;
        if (totalTokens > tokenLimit) revert InvalidLimit();

        emit Mint(user);
    }

    /**
     * @notice Burn a Prime token
     * @param user User address
     */
    function _burn(address user) internal {
        _accrueAllMarkets();
        _burnWithoutAccrual(user);
    }

    /**
     * @notice Burn a Prime token (without calling accrueAllMarkets)
     * @dev Caller must ensure _accrueAllMarkets() was called beforehand
     * @param user User address
     */
    function _burnWithoutAccrual(address user) internal {
        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;
        _ensureMaxLoops(marketsLength);

        for (uint256 i; i < marketsLength; ) {
            address market = allMarkets[i];
            _executeBoostWithoutAccrual(user, market);
            markets[market].sumOfMembersScore = markets[market].sumOfMembersScore - interests[market][user].score;

            delete interests[market][user].score;
            delete interests[market][user].rewardIndex;

            unchecked {
                ++i;
            }
        }

        --totalTokens;

        delete isPrimeHolder[user];

        emit Burn(user);
    }

    /**
     * @notice Initialize markets for a new Prime holder (with accrual)
     * @param account User address
     */
    function _initializeMarkets(address account) internal {
        _accrueAllMarkets();
        _initializeMarketsWithoutAccrual(account);
    }

    /**
     * @notice Initialize markets for a new Prime holder (without accrual)
     * @dev Caller must ensure _accrueAllMarkets() was called beforehand
     * @param account User address
     */
    function _initializeMarketsWithoutAccrual(address account) internal {
        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;
        _ensureMaxLoops(marketsLength);

        for (uint256 i; i < marketsLength; ) {
            address market = allMarkets[i];

            interests[market][account].rewardIndex = markets[market].rewardIndex;

            uint256 score = _calculateScore(market, account);
            interests[market][account].score = score;
            markets[market].sumOfMembersScore = markets[market].sumOfMembersScore + score;

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Claim interest for a user
     * @dev Allows claiming residual accrued interest even after a market is removed.
     *      Reverts with MarketNotSupported only if the market is removed AND the user has no accrued balance.
     * @param vToken Market address
     * @param user User address
     * @return amount Amount claimed
     */
    function _claimInterest(address vToken, address user) internal returns (uint256) {
        bool marketExists = markets[vToken].exists;

        uint256 amount;
        if (marketExists) {
            // accrueInterest is a market-global operation: it indexes pending
            // PLP income into rewardIndex for ALL holders. It must run before
            // the releaseFunds path below can pull and clear that income, even
            // when `user` is no longer a Prime holder — otherwise a residual
            // claim strands the freshly accrued slice as untracked surplus.
            accrueInterest(vToken);

            if (isPrimeHolder[user]) {
                amount = _interestAccrued(vToken, user);
                // _claimInterest runs its own accrual rather than going through
                // _executeBoost, so bump lifetimeAccrued here too to keep the
                // counter monotonic and complete. Skip the SSTORE when there's
                // no fresh delta (idle market or zero score) to save gas.
                if (amount != 0) {
                    interests[vToken][user].lifetimeAccrued += amount;
                }
                interests[vToken][user].rewardIndex = markets[vToken].rewardIndex;
            }
        }
        amount += interests[vToken][user].accrued;

        // If market was removed and user has no residual accrued interest, revert
        if (!marketExists && amount == 0) revert MarketNotSupported();

        delete interests[vToken][user].accrued;

        if (amount == 0) return 0;

        address underlying = _getUnderlying(vToken);
        IERC20Upgradeable asset = IERC20Upgradeable(underlying);

        uint256 available = asset.balanceOf(address(this));
        if (amount > available) {
            delete unreleasedPLPIncome[underlying];
            IPrimeLiquidityProvider(primeLiquidityProvider).releaseFunds(address(asset));
            available = asset.balanceOf(address(this));
        }
        if (amount > available) {
            interests[vToken][user].accrued = amount - available;
            amount = available;
        }

        if (amount == 0) return 0;
        asset.safeTransfer(user, amount);

        emit InterestClaimed(user, vToken, amount);

        return amount;
    }

    /**
     * @notice Calculate pending interest for a user
     * @param vToken Market address
     * @param user User address
     * @return Pending interest amount
     */
    function _interestAccrued(address vToken, address user) internal view returns (uint256) {
        Interest memory userInterest = interests[vToken][user];
        Market memory market = markets[vToken];

        if (userInterest.score == 0) return 0;

        uint256 indexDelta = market.rewardIndex - userInterest.rewardIndex;
        return (indexDelta * userInterest.score) / EXP_SCALE;
    }

    /**
     * @notice Accrue interest and update score for all markets
     * @param user User address
     */
    function _accrueInterestAndUpdateScore(address user) internal {
        _accrueAllMarkets();
        _accrueInterestAndUpdateScoreWithoutAccrual(user);
    }

    /**
     * @notice Update score for a user across all markets (without calling accrueAllMarkets)
     * @dev Caller must ensure _accrueAllMarkets() was called beforehand
     * @param user User address
     */
    function _accrueInterestAndUpdateScoreWithoutAccrual(address user) internal {
        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;
        _ensureMaxLoops(marketsLength);

        for (uint256 i; i < marketsLength; ) {
            address market = allMarkets[i];
            _executeBoostWithoutAccrual(user, market);
            _updateScore(user, market);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Accrue interest on all Prime markets
     * @dev Called once before per-user loops to avoid redundant accrual
     */
    function _accrueAllMarkets() internal {
        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;
        _ensureMaxLoops(marketsLength);

        for (uint256 i; i < marketsLength; ) {
            accrueInterest(allMarkets[i]);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Accrue rewards for a user in a market
     * @param user User address
     * @param vToken Market address
     */
    function _executeBoost(address user, address vToken) internal {
        if (!markets[vToken].exists || !isPrimeHolder[user]) {
            return;
        }

        accrueInterest(vToken);
        uint256 delta = _interestAccrued(vToken, user);
        if (delta != 0) {
            interests[vToken][user].accrued += delta;
            interests[vToken][user].lifetimeAccrued += delta;
        }
        interests[vToken][user].rewardIndex = markets[vToken].rewardIndex;
    }

    /**
     * @notice Accrue rewards for a user in a market (without calling accrueInterest)
     * @dev Caller must ensure accrueInterest was called beforehand (e.g. via _accrueAllMarkets)
     * @param user User address
     * @param vToken Market address
     */
    function _executeBoostWithoutAccrual(address user, address vToken) internal {
        if (!markets[vToken].exists || !isPrimeHolder[user]) {
            return;
        }

        uint256 delta = _interestAccrued(vToken, user);
        if (delta != 0) {
            interests[vToken][user].accrued += delta;
            interests[vToken][user].lifetimeAccrued += delta;
        }
        interests[vToken][user].rewardIndex = markets[vToken].rewardIndex;
    }

    /**
     * @notice Update score for a user in a market
     * @param user User address
     * @param market Market address
     */
    function _updateScore(address user, address market) internal {
        Market storage _market = markets[market];
        if (!_market.exists || !isPrimeHolder[user]) {
            return;
        }

        uint256 score = _calculateScore(market, user);
        _market.sumOfMembersScore = _market.sumOfMembersScore - interests[market][user].score + score;
        interests[market][user].score = score;
    }

    /**
     * @notice Calculate score for a user in a market
     * @dev Triggers oracle.updateAssetPrice/updatePrice to ensure fresh prices.
     *      In batch operations these calls are redundant but ensure correctness.
     * @param market Market address
     * @param user User address
     * @return score Calculated score
     */
    function _calculateScore(address market, address user) internal returns (uint256) {
        uint256 xvsBalanceForScore = _xvsBalanceOfUser(user);

        IVToken vToken = IVToken(market);
        uint256 borrow = vToken.borrowBalanceStored(user);
        uint256 exchangeRate = vToken.exchangeRateStored();
        uint256 balanceOfAccount = vToken.balanceOf(user);
        uint256 supply = (exchangeRate * balanceOfAccount) / EXP_SCALE;

        oracle.updateAssetPrice(xvsVaultRewardToken);
        oracle.updatePrice(market);

        (uint256 capital, , ) = _capitalForScore(xvsBalanceForScore, borrow, supply, market);

        uint256 decimals = IERC20MetadataUpgradeable(_getUnderlying(market)).decimals();
        capital = capital * (10 ** (18 - decimals));

        return Scores._calculateScore(xvsBalanceForScore, capital, alphaNumerator, alphaDenominator);
    }

    /**
     * @notice Calculate capital for score calculation
     * @param xvsBalanceForScore XVS balance for score
     * @param borrow Borrow amount
     * @param supply Supply amount
     * @param market Market address
     * @return capital Capped capital
     * @return cappedSupply Capped supply
     * @return cappedBorrow Capped borrow
     */
    function _capitalForScore(
        uint256 xvsBalanceForScore,
        uint256 borrow,
        uint256 supply,
        address market
    ) internal view returns (uint256 capital, uint256 cappedSupply, uint256 cappedBorrow) {
        Market storage marketData = markets[market];

        uint256 xvsPrice = oracle.getPrice(xvsVaultRewardToken);

        uint256 borrowCapUSD = (xvsPrice * xvsBalanceForScore * marketData.borrowMultiplier) / (EXP_SCALE * EXP_SCALE);
        uint256 supplyCapUSD = (xvsPrice * xvsBalanceForScore * marketData.supplyMultiplier) / (EXP_SCALE * EXP_SCALE);

        uint256 tokenPrice = oracle.getUnderlyingPrice(market);

        cappedSupply = supply;
        cappedBorrow = borrow;

        if (supply > 0 && tokenPrice > 0) {
            uint256 supplyUSD = (supply * tokenPrice) / EXP_SCALE;
            if (supplyUSD > supplyCapUSD) {
                cappedSupply = (supplyCapUSD * EXP_SCALE) / tokenPrice;
            }
        }

        if (borrow > 0 && tokenPrice > 0) {
            uint256 borrowUSD = (borrow * tokenPrice) / EXP_SCALE;
            if (borrowUSD > borrowCapUSD) {
                cappedBorrow = (borrowCapUSD * EXP_SCALE) / tokenPrice;
            }
        }

        capital = cappedSupply + cappedBorrow;
    }

    /**
     * @notice Get user's XVS balance from vault
     * @param user User address
     * @return xvsBalance XVS balance
     */
    function _xvsBalanceOfUser(address user) internal view returns (uint256) {
        (uint256 xvs, , uint256 pendingWithdrawals) = IXVSVault(xvsVault).getUserInfo(
            xvsVaultRewardToken,
            xvsVaultPoolId,
            user
        );

        if (xvs <= pendingWithdrawals) return 0;
        return xvs - pendingWithdrawals;
    }

    /**
     * @notice Get underlying token for a vToken
     * @param vToken vToken address
     * @return Underlying token address
     */
    function _getUnderlying(address vToken) internal view returns (address) {
        if (vToken == NATIVE_MARKET) {
            return WRAPPED_NATIVE_TOKEN;
        }
        return IVToken(vToken).underlying();
    }

    /**
     * @notice Validate alpha arguments
     * @param alphaNumerator_ Alpha numerator
     * @param alphaDenominator_ Alpha denominator
     */
    function _checkAlphaArguments(uint128 alphaNumerator_, uint128 alphaDenominator_) internal pure {
        if (alphaNumerator_ == 0 || alphaNumerator_ >= alphaDenominator_) {
            revert InvalidAlphaArguments();
        }
    }

    /**
     * @notice Queue score updates after parameter change
     */
    function _queueScoreUpdates() internal {
        if (pendingScoreUpdates > 0) {
            emit IncompleteRoundDiscarded(nextScoreUpdateRoundId, pendingScoreUpdates);
        }
        ++nextScoreUpdateRoundId;
        pendingScoreUpdates = totalTokens;
    }
}
