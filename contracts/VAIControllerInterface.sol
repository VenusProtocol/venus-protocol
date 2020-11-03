pragma solidity ^0.5.16;

contract VAIControllerInterface {
    function mintVAI(address minter, uint mintVAIAmount) external returns (uint);
    function repayVAI(address repayer, uint repayVAIAmount) external returns (uint);
}
