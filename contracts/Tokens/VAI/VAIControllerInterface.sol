pragma solidity 0.8.13;

import "../VTokens/VToken.sol";

interface VAIControllerInterface {
    function getVAIAddress() external view returns (address);

    function getMintableVAI(address minter) external view returns (uint, uint);

    function mintVAI(address minter, uint mintVAIAmount) external returns (uint);

    function repayVAI(address repayer, uint repayVAIAmount) external returns (uint);

    function liquidateVAI(
        address borrower,
        uint repayAmount,
        VTokenInterface vTokenCollateral
    ) external returns (uint, uint);

    function _initializeVenusVAIState(uint blockNumber) external returns (uint);

    function updateVenusVAIMintIndex() external returns (uint);

    function calcDistributeVAIMinterVenus(address vaiMinter) external returns (uint, uint, uint, uint);

    function getVAIRepayAmount(address account) external view returns (uint);
}
