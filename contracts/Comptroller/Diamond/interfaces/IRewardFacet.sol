// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.5.16;

import { VTokenInterface } from "../../../Tokens/VTokens/VTokenInterfaces.sol";
import { ComptrollerTypes } from "../../ComptrollerStorage.sol";

interface IRewardFacet {
    function claimVenus(address holder) external;

    function claimVenus(address holder, VTokenInterface[] calldata vTokens) external;

    function claimVenus(
        address[] calldata holders,
        VTokenInterface[] calldata vTokens,
        bool borrowers,
        bool suppliers
    ) external;

    function claimVenusAsCollateral(address holder) external;

    function _grantXVS(address recipient, uint256 amount) external;

    function getXVSAddress() external view returns (address);

    function getXVSVTokenAddress() external view returns (address);

    function actionPaused(address market, ComptrollerTypes.Action action) external view returns (bool);

    function claimVenus(
        address[] calldata holders,
        VTokenInterface[] calldata vTokens,
        bool borrowers,
        bool suppliers,
        bool collateral
    ) external;
    function seizeVenus(address[] calldata holders, address recipient) external returns (uint256);
}
