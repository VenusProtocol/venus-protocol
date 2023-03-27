pragma solidity ^0.5.16;

interface IPrime {
    function xvsUpdated(address owner) external;

    function executeBoost(address account, address vToken) external;

    function accrueInterest(address vToken) external;

    function updateScore(address account, address vToken) external;
}
