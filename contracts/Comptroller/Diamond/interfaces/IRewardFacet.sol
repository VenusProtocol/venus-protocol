// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.5.16;

import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { ComptrollerTypes } from "../../ComptrollerStorage.sol";

interface IRewardFacet {
    function claimVenus(address holder) external;

    function claimVenus(address holder, VToken[] calldata vTokens) external;

    function claimVenus(address[] calldata holders, VToken[] calldata vTokens, bool borrowers, bool suppliers) external;

    function claimVenusAsCollateral(address holder) external;

    function _grantXVS(address recipient, uint256 amount) external;

    function getXVSAddress() external pure returns (address);

    function getXVSVTokenAddress() external pure returns (address);

    function actionPaused(address market, ComptrollerTypes.Action action) external view returns (bool);

    function claimVenus(
        address[] calldata holders,
        VToken[] calldata vTokens,
        bool borrowers,
        bool suppliers,
        bool collateral
    ) external;
}
