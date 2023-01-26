pragma solidity ^0.5.16;

interface IPrime {
    function staked(
        address owner,
        uint256 totalStaked
    ) external;

    function unstaked(
        address owner,
        uint256 totalStaked
    ) external;

    function executeBoost(
        address account,
        address vToken
    ) external; 

    function accrueInterest(
        address vToken
    ) external;

    function updateQVL(
        address account, 
        address vToken
    ) external;
}
