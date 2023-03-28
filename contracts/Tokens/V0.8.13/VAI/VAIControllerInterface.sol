pragma solidity 0.8.13;

import "../VTokens/VToken.sol";

abstract contract VAIControllerInterface {
    function getVAIAddress() public view virtual returns (address);

    function getMintableVAI(address minter) public view virtual returns (uint, uint);

    function mintVAI(address minter, uint mintVAIAmount) external virtual returns (uint);

    function repayVAI(address repayer, uint repayVAIAmount) external virtual returns (uint);

    function liquidateVAI(
        address borrower,
        uint repayAmount,
        VTokenInterface vTokenCollateral
    ) external virtual returns (uint, uint);

    function _initializeVenusVAIState(uint blockNumber) external virtual returns (uint);

    function updateVenusVAIMintIndex() external virtual returns (uint);

    function calcDistributeVAIMinterVenus(address vaiMinter) external virtual returns (uint, uint, uint, uint);

    function getVAIRepayAmount(address account) public view virtual returns (uint);
}
