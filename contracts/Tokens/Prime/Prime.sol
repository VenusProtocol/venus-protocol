pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "./PrimeStorage.sol";

contract Prime is Ownable2StepUpgradeable, PrimeStorageV1 {

    /// @notice address of XVS vault
    address immutable internal xvsVault;

    event Mint (
        address owner,
        Token metadata
    );

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

    function setLimit(
        uint256 irrevocableLimit,
        uint256 revocableLimit
    ) onlyOwner external {
        require(_totalRevocable >= _revocableLimit, "limit is lower than total minted tokens");
        require(_totalIrrevocable >= irrevocableLimit, "limit is lower than total minted tokens");

        _revocableLimit = revocableLimit;
        _irrevocableLimit = irrevocableLimit;
    }

    function setCaps(
        uint256[] memory thresholds,
        uint256[] memory supplyTVLCaps,
        uint256[] memory borrowTVLCaps        
    ) onlyOwner external {
        require(
            thresholds.length == uint(MAX_TIER) &&
            supplyTVLCaps.length == uint(MAX_TIER) &&
            borrowTVLCaps.length == uint(MAX_TIER), 
            "you need to set caps for all tiers"
        );

        uint256 threshold;
        uint256 borrowTVLCap;
        uint256 supplyTVLCap;

        for(uint i = 0; i < thresholds.length; i++) {
            require(
                thresholds[i] > threshold &&
                borrowTVLCaps[i] > borrowTVLCap &&
                supplyTVLCaps[i] > supplyTVLCap, 
                "higher tier should have higher cap"
            );

            threshold = thresholds[i];
            borrowTVLCap = borrowTVLCaps[i];
            supplyTVLCap = supplyTVLCaps[i];

            _tiers[Tier(i+1)] = Cap(
                thresholds[i],
                supplyTVLCaps[i],
                borrowTVLCaps[i]
            );
        }
    }

    function issue(
        address[] memory owners
    ) onlyOwner external {
        for (uint i = 0; i < owners.length; i++) {
            _mint(true, Tier.FIVE, owners[i]);
        }
    }

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

    function claim() external {
        require(_tokens[msg.sender].tier == Tier.ZERO, "you already own prime token");
        require(_stakes[msg.sender].tier > Tier.ZERO, "you are not eligible to claim prime token");
        require(block.timestamp - _stakes[msg.sender].stakedAt >= STAKING_PERIOD, "you need to wait more time for claiming prime token");

        _mint(false, _stakes[msg.sender].tier, msg.sender);
        delete _stakes[msg.sender];
    }

    function upgrade() external {
        require(_tokens[msg.sender].tier != Tier.ZERO, "you don't own prime token");
        require(_tokens[msg.sender].isIrrevocable == false, "you can only upgrade revocable token");
        require(_stakes[msg.sender].tier > _tokens[msg.sender].tier, "you token is already upgraded");
        require(block.timestamp - _stakes[msg.sender].stakedAt >= STAKING_PERIOD, "you need to wait more time for upgrading prime token");

        _tokens[msg.sender].tier = _stakes[msg.sender].tier;
        delete _stakes[msg.sender];
    }

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
    ) internal returns (Tier eligibleTier) {
        for(uint i = 0; i < uint(MAX_TIER); i++) {
            if(amount >= _tiers[Tier(i + 1)].threshold) {
                eligibleTier = Tier(i + 1);
            } else {
                break;
            }
        }

        return eligibleTier;
    }

    modifier onlyXVSVault() {
        require(msg.sender == xvsVault, "only XVS vault can call this function");
        _;
    }
}