// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

interface ILiquidatorStorage {
    /**
     * @notice Percent of seized amount that goes to treasury.
     * @return The treasury percent, scaled by 1e18 (e.g. 0.2 * 1e18 for 20%)
     */
    function treasuryPercentMantissa() external view returns (uint256);

    /**
     * @notice Mapping of addresses allowed to liquidate an account if liquidationRestricted[borrower] == true
     * @param liquidator The address of the liquidator
     * @param borrower The address of the borrower
     * @return True if the liquidator is allowed to liquidate the borrower, false otherwise
     */
    function allowedLiquidatorsByAccount(address liquidator, address borrower) external view returns (bool);

    /**
     * @notice Whether the liquidations are restricted to enabled allowedLiquidatorsByAccount addresses only
     * @param borrower The address of the borrower
     * @return True if the liquidations are restricted to enabled allowedLiquidatorsByAccount addresses only, false otherwise
     */
    function liquidationRestricted(address borrower) external view returns (bool);

    /**
     * @notice minimum amount of VAI liquidation threshold
     * @return The minimum amount of VAI liquidation threshold
     */
    function minLiquidatableVAI() external view returns (uint256);

    /**
     * @notice check for liquidation of VAI
     * @return True if the liquidation of VAI is enabled, false otherwise
     */
    function forceVAILiquidate() external view returns (bool);

    /**
     * @notice assests whose redeem is pending to reduce reserves
     * @param index The index of the pending redeem
     * @return The address of the pending redeem
     */
    function pendingRedeem(uint256 index) external view returns (address);

    /**
     * @notice protocol share reserve contract address
     * @return The address of the protocol share reserve contract
     */
    function protocolShareReserve() external view returns (address);
}
