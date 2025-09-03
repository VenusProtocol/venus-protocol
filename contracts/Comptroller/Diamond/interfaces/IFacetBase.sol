// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { Action } from "../../../Comptroller/ComptrollerInterface.sol";
import { PoolMarketId } from "../../../Comptroller/Types/PoolMarketId.sol";

import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { ComptrollerErrorReporter } from "../../../Utils/ErrorReporter.sol";
import { ExponentialNoError } from "../../../Utils/ExponentialNoError.sol";
import { IVAIVault, Action } from "../../../Comptroller/ComptrollerInterface.sol";
import { ComptrollerLensInterface } from "../../../Comptroller/ComptrollerLensInterface.sol";
enum WeightFunction {
    /// @notice Use the collateral factor of the asset for weighting
    USE_COLLATERAL_FACTOR,
    /// @notice Use the liquidation threshold of the asset for weighting
    USE_LIQUIDATION_THRESHOLD
}

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

    function getDynamicLiquidationIncentive(address borrower, address vToken) external view returns (uint256);

    function getDynamicLiquidationIncentive(
        address vToken,
        uint256 liquidationThresholdAvg,
        uint256 healthFactor
    ) external view returns (uint256);

    function getCollateralFactor(address vToken) external view returns (uint256);

    function getLiquidationThreshold(address vToken) external view returns (uint256);

    function getHypotheticalHealthSnapshot(
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount
    ) external view returns (uint256 err, ComptrollerLensInterface.AccountSnapshot memory snapshot);
    
    function getPoolMarketIndex(uint96 poolId, address vToken) external pure returns (PoolMarketId);

    function corePoolId() external pure returns (uint96);
}
