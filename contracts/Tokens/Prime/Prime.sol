pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "./PrimeStorage.sol";

contract Prime is Ownable2StepUpgradeable, PrimeStorageV1 {

    constructor() {} 

    function initialize() external virtual initializer {
        __Ownable2Step_init();
    }

    function _safeMint(
        bool isIrrevocable,
        Tier tier,
        address owner
    ) private {

    }
}