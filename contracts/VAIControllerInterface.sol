pragma solidity 0.5.17;

contract VAIControllerInterface {
    function getMintableVAI(address minter) public view returns (uint, uint);
    function mintVAI(address minter, uint mintVAIAmount) external returns (uint);
    function repayVAI(address repayer, uint repayVAIAmount) external returns (uint);
}
