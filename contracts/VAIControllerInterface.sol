pragma solidity ^0.5.16;

import "./VToken.sol";

contract VAIControllerInterface {
    function getVAIAddress() public view returns (address);
    function getMintableVAI(address minter) public view returns (uint, uint);
    function mintVAI(address minter, uint mintVAIAmount) external returns (uint);
    function repayVAI(address repayer, uint repayVAIAmount) external returns (uint);
    function liquidateVAI(address borrower, uint repayAmount, VTokenInterface vTokenCollateral) external returns (uint, uint);

    function _initializeVenusVAIState(uint blockNumber) external returns (uint);
    function updateVenusVAIMintIndex() external returns (uint);
    function calcDistributeVAIMinterVenus(address vaiMinter) external returns(uint, uint, uint, uint);
}
