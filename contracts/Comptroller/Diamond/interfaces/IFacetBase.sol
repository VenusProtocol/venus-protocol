// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { Action } from "../../../Comptroller/ComptrollerInterface.sol";

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
}
