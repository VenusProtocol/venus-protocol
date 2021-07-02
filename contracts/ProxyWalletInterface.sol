pragma solidity ^0.5.16;

// Part of OppenZeppelin IOwnable interface
// https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol
interface IOwnable {
    function owner() external view returns (address);
}

interface IProxyWallet {
    function controller() external returns (IOwnable);
}
