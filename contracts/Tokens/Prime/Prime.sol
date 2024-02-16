// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { MaxLoopsLimitHelper } from "@venusprotocol/solidity-utilities/contracts/MaxLoopsLimitHelper.sol";
import { TimeManagerV8 } from "@venusprotocol/solidity-utilities/contracts/TimeManagerV8.sol";

import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";

import { PrimeStorageV1 } from "./PrimeStorage.sol";
import { Scores } from "./libs/Scores.sol";

import { IPrimeLiquidityProvider } from "./Interfaces/IPrimeLiquidityProvider.sol";
import { IPrime } from "./Interfaces/IPrime.sol";
import { IXVSVault } from "./Interfaces/IXVSVault.sol";
import { IVToken } from "./Interfaces/IVToken.sol";
import { InterfaceComptroller } from "./Interfaces/InterfaceComptroller.sol";
import { PoolRegistryInterface } from "./Interfaces/IPoolRegistry.sol";

/**
 * @title Prime
 * @author Venus
 * @notice Prime Token is used to provide extra rewards to the users who have staked a minimum of `MINIMUM_STAKED_XVS` XVS in the XVSVault for `STAKING_PERIOD` days
 * @custom:security-contact https://github.com/VenusProtocol/venus-protocol
 */
contract Prime is IPrime, AccessControlledV8, PausableUpgradeable, MaxLoopsLimitHelper, PrimeStorageV1, TimeManagerV8 {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice address of wrapped native token contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable WRAPPED_NATIVE_TOKEN;

    /// @notice address of native market contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable NATIVE_MARKET;

    /// @notice minimum amount of XVS user needs to stake to become a prime member
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable MINIMUM_STAKED_XVS;

    /// @notice maximum XVS taken in account when calculating user score
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable MAXIMUM_XVS_CAP;

    /// @notice number of days user need to stake to claim prime token
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable STAKING_PERIOD;

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

    /// @notice Emitted when stakedAt is updated
    event StakedAtUpdated(address indexed user, uint256 timestamp);

    /// @notice Error thrown when market is not supported
    error MarketNotSupported();

    /// @notice Error thrown when mint limit is reached
    error InvalidLimit();

    /// @notice Error thrown when user is not eligible to claim prime token
    error IneligibleToClaim();

    /// @notice Error thrown when user needs to wait more time to claim prime token
    error WaitMoreTime();

    /// @notice Error thrown when user has no prime token
    error UserHasNoPrimeToken();

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

    /// @notice Error thrown when invalid length is passed
    error InvalidLength();

    /// @notice Error thrown when timestamp is invalid
    error InvalidTimestamp();

    /// @notice Error thrown when invalid comptroller is passed
    error InvalidComptroller();

    /**
     * @notice Prime constructor
     * @param _wrappedNativeToken Address of wrapped native token
     * @param _nativeMarket Address of native market
     * @param _blocksPerYear total blocks per year
     * @param _stakingPeriod total number of seconds for which user needs to stake to claim prime token
     * @param _minimumStakedXVS minimum amount of XVS user needs to stake to become a prime member (scaled by 1e18)
     * @param _maximumXVSCap maximum XVS taken in account when calculating user score (scaled by 1e18)
     * @param _timeBased A boolean indicating whether the contract is based on time or block.
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        address _wrappedNativeToken,
        address _nativeMarket,
        uint256 _blocksPerYear,
        uint256 _stakingPeriod,
        uint256 _minimumStakedXVS,
        uint256 _maximumXVSCap,
        bool _timeBased
    ) TimeManagerV8(_timeBased, _blocksPerYear) {
        WRAPPED_NATIVE_TOKEN = _wrappedNativeToken;
        NATIVE_MARKET = _nativeMarket;
        STAKING_PERIOD = _stakingPeriod;
        MINIMUM_STAKED_XVS = _minimumStakedXVS;
        MAXIMUM_XVS_CAP = _maximumXVSCap;

        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /**
     * @notice Prime initializer
     * @param xvsVault_ Address of XVSVault
     * @param xvsVaultRewardToken_ Address of XVSVault reward token
     * @param xvsVaultPoolId_ Pool id of XVSVault
     * @param alphaNumerator_ numerator of alpha. If alpha is 0.5 then numerator is 1.
              alphaDenominator_ must be greater than alphaNumerator_, alphaDenominator_ cannot be zero and alphaNumerator_ cannot be zero
     * @param alphaDenominator_ denominator of alpha. If alpha is 0.5 then denominator is 2.
              alpha is alphaNumerator_/alphaDenominator_. So, 0 < alpha < 1
     * @param accessControlManager_ Address of AccessControlManager
     * @param primeLiquidityProvider_ Address of PrimeLiquidityProvider
     * @param comptroller_ Address of core pool comptroller
     * @param oracle_ Address of Oracle
     * @param loopsLimit_ Maximum number of loops allowed in a single transaction
     * @custom:error Throw InvalidAddress if any of the address is invalid
     */
    function initialize(
        address xvsVault_,
        address xvsVaultRewardToken_,
        uint256 xvsVaultPoolId_,
        uint128 alphaNumerator_,
        uint128 alphaDenominator_,
        address accessControlManager_,
        address primeLiquidityProvider_,
        address comptroller_,
        address oracle_,
        uint256 loopsLimit_
    ) external initializer {
        if (xvsVault_ == address(0)) revert InvalidAddress();
        if (xvsVaultRewardToken_ == address(0)) revert InvalidAddress();
        if (oracle_ == address(0)) revert InvalidAddress();
        if (primeLiquidityProvider_ == address(0)) revert InvalidAddress();

        _checkAlphaArguments(alphaNumerator_, alphaDenominator_);

        alphaNumerator = alphaNumerator_;
        alphaDenominator = alphaDenominator_;
        xvsVaultRewardToken = xvsVaultRewardToken_;
        xvsVaultPoolId = xvsVaultPoolId_;
        xvsVault = xvsVault_;
        nextScoreUpdateRoundId = 0;
        primeLiquidityProvider = primeLiquidityProvider_;
        corePoolComptroller = comptroller_;
        oracle = ResilientOracleInterface(oracle_);

        __AccessControlled_init(accessControlManager_);
        __Pausable_init();
        _setMaxLoopsLimit(loopsLimit_);

        _pause();
    }

    /**
     * @notice Prime initializer V2 for initializing pool registry
     * @param poolRegistry_ Address of IL pool registry
     */
    function initializeV2(address poolRegistry_) external reinitializer(2) {
        poolRegistry = poolRegistry_;
    }

    /**
     * @notice Returns boosted pending interest accrued for a user for all markets
     * @param user the account for which to get the accrued interests
     * @return pendingRewards the number of underlying tokens accrued by the user for all markets
     */
    function getPendingRewards(address user) external returns (PendingReward[] memory pendingRewards) {
        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;

        pendingRewards = new PendingReward[](marketsLength);
        for (uint256 i; i < marketsLength; ) {
            address market = allMarkets[i];
            uint256 interestAccrued = getInterestAccrued(market, user);
            uint256 accrued = interests[market][user].accrued;

            pendingRewards[i] = PendingReward({
                vToken: market,
                rewardToken: _getUnderlying(market),
                amount: interestAccrued + accrued
            });

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Update total score of multiple users and market
     * @param users accounts for which we need to update score
     * @custom:error Throw NoScoreUpdatesRequired if no score updates are required
     * @custom:error Throw UserHasNoPrimeToken if user has no prime token
     * @custom:event Emits UserScoreUpdated event
     */
    function updateScores(address[] calldata users) external {
        if (pendingScoreUpdates == 0) revert NoScoreUpdatesRequired();
        if (nextScoreUpdateRoundId == 0) revert NoScoreUpdatesRequired();

        for (uint256 i; i < users.length; ) {
            address user = users[i];

            if (!tokens[user].exists) revert UserHasNoPrimeToken();
            if (isScoreUpdated[nextScoreUpdateRoundId][user]) {
                unchecked {
                    ++i;
                }
                continue;
            }

            address[] storage allMarkets = _allMarkets;
            uint256 marketsLength = allMarkets.length;

            for (uint256 j; j < marketsLength; ) {
                address market = allMarkets[j];
                _executeBoost(user, market);
                _updateScore(user, market);

                unchecked {
                    ++j;
                }
            }

            --pendingScoreUpdates;
            isScoreUpdated[nextScoreUpdateRoundId][user] = true;

            unchecked {
                ++i;
            }

            emit UserScoreUpdated(user);
        }
    }

    /**
     * @notice Update value of alpha
     * @param _alphaNumerator numerator of alpha. If alpha is 0.5 then numerator is 1
     * @param _alphaDenominator denominator of alpha. If alpha is 0.5 then denominator is 2
     * @custom:event Emits AlphaUpdated event
     * @custom:access Controlled by ACM
     */
    function updateAlpha(uint128 _alphaNumerator, uint128 _alphaDenominator) external {
        _checkAccessAllowed("updateAlpha(uint128,uint128)");
        _checkAlphaArguments(_alphaNumerator, _alphaDenominator);

        emit AlphaUpdated(alphaNumerator, alphaDenominator, _alphaNumerator, _alphaDenominator);

        alphaNumerator = _alphaNumerator;
        alphaDenominator = _alphaDenominator;

        uint256 marketslength = _allMarkets.length;

        for (uint256 i; i < marketslength; ) {
            accrueInterest(_allMarkets[i]);

            unchecked {
                ++i;
            }
        }

        _startScoreUpdateRound();
    }

    /**
     * @notice Update multipliers for a market
     * @param market address of the market vToken
     * @param supplyMultiplier new supply multiplier for the market, scaled by 1e18
     * @param borrowMultiplier new borrow multiplier for the market, scaled by 1e18
     * @custom:error Throw MarketNotSupported if market is not supported
     * @custom:event Emits MultiplierUpdated event
     * @custom:access Controlled by ACM
     */
    function updateMultipliers(address market, uint256 supplyMultiplier, uint256 borrowMultiplier) external {
        _checkAccessAllowed("updateMultipliers(address,uint256,uint256)");

        Market storage _market = markets[market];
        if (!_market.exists) revert MarketNotSupported();

        accrueInterest(market);

        emit MultiplierUpdated(
            market,
            _market.supplyMultiplier,
            _market.borrowMultiplier,
            supplyMultiplier,
            borrowMultiplier
        );
        _market.supplyMultiplier = supplyMultiplier;
        _market.borrowMultiplier = borrowMultiplier;

        _startScoreUpdateRound();
    }

    /**
     * @notice Update staked at timestamp for multiple users
     * @param users accounts for which we need to update staked at timestamp
     * @param timestamps new staked at timestamp for the users
     * @custom:error Throw InvalidLength if users and timestamps length are not equal
     * @custom:event Emits StakedAtUpdated event for each user
     * @custom:access Controlled by ACM
     */
    function setStakedAt(address[] calldata users, uint256[] calldata timestamps) external {
        _checkAccessAllowed("setStakedAt(address[],uint256[])");
        if (users.length != timestamps.length) revert InvalidLength();

        for (uint256 i; i < users.length; ) {
            if (timestamps[i] > block.timestamp) revert InvalidTimestamp();

            stakedAt[users[i]] = timestamps[i];
            emit StakedAtUpdated(users[i], timestamps[i]);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Add a market to prime program
     * @param comptroller address of the comptroller
     * @param market address of the market vToken
     * @param supplyMultiplier the multiplier for supply cap. It should be converted to 1e18
     * @param borrowMultiplier the multiplier for borrow cap. It should be converted to 1e18
     * @custom:error Throw MarketAlreadyExists if market already exists
     * @custom:error Throw InvalidVToken if market is not valid
     * @custom:event Emits MarketAdded event
     * @custom:access Controlled by ACM
     */
    function addMarket(
        address comptroller,
        address market,
        uint256 supplyMultiplier,
        uint256 borrowMultiplier
    ) external {
        _checkAccessAllowed("addMarket(address,address,uint256,uint256)");

        if (comptroller == address(0)) revert InvalidComptroller();

        if (
            comptroller != corePoolComptroller &&
            PoolRegistryInterface(poolRegistry).getPoolByComptroller(comptroller).comptroller != comptroller
        ) revert InvalidComptroller();

        Market storage _market = markets[market];
        if (_market.exists) revert MarketAlreadyExists();

        bool isMarketExist = InterfaceComptroller(comptroller).markets(market);
        if (!isMarketExist) revert InvalidVToken();

        delete _market.rewardIndex;
        _market.supplyMultiplier = supplyMultiplier;
        _market.borrowMultiplier = borrowMultiplier;
        delete _market.sumOfMembersScore;
        _market.exists = true;

        address underlying = _getUnderlying(market);

        if (vTokenForAsset[underlying] != address(0)) revert AssetAlreadyExists();
        vTokenForAsset[underlying] = market;

        _allMarkets.push(market);
        _startScoreUpdateRound();

        _ensureMaxLoops(_allMarkets.length);

        emit MarketAdded(comptroller, market, supplyMultiplier, borrowMultiplier);
    }

    /**
     * @notice Set limits for total tokens that can be minted
     * @param _irrevocableLimit total number of irrevocable tokens that can be minted
     * @param _revocableLimit total number of revocable tokens that can be minted
     * @custom:error Throw InvalidLimit if any of the limit is less than total tokens minted
     * @custom:event Emits MintLimitsUpdated event
     * @custom:access Controlled by ACM
     */
    function setLimit(uint256 _irrevocableLimit, uint256 _revocableLimit) external {
        _checkAccessAllowed("setLimit(uint256,uint256)");
        if (_irrevocableLimit < totalIrrevocable || _revocableLimit < totalRevocable) revert InvalidLimit();

        emit MintLimitsUpdated(irrevocableLimit, revocableLimit, _irrevocableLimit, _revocableLimit);

        revocableLimit = _revocableLimit;
        irrevocableLimit = _irrevocableLimit;
    }

    /**
     * @notice Set the limit for the loops can iterate to avoid the DOS
     * @param loopsLimit Number of loops limit
     * @custom:event Emits MaxLoopsLimitUpdated event on success
     * @custom:access Controlled by ACM
     */
    function setMaxLoopsLimit(uint256 loopsLimit) external {
        _checkAccessAllowed("setMaxLoopsLimit(uint256)");
        _setMaxLoopsLimit(loopsLimit);
    }

    /**
     * @notice Directly issue prime tokens to users
     * @param isIrrevocable are the tokens being issued
     * @param users list of address to issue tokens to
     * @custom:access Controlled by ACM
     */
    function issue(bool isIrrevocable, address[] calldata users) external {
        _checkAccessAllowed("issue(bool,address[])");

        if (isIrrevocable) {
            for (uint256 i; i < users.length; ) {
                Token storage userToken = tokens[users[i]];
                if (userToken.exists && !userToken.isIrrevocable) {
                    _upgrade(users[i]);
                } else {
                    _mint(true, users[i]);
                    _initializeMarkets(users[i]);
                }

                unchecked {
                    ++i;
                }
            }
        } else {
            for (uint256 i; i < users.length; ) {
                _mint(false, users[i]);
                _initializeMarkets(users[i]);

                unchecked {
                    ++i;
                }
            }
        }
    }

    /**
     * @notice Executed by XVSVault whenever user's XVSVault balance changes
     * @param user the account address whose balance was updated
     */
    function xvsUpdated(address user) external {
        uint256 totalStaked = _xvsBalanceOfUser(user);
        bool isAccountEligible = _isEligible(totalStaked);

        uint256 userStakedAt = stakedAt[user];
        Token memory token = tokens[user];

        if (token.exists && !isAccountEligible) {
            delete stakedAt[user];
            emit StakedAtUpdated(user, 0);

            if (token.isIrrevocable) {
                _accrueInterestAndUpdateScore(user);
            } else {
                _burn(user);
            }
        } else if (!isAccountEligible && !token.exists && userStakedAt != 0) {
            delete stakedAt[user];
            emit StakedAtUpdated(user, 0);
        } else if (userStakedAt == 0 && isAccountEligible && !token.exists) {
            stakedAt[user] = block.timestamp;
            emit StakedAtUpdated(user, block.timestamp);
        } else if (token.exists && isAccountEligible) {
            _accrueInterestAndUpdateScore(user);

            if (stakedAt[user] == 0) {
                stakedAt[user] = block.timestamp;
                emit StakedAtUpdated(user, block.timestamp);
            }
        }
    }

    /**
     * @notice accrues interes and updates score for an user for a specific market
     * @param user the account address for which to accrue interest and update score
     * @param market the market for which to accrue interest and update score
     */
    function accrueInterestAndUpdateScore(address user, address market) external {
        _executeBoost(user, market);
        _updateScore(user, market);
    }

    /**
     * @notice For claiming prime token when staking period is completed
     */
    function claim() external {
        uint256 userStakedAt = stakedAt[msg.sender];
        if (userStakedAt == 0) revert IneligibleToClaim();
        if (block.timestamp - userStakedAt < STAKING_PERIOD) revert WaitMoreTime();

        _mint(false, msg.sender);
        _initializeMarkets(msg.sender);
    }

    /**
     * @notice For burning any prime token
     * @param user the account address for which the prime token will be burned
     * @custom:access Controlled by ACM
     */
    function burn(address user) external {
        _checkAccessAllowed("burn(address)");
        _burn(user);
    }

    /**
     * @notice To pause or unpause claiming of interest
     * @custom:access Controlled by ACM
     */
    function togglePause() external {
        _checkAccessAllowed("togglePause()");
        if (paused()) {
            _unpause();
        } else {
            _pause();
        }
    }

    /**
     * @notice For user to claim boosted yield
     * @param vToken the market for which claim the accrued interest
     * @return amount the amount of tokens transferred to the msg.sender
     */
    function claimInterest(address vToken) external whenNotPaused returns (uint256) {
        return _claimInterest(vToken, msg.sender);
    }

    /**
     * @notice For user to claim boosted yield
     * @param vToken the market for which claim the accrued interest
     * @param user the user for which to claim the accrued interest
     * @return amount the amount of tokens transferred to the user
     */
    function claimInterest(address vToken, address user) external whenNotPaused returns (uint256) {
        return _claimInterest(vToken, user);
    }

    /**
     * @notice Retrieves an array of all available markets
     * @return an array of addresses representing all available markets
     */
    function getAllMarkets() external view returns (address[] memory) {
        return _allMarkets;
    }

    /**
     * @notice Retrieves the core pool comptroller address
     * @return the core pool comptroller address
     */
    function comptroller() external view returns (address) {
        return corePoolComptroller;
    }

    /**
     * @notice fetch the numbers of seconds remaining for staking period to complete
     * @param user the account address for which we are checking the remaining time
     * @return timeRemaining the number of seconds the user needs to wait to claim prime token
     */
    function claimTimeRemaining(address user) external view returns (uint256) {
        uint256 userStakedAt = stakedAt[user];
        if (userStakedAt == 0) return STAKING_PERIOD;

        uint256 totalTimeStaked;
        unchecked {
            totalTimeStaked = block.timestamp - userStakedAt;
        }

        if (totalTimeStaked < STAKING_PERIOD) {
            unchecked {
                return STAKING_PERIOD - totalTimeStaked;
            }
        }
        return 0;
    }

    /**
     * @notice Returns if user is a prime holder
     * @return isPrimeHolder true if user is a prime holder
     */
    function isUserPrimeHolder(address user) external view returns (bool) {
        return tokens[user].exists;
    }

    /**
     * @notice Returns supply and borrow APR for user for a given market
     * @param market the market for which to fetch the APR
     * @param user the account for which to get the APR
     * @return aprInfo APR information for the user for the given market
     */
    function calculateAPR(address market, address user) external view returns (APRInfo memory aprInfo) {
        IVToken vToken = IVToken(market);
        uint256 borrow = vToken.borrowBalanceStored(user);
        uint256 exchangeRate = vToken.exchangeRateStored();
        uint256 balanceOfAccount = vToken.balanceOf(user);
        uint256 supply = (exchangeRate * balanceOfAccount) / EXP_SCALE;

        aprInfo.userScore = interests[market][user].score;
        aprInfo.totalScore = markets[market].sumOfMembersScore;

        aprInfo.xvsBalanceForScore = _xvsBalanceForScore(_xvsBalanceOfUser(user));
        Capital memory capital = _capitalForScore(aprInfo.xvsBalanceForScore, borrow, supply, address(vToken));

        aprInfo.capital = capital.capital;
        aprInfo.cappedSupply = capital.cappedSupply;
        aprInfo.cappedBorrow = capital.cappedBorrow;
        aprInfo.supplyCapUSD = capital.supplyCapUSD;
        aprInfo.borrowCapUSD = capital.borrowCapUSD;

        (aprInfo.supplyAPR, aprInfo.borrowAPR) = _calculateUserAPR(
            market,
            supply,
            borrow,
            aprInfo.cappedSupply,
            aprInfo.cappedBorrow,
            aprInfo.userScore,
            aprInfo.totalScore
        );
    }

    /**
     * @notice Returns supply and borrow APR for estimated supply, borrow and XVS staked
     * @param market the market for which to fetch the APR
     * @param user the account for which to get the APR
     * @return aprInfo APR information for the user for the given market
     */
    function estimateAPR(
        address market,
        address user,
        uint256 borrow,
        uint256 supply,
        uint256 xvsStaked
    ) external view returns (APRInfo memory aprInfo) {
        aprInfo.totalScore = markets[market].sumOfMembersScore - interests[market][user].score;

        aprInfo.xvsBalanceForScore = _xvsBalanceForScore(xvsStaked);
        Capital memory capital = _capitalForScore(aprInfo.xvsBalanceForScore, borrow, supply, market);

        aprInfo.capital = capital.capital;
        aprInfo.cappedSupply = capital.cappedSupply;
        aprInfo.cappedBorrow = capital.cappedBorrow;
        aprInfo.supplyCapUSD = capital.supplyCapUSD;
        aprInfo.borrowCapUSD = capital.borrowCapUSD;

        uint256 decimals = IERC20MetadataUpgradeable(_getUnderlying(market)).decimals();
        aprInfo.capital = aprInfo.capital * (10 ** (18 - decimals));

        aprInfo.userScore = Scores._calculateScore(
            aprInfo.xvsBalanceForScore,
            aprInfo.capital,
            alphaNumerator,
            alphaDenominator
        );

        aprInfo.totalScore = aprInfo.totalScore + aprInfo.userScore;

        (aprInfo.supplyAPR, aprInfo.borrowAPR) = _calculateUserAPR(
            market,
            supply,
            borrow,
            aprInfo.cappedSupply,
            aprInfo.cappedBorrow,
            aprInfo.userScore,
            aprInfo.totalScore
        );
    }

    /**
     * @notice Distributes income from market since last distribution
     * @param vToken the market for which to distribute the income
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
     * @notice Returns boosted interest accrued for a user
     * @param vToken the market for which to fetch the accrued interest
     * @param user the account for which to get the accrued interest
     * @return interestAccrued the number of underlying tokens accrued by the user since the last accrual
     */
    function getInterestAccrued(address vToken, address user) public returns (uint256) {
        accrueInterest(vToken);

        return _interestAccrued(vToken, user);
    }

    /**
     * @notice accrues interest and updates score of all markets for an user
     * @param user the account address for which to accrue interest and update score
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
     * @notice Initializes all the markets for the user when a prime token is minted
     * @param account the account address for which markets needs to be initialized
     */
    function _initializeMarkets(address account) internal {
        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;

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
     * @notice calculate the current score of user
     * @param market the market for which to calculate the score
     * @param user the account for which to calculate the score
     * @return score the score of the user
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

        Capital memory capital = _capitalForScore(xvsBalanceForScore, borrow, supply, market);

        uint256 decimals = IERC20MetadataUpgradeable(_getUnderlying(market)).decimals();

        capital.capital = capital.capital * (10 ** (18 - decimals));

        return Scores._calculateScore(xvsBalanceForScore, capital.capital, alphaNumerator, alphaDenominator);
    }

    /**
     * @notice To transfer the accrued interest to user
     * @param vToken the market for which to claim
     * @param user the account for which to get the accrued interest
     * @return amount the amount of tokens transferred to the user
     * @custom:event Emits InterestClaimed event
     */
    function _claimInterest(address vToken, address user) internal returns (uint256) {
        uint256 amount = getInterestAccrued(vToken, user);
        amount += interests[vToken][user].accrued;

        interests[vToken][user].rewardIndex = markets[vToken].rewardIndex;
        delete interests[vToken][user].accrued;

        address underlying = _getUnderlying(vToken);
        IERC20Upgradeable asset = IERC20Upgradeable(underlying);

        if (amount > asset.balanceOf(address(this))) {
            delete unreleasedPLPIncome[underlying];
            IPrimeLiquidityProvider(primeLiquidityProvider).releaseFunds(address(asset));
        }

        asset.safeTransfer(user, amount);

        emit InterestClaimed(user, vToken, amount);

        return amount;
    }

    /**
     * @notice Used to mint a new prime token
     * @param isIrrevocable is the tokens being issued is irrevocable
     * @param user token owner
     * @custom:error Throw IneligibleToClaim if user is not eligible to claim prime token
     * @custom:event Emits Mint event
     */
    function _mint(bool isIrrevocable, address user) internal {
        Token storage token = tokens[user];
        if (token.exists) revert IneligibleToClaim();

        token.exists = true;
        token.isIrrevocable = isIrrevocable;

        if (isIrrevocable) {
            ++totalIrrevocable;
        } else {
            ++totalRevocable;
        }

        if (totalIrrevocable > irrevocableLimit || totalRevocable > revocableLimit) revert InvalidLimit();
        _updateRoundAfterTokenMinted(user);

        emit Mint(user, isIrrevocable);
    }

    /**
     * @notice Used to burn a new prime token
     * @param user owner whose prime token to burn
     * @custom:error Throw UserHasNoPrimeToken if user has no prime token
     * @custom:event Emits Burn event
     */
    function _burn(address user) internal {
        Token memory token = tokens[user];
        if (!token.exists) revert UserHasNoPrimeToken();

        address[] storage allMarkets = _allMarkets;
        uint256 marketsLength = allMarkets.length;

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
     * @notice Used to upgrade an token
     * @param user owner whose prime token to upgrade
     * @custom:error Throw InvalidLimit if total irrevocable tokens exceeds the limit
     * @custom:event Emits TokenUpgraded event
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
     * @notice Accrue rewards for the user. Must be called before updating score
     * @param user account for which we need to accrue rewards
     * @param vToken the market for which we need to accrue rewards
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
     * @notice Update total score of user and market. Must be called after changing account's borrow or supply balance.
     * @param user account for which we need to update score
     * @param market the market for which we need to score
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
     * @notice Verify new alpha arguments
     * @param _alphaNumerator numerator of alpha. If alpha is 0.5 then numerator is 1
     * @param _alphaDenominator denominator of alpha. If alpha is 0.5 then denominator is 2
     * @custom:error Throw InvalidAlphaArguments if alpha is invalid
     */
    function _checkAlphaArguments(uint128 _alphaNumerator, uint128 _alphaDenominator) internal pure {
        if (_alphaNumerator >= _alphaDenominator || _alphaNumerator == 0) {
            revert InvalidAlphaArguments();
        }
    }

    /**
     * @notice starts round to update scores of a particular or all markets
     */
    function _startScoreUpdateRound() internal {
        nextScoreUpdateRoundId++;
        totalScoreUpdatesRequired = totalIrrevocable + totalRevocable;
        pendingScoreUpdates = totalScoreUpdatesRequired;
    }

    /**
     * @notice update the required score updates when token is burned before round is completed
     */
    function _updateRoundAfterTokenBurned(address user) internal {
        if (totalScoreUpdatesRequired != 0) --totalScoreUpdatesRequired;

        if (pendingScoreUpdates != 0 && !isScoreUpdated[nextScoreUpdateRoundId][user]) {
            --pendingScoreUpdates;
        }
    }

    /**
     * @notice update the required score updates when token is minted before round is completed
     */
    function _updateRoundAfterTokenMinted(address user) internal {
        if (totalScoreUpdatesRequired != 0) isScoreUpdated[nextScoreUpdateRoundId][user] = true;
    }

    /**
     * @notice fetch the current XVS balance of user in the XVSVault
     * @param user the account address
     * @return xvsBalance the XVS balance of user
     */
    function _xvsBalanceOfUser(address user) internal view returns (uint256) {
        (uint256 xvs, , uint256 pendingWithdrawals) = IXVSVault(xvsVault).getUserInfo(
            xvsVaultRewardToken,
            xvsVaultPoolId,
            user
        );
        return (xvs - pendingWithdrawals);
    }

    /**
     * @notice calculate the current XVS balance that will be used in calculation of score
     * @param xvs the actual XVS balance of user
     * @return xvsBalanceForScore the XVS balance to use in score
     */
    function _xvsBalanceForScore(uint256 xvs) internal view returns (uint256) {
        if (xvs > MAXIMUM_XVS_CAP) {
            return MAXIMUM_XVS_CAP;
        }
        return xvs;
    }

    /**
     * @notice calculate the capital for calculation of score
     * @param xvs the actual XVS balance of user
     * @param borrow the borrow balance of user
     * @param supply the supply balance of user
     * @param market the market vToken address
     * @return capital the capital to use in calculation of score
     */
    function _capitalForScore(
        uint256 xvs,
        uint256 borrow,
        uint256 supply,
        address market
    ) internal view returns (Capital memory capital) {
        address xvsToken = IXVSVault(xvsVault).xvsAddress();

        uint256 xvsPrice = oracle.getPrice(xvsToken);
        capital.borrowCapUSD = (xvsPrice * ((xvs * markets[market].borrowMultiplier) / EXP_SCALE)) / EXP_SCALE;
        capital.supplyCapUSD = (xvsPrice * ((xvs * markets[market].supplyMultiplier) / EXP_SCALE)) / EXP_SCALE;

        uint256 tokenPrice = oracle.getUnderlyingPrice(market);
        uint256 supplyUSD = (tokenPrice * supply) / EXP_SCALE;
        uint256 borrowUSD = (tokenPrice * borrow) / EXP_SCALE;

        if (supplyUSD >= capital.supplyCapUSD) {
            supply = supplyUSD != 0 ? (supply * capital.supplyCapUSD) / supplyUSD : 0;
        }

        if (borrowUSD >= capital.borrowCapUSD) {
            borrow = borrowUSD != 0 ? (borrow * capital.borrowCapUSD) / borrowUSD : 0;
        }

        capital.capital = supply + borrow;
        capital.cappedSupply = supply;
        capital.cappedBorrow = borrow;
    }

    /**
     * @notice Used to get if the XVS balance is eligible for prime token
     * @param amount amount of XVS
     * @return isEligible true if the staked XVS amount is enough to consider the associated user eligible for a Prime token, false otherwise
     */
    function _isEligible(uint256 amount) internal view returns (bool) {
        if (amount >= MINIMUM_STAKED_XVS) {
            return true;
        }

        return false;
    }

    /**
     * @notice Calculate the interests accrued by the user in the market, since the last accrual
     * @param vToken the market for which to calculate the accrued interest
     * @param user the user for which to calculate the accrued interest
     * @return interestAccrued the number of underlying tokens accrued by the user since the last accrual
     */
    function _interestAccrued(address vToken, address user) internal view returns (uint256) {
        Interest memory interest = interests[vToken][user];
        uint256 index = markets[vToken].rewardIndex - interest.rewardIndex;

        uint256 score = interest.score;

        return (index * score) / EXP_SCALE;
    }

    /**
     * @notice Returns the underlying token associated with the VToken, or wrapped native token if the market is native market
     * @param vToken the market whose underlying token will be returned
     * @return underlying The address of the underlying token associated with the VToken, or the address of the WRAPPED_NATIVE_TOKEN token if the market is NATIVE_MARKET
     */
    function _getUnderlying(address vToken) internal view returns (address) {
        if (vToken == NATIVE_MARKET) {
            return WRAPPED_NATIVE_TOKEN;
        }
        return IVToken(vToken).underlying();
    }

    //////////////////////////////////////////////////
    //////////////// APR Calculation ////////////////
    ////////////////////////////////////////////////

    /**
     * @notice the total income that's going to be distributed in a year to prime token holders
     * @param vToken the market for which to fetch the total income that's going to distributed in a year
     * @return amount the total income
     */
    function incomeDistributionYearly(address vToken) public view returns (uint256 amount) {
        uint256 totalIncomePerBlockOrSecondFromPLP = IPrimeLiquidityProvider(primeLiquidityProvider)
            .getEffectiveDistributionSpeed(_getUnderlying(vToken));
        amount = blocksOrSecondsPerYear * totalIncomePerBlockOrSecondFromPLP;
    }

    /**
     * @notice used to calculate the supply and borrow APR of the user
     * @param vToken the market for which to fetch the APR
     * @param totalSupply the total token supply of the user
     * @param totalBorrow the total tokens borrowed by the user
     * @param totalCappedSupply the total token capped supply of the user
     * @param totalCappedBorrow the total capped tokens borrowed by the user
     * @param userScore the score of the user
     * @param totalScore the total market score
     * @return supplyAPR the supply APR of the user
     * @return borrowAPR the borrow APR of the user
     */
    function _calculateUserAPR(
        address vToken,
        uint256 totalSupply,
        uint256 totalBorrow,
        uint256 totalCappedSupply,
        uint256 totalCappedBorrow,
        uint256 userScore,
        uint256 totalScore
    ) internal view returns (uint256 supplyAPR, uint256 borrowAPR) {
        if (totalScore == 0) return (0, 0);

        uint256 userYearlyIncome = (userScore * incomeDistributionYearly(vToken)) / totalScore;

        uint256 totalCappedValue = totalCappedSupply + totalCappedBorrow;

        if (totalCappedValue == 0) return (0, 0);

        uint256 maximumBps = MAXIMUM_BPS;
        uint256 userSupplyIncomeYearly;
        uint256 userBorrowIncomeYearly;
        userSupplyIncomeYearly = (userYearlyIncome * totalCappedSupply) / totalCappedValue;
        userBorrowIncomeYearly = (userYearlyIncome * totalCappedBorrow) / totalCappedValue;
        supplyAPR = totalSupply == 0 ? 0 : ((userSupplyIncomeYearly * maximumBps) / totalSupply);
        borrowAPR = totalBorrow == 0 ? 0 : ((userBorrowIncomeYearly * maximumBps) / totalBorrow);
    }
}
