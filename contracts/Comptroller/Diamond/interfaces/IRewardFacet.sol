// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { IVToken } from "../../../Tokens/VTokens/interfaces/IVToken.sol";
import { IFacetBase, Action } from "./IFacetBase.sol";

/**
 * @title IRewardFacet
 * @author Venus
 * @dev This interface contains all the methods related to the reward functionality
 * @notice This interface provides the external functions related to all claims and rewards of the protocol
 */
interface IRewardFacet is IFacetBase {
    /**
     * @notice Claim all the xvs accrued by holder in all markets and VAI
     * @param holder The address to claim XVS for
     */
    function claimVenus(address holder) external;

    /**
     * @notice Claim all the xvs accrued by holder in the specified markets
     * @param holder The address to claim XVS for
     * @param vTokens The list of markets to claim XVS in
     */
    function claimVenus(address holder, IVToken[] calldata vTokens) external;

    /**
     * @notice Claim all xvs accrued by the holders
     * @param holders The addresses to claim XVS for
     * @param vTokens The list of markets to claim XVS in
     * @param borrowers Whether or not to claim XVS earned by borrowing
     * @param suppliers Whether or not to claim XVS earned by supplying
     */
    function claimVenus(address[] calldata holders, IVToken[] calldata vTokens, bool borrowers, bool suppliers) external;

    /**
     * @notice Claim all the xvs accrued by holder in all markets, a shorthand for `claimVenus` with collateral set to `true`
     * @param holder The address to claim XVS for
     */
    function claimVenusAsCollateral(address holder) external;

    /**
     * @notice Transfer XVS to the recipient
     * @dev Allows the contract admin to transfer XVS to any recipient based on the recipient's shortfall
     *      Note: If there is not enough XVS, we do not perform the transfer all
     * @param recipient The address of the recipient to transfer XVS to
     * @param amount The amount of XVS to (possibly) transfer
     */
    function _grantXVS(address recipient, uint256 amount) external;

    /**
     * @notice Returns the XVS vToken address
     * @return The address of XVS vToken
     */
    function getXVSVTokenAddress() external view returns (address);

    /**
     * @notice Claim all xvs accrued by the holders
     * @param holders The addresses to claim XVS for
     * @param vTokens The list of markets to claim XVS in
     * @param borrowers Whether or not to claim XVS earned by borrowing
     * @param suppliers Whether or not to claim XVS earned by supplying
     * @param collateral Whether or not to use XVS earned as collateral, only takes effect when the holder has a shortfall
     */
    function claimVenus(
        address[] calldata holders,
        IVToken[] calldata vTokens,
        bool borrowers,
        bool suppliers,
        bool collateral
    ) external;

    /**
     * @notice Seize XVS rewards allocated to holders
     * @dev Seize XVS tokens from the specified holders and transfer to recipient
     * @param holders Addresses of the XVS holders
     * @param recipient Address of the XVS token recipient
     * @return The total amount of XVS tokens seized and transferred to recipient
     */
    function seizeVenus(address[] calldata holders, address recipient) external returns (uint256);
}
