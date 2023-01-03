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