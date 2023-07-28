pragma solidity ^0.5.16;

interface IPrime {
    function xvsUpdated(address user) external;

    function executeBoost(address user, address vToken) external;

    function accrueInterest(address vToken) external;

    function updateScore(address user, address vToken) external;
}
