// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

// TODO: replace with import from @venusprotocol/oracle once the package is published with IDeviationBoundedOracle

/**
 * @title IDeviationBoundedOracle
 * @notice Minimal interface — only the methods called within this repository.
 */
interface IDeviationBoundedOracle {
    /// @notice Populates the transient price cache for `vToken`; must be called before view price reads in the CF path
    function updateProtectionState(address vToken) external;

    /// @notice Returns the bounded collateral price from the transient cache (view-safe after updateProtectionState)
    function getBoundedCollateralPriceView(address vToken) external view returns (uint256);

    /// @notice Returns the bounded debt price from the transient cache (view-safe after updateProtectionState)
    function getBoundedDebtPriceView(address vToken) external view returns (uint256);
}
