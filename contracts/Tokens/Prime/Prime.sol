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

contract Prime is Ownable2StepUpgradeable, PrimeStorageV1 {
    /// @notice address of XVS vault
    address internal immutable xvsVault;

    /// @notice Emitted when prime token is minted
    event Mint(address owner, bool isIrrevocable);

    /// @notice Emitted when prime token is burned
    event Burn(address owner);

    using SafeERC20Upgradeable for IERC20Upgradeable;

    constructor(address _xvsVault) {
        xvsVault = _xvsVault;
    }

    function initialize(
        uint128 _alphaNumerator,
        uint128 _alphaDemominator
    ) external virtual initializer {
        alphaNumerator = _alphaNumerator;
        alphaDenominator = _alphaDemominator;

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
        uint256 supplyMultiplier,
        uint256 borrowMultiplier
    ) external onlyOwner {
        require(markets[vToken].lastUpdated == 0, "market is already added");

        markets[vToken].rewardIndex = INITIAL_INDEX;
        markets[vToken].lastUpdated = block.number;
        markets[vToken].supplyMultiplier = supplyMultiplier;
        markets[vToken].borrowMultiplier = borrowMultiplier;
        markets[vToken].totalScore = 0;
        markets[vToken].timesScoreUpdated = 0;

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

    /**
     * @notice Called by XVS vault when someone deposits XVS. Used to start staking period if eligible
     * @param owner the address of the user who staked XVS
     * @param totalStaked the total staked XVS balance of user
     */
    function staked(address owner, uint256 totalStaked) external onlyXVSVault {
        if (tokens[owner].exists == true) {
            return;
        }

        bool isAccountEligible = isEligible(totalStaked);
        if(stakedAt[owner] == 0 && isAccountEligible == true) {
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
        // for (uint i = 0; i < allMarkets.length; i++) {
        //     address market = allMarkets[i];
        //     IVToken vToken = IVToken(allMarkets[i]);
        //     uint256 borrowBalance = vToken.borrowBalanceCurrent(account);
        //     uint256 supplyBalance = vToken.balanceOfUnderlying(account);

        //     accrueInterest(market);

        //     _interests[market][account].index = _markets[market].index;

        //     uint accountTotalQVL = getQVL(account, market, borrowBalance, supplyBalance);
        //     _markets[market].totalQVL = _markets[market].totalQVL + accountTotalQVL;
        //     _interests[market][account].totalQVL = accountTotalQVL;
        // }
    }

    function calculateScore(
        uint256 xvs,
        uint256 capital
    ) public view returns (uint256) {
        return Scores.calculateScore(xvs, capital, alphaNumerator, alphaDenominator);
    }

    /**
     * @notice Called by XVS vault when someone withdraws XVS. Used to downgrade user tier or burn the prime token
     * @param owner the address of the user who withdrew XVS
     * @param totalStaked the total staked XVS balance of user
     */
    function unstaked(address owner, uint256 totalStaked) external onlyXVSVault {
        bool isAccountEligible = isEligible(totalStaked);

        if (isAccountEligible == false && tokens[owner].exists == true) {
            _burn(owner);
        }

        if (isAccountEligible == false && tokens[owner].exists == false && stakedAt[owner] > 0) {
            stakedAt[owner] = 0;
        }
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
    function executeBoost(address account, address vToken) public {
        // if (_markets[vToken].lastUpdated == 0) {
        //     return;
        // }

        // if (_tokens[account].tier == Tier.ZERO) {
        //     return;
        // }

        // accrueInterest(vToken);
        // _executeBoost(account, vToken);
    }

    function _executeBoost(address account, address vToken) internal {
        // if (_interests[vToken][account].index == _markets[vToken].index) {
        //     return;
        // }

        // _interests[vToken][account].accrued = _interestAccrued(vToken, account);
        // _interests[vToken][account].index = _markets[vToken].index;
    }

    /**
     * @notice Update total QVL of user and market. Must be called after changing account's borrow or supply balance.
     * @param account account for which we need to update QVL
     * @param vToken the market for which we need to QVL
     */
    function updateQVL(address account, address vToken) public {
        // if (_markets[vToken].lastUpdated == 0) {
        //     return;
        // }

        // if (_tokens[account].tier == Tier.ZERO) {
        //     return;
        // }

        // IVToken market = IVToken(vToken);
        // uint256 borrowBalance = market.borrowBalanceCurrent(account);
        // uint256 supplyBalance = market.balanceOfUnderlying(account);

        // uint accountTotalQVL = getQVL(account, vToken, borrowBalance, supplyBalance);

        // _markets[vToken].totalQVL = _markets[vToken].totalQVL - _interests[vToken][account].totalQVL;
        // _markets[vToken].totalQVL = _markets[vToken].totalQVL + accountTotalQVL;
        // _interests[vToken][account].totalQVL = accountTotalQVL;

        // // when existing market is added to prime program we need to initiaze the market for the user
        // if (_interests[vToken][account].index == 0) {
        //     _interests[vToken][account].index = _markets[vToken].index;
        // }
    }

    /**
     * @notice Update total QVL of user and market. Must be called after changing account's borrow or supply balance.
     * @param account account for which we need to update QVL
     * @param vToken the market for which we need to QVL
     */
    function getQVL(
        address account,
        address vToken,
        uint256 borrowBalance,
        uint256 supplyBalance
    ) internal returns (uint) {
        // uint borrowQVL;
        // uint supplyQVL;
        // uint tier = uint(_tokens[account].tier);

        // for (uint i = 0; i <= tier; i++) {
        //     borrowQVL = borrowQVL + _markets[vToken].caps[Tier(i)].borrowTVLCap;
        //     supplyQVL = supplyQVL + _markets[vToken].caps[Tier(i)].supplyTVLCap;
        // }

        // if (borrowBalance < borrowQVL) {
        //     borrowQVL = borrowBalance;
        // }

        // if (supplyBalance < supplyQVL) {
        //     supplyQVL = supplyBalance;
        // }

        // return (borrowQVL + supplyQVL);
    }

    /**
     * @notice Distributes income from market since last distribution
     * @param vToken the market for which to distribute the income
     */
    function accrueInterest(address vToken) public {
        // require(_markets[vToken].lastUpdated != 0, "market is not supported");

        // IVToken market = IVToken(vToken);

        // uint256 pastBlocks = block.number - _markets[vToken].lastUpdated;
        // uint256 protocolIncomePerBlock = (((market.totalBorrowsCurrent() * market.borrowRatePerBlock()) / 1e18) *
        //     market.reserveFactorMantissa()) / 1e18;
        // uint256 accumulatedIncome = protocolIncomePerBlock * pastBlocks;
        // uint256 distributionIncome = (accumulatedIncome * INCOME_DISTRIBUTION_BPS) / MAXIMUM_BPS;
        // uint256 distributionPerQVL = 0;

        // if (_markets[vToken].totalQVL > 0) {
        //     distributionPerQVL = ((distributionIncome * getMarketDecimals(vToken)) / _markets[vToken].totalQVL);
        // }

        // _markets[vToken].index = _markets[vToken].index + distributionPerQVL;
        // _markets[vToken].lastUpdated = block.number;
    }

    function getMarketDecimals(address vToken) internal returns (uint256) {
        // IVToken market = IVToken(vToken);
        // address underlying;

        // try market.underlying() returns (address _underlying) {
        //     underlying = _underlying;
        // } catch (bytes memory) {
        //     return 10 ** 18; // vBNB
        // }

        // return (10 ** ERC20Interface(underlying).decimals());
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
        // uint delta = _markets[vToken].index - _interests[vToken][account].index;
        // return
        //     _interests[vToken][account].accrued +
        //     ((_interests[vToken][account].totalQVL * delta) / getMarketDecimals(vToken));
    }

    /**
     * @notice For user to claim boosted yield
     * @param vToken the market for which claim the accrued interest
     */
    function claimInterest(address vToken) external {
        // accrueInterest(vToken);

        // uint256 amount = getInterestAccrued(vToken, msg.sender);
        // _interests[vToken][msg.sender].index = _markets[vToken].index;
        // _interests[vToken][msg.sender].accrued = 0;

        // IERC20Upgradeable asset = IERC20Upgradeable(IVToken(vToken).underlying());
        // asset.safeTransfer(msg.sender, amount);
    }

    modifier onlyXVSVault() {
        require(msg.sender == xvsVault, "only XVS vault can call this function");
        _;
    }
}
