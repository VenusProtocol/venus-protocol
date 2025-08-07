// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IVToken } from "../../Tokens/VTokens/interfaces/IVToken.sol";
import { ILiquidatorStorage } from "./ILiquidatorStorage.sol";

interface ILiquidator is ILiquidatorStorage {
    /**
     * @notice An admin function to restrict liquidations to allowed addresses only.
     * @dev Use {addTo,removeFrom}AllowList to configure the allowed addresses.
     * @param borrower The address of the borrower
     */
    function restrictLiquidation(address borrower) external;

    /**
     * @notice An admin function to remove restrictions for liquidations.
     * @dev Does not impact the allowedLiquidatorsByAccount mapping for the borrower, just turns off the check.
     * @param borrower The address of the borrower
     */
    function unrestrictLiquidation(address borrower) external;

    /**
     * @notice An admin function to add the liquidator to the allowedLiquidatorsByAccount mapping for a certain
     *         borrower. If the liquidations are restricted, only liquidators from the
     *         allowedLiquidatorsByAccount mapping can participate in liquidating the positions of this borrower.
     * @param borrower The address of the borrower
     * @param borrower The address of the liquidator
     */
    function addToAllowlist(address borrower, address liquidator) external;

    /**
     * @notice An admin function to remove the liquidator from the allowedLiquidatorsByAccount mapping for a certain
     *         borrower.
     * @param borrower The address of the borrower
     * @param liquidator The address of the liquidator
     */
    function removeFromAllowlist(address borrower, address liquidator) external;

    /**
     * @notice Liquidates a borrowers position.
     * @param vToken The address of the vToken to liquidate
     * @param borrower The address of the borrower
     * @param repayAmount The amount of the underlying asset to repay
     * @param vTokenCollateral The address of the vToken collateral
     */
    function liquidateBorrow(
        address vToken,
        address borrower,
        uint256 repayAmount,
        IVToken vTokenCollateral
    ) external payable;

    /**
     * @notice Sets the percentage of the liquidation reward that is sent to the treasury.
     * @param newTreasuryPercentMantissa The new treasury percent, scaled by 1e18 (e.g. 0.2 * 1e18 for 20%)
     */
    function setTreasuryPercent(uint256 newTreasuryPercentMantissa) external;
}
