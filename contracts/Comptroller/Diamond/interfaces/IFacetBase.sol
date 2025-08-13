// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";

import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { ComptrollerErrorReporter } from "../../../Utils/ErrorReporter.sol";
import { ExponentialNoError } from "../../../Utils/ExponentialNoError.sol";
import { IVAIVault, Action } from "../../../Comptroller/ComptrollerInterface.sol";
import { ComptrollerV16Storage } from "../../../Comptroller/ComptrollerStorage.sol";

interface IFacetBase {
    /**
     * @notice The initial XVS rewards index for a market
     */
    function venusInitialIndex() external pure returns (uint224);

    /**
     * @notice Checks if a certain action is paused on a market
     * @param action Action id
     * @param market vToken address
     */
    function actionPaused(address market, Action action) external view returns (bool);

    /**
     * @notice Returns the XVS address
     * @return The address of XVS token
     */
    function getXVSAddress() external view returns (address);

    function getPoolMarketIndex(uint96 poolId, address vToken) external pure returns (bytes32);

    function getCollateralFactor(address vToken) external view returns (uint256);

    function getLiquidationThreshold(address vToken) external view returns (uint256);

    function getEffectiveCollateralFactor(address account, address vToken) external view returns (uint256);

    function getEffectiveLiquidationThreshold(address account, address vToken) external view returns (uint256);

    function getEffectiveLiquidationIncentive(address account, address vToken) external view returns (uint256);

    function getPoolVTokens(uint96 poolId) external view returns (address[] memory);
}
