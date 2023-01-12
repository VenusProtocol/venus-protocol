pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "./PrimeStorage.sol";

interface IVToken {
    function borrowRatePerBlock() external view returns (uint);
    function supplyRatePerBlock() external view returns (uint);
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
     * @param stableCoinSupplyTVLCaps supply TVL cap for stablecoin markets
     * @param stableCoinBorrowTVLCaps borrow TVL cap for stablecoin markets
     * @param nonStableCoinSupplyTVLCaps supply TVL cap for non-stablecoin markets
     * @param nonStableCoinBorrowTVLCaps borrow TVL cap for non-stablecoin markets
     */
    function setCaps(
        address vToken,
        uint256[] memory stableCoinSupplyTVLCaps,
        uint256[] memory stableCoinBorrowTVLCaps,
        uint256[] memory nonStableCoinSupplyTVLCaps,
        uint256[] memory nonStableCoinBorrowTVLCaps        
    ) onlyOwner external {
        require(_markets[vToken].boostRateIndex != 0, "market doesn't exist");
        require(
            stableCoinSupplyTVLCaps.length == uint(MAX_TIER) &&
            stableCoinBorrowTVLCaps.length == uint(MAX_TIER) && 
            nonStableCoinSupplyTVLCaps.length == uint(MAX_TIER) &&
            nonStableCoinBorrowTVLCaps.length == uint(MAX_TIER), 
            "you need to set caps for all tiers"
        );

        uint256 stableCoinSupplyTVLCap;
        uint256 stableCoinBorrowTVLCap;
        uint256 nonStableCoinSupplyTVLCap;
        uint256 nonStableCoinBorrowTVLCap;

        for(uint i = 0; i < stableCoinSupplyTVLCaps.length; i++) {
            require(
                stableCoinSupplyTVLCaps[i] > stableCoinSupplyTVLCap &&
                stableCoinBorrowTVLCaps[i] > stableCoinBorrowTVLCap &&
                nonStableCoinSupplyTVLCaps[i] > nonStableCoinSupplyTVLCap &&
                nonStableCoinBorrowTVLCaps[i] > nonStableCoinBorrowTVLCap, 
                "higher tier should have higher cap"
            );

            stableCoinSupplyTVLCap = stableCoinSupplyTVLCaps[i];
            stableCoinBorrowTVLCap = stableCoinBorrowTVLCaps[i];
            nonStableCoinSupplyTVLCap = nonStableCoinSupplyTVLCaps[i];
            nonStableCoinBorrowTVLCap = nonStableCoinBorrowTVLCaps[i];

            _markets[vToken].caps[Tier(i+1)] = Cap(
                stableCoinSupplyTVLCaps[i],
                stableCoinBorrowTVLCaps[i],
                nonStableCoinSupplyTVLCaps[i],
                nonStableCoinBorrowTVLCaps[i]
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
            }   
        } else {
            for (uint i = 0; i < owners.length; i++) {
                _mint(false, tiers[i], owners[i]);
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
     * @notice Add or update market rate and configuration
     * @param vToken vToken address of the market
     * @param rate prime boost yield for the market. For example: 5.66% is set as (5.66 * 10**18)
     */
    function addMarket(
        address vToken,
        uint256 rate,
        bool isStableCoin
    ) onlyOwner external {
        _markets[vToken].rate = rate;
        _markets[vToken].isStableCoin = isStableCoin;

        if (_markets[vToken].boostRateIndex == 0) {
            _markets[vToken].boostRateIndex = INITIAL_INDEX;
            _markets[vToken].borrowRateIndex = INITIAL_INDEX;
            _markets[vToken].supplyRateIndex = INITIAL_INDEX;
            _markets[vToken].lastUpdated = block.number;
        }
    }

    function executeInterest(
        address vToken,
        uint256 borrowBalance,
        uint256 supplyBalance
    ) external onlyComptroller {
        accrueInterest(vToken);

    }

    function interestPerBlock() internal {
        //Supply * rate + supply QVL * boost - (Borrow * (Boost minus rate))
        //1,200,000 * 0.01 + 1,200,000 * 0.45 - (260,000 * (0.045 - 0.031)) = $69,640
    }

    function accrueInterest(
        address vToken
    ) public returns (uint) {
        uint256 pastBlocks = (block.number - _markets[vToken].lastUpdated);

        _markets[vToken].boostRateIndex = _markets[vToken].boostRateIndex + (pastBlocks * boostRatePerBlock(vToken));

        _markets[vToken].borrowRateIndex = _markets[vToken].borrowRateIndex + (IVToken(vToken).borrowRatePerBlock() * pastBlocks);
        _markets[vToken].supplyRateIndex =  _markets[vToken].supplyRateIndex + (IVToken(vToken).supplyRatePerBlock() * pastBlocks);

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