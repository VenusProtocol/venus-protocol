// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { AccessControlledV8 } from "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { MaxLoopsLimitHelper } from "@venusprotocol/isolated-pools/contracts/MaxLoopsLimitHelper.sol";

import { PrimeStorageV1 } from "./PrimeStorage.sol";
import { Scores } from "./libs/Scores.sol";

import { IPrimeLiquidityProvider } from "./Interfaces/IPrimeLiquidityProvider.sol";
import { IXVSVault } from "./Interfaces/IXVSVault.sol";
import { IVToken } from "./Interfaces/IVToken.sol";
import { IProtocolShareReserve } from "./Interfaces/IProtocolShareReserve.sol";
import { IIncomeDestination } from "./Interfaces/IIncomeDestination.sol";
import { InterfaceComptroller } from "./Interfaces/InterfaceComptroller.sol";

error MarketNotSupported();
error InvalidLimit();
error IneligibleToClaim();
error WaitMoreTime();
error UserHasNoPrimeToken();
error InvalidCaller();
error InvalidComptroller();
error NoScoreUpdatesRequired();
error MarketAlreadyExists();
error InvalidAddress();
error InvalidBlocksPerYear();
error InvalidAlphaArguments();
error InvalidVToken();

/// @custom:security-contact https://github.com/VenusProtocol/venus-protocol
contract Prime is IIncomeDestination, AccessControlledV8, PausableUpgradeable, MaxLoopsLimitHelper, PrimeStorageV1 {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice total blocks per year
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable BLOCKS_PER_YEAR;

    /// @notice address of WBNB contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable WBNB;

    /// @notice address of VBNB contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable VBNB;

    /// @notice Emitted when prime token is minted
    event Mint(address indexed user, bool isIrrevocable);

    /// @notice Emitted when prime token is burned
    event Burn(address indexed user);

    /// @notice Emitted asset state is update by protocol share reserve
    event UpdatedAssetsState(address indexed comptroller, address indexed asset);

    /// @notice Emitted when a market is added to prime program
    event MarketAdded(address indexed market, uint256 indexed supplyMultiplier, uint256 indexed borrowMultiplier);

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

    /**
     * @notice Prime constructor
     * @param _wbnb Address of WBNB
     * @param _vbnb Address of VBNB
     * @param _blocksPerYear total blocks per year
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _wbnb, address _vbnb, uint256 _blocksPerYear) {
        if (_wbnb == address(0)) revert InvalidAddress();
        if (_vbnb == address(0)) revert InvalidAddress();
        if (_blocksPerYear == 0) revert InvalidBlocksPerYear();
        WBNB = _wbnb;
        VBNB = _vbnb;
        BLOCKS_PER_YEAR = _blocksPerYear;

        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    /**
     * @notice Prime initializer
     * @param _xvsVault Address of XVSVault
     * @param _xvsVaultRewardToken Address of XVSVault reward token
     * @param _xvsVaultPoolId Pool id of XVSVault
     * @param _alphaNumerator numerator of alpha. If alpha is 0.5 then numerator is 1
     * @param _alphaDenominator denominator of alpha. If alpha is 0.5 then denominator is 2
     * @param _accessControlManager Address of AccessControlManager
     * @param _protocolShareReserve Address of ProtocolShareReserve
     * @param _primeLiquidityProvider Address of PrimeLiquidityProvider
     * @param _comptroller Address of Comptroller
     * @param _oracle Address of Oracle
     * @param _loopsLimit Maximum number of loops allowed in a single transaction
     */
    function initialize(
        address _xvsVault,
        address _xvsVaultRewardToken,
        uint256 _xvsVaultPoolId,
        uint128 _alphaNumerator,
        uint128 _alphaDenominator,
        address _accessControlManager,
        address _protocolShareReserve,
        address _primeLiquidityProvider,
        address _comptroller,
        address _oracle,
        uint256 _loopsLimit
    ) external virtual initializer {
        if (_xvsVault == address(0)) revert InvalidAddress();
        if (_xvsVaultRewardToken == address(0)) revert InvalidAddress();
        if (_protocolShareReserve == address(0)) revert InvalidAddress();
        if (_comptroller == address(0)) revert InvalidAddress();
        if (_oracle == address(0)) revert InvalidAddress();
        if (_primeLiquidityProvider == address(0)) revert InvalidAddress();
        _checkAlphaArguments(_alphaNumerator, _alphaDenominator);

        alphaNumerator = _alphaNumerator;
        alphaDenominator = _alphaDenominator;
        xvsVaultRewardToken = _xvsVaultRewardToken;
        xvsVaultPoolId = _xvsVaultPoolId;
        xvsVault = _xvsVault;
        nextScoreUpdateRoundId = 0;
        protocolShareReserve = _protocolShareReserve;
        primeLiquidityProvider = _primeLiquidityProvider;
        comptroller = _comptroller;
        oracle = ResilientOracleInterface(_oracle);

        __AccessControlled_init(_accessControlManager);
        __Pausable_init();
        _setMaxLoopsLimit(_loopsLimit);

        _pause();
    }

    /**
     * @notice Returns boosted pending interest accrued for a user for all markets
     * @param user the account for which to get the accrued interests
     * @return pendingInterests the number of underlying tokens accrued by the user for all markets
     */
    function getPendingInterests(address user) external returns (PendingInterest[] memory pendingInterests) {
        address[] storage _allMarkets = allMarkets;
        PendingInterest[] memory pendingInterests = new PendingInterest[](_allMarkets.length);

        for (uint256 i = 0; i < _allMarkets.length; ) {
            address market = _allMarkets[i];
            uint256 interestAccrued = getInterestAccrued(market, user);
            uint256 accrued = interests[market][user].accrued;

            pendingInterests[i] = PendingInterest({
                market: IVToken(market).underlying(),
                amount: interestAccrued + accrued
            });

            unchecked {
                i++;
            }
        }

        return pendingInterests;
    }

    /**
     * @notice Update total score of multiple users and market
     * @param users accounts for which we need to update score
     */
    function updateScores(address[] memory users) external {
        if (pendingScoreUpdates == 0) revert NoScoreUpdatesRequired();
        if (nextScoreUpdateRoundId == 0) revert NoScoreUpdatesRequired();

        for (uint256 i = 0; i < users.length; ) {
            address user = users[i];

            if (!tokens[user].exists) revert UserHasNoPrimeToken();
            if (isScoreUpdated[nextScoreUpdateRoundId][user]) continue;

            address[] storage _allMarkets = allMarkets;
            for (uint256 j = 0; j < _allMarkets.length; ) {
                address market = _allMarkets[j];
                _executeBoost(user, market);
                _updateScore(user, market);

                unchecked {
                    j++;
                }
            }

            pendingScoreUpdates--;
            isScoreUpdated[nextScoreUpdateRoundId][user] = true;

            unchecked {
                i++;
            }

            emit UserScoreUpdated(user);
        }
    }

    /**
     * @notice Update value of alpha
     * @param _alphaNumerator numerator of alpha. If alpha is 0.5 then numerator is 1
     * @param _alphaDenominator denominator of alpha. If alpha is 0.5 then denominator is 2
     */
    function updateAlpha(uint128 _alphaNumerator, uint128 _alphaDenominator) external {
        _checkAccessAllowed("updateAlpha(uint128,uint128)");
        _checkAlphaArguments(_alphaNumerator, _alphaDenominator);

        emit AlphaUpdated(alphaNumerator, alphaDenominator, _alphaNumerator, _alphaDenominator);

        alphaNumerator = _alphaNumerator;
        alphaDenominator = _alphaDenominator;

        for (uint256 i = 0; i < allMarkets.length; ) {
            accrueInterest(allMarkets[i]);

            unchecked {
                i++;
            }
        }

        _startScoreUpdateRound();
    }

    /**
     * @notice Update multipliers for a market
     * @param market address of the market vToken
     * @param supplyMultiplier new supply multiplier for the market, scaled by 1e18
     * @param borrowMultiplier new borrow multiplier for the market, scaled by 1e18
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

        _startScoreUpdateRound();
    }

    /**
     * @notice Add a market to prime program
     * @param vToken address of the market vToken
     * @param supplyMultiplier the multiplier for supply cap. It should be converted to 1e18
     * @param borrowMultiplier the multiplier for borrow cap. It should be converted to 1e18
     */
    function addMarket(address vToken, uint256 supplyMultiplier, uint256 borrowMultiplier) external {
        _checkAccessAllowed("addMarket(address,uint256,uint256)");
        if (markets[vToken].exists) revert MarketAlreadyExists();

        bool isMarketExist = InterfaceComptroller(comptroller).markets(vToken);
        if (!isMarketExist) revert InvalidVToken();

        markets[vToken].rewardIndex = 0;
        markets[vToken].supplyMultiplier = supplyMultiplier;
        markets[vToken].borrowMultiplier = borrowMultiplier;
        markets[vToken].sumOfMembersScore = 0;
        markets[vToken].exists = true;

        vTokenForAsset[_getUnderlying(vToken)] = vToken;

        allMarkets.push(vToken);
        _startScoreUpdateRound();

        _ensureMaxLoops(allMarkets.length);

        emit MarketAdded(vToken, supplyMultiplier, borrowMultiplier);
    }

    /**
     * @notice Set limits for total tokens that can be minted
     * @param _irrevocableLimit total number of irrevocable tokens that can be minted
     * @param _revocableLimit total number of revocable tokens that can be minted
     */
    function setLimit(uint256 _irrevocableLimit, uint256 _revocableLimit) external {
        _checkAccessAllowed("setLimit(uint256,uint256)");
        if (_irrevocableLimit < totalIrrevocable || _revocableLimit < totalRevocable) revert InvalidLimit();

        emit MintLimitsUpdated(irrevocableLimit, revocableLimit, _irrevocableLimit, _revocableLimit);

        revocableLimit = _revocableLimit;
        irrevocableLimit = _irrevocableLimit;
    }

    /**
     * @notice Directly issue prime tokens to users
     * @param isIrrevocable are the tokens being issued
     * @param users list of address to issue tokens to
     */
    function issue(bool isIrrevocable, address[] calldata users) external {
        _checkAccessAllowed("issue(bool,address[])");

        if (isIrrevocable) {
            for (uint256 i = 0; i < users.length; ) {
                Token storage userToken = tokens[users[i]];
                if (userToken.exists && !userToken.isIrrevocable) {
                    _upgrade(users[i]);
                } else {
                    _mint(true, users[i]);
                    _initializeMarkets(users[i]);
                }

                unchecked {
                    i++;
                }
            }
        } else {
            for (uint256 i = 0; i < users.length; ) {
                _mint(false, users[i]);
                _initializeMarkets(users[i]);
                delete stakedAt[users[i]];

                unchecked {
                    i++;
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
        bool isAccountEligible = isEligible(totalStaked);

        if (tokens[user].exists && !isAccountEligible) {
            if (tokens[user].isIrrevocable) {
                _accrueInterestAndUpdateScore(user);
            } else {
                _burn(user);
            }
        } else if (!isAccountEligible && !tokens[user].exists && stakedAt[user] > 0) {
            stakedAt[user] = 0;
        } else if (stakedAt[user] == 0 && isAccountEligible && !tokens[user].exists) {
            stakedAt[user] = block.timestamp;
        } else if (tokens[user].exists && isAccountEligible) {
            _accrueInterestAndUpdateScore(user);
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
        if (stakedAt[msg.sender] == 0) revert IneligibleToClaim();
        if (block.timestamp - stakedAt[msg.sender] < STAKING_PERIOD) revert WaitMoreTime();

        stakedAt[msg.sender] = 0;

        _mint(false, msg.sender);
        _initializeMarkets(msg.sender);
    }

    /**
     * @notice For burning any prime token
     * @param user the account address for which the prime token will be burned
     */
    function burn(address user) external {
        _checkAccessAllowed("burn(address)");
        _burn(user);
    }

    /**
     * @notice To pause or unpause claiming of interest
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
     * @return amount the amount of tokens transferred to the user
     */
    function claimInterest(address vToken) external whenNotPaused returns (uint256) {
        return _claimInterest(vToken, msg.sender);
    }

    /**
     * @notice For user to claim boosted yield
     * @param vToken the market for which claim the accrued interest
     * @param user the user for which claim the accrued interest
     * @return amount the amount of tokens transferred to the user
     */
    function claimInterest(address vToken, address user) external whenNotPaused returns (uint256) {
        return _claimInterest(vToken, user);
    }

    /**
     * @notice Callback by ProtocolShareReserve to update assets state when funds are released to this contract
     * @param _comptroller The address of the Comptroller whose income is distributed
     * @param asset The address of the asset whose income is distributed
     */
    function updateAssetsState(address _comptroller, address asset) external {
        if (msg.sender != protocolShareReserve) revert InvalidCaller();
        if (comptroller != _comptroller) revert InvalidComptroller();

        address vToken = vTokenForAsset[asset];
        if (vToken == address(0)) revert MarketNotSupported();

        IVToken market = IVToken(vToken);
        unreleasedPSRIncome[_getUnderlying(address(market))] = 0;

        emit UpdatedAssetsState(comptroller, asset);
    }

    /**
     * @notice Retrieves an array of all available markets
     * @return an array of addresses representing all available markets
     */
    function getAllMarkets() external view returns (address[] memory) {
        return allMarkets;
    }

    /**
     * @notice fetch the numbers of seconds remaining for staking period to complete
     * @param user the account address for which we are checking the remaining time
     * @return timeRemaining the number of seconds the user needs to wait to claim prime token
     */
    function claimTimeRemaining(address user) external view returns (uint256) {
        if (stakedAt[user] == 0) return STAKING_PERIOD;

        uint256 totalTimeStaked = block.timestamp - stakedAt[user];
        if (totalTimeStaked < STAKING_PERIOD) {
            return STAKING_PERIOD - totalTimeStaked;
        } else {
            return 0;
        }
    }

    /**
     * @notice Returns supply and borrow APR for user for a given market
     * @param market the market for which to fetch the APR
     * @param user the account for which to get the APR
     * @return supplyAPR supply APR of the user in BPS
     * @return borrowAPR borrow APR of the user in BPS
     */
    function calculateAPR(address market, address user) external view returns (uint256 supplyAPR, uint256 borrowAPR) {
        IVToken vToken = IVToken(market);
        uint256 borrow = vToken.borrowBalanceStored(user);
        uint256 exchangeRate = vToken.exchangeRateStored();
        uint256 balanceOfAccount = vToken.balanceOf(user);
        uint256 supply = (exchangeRate * balanceOfAccount) / EXP_SCALE;

        uint256 userScore = interests[market][user].score;
        uint256 totalScore = markets[market].sumOfMembersScore;

        uint256 xvsBalanceForScore = _xvsBalanceForScore(_xvsBalanceOfUser(user));
        (, uint256 cappedSupply, uint256 cappedBorrow) = _capitalForScore(
            xvsBalanceForScore,
            borrow,
            supply,
            address(vToken)
        );

        return _calculateUserAPR(market, supply, borrow, cappedSupply, cappedBorrow, userScore, totalScore);
    }

    /**
     * @notice Returns supply and borrow APR for estimated supply, borrow and XVS staked
     * @param market the market for which to fetch the APR
     * @param user the account for which to get the APR
     * @param borrow hypothetical borrow amount
     * @param supply hypothetical supply amount
     * @param xvsStaked hypothetical staked XVS amount
     * @return supplyAPR supply APR of the user in BPS
     * @return borrowAPR borrow APR of the user in BPS
     */
    function estimateAPR(
        address market,
        address user,
        uint256 borrow,
        uint256 supply,
        uint256 xvsStaked
    ) external view returns (uint256 supplyAPR, uint256 borrowAPR) {
        uint256 totalScore = markets[market].sumOfMembersScore - interests[market][user].score;

        uint256 xvsBalanceForScore = _xvsBalanceForScore(xvsStaked);
        (uint256 capital, uint256 cappedSupply, uint256 cappedBorrow) = _capitalForScore(
            xvsBalanceForScore,
            borrow,
            supply,
            market
        );
        uint256 userScore = Scores.calculateScore(xvsBalanceForScore, capital, alphaNumerator, alphaDenominator);

        totalScore = totalScore + userScore;

        return _calculateUserAPR(market, supply, borrow, cappedSupply, cappedBorrow, userScore, totalScore);
    }

    /**
     * @notice Distributes income from market since last distribution
     * @param vToken the market for which to distribute the income
     */
    function accrueInterest(address vToken) public {
        if (!markets[vToken].exists) revert MarketNotSupported();

        address underlying = _getUnderlying(vToken);

        IPrimeLiquidityProvider _primeLiquidityProvider = IPrimeLiquidityProvider(primeLiquidityProvider);

        uint256 totalIncomeUnreleased = IProtocolShareReserve(protocolShareReserve).getUnreleasedFunds(
            comptroller,
            IProtocolShareReserve.Schema.SPREAD_PRIME_CORE,
            address(this),
            underlying
        );

        uint256 distributionIncome = totalIncomeUnreleased - unreleasedPSRIncome[underlying];

        _primeLiquidityProvider.accrueTokens(underlying);
        uint256 totalAccruedInPLP = _primeLiquidityProvider.tokenAmountAccrued(underlying);
        uint256 unreleasedPLPAccruedInterest = totalAccruedInPLP - unreleasedPLPIncome[underlying];

        distributionIncome += unreleasedPLPAccruedInterest;

        if (distributionIncome == 0) {
            return;
        }

        unreleasedPSRIncome[underlying] = totalIncomeUnreleased;
        unreleasedPLPIncome[underlying] = totalAccruedInPLP;

        uint256 delta;
        if (markets[vToken].sumOfMembersScore > 0) {
            delta = ((distributionIncome * EXP_SCALE) / markets[vToken].sumOfMembersScore);
        }

        markets[vToken].rewardIndex = markets[vToken].rewardIndex + delta;
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
     * @notice accrues interes and updates score of all markets for an user
     * @param user the account address for which to accrue interest and update score
     */
    function _accrueInterestAndUpdateScore(address user) internal {
        address[] storage _allMarkets = allMarkets;
        for (uint256 i = 0; i < _allMarkets.length; ) {
            _executeBoost(user, _allMarkets[i]);
            _updateScore(user, _allMarkets[i]);

            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Initializes all the markets for the user when a prime token is minted
     * @param account the account address for which markets needs to be initialized
     */
    function _initializeMarkets(address account) internal {
        address[] storage _allMarkets = allMarkets;
        for (uint256 i = 0; i < _allMarkets.length; ) {
            address market = _allMarkets[i];
            accrueInterest(market);

            interests[market][account].rewardIndex = markets[market].rewardIndex;

            uint256 score = _calculateScore(market, account);
            interests[market][account].score = score;
            markets[market].sumOfMembersScore = markets[market].sumOfMembersScore + score;

            unchecked {
                i++;
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

        (uint256 capital, , ) = _capitalForScore(xvsBalanceForScore, borrow, supply, market);
        capital = capital * (10 ** (18 - vToken.decimals()));

        return Scores.calculateScore(xvsBalanceForScore, capital, alphaNumerator, alphaDenominator);
    }

    /**
     * @notice To transfer the accrued interest to user
     * @param vToken the market for which to claim
     * @param user the account for which to get the accrued interest
     * @return amount the amount of tokens transferred to the user
     */
    function _claimInterest(address vToken, address user) internal returns (uint256) {
        uint256 amount = getInterestAccrued(vToken, user);
        amount += interests[vToken][user].accrued;

        interests[vToken][user].rewardIndex = markets[vToken].rewardIndex;
        interests[vToken][user].accrued = 0;

        address underlying = _getUnderlying(vToken);
        IERC20Upgradeable asset = IERC20Upgradeable(underlying);

        if (amount > asset.balanceOf(address(this))) {
            address[] memory assets = new address[](1);
            assets[0] = address(asset);
            IProtocolShareReserve(protocolShareReserve).releaseFunds(comptroller, assets);
            if (amount > asset.balanceOf(address(this))) {
                IPrimeLiquidityProvider(primeLiquidityProvider).releaseFunds(address(asset));
                unreleasedPLPIncome[underlying] = 0;
            }
        }

        asset.safeTransfer(user, amount);

        emit InterestClaimed(user, vToken, amount);

        return amount;
    }

    /**
     * @notice Used to mint a new prime token
     * @param isIrrevocable is the tokens being issued is irrevocable
     * @param user token owner
     */
    function _mint(bool isIrrevocable, address user) internal {
        if (tokens[user].exists) revert IneligibleToClaim();

        tokens[user].exists = true;
        tokens[user].isIrrevocable = isIrrevocable;

        if (isIrrevocable) {
            totalIrrevocable++;
        } else {
            totalRevocable++;
        }

        if (totalIrrevocable > irrevocableLimit || totalRevocable > revocableLimit) revert InvalidLimit();

        emit Mint(user, isIrrevocable);
    }

    /**
     * @notice Used to burn a new prime token
     * @param user owner whose prime token to burn
     */
    function _burn(address user) internal {
        if (!tokens[user].exists) revert UserHasNoPrimeToken();

        address[] storage _allMarkets = allMarkets;

        for (uint256 i = 0; i < _allMarkets.length; ) {
            _executeBoost(user, _allMarkets[i]);

            markets[_allMarkets[i]].sumOfMembersScore =
                markets[_allMarkets[i]].sumOfMembersScore -
                interests[_allMarkets[i]][user].score;
            interests[_allMarkets[i]][user].score = 0;
            interests[_allMarkets[i]][user].rewardIndex = 0;

            unchecked {
                i++;
            }
        }

        if (tokens[user].isIrrevocable) {
            totalIrrevocable--;
        } else {
            totalRevocable--;
        }

        tokens[user].exists = false;
        tokens[user].isIrrevocable = false;

        _updateRoundAfterTokenBurned(user);

        emit Burn(user);
    }

    /**
     * @notice Used to upgrade an token
     * @param user owner whose prime token to upgrade
     */
    function _upgrade(address user) internal {
        Token storage userToken = tokens[user];

        userToken.isIrrevocable = true;
        totalIrrevocable++;
        totalRevocable--;

        if (totalIrrevocable > irrevocableLimit) revert InvalidLimit();

        emit TokenUpgraded(user);
    }

    /**
     * @notice Accrue rewards for the user. Must be called by Comptroller before changing account's borrow or supply balance.
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
        if (!markets[market].exists || !tokens[user].exists) {
            return;
        }

        uint256 score = _calculateScore(market, user);
        markets[market].sumOfMembersScore = markets[market].sumOfMembersScore - interests[market][user].score + score;
        interests[market][user].score = score;
    }

    /**
     * @notice Verify new alpha arguments
     * @param _alphaNumerator numerator of alpha. If alpha is 0.5 then numerator is 1
     * @param _alphaDenominator denominator of alpha. If alpha is 0.5 then denominator is 2
     */
    function _checkAlphaArguments(uint128 _alphaNumerator, uint128 _alphaDenominator) internal {
        if (_alphaDenominator == 0 || _alphaNumerator > _alphaDenominator) {
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
        if (totalScoreUpdatesRequired > 0) totalScoreUpdatesRequired--;

        if (pendingScoreUpdates > 0 && !isScoreUpdated[nextScoreUpdateRoundId][user]) {
            pendingScoreUpdates--;
        }
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
        } else {
            return xvs;
        }
    }

    /**
     * @notice calculate the capital for calculation of score
     * @param xvs the actual XVS balance of user
     * @param borrow the borrow balance of user
     * @param supply the supply balance of user
     * @param market the market vToken address
     * @return capital the capital to use in calculation of score
     * @return cappedSupply the capped supply of user
     * @return cappedBorrow the capped borrow of user
     */
    function _capitalForScore(
        uint256 xvs,
        uint256 borrow,
        uint256 supply,
        address market
    ) internal view returns (uint256, uint256, uint256) {
        address xvsToken = IXVSVault(xvsVault).xvsAddress();

        uint256 xvsPrice = oracle.getPrice(xvsToken);
        uint256 borrowCapUSD = (xvsPrice * ((xvs * markets[market].borrowMultiplier) / EXP_SCALE)) / EXP_SCALE;
        uint256 supplyCapUSD = (xvsPrice * ((xvs * markets[market].supplyMultiplier) / EXP_SCALE)) / EXP_SCALE;

        uint256 tokenPrice = oracle.getUnderlyingPrice(market);
        uint256 supplyUSD = (tokenPrice * supply) / EXP_SCALE;
        uint256 borrowUSD = (tokenPrice * borrow) / EXP_SCALE;

        if (supplyUSD >= supplyCapUSD) {
            supply = supplyUSD > 0 ? (supply * supplyCapUSD) / supplyUSD : 0;
        }

        if (borrowUSD >= borrowCapUSD) {
            borrow = borrowUSD > 0 ? (borrow * borrowCapUSD) / borrowUSD : 0;
        }

        return ((supply + borrow), supply, borrow);
    }

    /**
     * @notice Used to get if the XVS balance is eligible for prime token
     * @param amount amount of XVS
     * @return isEligible true if the staked XVS amount is enough to consider the associated user eligible for a Prime token, false otherwise
     */
    function isEligible(uint256 amount) internal view returns (bool) {
        if (amount >= MINIMUM_STAKED_XVS) {
            return true;
        }

        return false;
    }

    /**
     * @notice Calculate the interests accrued by the user in the market, since the last accrual
     * @param vToken the market for which calculate the accrued interest
     * @param user the user for which calculate the accrued interest
     * @return interestAccrued the number of underlying tokens accrued by the user since the last accrual
     */
    function _interestAccrued(address vToken, address user) internal view returns (uint256) {
        uint256 index = markets[vToken].rewardIndex - interests[vToken][user].rewardIndex;
        uint256 score = interests[vToken][user].score;

        return (index * score) / EXP_SCALE;
    }

    /**
     * @notice Returns the underlying token associated with the VToken, or WBNB if the market is VBNB
     * @param vToken the market whose underlying token will be returned
     * @return underlying The address of the underlying token associated with the VToken, or the address of the WBNB token if the market is VBNB
     */
    function _getUnderlying(address vToken) internal view returns (address) {
        if (vToken == VBNB) {
            return WBNB;
        } else {
            return IVToken(vToken).underlying();
        }
    }

    //////////////////////////////////////////////////
    //////////////// APR Calculation ////////////////
    ////////////////////////////////////////////////

    /**
     * @notice Returns the income the market generates per block
     * @param vToken the market for which to fetch the income per block
     * @return income the amount of tokens generated as income per block
     */
    function _incomePerBlock(address vToken) internal view returns (uint256) {
        IVToken market = IVToken(vToken);
        return ((((market.totalBorrows() * market.borrowRatePerBlock()) / EXP_SCALE) * market.reserveFactorMantissa()) /
            EXP_SCALE);
    }

    /**
     * @notice the percentage of income we distribute among the prime token holders
     * @return percentage the percentage returned without mantissa
     */
    function _distributionPercentage() internal view returns (uint256) {
        return
            IProtocolShareReserve(protocolShareReserve).getPercentageDistribution(
                address(this),
                IProtocolShareReserve.Schema.SPREAD_PRIME_CORE
            );
    }

    /**
     * @notice the total income that's going to be distributed in a year to prime token holders
     * @param vToken the market for which to fetch the total income that's going to distributed in a year
     * @return amount the total income
     */
    function _incomeDistributionYearly(address vToken) internal view returns (uint256 amount) {
        uint256 totalIncomePerBlockFromMarket = _incomePerBlock(vToken);
        uint256 incomePerBlockForDistributionFromMarket = (totalIncomePerBlockFromMarket * _distributionPercentage()) /
            IProtocolShareReserve(protocolShareReserve).MAX_PERCENT();
        amount = BLOCKS_PER_YEAR * incomePerBlockForDistributionFromMarket;

        uint256 totalIncomePerBlockFromPLP = IPrimeLiquidityProvider(primeLiquidityProvider)
            .getEffectiveDistributionSpeed(_getUnderlying(vToken));
        amount += BLOCKS_PER_YEAR * totalIncomePerBlockFromPLP;
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

        uint256 userYearlyIncome = (userScore * _incomeDistributionYearly(vToken)) / totalScore;
        uint256 totalCappedValue = totalCappedSupply + totalCappedBorrow;

        if (totalCappedValue == 0) return (0, 0);

        uint256 userSupplyIncomeYearly = (userYearlyIncome * totalCappedSupply) / totalCappedValue;
        uint256 userBorrowIncomeYearly = (userYearlyIncome * totalCappedBorrow) / totalCappedValue;

        supplyAPR = totalSupply == 0 ? 0 : ((userSupplyIncomeYearly * MAXIMUM_BPS) / totalSupply);
        borrowAPR = totalBorrow == 0 ? 0 : ((userBorrowIncomeYearly * MAXIMUM_BPS) / totalBorrow);
    }
}
