pragma solidity ^0.5.16;

contract VAIControllerInterface {
    function mintVAI(address oracle, address vToken, address minter, uint actualMintAmount) external returns (uint);
}
