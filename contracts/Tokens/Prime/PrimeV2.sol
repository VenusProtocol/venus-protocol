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

    /// @notice Maximum XVS considered for score calculation
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable MAXIMUM_XVS_CAP;

    // ═══════════════════ EVENTS ═══════════════════

    /// @notice Emitted when prime token is minted
    event Mint(address indexed user, bool isIrrevocable);

    /// @notice Emitted when prime token is burned
    event Burn(address indexed user);

    /// @notice Emitted when a market is added to prime program
    event MarketAdded(
        address indexed comptroller,
        address indexed market,
        uint256 supplyMultiplier,
        uint256 borrowMultiplier
    );

    /// @notice Emitted when mint limits are updated
    event MintLimitsUpdated(
        uint256 indexed oldIrrevocableLimit,
        uint256 indexed oldRevocableLimit,
        uint256 indexed newIrrevocableLimit,
        uint256 newRevocableLimit
    );

    /// @notice Emitted when user score is updated
    event UserScoreUpdated(address indexed user);

    /// @notice Emitted when alpha is updated
    event AlphaUpdated(
        uint128 indexed oldNumerator,
        uint128 indexed oldDenominator,
        uint128 indexed newNumerator,
        uint128 newDenominator
    );

    /// @notice Emitted when multiplier is updated
    event MultiplierUpdated(
        address indexed market,
        uint256 indexed oldSupplyMultiplier,
        uint256 indexed oldBorrowMultiplier,
        uint256 newSupplyMultiplier,
        uint256 newBorrowMultiplier
    );

    /// @notice Emitted when interest is claimed
    event InterestClaimed(address indexed user, address indexed market, uint256 amount);

    /// @notice Emitted when revocable token is upgraded to irrevocable token
    event TokenUpgraded(address indexed user);

    /// @notice Emitted when PrimeLeaderboard address is set
    event PrimeLeaderboardSet(address indexed oldLeaderboard, address indexed newLeaderboard);

    /// @notice Emitted when an incomplete score update round is discarded
    event IncompleteRoundDiscarded(uint256 indexed roundId, uint256 remainingUpdates);

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

    /**
     * @notice PrimeV2 constructor
     * @param wrappedNativeToken_ Address of wrapped native token
     * @param nativeMarket_ Address of native market
     * @param maximumXVSCap_ Maximum XVS taken in account when calculating user score
     * @param timeBased_ A boolean indicating whether the contract is based on time or block
     * @param blocksPerYear_ Total blocks per year
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address wrappedNativeToken_,
        address nativeMarket_,
        uint256 maximumXVSCap_,
        bool timeBased_,
        uint256 blocksPerYear_
    ) TimeManagerV8(timeBased_, blocksPerYear_) {
        WRAPPED_NATIVE_TOKEN = wrappedNativeToken_;
        NATIVE_MARKET = nativeMarket_;
        MAXIMUM_XVS_CAP = maximumXVSCap_;

        _disableInitializers();
    }

    /**
     * @notice PrimeV2 initializer
     * @param xvsVault_ Address of XVSVault
     * @param xvsVaultRewardToken_ Address of XVSVault reward token
     * @param xvsVaultPoolId_ Pool id of XVSVault
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
        address xvsVault_,
        address xvsVaultRewardToken_,
        uint256 xvsVaultPoolId_,
        uint128 alphaNumerator_,
        uint128 alphaDenominator_,
        address accessControlManager_,
        address primeLiquidityProvider_,
        address corePoolComptroller_,
        address oracle_,
        uint256 loopsLimit_
    ) external initializer {
        if (xvsVault_ == address(0)) revert InvalidAddress();
        if (xvsVaultRewardToken_ == address(0)) revert InvalidAddress();
        if (primeLiquidityProvider_ == address(0)) revert InvalidAddress();
        if (corePoolComptroller_ == address(0)) revert InvalidAddress();
        if (oracle_ == address(0)) revert InvalidAddress();

        _checkAlphaArguments(alphaNumerator_, alphaDenominator_);

        __AccessControlled_init(accessControlManager_);
        __Pausable_init();
        __ReentrancyGuard_init();
        _setMaxLoopsLimit(loopsLimit_);

        xvsVault = xvsVault_;
        xvsVaultRewardToken = xvsVaultRewardToken_;
        xvsVaultPoolId = xvsVaultPoolId_;
        alphaNumerator = alphaNumerator_;
        alphaDenominator = alphaDenominator_;
        primeLiquidityProvider = primeLiquidityProvider_;
        corePoolComptroller = corePoolComptroller_;
        oracle = ResilientOracleInterface(oracle_);

        // Default limits
        irrevocableLimit = 100;
        revocableLimit = 500;
    }

    // ═══════════════════ PRIME TOKEN MANAGEMENT ═══════════════════

    /**
     * @notice Issue Prime tokens (admin function)
     * @param isIrrevocable Whether tokens are irrevocable
     * @param users Array of user addresses
     * @custom:event Emits Mint event on new token issuance
     * @custom:event Emits TokenUpgraded event on upgrade from revocable to irrevocable
     * @custom:error Throw InvalidLimit if mint limit would be exceeded
     * @custom:access Controlled by ACM
     */
    function issue(bool isIrrevocable, address[] calldata users) external {
        _checkAccessAllowed("issue(bool,address[])");

        uint256 usersLength = users.length;
        _ensureMaxLoops(usersLength);

        for (uint256 i; i < usersLength; ) {
            address user = users[i];
            Token storage token = tokens[user];

            if (token.exists) {
                if (isIrrevocable && !token.isIrrevocable) {
                    _upgrade(user);
                }
            } else {
                _mint(isIrrevocable, user);
                _initializeMarkets(user);
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
     * @custom:access Controlled by ACM
     */
    function burn(address user) external {
        _checkAccessAllowed("burn(address)");
        _burn(user);
    }

    /**
     * @notice Check if user has Prime token
     * @param user User address
     * @return exists Whether user has Prime token
     */
    function isUserPrimeHolder(address user) external view returns (bool) {
        return tokens[user].exists;
    }

    // ═══════════════════ INTEREST FUNCTIONS ═══════════════════

    /**
     * @notice Claim accrued interest for a market
     * @param vToken Market address
     * @return amount Amount claimed
     * @custom:event Emits InterestClaimed event
     * @custom:error Throw UserHasNoPrimeToken if user has no prime token
     * @custom:error Throw MarketNotSupported if market is not supported
     */
    function claimInterest(address vToken) external nonReentrant whenNotPaused returns (uint256) {
        return _claimInterest(vToken, msg.sender);
    }

    /**
     * @notice Claim accrued interest for a market to a specific address
     * @param vToken Market address
     * @param user Recipient address
     * @return amount Amount claimed
     * @custom:event Emits InterestClaimed event
     * @custom:error Throw UserHasNoPrimeToken if user has no prime token
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
        uint256 unreleasedPLPAccruedInterest = totalAccruedInPLP - unreleasedPLPIncome[underlying];
        uint256 distributionIncome = unreleasedPLPAccruedInterest;

        if (distributionIncome == 0) {
            return;
        }

        unreleasedPLPIncome[underlying] = totalAccruedInPLP;

        uint256 delta;
        if (market.sumOfMembersScore != 0) {
            delta = ((distributionIncome * EXP_SCALE) / market.sumOfMembersScore);
        }

        market.rewardIndex += delta;
    }

    /**
     * @notice Accrue interest and update score for a user
     * @dev Intentionally not gated by whenNotPaused — called by Comptroller hooks
     * @param user User address
     * @param market Market address
     */
    function accrueInterestAndUpdateScore(address user, address market) external {
        _executeBoost(user, market);
        _updateScore(user, market);
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

        for (uint256 i; i < usersLength; ) {
            address user = users[i];

            if (!tokens[user].exists) {
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

            _accrueInterestAndUpdateScore(user);
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
     * @notice Set the PrimeLeaderboard contract address
     * @param primeLeaderboard_ Address of PrimeLeaderboard
     * @custom:event Emits PrimeLeaderboardSet event
     * @custom:error Throw InvalidAddress if address is zero
     * @custom:access Controlled by ACM
     */
    function setPrimeLeaderboard(address primeLeaderboard_) external {
        _checkAccessAllowed("setPrimeLeaderboard(address)");
        if (primeLeaderboard_ == address(0)) revert InvalidAddress();

        address oldLeaderboard = primeLeaderboard;
        primeLeaderboard = primeLeaderboard_;

        emit PrimeLeaderboardSet(oldLeaderboard, primeLeaderboard_);
    }

    /**
     * @notice Add a market to Prime
     * @param comptroller Comptroller address
     * @param market Market address
     * @param supplyMultiplier Supply multiplier
     * @param borrowMultiplier Borrow multiplier
     * @custom:event Emits MarketAdded event
     * @custom:error Throw MarketAlreadyExists if market already exists
     * @custom:error Throw InvalidMultipliers if both multipliers are zero
     * @custom:error Throw InvalidVToken if market is not listed
     * @custom:error Throw AssetAlreadyExists if asset already has a market
     * @custom:access Controlled by ACM
     */
    function addMarket(
        address comptroller,
        address market,
        uint256 supplyMultiplier,
        uint256 borrowMultiplier
    ) external {
        _checkAccessAllowed("addMarket(address,address,uint256,uint256)");

        if (markets[market].exists) revert MarketAlreadyExists();
        if (supplyMultiplier == 0 && borrowMultiplier == 0) revert InvalidMultipliers();

        bool isListed = InterfaceComptroller(comptroller).markets(market);
        if (!isListed) revert InvalidVToken();

        address underlying = _getUnderlying(market);
        if (vTokenForAsset[underlying] != address(0)) revert AssetAlreadyExists();

        markets[market] = Market({
            supplyMultiplier: supplyMultiplier,
            borrowMultiplier: borrowMultiplier,
            rewardIndex: 0,
            sumOfMembersScore: 0,
            exists: true
        });

        vTokenForAsset[underlying] = market;
        _allMarkets.push(market);

        _queueScoreUpdates();

        emit MarketAdded(comptroller, market, supplyMultiplier, borrowMultiplier);
    }

    /**
     * @notice Update mint limits
     * @param irrevocableLimit_ New irrevocable limit
     * @param revocableLimit_ New revocable limit
     * @custom:event Emits MintLimitsUpdated event
     * @custom:error Throw InvalidLimit if any limit is less than current count
     * @custom:access Controlled by ACM
     */
    function setLimits(uint256 irrevocableLimit_, uint256 revocableLimit_) external {
        _checkAccessAllowed("setLimits(uint256,uint256)");

        if (irrevocableLimit_ < totalIrrevocable || revocableLimit_ < totalRevocable) {
            revert InvalidLimit();
        }

        emit MintLimitsUpdated(irrevocableLimit, revocableLimit, irrevocableLimit_, revocableLimit_);

        irrevocableLimit = irrevocableLimit_;
        revocableLimit = revocableLimit_;
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
     * @custom:access Controlled by ACM
     */
    function updateMultipliers(address market, uint256 supplyMultiplier, uint256 borrowMultiplier) external {
        _checkAccessAllowed("updateMultipliers(address,uint256,uint256)");

        if (!markets[market].exists) revert MarketNotSupported();

        accrueInterest(market);

        emit MultiplierUpdated(
            market,
            markets[market].supplyMultiplier,
            markets[market].borrowMultiplier,
            supplyMultiplier,
            borrowMultiplier
        );

        markets[market].supplyMultiplier = supplyMultiplier;
        markets[market].borrowMultiplier = borrowMultiplier;

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

    // ═══════════════════ INTERNAL FUNCTIONS ═══════════════════

    /**
     * @notice Mint a Prime token
     * @param isIrrevocable Whether token is irrevocable
     * @param user User address
     */
    function _mint(bool isIrrevocable, address user) internal {
        Token storage token = tokens[user];
        if (token.exists) revert UserAlreadyHasPrimeToken();

        token.exists = true;
        token.isIrrevocable = isIrrevocable;

        if (isIrrevocable) {
            ++totalIrrevocable;
            if (totalIrrevocable > irrevocableLimit) revert InvalidLimit();
        } else {
            ++totalRevocable;
            if (totalRevocable > revocableLimit) revert InvalidLimit();
        }

        _updateRoundAfterTokenMinted(user);

        emit Mint(user, isIrrevocable);
    }

    /**
     * @notice Burn a Prime token
     * @param user User address
     */
    function _burn(address user) internal {
        Token memory token = tokens[user];
        if (!token.exists) revert UserHasNoPrimeToken();

        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;
        _ensureMaxLoops(marketsLength);

        for (uint256 i; i < marketsLength; ) {
            address market = allMarkets[i];
            _executeBoost(user, market);
            markets[market].sumOfMembersScore = markets[market].sumOfMembersScore - interests[market][user].score;

            delete interests[market][user].score;
            delete interests[market][user].rewardIndex;

            unchecked {
                ++i;
            }
        }

        if (token.isIrrevocable) {
            --totalIrrevocable;
        } else {
            --totalRevocable;
        }

        delete tokens[user].exists;
        delete tokens[user].isIrrevocable;

        _updateRoundAfterTokenBurned(user);

        emit Burn(user);
    }

    /**
     * @notice Upgrade a token to irrevocable
     * @param user User address
     */
    function _upgrade(address user) internal {
        Token storage userToken = tokens[user];

        userToken.isIrrevocable = true;
        ++totalIrrevocable;
        --totalRevocable;

        if (totalIrrevocable > irrevocableLimit) revert InvalidLimit();

        emit TokenUpgraded(user);
    }

    /**
     * @notice Initialize markets for a new Prime holder
     * @param account User address
     */
    function _initializeMarkets(address account) internal {
        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;
        _ensureMaxLoops(marketsLength);

        for (uint256 i; i < marketsLength; ) {
            address market = allMarkets[i];
            accrueInterest(market);

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
     * @param vToken Market address
     * @param user User address
     * @return amount Amount claimed
     */
    function _claimInterest(address vToken, address user) internal returns (uint256) {
        if (!tokens[user].exists) revert UserHasNoPrimeToken();
        if (!markets[vToken].exists) revert MarketNotSupported();

        accrueInterest(vToken);
        uint256 amount = _interestAccrued(vToken, user);
        amount += interests[vToken][user].accrued;

        interests[vToken][user].rewardIndex = markets[vToken].rewardIndex;
        delete interests[vToken][user].accrued;

        if (amount == 0) return 0;

        address underlying = _getUnderlying(vToken);
        IERC20Upgradeable asset = IERC20Upgradeable(underlying);

        if (amount > asset.balanceOf(address(this))) {
            delete unreleasedPLPIncome[underlying];
            IPrimeLiquidityProvider(primeLiquidityProvider).releaseFunds(address(asset));
        }

        uint256 available = asset.balanceOf(address(this));
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
        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;

        for (uint256 i; i < marketsLength; ) {
            address market = allMarkets[i];
            _executeBoost(user, market);
            _updateScore(user, market);

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
        if (!markets[vToken].exists || !tokens[user].exists) {
            return;
        }

        accrueInterest(vToken);
        interests[vToken][user].accrued += _interestAccrued(vToken, user);
        interests[vToken][user].rewardIndex = markets[vToken].rewardIndex;
    }

    /**
     * @notice Update score for a user in a market
     * @param user User address
     * @param market Market address
     */
    function _updateScore(address user, address market) internal {
        Market storage _market = markets[market];
        if (!_market.exists || !tokens[user].exists) {
            return;
        }

        uint256 score = _calculateScore(market, user);
        _market.sumOfMembersScore = _market.sumOfMembersScore - interests[market][user].score + score;
        interests[market][user].score = score;
    }

    /**
     * @notice Calculate score for a user in a market
     * @param market Market address
     * @param user User address
     * @return score Calculated score
     */
    function _calculateScore(address market, address user) internal returns (uint256) {
        uint256 xvsBalanceForScore = _xvsBalanceForScore(_xvsBalanceOfUser(user));

        IVToken vToken = IVToken(market);
        uint256 borrow = vToken.borrowBalanceStored(user);
        uint256 exchangeRate = vToken.exchangeRateStored();
        uint256 balanceOfAccount = vToken.balanceOf(user);
        uint256 supply = (exchangeRate * balanceOfAccount) / EXP_SCALE;

        address xvsToken = IXVSVault(xvsVault).xvsAddress();
        oracle.updateAssetPrice(xvsToken);
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

        address xvsToken = IXVSVault(xvsVault).xvsAddress();
        uint256 xvsPrice = oracle.getPrice(xvsToken);

        uint256 borrowCapUSD = (xvsPrice * xvsBalanceForScore * marketData.borrowMultiplier) / (EXP_SCALE * EXP_SCALE);
        uint256 supplyCapUSD = (xvsPrice * xvsBalanceForScore * marketData.supplyMultiplier) / (EXP_SCALE * EXP_SCALE);

        uint256 tokenPrice = oracle.getUnderlyingPrice(market);
        uint256 decimals = IERC20MetadataUpgradeable(_getUnderlying(market)).decimals();

        cappedSupply = supply;
        cappedBorrow = borrow;

        if (supply > 0 && tokenPrice > 0) {
            uint256 supplyUSD = (supply * tokenPrice) / (10 ** decimals);
            if (supplyUSD > supplyCapUSD) {
                cappedSupply = (supplyCapUSD * (10 ** decimals)) / tokenPrice;
            }
        }

        if (borrow > 0 && tokenPrice > 0) {
            uint256 borrowUSD = (borrow * tokenPrice) / (10 ** decimals);
            if (borrowUSD > borrowCapUSD) {
                cappedBorrow = (borrowCapUSD * (10 ** decimals)) / tokenPrice;
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
     * @notice Cap XVS balance for score calculation
     * @param xvsBalance XVS balance
     * @return Capped XVS balance
     */
    function _xvsBalanceForScore(uint256 xvsBalance) internal view returns (uint256) {
        if (xvsBalance > MAXIMUM_XVS_CAP) {
            return MAXIMUM_XVS_CAP;
        }
        return xvsBalance;
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
        if (alphaDenominator_ == 0 || alphaNumerator_ > alphaDenominator_) {
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
        pendingScoreUpdates = totalIrrevocable + totalRevocable;
    }

    /**
     * @notice Update round after token minted
     * @param user User address
     */
    function _updateRoundAfterTokenMinted(address user) internal {
        if (pendingScoreUpdates > 0 && !isScoreUpdated[nextScoreUpdateRoundId][user]) {
            isScoreUpdated[nextScoreUpdateRoundId][user] = true;
            --pendingScoreUpdates;
        }
    }

    /**
     * @notice Update round after token burned
     * @param user User address
     */
    function _updateRoundAfterTokenBurned(address user) internal {
        if (pendingScoreUpdates > 0 && !isScoreUpdated[nextScoreUpdateRoundId][user]) {
            --pendingScoreUpdates;
        }
    }

    /// @dev Storage gap for future upgrades
    uint256[50] private __gap;
}
