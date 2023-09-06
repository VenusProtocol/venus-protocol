pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import "./PrimeStorage.sol";
import "./libs/Scores.sol";

interface IVToken {
    function borrowBalanceStored(address account) external returns (uint);

    function exchangeRateStored() external returns (uint);

    function balanceOf(address account) external view returns (uint);

    function underlying() external view returns (address);

    function totalBorrows() external view returns (uint);

    function borrowRatePerBlock() external view returns (uint);

    function reserveFactorMantissa() external view returns (uint);
}

interface IXVSVault {
    function getUserInfo(
        address _rewardToken,
        uint256 _pid,
        address _user
    ) external view returns (uint256 amount, uint256 rewardDebt, uint256 pendingWithdrawals);
}

interface IProtocolShareReserve {
    enum Schema {
        DEFAULT,
        SPREAD_PRIME_CORE
    }

    function getUnreleasedFunds(
        address comptroller,
        Schema schema,
        address destination,
        address asset
    ) external view returns (uint256);

    function releaseFunds(address comptroller, address[] memory assets) external;

    function getPercentageDistribution(address destination, Schema schema) external view returns (uint256);

    function MAX_PERCENT() external view returns (uint256);
}

interface IIncomeDestination {
    function updateAssetsState(address comptroller, address asset) external;
}

interface IPrimeLiquidityProvider {
    function releaseFunds(address token_) external;
}

error MarketNotSupported();
error InvalidLimit();
error IneligibleToClaim();
error WaitMoreTime();
error UserHasNoPrimeToken();
error InvalidCaller();
error InvalidComptroller();
error NoScoreUpdatesRequired();
error MarketAlreadyExists();

contract Prime is IIncomeDestination, AccessControlledV8, PrimeStorageV1 {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    
    /// @notice total blocks per year
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable BLOCKS_PER_YEAR;

    /// @notice address of WBNB contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable WBNB;

    /// @notice address of vBNB contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable vBNB;

    /// @notice Emitted when prime token is minted
    event Mint(address indexed user, bool isIrrevocable);

    /// @notice Emitted when prime token is burned
    event Burn(address indexed user);

    /// @notice Emitted asset state is update by protocol share reserve
    event UpdatedAssetsState(address indexed comptroller, address indexed asset);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address _wbnb, address _vbnb, uint256 _blocksPerYear) {
        require(_wbnb != address(0), "Prime: WBNB address invalid");
        require(_vbnb != address(0), "Prime: vBNB address invalid");
        require(_blocksPerYear != 0, "Prime: Invalid blocks per year");
        WBNB = _wbnb;
        vBNB = _vbnb;
        BLOCKS_PER_YEAR = _blocksPerYear;

        // Note that the contract is upgradeable. Use initialize() or reinitializers
        // to set the state variables.
        _disableInitializers();
    }

    function initialize(
        address _xvsVault,
        address _xvsVaultRewardToken,
        uint256 _xvsVaultPoolId,
        uint128 _alphaNumerator,
        uint128 _alphaDenominator,
        address _accessControlManager,
        address _protocolShareReserve,
        address _primeLiquidityProvider,
        address _comptroller
    ) external virtual initializer {
        alphaNumerator = _alphaNumerator;
        alphaDenominator = _alphaDenominator;
        xvsVaultRewardToken = _xvsVaultRewardToken;
        xvsVaultPoolId = _xvsVaultPoolId;
        xvsVault = _xvsVault;
        nextScoreUpdateRoundId = 0;
        protocolShareReserve = _protocolShareReserve;
        primeLiquidityProvider = _primeLiquidityProvider;
        comptroller = _comptroller;

        __AccessControlled_init(_accessControlManager);
    }

    /**
     * @notice Update value of alpha
     * @param _alphaNumerator numerator of alpha. If alpha is 0.5 then numerator is 1
     * @param _alphaDenominator denominator of alpha. If alpha is 0.5 then denominator is 2
     */
    function updateAlpha(uint128 _alphaNumerator, uint128 _alphaDenominator) external {
        _checkAccessAllowed("updateAlpha(uint128,uint128)");

        alphaNumerator = _alphaNumerator;
        alphaDenominator = _alphaDenominator;

        for (uint i = 0; i < allMarkets.length; i++) {
            accrueInterest(allMarkets[i]);
        }

        _startScoreUpdateRound();
    }

    /**
     * @notice Update multipliers for a market
     * @param _supplyMultiplier new supply multiplier for the market
     * @param _borrowMultiplier new borrow multiplier for the market
     */
    function updateMultipliers(address market, uint256 _supplyMultiplier, uint256 _borrowMultiplier) external {
        _checkAccessAllowed("updateMultipliers(address,uint256,uint256)");
        if (!markets[market].exists) revert MarketNotSupported();

        accrueInterest(market);
        markets[market].supplyMultiplier = _supplyMultiplier;
        markets[market].borrowMultiplier = _borrowMultiplier;

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

        markets[vToken].rewardIndex = 0;
        markets[vToken].supplyMultiplier = supplyMultiplier;
        markets[vToken].borrowMultiplier = borrowMultiplier;
        markets[vToken].sumOfMembersScore = 0;
        markets[vToken].exists = true;

        vTokenForAsset[_getUnderlying(vToken)] = vToken;

        allMarkets.push(vToken);
        _startScoreUpdateRound();
    }

    /**
     * @notice Set limits for total tokens that can be mined
     * @param irrevocableLimit total number of irrevocable tokens that can be minted
     * @param revocableLimit total number of revocable tokens that can be minted
     */
    function setLimit(uint256 irrevocableLimit, uint256 revocableLimit) external {
        _checkAccessAllowed("setLimit(uint256,uint256)");
        if (irrevocableLimit < _totalIrrevocable || revocableLimit < _totalRevocable) revert InvalidLimit();

        _revocableLimit = revocableLimit;
        _irrevocableLimit = irrevocableLimit;
    }

    /**
     * @notice Directly issue prime tokens to users
     * @param isIrrevocable is the tokens being issued is irrevocable
     * @param users list of address to issue tokens to
     */
    function issue(bool isIrrevocable, address[] calldata users) external {
        _checkAccessAllowed("issue(bool,address[])");

        if (isIrrevocable) {
            for (uint i = 0; i < users.length; i++) {
                _mint(true, users[i]);
                _initializeMarkets(users[i]);
            }
        } else {
            for (uint i = 0; i < users.length; i++) {
                _mint(false, users[i]);
                _initializeMarkets(users[i]);
                delete stakedAt[users[i]];
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

    function _accrueInterestAndUpdateScore(address user) internal {
        address[] storage _allMarkets = allMarkets;
        for (uint i = 0; i < _allMarkets.length; i++) {
            executeBoost(user, _allMarkets[i]);
            updateScore(user, _allMarkets[i]);
        }
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
     * @notice fetch the numbers of seconds remaining for staking period to complete
     * @param user the account address for which we are checking the remaining time
     * @return timeRemaining the number of seconds the user needs to wait to claim prime token
     */
    function claimTimeRemaining(address user) external view returns (uint256) {
        if (stakedAt[user] == 0) revert IneligibleToClaim();

        uint256 totalTimeStaked = block.timestamp - stakedAt[user];
        if (totalTimeStaked < STAKING_PERIOD) {
            return STAKING_PERIOD - totalTimeStaked;
        } else {
            return 0;
        }
    }

    /**
     * @notice Initializes all the markets for the user when a prime token is minted
     * @param account the account address for which markets needs to be initialized
     */
    function _initializeMarkets(address account) internal {
        address[] storage _allMarkets = allMarkets;
        for (uint i = 0; i < _allMarkets.length; i++) {
            address market = _allMarkets[i];
            accrueInterest(market);

            interests[market][account].rewardIndex = markets[market].rewardIndex;

            uint score = _calculateScore(market, account);
            interests[market][account].score = score;
            markets[market].sumOfMembersScore = markets[market].sumOfMembersScore + score;
        }
    }

    /**
     * @notice fetch the current XVS balance of user in the XVSVault
     * @param user the account address for which markets needs to be initialized
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

        return
            Scores.calculateScore(
                xvsBalanceForScore,
                _capitalForScore(xvsBalanceForScore, borrow, supply, market),
                alphaNumerator,
                alphaDenominator
            );
    }

    /**
     * @notice calcukate the current XVS balance that will be used in calculation of score
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
     */
    function _capitalForScore(
        uint256 xvs,
        uint256 borrow,
        uint256 supply,
        address market
    ) internal view returns (uint256) {
        uint256 borrowCap = (xvs * markets[market].borrowMultiplier) / EXP_SCALE;
        uint256 supplyCap = (xvs * markets[market].supplyMultiplier) / EXP_SCALE;

        if (supply > supplyCap) {
            supply = supplyCap;
        }

        if (borrow > borrowCap) {
            borrow = borrowCap;
        }

        return (supply + borrow);
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
            _totalIrrevocable++;
        } else {
            _totalRevocable++;
        }

        if (_totalIrrevocable > _irrevocableLimit || _totalRevocable > _revocableLimit) revert InvalidLimit();

        emit Mint(user, isIrrevocable);
    }

    /**
     * @notice Used to burn a new prime token
     * @param user owner whose prime token to burn
     */
    function _burn(address user) internal {
        if (!tokens[user].exists) revert UserHasNoPrimeToken();

        address[] storage _allMarkets = allMarkets;

        for (uint i = 0; i < _allMarkets.length; i++) {
            executeBoost(user, _allMarkets[i]);

            markets[_allMarkets[i]].sumOfMembersScore =
                markets[_allMarkets[i]].sumOfMembersScore -
                interests[_allMarkets[i]][user].score;
            interests[_allMarkets[i]][user].score = 0;
            interests[_allMarkets[i]][user].rewardIndex = 0;
        }

        if (tokens[user].isIrrevocable) {
            _totalIrrevocable--;
        } else {
            _totalRevocable--;
        }

        tokens[user].exists = false;
        tokens[user].isIrrevocable = false;

        _updateRoundAfterTokenBurned(user);

        emit Burn(user);
    }

    /**
     * @notice Used to get if the XVS balance is eligible for prime token
     * @param amount amount of XVS
     */
    function isEligible(uint256 amount) internal view returns (bool) {
        if (amount >= MINIMUM_STAKED_XVS) {
            return true;
        }

        return false;
    }

    /**
     * @notice Accrue rewards for the user. Must be called by Comptroller before changing account's borrow or supply balance.
     * @param user account for which we need to accrue rewards
     * @param vToken the market for which we need to accrue rewards
     */
    function executeBoost(address user, address vToken) public {
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
    function updateScore(address user, address market) public {
        if (!markets[market].exists) {
            return;
        }

        if (!tokens[user].exists) {
            return;
        }

        uint score = _calculateScore(market, user);
        markets[market].sumOfMembersScore = markets[market].sumOfMembersScore - interests[market][user].score + score;
        interests[market][user].score = score;
    }

    /**
     * @notice Distributes income from market since last distribution
     * @param vToken the market for which to distribute the income
     */
    function accrueInterest(address vToken) public {
        if (!markets[vToken].exists) revert MarketNotSupported();

        address underlying = _getUnderlying(vToken);

        uint totalIncomeUnreleased = IProtocolShareReserve(protocolShareReserve).getUnreleasedFunds(
            comptroller,
            IProtocolShareReserve.Schema.SPREAD_PRIME_CORE,
            address(this),
            underlying
        );

        uint256 distributionIncome = totalIncomeUnreleased - unreleasedIncome[underlying];

        if (distributionIncome == 0) {
            return;
        }

        unreleasedIncome[underlying] = totalIncomeUnreleased;

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
     */
    function getInterestAccrued(address vToken, address user) public returns (uint256) {
        accrueInterest(vToken);

        return _interestAccrued(vToken, user);
    }

    function _interestAccrued(address vToken, address user) internal returns (uint256) {
        uint256 index = markets[vToken].rewardIndex - interests[vToken][user].rewardIndex;
        uint256 score = interests[vToken][user].score;

        return (index * score) / EXP_SCALE;
    }

    /**
     * @notice For user to claim boosted yield
     * @param vToken the market for which claim the accrued interest
     */
    function claimInterest(address vToken) external {
        _claimInterest(vToken, msg.sender);
    }

    /**
     * @notice For user to claim boosted yield
     * @param vToken the market for which claim the accrued interest
     */
    function claimInterest(address vToken, address user) external {
        _claimInterest(vToken, user);
    }

    /**
     * @notice To transfer the accrued interest to user
     * @param vToken the market for which claim the accrued interest
     * @param user the account for which to get the accrued interest
     */
    function _claimInterest(address vToken, address user) internal {
        uint256 amount = getInterestAccrued(vToken, user);
        amount += interests[vToken][user].accrued;

        interests[vToken][user].rewardIndex = markets[vToken].rewardIndex;
        interests[vToken][user].accrued = 0;

        IERC20Upgradeable asset = IERC20Upgradeable(_getUnderlying(vToken));

        if (amount > asset.balanceOf(address(this))) {
            address[] memory assets = new address[](1);
            assets[0] = address(asset);
            IProtocolShareReserve(protocolShareReserve).releaseFunds(comptroller, assets);
            if (amount > asset.balanceOf(address(this))) {
                IPrimeLiquidityProvider(primeLiquidityProvider).releaseFunds(address(asset));
            }
        }

        asset.safeTransfer(user, amount);
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
        unreleasedIncome[_getUnderlying(address(market))] = 0;

        emit UpdatedAssetsState(comptroller, asset);
    }

    function _getUnderlying(address vToken) internal view returns (address) {
        if (vToken == vBNB) {
            return WBNB;
        } else {
            return IVToken(vToken).underlying();
        }
    }

    //////////////////////////////////////////////////
    /////// Update Scores after Config Change ///////
    ////////////////////////////////////////////////

    /**
     * @notice Update total score of multiple users and market
     * @param users accounts for which we need to update score
     */
    function updateScores(address[] memory users) external {
        if (pendingScoreUpdates == 0) revert NoScoreUpdatesRequired();
        if (nextScoreUpdateRoundId == 0) revert NoScoreUpdatesRequired();

        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];

            if (!tokens[user].exists) revert UserHasNoPrimeToken();
            if (isScoreUpdated[nextScoreUpdateRoundId][user]) continue;

            address[] storage _allMarkets = allMarkets;
            for (uint i = 0; i < _allMarkets.length; i++) {
                address market = _allMarkets[i];
                updateScore(user, market);
            }

            pendingScoreUpdates--;
            isScoreUpdated[nextScoreUpdateRoundId][user] = true;
        }
    }

    /**
     * @notice starts round to update scores of a particular or all markets
     */
    function _startScoreUpdateRound() internal {
        nextScoreUpdateRoundId++;
        totalScoreUpdatesRequired = _totalIrrevocable + _totalRevocable;
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
    function _incomeDistributionYearly(address vToken) internal view returns (uint256) {
        uint256 totalIncomePerBlock = _incomePerBlock(vToken);
        uint256 incomePerBlockForDistribution = (totalIncomePerBlock * _distributionPercentage()) /
            IProtocolShareReserve(protocolShareReserve).MAX_PERCENT();
        return BLOCKS_PER_YEAR * incomePerBlockForDistribution;
    }

    /**
     * @notice used to calculate the supply and borrow APR of the user
     * @param vToken the market for which to fetch the APR
     * @param user the user whose APR we need to calculate
     * @param totalSupply the total token supply of the user
     * @param totalBorrow the total tokens borrowed by the user
     * @param userScore the score of the user
     * @param totalScore the total market score
     * @return supplyAPR the supply APR of the user
     * @return borrowAPR the borrow APR of the user
     */
    function _calculateUserAPR(
        address vToken, 
        address user, 
        uint256 totalSupply, 
        uint256 totalBorrow,
        uint256 userScore,
        uint256 totalScore
    ) internal view returns (uint256 supplyAPR, uint256 borrowAPR) {
        if (totalScore == 0) return (0,0);

        uint256 userYearlyIncome = (userScore * _incomeDistributionYearly(vToken)) / totalScore;
        uint256 totalValue = totalSupply + totalBorrow;
    
        if (totalValue == 0) return (0,0);

        uint256 apr = (userYearlyIncome * MAXIMUM_BPS) / totalValue;
        supplyAPR = totalSupply > 0 ? apr : 0;
        borrowAPR = totalBorrow > 0 ? apr : 0;
    }

    /**
     * @notice Returns supply and borrow APR for user for a given market
     * @param market the market for which to fetch the APR
     * @param user the account for which to get the APR
     * @return supplyAPR supply APR of the user
     * @return borrowAPR borrow APR of the user
     */
    function calculateAPR(address market, address user) external returns (uint256 supplyAPR, uint256 borrowAPR) {
        IVToken vToken = IVToken(market);
        uint256 borrow = vToken.borrowBalanceStored(user);
        uint256 exchangeRate = vToken.exchangeRateStored();
        uint256 balanceOfAccount = vToken.balanceOf(user);
        uint256 supply = (exchangeRate * balanceOfAccount) / EXP_SCALE;

        uint256 userScore = interests[market][user].score;
        uint256 totalScore = markets[market].sumOfMembersScore;

        return _calculateUserAPR(market, user, supply, borrow, userScore, totalScore);
    }

    /**
     * @notice Returns supply and borrow APR for estimated supply, borrow and XVS staked
     * @param market the market for which to fetch the APR
     * @param user the account for which to get the APR
     * @param borrow hypothetical borrow amount
     * @param supply hypothetical supply amount
     * @param xvsStaked hypothetical staked XVS amount
     * @return supplyAPR supply APR of the user
     * @return borrowAPR borrow APR of the user
     */
    function estimateAPR(
        address market, 
        address user,
        uint256 borrow,
        uint256 supply,
        uint256 xvsStaked
    ) external view returns (uint256 supplyAPR, uint256 borrowAPR) {
        uint256 totalScore = markets[market].sumOfMembersScore - interests[market][user].score;

        uint256 userScore = Scores.calculateScore(
            xvsStaked,
            _capitalForScore(xvsStaked, borrow, supply, market),
            alphaNumerator,
            alphaDenominator
        );

        totalScore = totalScore + userScore;

        return _calculateUserAPR(market, user, supply, borrow, userScore, totalScore);
    }
}
