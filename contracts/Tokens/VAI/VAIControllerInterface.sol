pragma solidity ^0.5.16;

import { VTokenInterface } from "../VTokens/VTokenInterfaces.sol";

contract VAIControllerInterface {
    function mintVAI(uint256 mintVAIAmount) external returns (uint256);

    function repayVAI(uint256 amount) external returns (uint256, uint256);

    function repayVAIBehalf(address borrower, uint256 amount) external returns (uint256, uint256);

    function liquidateVAI(
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral
    ) external returns (uint256, uint256);

    function getMintableVAI(address minter) external view returns (uint256, uint256);

    function getVAIAddress() external view returns (address);

    function getVAIRepayAmount(address account) external view returns (uint256);
}
