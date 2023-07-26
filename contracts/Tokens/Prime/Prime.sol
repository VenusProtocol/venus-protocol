pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@venusprotocol/governance-contracts/contracts/Governance/AccessControlledV8.sol";
import "./PrimeStorage.sol";
import "./libs/Scores.sol";

interface IVToken {
    function borrowRatePerBlock() external view returns (uint);

    function reserveFactorMantissa() external returns (uint);

    function totalBorrows() external returns (uint);

    function accrueInterest() external returns (uint);

    function borrowBalanceStored(address account) external returns (uint);

    function exchangeRateStored() external returns (uint);

    function balanceOf(address account) external returns (uint);

    function underlying() external returns (address);
}

interface ERC20Interface {
    function decimals() external view returns (uint8);
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
        ONE,
        TWO
    }

    function getUnreleasedFunds(
        address comptroller,
        Schema schema,
        address destination,
        address asset
    ) external view returns (uint256);

    function releaseFunds(address comptroller, address[] memory assets) external;
}

interface IIncomeDestination {
    function updateAssetsState(address comptroller, address asset) external;
}

error MarketNotSupported();
error InvalidLimit();
error IneligibleToClaim();
error WaitMoreTime();
error UserHasNoPrimeToken();
error InvalidCaller();
error InvalidComptroller();
error NoScoreUpdatesRequired();

contract Prime is IIncomeDestination, AccessControlledV8, PrimeStorageV1 {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Emitted when prime token is minted
    event Mint(address owner, bool isIrrevocable);

    /// @notice Emitted when prime token is burned
    event Burn(address owner);

    /// @notice Emitted asset state is update by protocol share reserve
    event UpdatedAssetsState(address comptroller, address asset);

    function initialize(
        address _xvsVault,
        address _xvsVaultRewardToken,
        uint256 _xvsVaultPoolId,
        uint128 _alphaNumerator,
        uint128 _alphaDenominator,
        address _accessControlManager,
        address _protocolShareReserve,
        address _comptroller
    ) external virtual initializer {
        alphaNumerator = _alphaNumerator;
        alphaDenominator = _alphaDenominator;
        xvsVaultRewardToken = _xvsVaultRewardToken;
        xvsVaultPoolId = _xvsVaultPoolId;
        xvsVault = _xvsVault;
        nextScoreUpdateRoundId = 0;
        protocolShareReserve = _protocolShareReserve;
        comptroller = _comptroller;

        __AccessControlled_init(_accessControlManager);
    }

    /**
     * @notice Update value of alpha
     * @param _alphaNumerator numerator of alpha. If alpha is 0.5 then numberator is 1
     * @param _alphaDenominator denominator of alpha. If alpha is 0.5 then numberator is 2
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
        if (markets[market].exists == false) revert MarketNotSupported();
        
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
        if (markets[vToken].exists == true) revert MarketNotSupported();

        markets[vToken].rewardIndex = 0;
        markets[vToken].supplyMultiplier = supplyMultiplier;
        markets[vToken].borrowMultiplier = borrowMultiplier;
        markets[vToken].score = 0;
        markets[vToken].exists = true;

        vTokenForAsset[IVToken(vToken).underlying()] = vToken;

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
     * @param owners list of address to issue tokens to
     */
    function issue(bool isIrrevocable, address[] memory owners) external {
        _checkAccessAllowed("issue(bool,address[])");

        if (isIrrevocable == true) {
            for (uint i = 0; i < owners.length; i++) {
                _mint(true, owners[i]);
                _initializeMarkets(owners[i]);
            }
        } else {
            for (uint i = 0; i < owners.length; i++) {
                _mint(false, owners[i]);
                _initializeMarkets(owners[i]);
                delete stakedAt[owners[i]];
            }
        }
    }

    /**
     * @notice Executed by XVSVault whenever users XVSVault balance changes
     * @param owner the account address whose balance was updated
     */
    function xvsUpdated(address owner) external {
        uint256 totalStaked = _xvsBalanceOfUser(owner);
        bool isAccountEligible = isEligible(totalStaked);

        if (tokens[owner].exists == true && isAccountEligible == false) {
            _burn(owner);
        } else if (isAccountEligible == false && tokens[owner].exists == false && stakedAt[owner] > 0) {
            stakedAt[owner] = 0;
        } else if (stakedAt[owner] == 0 && isAccountEligible == true && tokens[owner].exists == false) {
            stakedAt[owner] = block.timestamp;
        } else if (tokens[owner].exists == true && isAccountEligible == true) {
            address[] storage _allMarkets = allMarkets;
            for (uint i = 0; i < _allMarkets.length; i++) {
                executeBoost(owner, _allMarkets[i]);
                updateScore(owner, _allMarkets[i]);
            }
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
            markets[market].score = markets[market].score + score;
        }
    }

    /**
     * @notice fetch the current XVS balance of user in the XVSVault
     * @param account the account address for which markets needs to be initialized
     * @return xvsBalance the XVS balance of user
     */
    function _xvsBalanceOfUser(address account) internal view returns (uint256) {
        (uint256 xvs, , uint256 pendingWithdrawals) = IXVSVault(xvsVault).getUserInfo(
            xvsVaultRewardToken,
            xvsVaultPoolId,
            account
        );
        return (xvs - pendingWithdrawals);
    }

    /**
     * @notice calculate the current score of user
     * @param market the market for which to calculate the score
     * @param account the account for which to calculate the score
     * @return score the score of the user
     */
    function _calculateScore(address market, address account) internal returns (uint256) {
        uint256 xvsBalanceForScore = _xvsBalanceForScore(_xvsBalanceOfUser(account));

        IVToken vToken = IVToken(market);
        uint256 borrow = vToken.borrowBalanceStored(account);
        uint256 exchangeRate = vToken.exchangeRateStored();
        uint256 balanceOfAccount = vToken.balanceOf(account);
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
     * @param owner token owner
     */
    function _mint(bool isIrrevocable, address owner) internal {
        if (tokens[owner].exists == true) revert IneligibleToClaim();

        tokens[owner].exists = true;
        tokens[owner].isIrrevocable = isIrrevocable;

        if (isIrrevocable == true) {
            _totalIrrevocable++;
        } else {
            _totalRevocable++;
        }

        if (_totalIrrevocable > _irrevocableLimit || _totalRevocable > _revocableLimit) revert InvalidLimit();

        _updateRoundAfterTokenMinted();

        emit Mint(owner, isIrrevocable);
    }

    /**
     * @notice Used to burn a new prime token
     * @param owner owner whose prime token to burn
     */
    function _burn(address owner) internal {
        if (tokens[owner].exists == false) revert UserHasNoPrimeToken();

        tokens[owner].exists = false;
        tokens[owner].isIrrevocable = false;

        if (tokens[owner].isIrrevocable == true) {
            _totalIrrevocable--;
        } else {
            _totalRevocable--;
        }

        _updateRoundAfterTokenBurned();

        emit Burn(owner);
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
     * @param account account for which we need to accrue rewards
     * @param vToken the market for which we need to accrue rewards
     */
    function executeBoost(address account, address vToken) public {
        if (markets[vToken].exists == false) {
            return;
        }

        if (tokens[account].exists == false) {
            return;
        }

        accrueInterest(vToken);
        interests[vToken][account].accrued = _interestAccrued(vToken, account);
        interests[vToken][account].rewardIndex = markets[vToken].rewardIndex;
    }

    /**
     * @notice Update total score of user and market. Must be called after changing account's borrow or supply balance.
     * @param account account for which we need to update score
     * @param market the market for which we need to score
     */
    function updateScore(address account, address market) public {
        if (markets[market].exists == false) {
            return;
        }

        if (tokens[account].exists == false) {
            return;
        }

        uint score = _calculateScore(market, account);
        markets[market].score = markets[market].score - interests[market][account].score;
        interests[market][account].score = score;
        markets[market].score = markets[market].score + score;
    }

    /**
     * @notice Distributes income from market since last distribution
     * @param vToken the market for which to distribute the income
     */
    function accrueInterest(address vToken) public {
        if (markets[vToken].exists == false) revert MarketNotSupported();

        IVToken market = IVToken(vToken);

        uint totalIncomeUnreleased = IProtocolShareReserve(protocolShareReserve).getUnreleasedFunds(
            comptroller,
            IProtocolShareReserve.Schema.ONE,
            address(this),
            market.underlying()
        );

        uint256 distributionIncome = totalIncomeUnreleased - unreleasedIncome[market.underlying()];
        unreleasedIncome[market.underlying()] = totalIncomeUnreleased;

        if (distributionIncome == 0) {
            return;
        }

        uint256 delta;
        if (markets[vToken].score > 0) {
            delta = ((distributionIncome * EXP_SCALE) / markets[vToken].score);
        }

        markets[vToken].rewardIndex = markets[vToken].rewardIndex + delta;
    }

    function getMarketDecimals(address vToken) internal returns (uint256) {
        IVToken market = IVToken(vToken);
        address underlying;

        try market.underlying() returns (address _underlying) {
            underlying = _underlying;
        } catch (bytes memory) {
            return 10 ** 18; // vBNB
        }

        return (10 ** ERC20Interface(underlying).decimals());
    }

    /**
     * @notice Returns boosted interest accrued for a user
     * @param vToken the market for which to fetch the accrued interest
     * @param account the account for which to get the accrued interest
     */
    function getInterestAccrued(address vToken, address account) public returns (uint256) {
        accrueInterest(vToken);

        return _interestAccrued(vToken, account);
    }

    function _interestAccrued(address vToken, address account) internal returns (uint256) {
        uint256 index = markets[vToken].rewardIndex - interests[vToken][account].rewardIndex;
        uint256 score = interests[vToken][account].score;

        return (index * score) / EXP_SCALE;
    }

    /**
     * @notice For user to claim boosted yield
     * @param vToken the market for which claim the accrued interest
     */
    function claimInterest(address vToken) external {
        uint256 amount = getInterestAccrued(vToken, msg.sender);
        interests[vToken][msg.sender].rewardIndex = markets[vToken].rewardIndex;
        interests[vToken][msg.sender].accrued = 0;

        IERC20Upgradeable asset = IERC20Upgradeable(IVToken(vToken).underlying());

        if (amount > asset.balanceOf(address(this))) {
            address[] memory assets = new address[](1);
            assets[0] = address(asset);
            IProtocolShareReserve(protocolShareReserve).releaseFunds(comptroller, assets);
        }

        asset.safeTransfer(msg.sender, amount);
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
        unreleasedIncome[market.underlying()] = 0;

        emit UpdatedAssetsState(comptroller, asset);
    }

    /**
     * @notice Update total score of multiple users and market
     * @param accounts accounts for which we need to update score
     */
    function updateScores(address[] memory accounts) external {
        if (pendingScoreUpdates == 0) revert NoScoreUpdatesRequired();
        if (nextScoreUpdateRoundId == 0) revert NoScoreUpdatesRequired();

        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            
            if (tokens[account].exists == false) revert UserHasNoPrimeToken();
            if (isScoreUpdated[nextScoreUpdateRoundId][account] == true) revert NoScoreUpdatesRequired();

            address[] storage _allMarkets = allMarkets;
            for (uint i = 0; i < _allMarkets.length; i++) {
                address market = _allMarkets[i];
                updateScore(account, market);
            }

            pendingScoreUpdates--;
            isScoreUpdated[nextScoreUpdateRoundId][account] = true;
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
    function _updateRoundAfterTokenBurned() internal {
        if (pendingScoreUpdates > 0) {
            totalScoreUpdatesRequired--;
            pendingScoreUpdates--;
        }
    }

    /**
     * @notice update the required score updates when token is burned before round is completed
     */
    function _updateRoundAfterTokenMinted() internal {
        if (pendingScoreUpdates > 0) {
            totalScoreUpdatesRequired++;
            pendingScoreUpdates++;
        }
    }
}
