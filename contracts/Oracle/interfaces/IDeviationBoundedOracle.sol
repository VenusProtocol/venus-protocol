// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

// TODO: replace with import from @venusprotocol/oracle once the package is published with IDeviationBoundedOracle

/**
 * @title IDeviationBoundedOracle
 * @notice Minimal interface — only the methods called within this repository.
 */
interface IDeviationBoundedOracle {
    /// @notice Populates the transient price cache for `vToken`; calling this before price reads in the CF path
    ///         avoids redundant oracle computation on subsequent reads within the same transaction
    function updateProtectionState(address vToken) external;

    /// @notice Returns the bounded collateral price. Always returns a correct value; calling updateProtectionState
    ///         first is more gas-efficient as it writes the price to transient storage, making this read cheaper.
    function getBoundedCollateralPriceView(address vToken) external view returns (uint256);

    /// @notice Returns the bounded debt price. Always returns a correct value; calling updateProtectionState
    ///         first is more gas-efficient as it writes the price to transient storage, making this read cheaper.
    function getBoundedDebtPriceView(address vToken) external view returns (uint256);

    /// @notice Updates the transient price cache for `vToken` and returns both bounded prices in a single call.
    ///         Prefer this over calling updateProtectionState + getBoundedCollateralPriceView + getBoundedDebtPriceView
    ///         separately — it performs the same computation once and returns both results, saving one external call.
    function getBoundedPrices(address vToken) external returns (uint256 collateralPrice, uint256 debtPrice);

    /// @notice View variant of getBoundedPrices: reads from the transient cache if warm (populated by a prior
    ///         updateProtectionState / getBoundedPrices call in the same transaction), falls back to ResilientOracle
    ///         on a cache miss. Returns both prices in a single call, saving one external call compared to invoking
    ///         getBoundedCollateralPriceView and getBoundedDebtPriceView separately.
    function getBoundedPricesView(address vToken) external view returns (uint256 collateralPrice, uint256 debtPrice);
}
