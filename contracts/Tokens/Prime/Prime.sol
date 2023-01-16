pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "./PrimeStorage.sol";

interface IVToken {
    function borrowRatePerBlock() external view returns (uint);
    function supplyRatePerBlock() external view returns (uint);
    function accrueInterest() external returns (uint);
    function borrowBalanceCurrent(address account) external returns (uint);
    function balanceOfUnderlying(address account) external returns (uint);
}

contract Prime is Ownable2StepUpgradeable, PrimeStorageV1 {

    /// @notice address of XVS vault
    address immutable internal xvsVault;

    /// @notice address of comptroller vault
    address immutable internal comptroller;

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
        address _xvsVault,
        address _comptroller
    ) {
        xvsVault = _xvsVault;
        comptroller = _comptroller;
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
        require(_totalRevocable >= _revocableLimit, "limit is lower than total minted tokens");
        require(_totalIrrevocable >= irrevocableLimit, "limit is lower than total minted tokens");

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
     * @notice Sets QVL for all the tiers
     * @param supplyTVLCaps supply TVL cap for stablecoin markets
     * @param borrowTVLCaps borrow TVL cap for stablecoin markets
     */
    function setCaps(
        address vToken,
        uint256[] memory supplyTVLCaps,
        uint256[] memory borrowTVLCaps
    ) onlyOwner external {
        require(_markets[vToken].boostRateIndex != 0, "market doesn't exist");
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
            _tokens[owner].tier = eligibleTier;

            if (eligibleTier == Tier.ZERO) {
                _burn(msg.sender);
            }
        }

        if (_stakes[msg.sender].tier != Tier.ZERO && _stakes[msg.sender].tier != eligibleTier) {
            delete _stakes[msg.sender];
        }
    }

    function _initializeMarkets(address account) internal {
        for (uint i = 0; i < allMarkets.length; i++) {
            address market = allMarkets[i];
            IVToken vToken = IVToken(allMarkets[i]);

            accrueInterest(market);

            _interests[market][account].supplyRateIndex = _markets[market].supplyRateIndex;
            _interests[market][account].borrowRateIndex = _markets[market].borrowRateIndex;
            _interests[market][account].boostRateIndex = _markets[market].boostRateIndex;
        }
    }

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

    function _burn(
        address owner
    ) internal {
        require(_tokens[owner].tier != Tier.ZERO, "user doesn't own an prime token");

        if (_tokens[owner].isIrrevocable == true) {
            _totalIrrevocable--;
        } else {
            _totalRevocable--;
        }

        _tokens[owner].tier = Tier.ZERO;

        emit Burn(owner);
    }

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
     * @notice Add boosted market
     * @param vToken vToken address of the market
     * @param rate prime boost yield for the market. For example: 5.66% is set as (5.66 * 10**18)
     */
    function addMarket(
        address vToken,
        uint256 rate
    ) onlyOwner external {
        require(_markets[vToken].lastUpdated == 0, "market is already added");

        _markets[vToken].rate = rate;
        _markets[vToken].boostRateIndex = INITIAL_INDEX;
        _markets[vToken].supplyRateIndex = INITIAL_INDEX;
        _markets[vToken].borrowRateIndex = INITIAL_INDEX;
        _markets[vToken].lastUpdated = block.number;

        allMarkets.push(vToken);
    }

    function updateRate(
        address vToken,
        uint256 rate
    ) onlyOwner external {
        require(_markets[vToken].lastUpdated != 0, "market is not added");

        accrueInterest(vToken);
        _markets[vToken].rate = rate;
    }

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

        if (_interests[vToken][account].boostRateIndex == _markets[vToken].boostRateIndex) {
            return;
        }

        uint boostRate =  _markets[vToken].boostRateIndex - _interests[vToken][account].boostRateIndex;
        uint supplyRate =  _markets[vToken].supplyRateIndex - _interests[vToken][account].supplyRateIndex;
        uint borrowRate =  _markets[vToken].borrowRateIndex - _interests[vToken][account].borrowRateIndex;

        // Calculate total interest accrued by the user:
        // (Supply * supplyRate - Borrow * borrowRate) + ((supplyQVL  + borrowQVL) * boost)
        (uint borrowQVL, uint supplyQVL) = getQVL(account, vToken, borrowBalance, supplyBalance);
        uint delta = (((supplyBalance * supplyRate) / 1e18) - ((borrowBalance * borrowRate) / 1e18)) + (((borrowQVL + supplyQVL) * boostRate) / 1e18);
        _interests[vToken][account].accrued = _interests[vToken][account].accrued + delta;
        _interests[vToken][account].boostRateIndex = _markets[vToken].boostRateIndex;
    }

    function getQVL(
        address account,
        address vToken,
        uint256 borrowBalance,
        uint256 supplyBalance
    ) internal returns (uint, uint) {
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

        return (borrowQVL, supplyQVL);
    }
    
    function accrueInterest(
        address vToken
    ) public {
        require(_markets[vToken].lastUpdated != 0, "market is supported");
        IVToken market = IVToken(vToken);
        uint256 pastBlocks = (block.number - _markets[vToken].lastUpdated);

        _markets[vToken].boostRateIndex = _markets[vToken].boostRateIndex + (pastBlocks * boostRatePerBlock(vToken));
        _markets[vToken].borrowRateIndex = _markets[vToken].borrowRateIndex + (pastBlocks * market.borrowRatePerBlock());
        _markets[vToken].supplyRateIndex = _markets[vToken].supplyRateIndex + (pastBlocks * market.supplyRatePerBlock());
        _markets[vToken].lastUpdated = block.number;
    } 

    function boostRatePerBlock(
        address vToken
    ) internal view returns (uint) {
        return _markets[vToken].rate / getBlocksPerYear();
    }

    function getBlocksPerYear() public view returns (uint) {
        return 10512000; //(24 * 60 * 60 * 365) / 3;
    }

    modifier onlyXVSVault() {
        require(msg.sender == xvsVault, "only XVS vault can call this function");
        _;
    }

    modifier onlyComptroller() {
        require(address(comptroller) == msg.sender, "only comptroller can call this function");
        _;
    }
}