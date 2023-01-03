pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "./PrimeStorage.sol";

contract Prime is Ownable2StepUpgradeable, PrimeStorageV1 {

    event Mint (
        address owner,
        Token metadata
    );

    event Burn (
        address owner
    );

    constructor() {} 

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
            thresholds.length == 5 &&
            supplyTVLCaps.length == 5 &&
            borrowTVLCaps.length == 5, 
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
}