pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "./PrimeStorage.sol";

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

interface EIP20Interface {
    function decimals() external view returns (uint8);
}

contract Prime is Ownable2StepUpgradeable, PrimeStorageV1 {

    /// @notice address of XVS vault
    address immutable internal xvsVault;

    /// @notice Emitted when prime token is minted
    event Mint (
        address owner,
        Token metadata
    );

    /// @notice Emitted when prime token is burned
    event Burn (
        address owner
    );

    constructor(
        address _xvsVault
    ) {
        xvsVault = _xvsVault;
    } 

    function initialize() external virtual initializer {
        __Ownable2Step_init();
    }

    /**
     * @notice Set limits for total tokens that can be mined
     * @param irrevocableLimit total number of irrevocable tokens that can be minted
     * @param revocableLimit total number of revocable tokens that can be minted
     */
    function setLimit(
        uint256 irrevocableLimit,
        uint256 revocableLimit
    ) onlyOwner external {
        require(_totalRevocable <= revocableLimit, "limit is lower than total minted tokens");
        require(_totalIrrevocable <= irrevocableLimit, "limit is lower than total minted tokens");

        _revocableLimit = revocableLimit;
        _irrevocableLimit = irrevocableLimit;
    }

    /**
     * @notice Sets threshold for all the tiers
     * @param thresholds XVS thresholds for each tier
     */
    function setThresholds(
        uint256[] memory thresholds
    ) onlyOwner external {
        require(
            thresholds.length == uint(MAX_TIER),
            "you need to set thresholds for all tiers"
        );

        uint256 threshold;

        for(uint i = 0; i < thresholds.length; i++) {
            require(
                thresholds[i] > threshold,
                "higher tier should have higher threshold"
            );

            threshold = thresholds[i];

            _thresholds[Tier(i+1)] = thresholds[i];
        }
    }

    /**
     * @notice Add boosted market
     * @param vToken vToken address of the market
     * @param totalQVL aggregated QVL of all prime token holders for this market. 
                       This is needed to be set when we are adding a market with some borrow/supply after prime token distribution.
     */
    function addMarket(
        address vToken,
        uint256 totalQVL
    ) onlyOwner external {
        require(_markets[vToken].lastUpdated == 0, "market is already added");

        _markets[vToken].index = INITIAL_INDEX;
        _markets[vToken].lastUpdated = block.number;
        _markets[vToken].totalQVL = totalQVL;

        allMarkets.push(vToken);
    }

    /**
     * @notice Update QVL for all the tiers. 
     * @param supplyTVLCaps supply TVL cap 
     * @param borrowTVLCaps borrow TVL cap 
     */
    function updateCaps(
        address vToken,
        uint256[] memory supplyTVLCaps,
        uint256[] memory borrowTVLCaps
    ) onlyOwner external {
        require(_markets[vToken].lastUpdated != 0, "market doesn't exist");
        require(
            supplyTVLCaps.length == uint(MAX_TIER) &&
            borrowTVLCaps.length == uint(MAX_TIER), 
            "you need to set caps for all tiers"
        );

        uint256 supplyTVLCap;
        uint256 borrowTVLCap;

        for(uint i = 0; i < supplyTVLCaps.length; i++) {
            require(
                supplyTVLCaps[i] > supplyTVLCap &&
                borrowTVLCaps[i] > borrowTVLCap,
                "higher tier should have higher cap"
            );

            supplyTVLCap = supplyTVLCaps[i];
            borrowTVLCap = borrowTVLCaps[i];

            _markets[vToken].caps[Tier(i+1)] = Cap(
                supplyTVLCaps[i],
                borrowTVLCaps[i]
            );
        }
    }

    /**
     * @notice Directly issue prime tokens to users
     * @param isIrrevocable is the tokens being issued is irrevocable
     * @param owners list of address to issue tokens to 
     * @param tiers tier for each of the issued tokens
     */
    function issue(
        bool isIrrevocable,
        address[] memory owners,
        Tier[] memory tiers
    ) onlyOwner external {
        if (isIrrevocable == true) {
            for (uint i = 0; i < owners.length; i++) {
                _mint(true, Tier.FIVE, owners[i]);
                _initializeMarkets(owners[i]);
            }   
        } else {
            for (uint i = 0; i < owners.length; i++) {
                _mint(false, tiers[i], owners[i]);
                _initializeMarkets(owners[i]);
                delete _stakes[owners[i]];
            } 
        }
    }

    /**
     * @notice Called by XVS vault when someone deposits XVS. Used to start staking period if eligible
     * @param owner the address of the user who staked XVS
     * @param totalStaked the total staked XVS balance of user
     */
    function staked(
        address owner,
        uint256 totalStaked
    ) external onlyXVSVault {
        Tier eligibleTier = getEligibleTier(totalStaked);

        if (
            _tokens[owner].isIrrevocable == false &&
            eligibleTier > _tokens[owner].tier &&
            _stakes[owner].tier != eligibleTier
        ) {
            _stakes[owner] = Stake(eligibleTier, block.timestamp);
        }
    }

    /**
     * @notice For claiming prime token when staking period is completed
     */
    function claim() external {
        require(_tokens[msg.sender].tier == Tier.ZERO, "you already own prime token");
        require(_stakes[msg.sender].tier > Tier.ZERO, "you are not eligible to claim prime token");
        require(block.timestamp - _stakes[msg.sender].stakedAt >= STAKING_PERIOD, "you need to wait more time for claiming prime token");

        _mint(false, _stakes[msg.sender].tier, msg.sender);
        _initializeMarkets(msg.sender);
        delete _stakes[msg.sender];
    }

    function _initializeMarkets(address account) internal {
        for (uint i = 0; i < allMarkets.length; i++) {
            address market = allMarkets[i];
            IVToken vToken = IVToken(allMarkets[i]);
            uint256 borrowBalance = vToken.borrowBalanceCurrent(account);
            uint256 supplyBalance = vToken.balanceOfUnderlying(account);

            accrueInterest(market);

            _interests[market][account].index = _markets[market].index;

            uint accountTotalQVL = getQVL(account, market, borrowBalance, supplyBalance);
            _markets[market].totalQVL = _markets[market].totalQVL + accountTotalQVL;
            _interests[market][account].totalQVL = accountTotalQVL;
        }
    }

    /**
     * @notice For upgrading tier for a claimed prime token
     */
    function upgrade() external {
        require(_tokens[msg.sender].tier != Tier.ZERO, "you don't own prime token");
        require(_tokens[msg.sender].isIrrevocable == false, "you can only upgrade revocable token");
        require(_stakes[msg.sender].tier > _tokens[msg.sender].tier, "you token is already upgraded");
        require(block.timestamp - _stakes[msg.sender].stakedAt >= STAKING_PERIOD, "you need to wait more time for upgrading prime token");

        for (uint i = 0; i < allMarkets.length; i++) {
            executeBoost(msg.sender, allMarkets[i]);
        }

        _tokens[msg.sender].tier = _stakes[msg.sender].tier;

        for (uint i = 0; i < allMarkets.length; i++) {
            updateQVL(msg.sender, allMarkets[i]);
        }

        delete _stakes[msg.sender];
    }

    /**
     * @notice Called by XVS vault when someone withdraws XVS. Used to downgrade user tier or burn the prime token
     * @param owner the address of the user who withdrew XVS
     * @param totalStaked the total staked XVS balance of user
     */
    function unstaked(
        address owner,
        uint256 totalStaked
    ) external onlyXVSVault {
        Tier eligibleTier = getEligibleTier(totalStaked);

        if (
            _tokens[owner].tier > Tier.ZERO &&
            eligibleTier < _tokens[owner].tier &&
            _tokens[owner].isIrrevocable == false
        ) {
            for (uint i = 0; i < allMarkets.length; i++) {
                executeBoost(msg.sender, allMarkets[i]);
            }
            
            if (eligibleTier == Tier.ZERO) {
                _burn(owner);
            } else {
                _tokens[owner].tier = eligibleTier;
            }

            for (uint i = 0; i < allMarkets.length; i++) {
                updateQVL(msg.sender, allMarkets[i]);
            }
        }

        if (_stakes[owner].tier != Tier.ZERO && _stakes[owner].tier != eligibleTier) {
            delete _stakes[owner];
        }
    }

    /**
     * @notice Used to mint a new prime token
     * @param isIrrevocable is the tokens being issued is irrevocable
     * @param tier tier of the minted token
     * @param owner token owner
     */
    function _mint(
        bool isIrrevocable,
        Tier tier,
        address owner
    ) internal {
        require(_tokens[owner].tier == Tier.ZERO, "user already owns a prime token");

        Token memory token = Token(isIrrevocable, tier);
        _tokens[owner] = token;

        if (isIrrevocable == true) {
            _totalIrrevocable++;
        } else {
            _totalRevocable++;
        }

        require(
            _totalIrrevocable <= _irrevocableLimit &&
            _totalRevocable <= _revocableLimit,
            "exceeds token mint limit"
        );

        emit Mint(owner, token);
    }

    /**
     * @notice Used to burn a new prime token
     * @param owner owner whose prime token to burn
     */
    function _burn(
        address owner
    ) internal {
        require(uint(_tokens[owner].tier) != uint(Tier.ZERO), "user doesn't own an prime token");

        if (_tokens[owner].isIrrevocable == true) {
            _totalIrrevocable--;
        } else {
            _totalRevocable--;
        }

        _tokens[owner].tier = Tier.ZERO;

        emit Burn(owner);
    }

    /**
     * @notice Used to get the eligible tier associated with XVS amount
     * @param amount amount of XVS
     */
    function getEligibleTier(
        uint256 amount
    ) view internal returns (Tier eligibleTier) {
        for(uint i = 0; i < uint(MAX_TIER); i++) {
            if(amount >= _thresholds[Tier(i + 1)]) {
                eligibleTier = Tier(i + 1);
            } else {
                break;
            }
        }

        return eligibleTier;
    }

    /**
     * @notice Accrue rewards for the user. Must be called before changing account's borrow or supply balance.
     * @param account account for which we need to accrue rewards
     * @param vToken the market for which we need to accrue rewards
     */
    function executeBoost(
        address account,
        address vToken
    ) public {
        if (_markets[vToken].lastUpdated == 0) {
            return;
        }

        if (_tokens[account].tier == Tier.ZERO) {
            return;
        }

        accrueInterest(vToken);

        IVToken market = IVToken(vToken);
        uint256 borrowBalance = market.borrowBalanceCurrent(account);
        uint256 supplyBalance = market.balanceOfUnderlying(account);

        // console.log(_interests[vToken][account].index, _markets[vToken].index);

        if (_interests[vToken][account].index == _markets[vToken].index) {
            return;
        }

        uint accountTotalQVL = getQVL(account, vToken, borrowBalance, supplyBalance);
       
        uint delta = _markets[vToken].index  - _interests[vToken][account].index;
        _interests[vToken][account].accrued = _interests[vToken][account].accrued + ((accountTotalQVL * delta) / getMarketDecimals(vToken));
        _interests[vToken][account].index = _markets[vToken].index;
    }

    /**
     * @notice Update total QVL of user and market. Must be called after changing account's borrow or supply balance.
     * @param account account for which we need to update QVL
     * @param vToken the market for which we need to QVL
     */
    function updateQVL(
        address account, 
        address vToken
    ) public {
        if (_markets[vToken].lastUpdated == 0) {
            return;
        }

        if (_tokens[account].tier == Tier.ZERO) {
            return;
        }
        
        accrueInterest(vToken);
        
        IVToken market = IVToken(vToken);
        uint256 borrowBalance = market.borrowBalanceCurrent(account);
        uint256 supplyBalance = market.balanceOfUnderlying(account);

        uint accountTotalQVL = getQVL(account, vToken, borrowBalance, supplyBalance);

        _markets[vToken].totalQVL =  _markets[vToken].totalQVL - _interests[vToken][account].totalQVL;
        _markets[vToken].totalQVL = _markets[vToken].totalQVL + accountTotalQVL;
        _interests[vToken][account].totalQVL = accountTotalQVL;
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
        uint borrowQVL;
        uint supplyQVL;
        uint tier = uint(_tokens[account].tier);

        for (uint i = 0; i <= tier; i++) {
            borrowQVL = borrowQVL +  _markets[vToken].caps[Tier(i)].borrowTVLCap;
            supplyQVL = supplyQVL +  _markets[vToken].caps[Tier(i)].supplyTVLCap;
        }

        if (borrowBalance < borrowQVL) {
            borrowQVL = borrowBalance;
        }

        if (supplyBalance < supplyQVL) {
            supplyQVL = supplyBalance;
        }

        return (borrowQVL + supplyQVL);
    }

    /**
     * @notice Distributes income from market since last distribution 
     * @param vToken the market for which to distribute the income
     */
    function accrueInterest(
        address vToken
    ) public {
        require(_markets[vToken].lastUpdated != 0, "market is supported");
    
        IVToken market = IVToken(vToken);

        uint256 pastBlocks = block.number - _markets[vToken].lastUpdated;
        uint256 protocolIncomePerBlock = (((market.totalBorrowsCurrent() * market.borrowRatePerBlock()) / 1e18) * market.reserveFactorMantissa()) / 1e18;
        uint256 accumulatedIncome = protocolIncomePerBlock * pastBlocks;
        uint256 distributionIncome = (accumulatedIncome * INCOME_DISTRIBUTION_BPS) / MAXIMUM_BPS;
        uint256 distributionPerQVL = 0;

        if (_markets[vToken].totalQVL > 0) {
            distributionPerQVL = ((distributionIncome * getMarketDecimals(vToken)) / _markets[vToken].totalQVL);
        }

        _markets[vToken].index = _markets[vToken].index + distributionPerQVL;
        _markets[vToken].lastUpdated = block.number;
    } 

    function getMarketDecimals(address vToken) internal returns (uint256) {
        IVToken market = IVToken(vToken);
        address underlying;

        try market.underlying() returns (address _underlying) {
            underlying = _underlying;
        } catch (bytes memory) {
            return 10**18; // vBNB
        }

        return (10 ** EIP20Interface(underlying).decimals());
    }

    modifier onlyXVSVault() {
        require(msg.sender == xvsVault, "only XVS vault can call this function");
        _;
    }

}