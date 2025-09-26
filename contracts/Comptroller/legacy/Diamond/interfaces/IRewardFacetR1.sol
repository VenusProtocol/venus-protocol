// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { VToken } from "../../../../Tokens/VTokens/VToken.sol";

interface IRewardFacetR1 {
    function claimVenus(address holder) external;

    function claimVenus(address holder, VToken[] calldata vTokens) external;

    function claimVenus(address[] calldata holders, VToken[] calldata vTokens, bool borrowers, bool suppliers) external;

    function claimVenusAsCollateral(address holder) external;

    function _grantXVS(address recipient, uint256 amount) external;

    function getXVSVTokenAddress() external view returns (address);

    function claimVenus(
        address[] calldata holders,
        VToken[] calldata vTokens,
        bool borrowers,
        bool suppliers,
        bool collateral
    ) external;
    function seizeVenus(address[] calldata holders, address recipient) external returns (uint256);
}
