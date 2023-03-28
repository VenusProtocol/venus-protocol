pragma solidity 0.8.13;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./PrimeStorage.sol";
import "./libs/Scores.sol";

import "hardhat/console.sol";

interface IVToken {
    function borrowRatePerBlock() external view returns (uint);

    function reserveFactorMantissa() external returns (uint);

    function totalBorrowsCurrent() external returns (uint);

    function accrueInterest() external returns (uint);

    function borrowBalanceCurrent(address account) external returns (uint);

    function balanceOfUnderlying(address account) external returns (uint);

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

contract Prime is Ownable2StepUpgradeable, PrimeStorageV1 {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /// @notice Emitted when prime token is minted
    event Mint(address owner, bool isIrrevocable);

    /// @notice Emitted when prime token is burned
    event Burn(address owner);

    function initialize(
        address _xvsVault,
        address _xvsVaultRewardToken,
        uint256 _xvsVaultPoolId,
        uint128 _alphaNumerator,
        uint128 _alphaDemominator,
        address _comptroller
    ) external virtual initializer {
        alphaNumerator = _alphaNumerator;
        alphaDenominator = _alphaDemominator;
        xvsVaultRewardToken = _xvsVaultRewardToken;
        xvsVaultPoolId = _xvsVaultPoolId;
        xvsVault = _xvsVault;
        comptroller = _comptroller;

        __Ownable2Step_init();
    }

    function updateAlpha(
        uint128 _alphaNumerator,
        uint128 _alphaDemominator
    ) external onlyOwner {
        alphaNumerator = _alphaNumerator;
        alphaDenominator = _alphaDemominator;
    }

    /**
     * @notice Set limits for total tokens that can be mined
     * @param irrevocableLimit total number of irrevocable tokens that can be minted
     * @param revocableLimit total number of revocable tokens that can be minted
     */
    function setLimit(uint256 irrevocableLimit, uint256 revocableLimit) external onlyOwner {
        require(_totalRevocable <= revocableLimit, "limit is lower than total minted tokens");
        require(_totalIrrevocable <= irrevocableLimit, "limit is lower than total minted tokens");

        _revocableLimit = revocableLimit;
        _irrevocableLimit = irrevocableLimit;
    }

    function addMarket(
        address vToken,
        uint256 supplyMultiplier, //represented as 1e18
        uint256 borrowMultiplier //represented as 1e18
    ) external onlyOwner {
        require(markets[vToken].lastUpdated == 0, "market is already added");

        markets[vToken].rewardIndex = INITIAL_INDEX;
        markets[vToken].lastUpdated = block.number;
        markets[vToken].supplyMultiplier = supplyMultiplier;
        markets[vToken].borrowMultiplier = borrowMultiplier;
        markets[vToken].score = 0;
        markets[vToken].indexMultiplier = 0;

        allMarkets.push(vToken);
    }

    /**
     * @notice Directly issue prime tokens to users
     * @param isIrrevocable is the tokens being issued is irrevocable
     * @param owners list of address to issue tokens to
     */
    function issue(bool isIrrevocable, address[] memory owners) external onlyOwner {
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

    function xvsUpdated(address owner) external onlyXVSVault {
        uint256 totalStaked = _xvsBalanceOfUser(owner);
        bool isAccountEligible = isEligible(totalStaked);

        if (tokens[owner].exists == true && isAccountEligible == false) {
            _burn(owner);
        } else if (isAccountEligible == false && tokens[owner].exists == false && stakedAt[owner] > 0) {
            stakedAt[owner] = 0;
        } else if(stakedAt[owner] == 0 && isAccountEligible == true && tokens[owner].exists == false) {
            stakedAt[owner] = block.timestamp;
        }
    }

    /**
     * @notice For claiming prime token when staking period is completed
     */
    function claim() external {
        require(stakedAt[msg.sender] != 0, "you are not eligible to claim prime token");
        require(
            block.timestamp - stakedAt[msg.sender] >= STAKING_PERIOD,
            "you need to wait more time for claiming prime token"
        );

        stakedAt[msg.sender] = 0;

        _mint(false, msg.sender);
        _initializeMarkets(msg.sender);
    }

    function _initializeMarkets(address account) internal {
        for (uint i = 0; i < allMarkets.length; i++) {
            address market = allMarkets[i];
            accrueInterest(market);
            
            IVToken vToken = IVToken(allMarkets[i]);
            uint256 borrow = vToken.borrowBalanceCurrent(account);
            uint256 supply = vToken.balanceOfUnderlying(account);

            interests[market][account].rewardIndex = markets[market].rewardIndex;
            interests[market][account].indexMultiplier = markets[market].indexMultiplier;
            interests[market][account].supply = supply;
            interests[market][account].borrow = borrow;

            uint score = _calculateScore(market, account);
            interests[market][account].score = score;
            markets[market].score = markets[market].score + score;
        }
    }

    function _xvsBalanceOfUser(address account) internal view returns(uint256) {
        (uint256 xvs,,uint256 pendingWithdrawals) = IXVSVault(xvsVault).getUserInfo(xvsVaultRewardToken, xvsVaultPoolId, account);
        return (xvs - pendingWithdrawals);
    }

    function _calculateScore(
        address market,
        address account
    ) internal view returns (uint256) {
        uint256 xvsBalanceForScore = _xvsBalanceForScore(_xvsBalanceOfUser(account));
        return Scores.calculateScore(
            xvsBalanceForScore, 
            _capitalForScore(xvsBalanceForScore, market, account), 
            alphaNumerator,
            alphaDenominator
        );
    }

    function _xvsBalanceForScore(
        uint256 xvs
    ) internal view returns (uint256) {
        if(xvs > MAXIMUM_XVS_CAP) {
            return MAXIMUM_XVS_CAP;
        } else {
            return xvs;
        }
    }

    function _capitalForScore(
        uint256 xvs,
        address market,
        address account
    ) internal view returns (uint256) {
        uint256 borrowCap = (xvs * markets[market].borrowMultiplier) / 1e18;
        uint256 supplyCap = (xvs * markets[market].supplyMultiplier) / 1e18;

        uint256 supply = interests[market][account].supply;
        uint256 borrow = interests[market][account].borrow;

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
        require(tokens[owner].exists == false, "user already owns a prime token");

        tokens[owner].exists = true;
        tokens[owner].isIrrevocable = isIrrevocable;

        if (isIrrevocable == true) {
            _totalIrrevocable++;
        } else {
            _totalRevocable++;
        }

        require(
            _totalIrrevocable <= _irrevocableLimit && _totalRevocable <= _revocableLimit,
            "exceeds token mint limit"
        );

        emit Mint(owner, isIrrevocable);
    }

    /**
     * @notice Used to burn a new prime token
     * @param owner owner whose prime token to burn
     */
    function _burn(address owner) internal {
        require(tokens[owner].exists == true, "user doesn't own an prime token");

        tokens[owner].exists = false;
        tokens[owner].isIrrevocable = false;

        if (tokens[owner].isIrrevocable == true) {
            _totalIrrevocable--;
        } else {
            _totalRevocable--;
        }

        emit Burn(owner);
    }

    /**
     * @notice Used to get the eligible tier associated with XVS amount
     * @param amount amount of XVS
     */
    function isEligible(uint256 amount) internal view returns (bool) {
        if (amount >= MINIMUM_STAKED_XVS) {
            return true;
        }

        return false;
    }

    /**
     * @notice Accrue rewards for the user. Must be called before changing account's borrow or supply balance.
     * @param account account for which we need to accrue rewards
     * @param vToken the market for which we need to accrue rewards
     */
    function executeBoost(address account, address vToken) public onlyComptroller {
        if (markets[vToken].lastUpdated == 0) {
            return;
        }

        if (tokens[account].exists == false) {
            return;
        }

        accrueInterest(vToken);
        
        interests[vToken][account].accrued = _interestAccrued(vToken, account);
        interests[vToken][account].rewardIndex = markets[vToken].rewardIndex;
        interests[vToken][account].indexMultiplier = markets[vToken].indexMultiplier;
    }


    /**
     * @notice Update total QVL of user and market. Must be called after changing account's borrow or supply balance.
     * @param account account for which we need to update QVL
     * @param market the market for which we need to QVL
     */
    function updateScore(address account, address market) public onlyComptroller {
        if (markets[market].lastUpdated == 0) {
            return;
        }

        if (tokens[account].exists == false) {
            return;
        }

        IVToken vToken = IVToken(market);
        uint256 borrow = vToken.borrowBalanceCurrent(account);
        uint256 supply = vToken.balanceOfUnderlying(account);

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
        require(markets[vToken].lastUpdated != 0, "market is not supported");

        IVToken market = IVToken(vToken);

        uint256 pastBlocks = block.number - markets[vToken].lastUpdated;
        uint256 protocolIncomePerBlock = (((market.totalBorrowsCurrent() * market.borrowRatePerBlock()) / 1e18) *
            market.reserveFactorMantissa()) / 1e18;
        uint256 accumulatedIncome = protocolIncomePerBlock * pastBlocks;
        uint256 distributionIncome = (accumulatedIncome * INCOME_DISTRIBUTION_BPS) / MAXIMUM_BPS;

        uint256 delta;
        if (markets[vToken].score > 0) {
            delta = ((distributionIncome * 1e18) / markets[vToken].score);
        }
         
        markets[vToken].rewardIndex = markets[vToken].rewardIndex + delta;
        markets[vToken].indexMultiplier = markets[vToken].indexMultiplier + 1;
        markets[vToken].lastUpdated = block.number;
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
        uint256 indexMultiplier = markets[vToken].indexMultiplier - interests[vToken][account].indexMultiplier;
        uint256 score = interests[vToken][account].score;

        return (index * indexMultiplier * score) / 1e18;
    }

    /**
     * @notice For user to claim boosted yield
     * @param vToken the market for which claim the accrued interest
     */
    function claimInterest(address vToken) external {
        accrueInterest(vToken);

        uint256 amount = getInterestAccrued(vToken, msg.sender);
        interests[vToken][msg.sender].rewardIndex = markets[vToken].rewardIndex;
        interests[vToken][msg.sender].indexMultiplier = markets[vToken].indexMultiplier;
        interests[vToken][msg.sender].accrued = 0;

        IERC20Upgradeable asset = IERC20Upgradeable(IVToken(vToken).underlying());
        asset.safeTransfer(msg.sender, amount);
    }

    modifier onlyXVSVault() {
        require(msg.sender == xvsVault, "only XVS vault can call this function");
        _;
    }

    modifier onlyComptroller() {
        require(msg.sender == comptroller, "only comptroller can call this function");
        _;
    }
}
