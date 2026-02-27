// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { VTokenInterface } from "../VTokens/VTokenInterfaces.sol";
import { ComptrollerLensInterface } from "../../Comptroller/ComptrollerLensInterface.sol";

interface VAIControllerInterface {
    function mintVAI(uint256 mintVAIAmount) external returns (uint256);

    function repayVAI(uint256 amount) external returns (uint256, uint256);

    function repayVAIBehalf(address borrower, uint256 amount) external returns (uint256, uint256);

    function liquidateVAI(
        address borrower,
        uint256 repayAmount,
        VTokenInterface vTokenCollateral,
        ComptrollerLensInterface.AccountSnapshot memory snapshot
    ) external returns (uint256, uint256);

    function getMintableVAI(address minter) external view returns (uint256, uint256);

    function getVAIAddress() external view returns (address);

    function getVAIRepayAmount(address account) external view returns (uint256);
}
