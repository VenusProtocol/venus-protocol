// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

/// @notice The slice of ResilientOracleInterface and IDeviationBoundedOracle the Comptroller
///  actually calls, with prices the test sets directly. Deployed rather than `vm.mockCall`ed
///  because the Comptroller checks that the oracle address holds code.
contract MockResilientOracle {
    mapping(address => uint256) public prices;

    function setUnderlyingPrice(address vToken, uint256 price) external {
        prices[vToken] = price;
    }

    function getUnderlyingPrice(address vToken) external view returns (uint256) {
        return prices[vToken];
    }

    /// @dev The Comptroller consults the deviation-bounded oracle on borrow and liquidate. With
    ///  no deviation configured, both bounds are the spot price.
    function getBoundedPricesView(address vToken) external view returns (uint256, uint256) {
        return (prices[vToken], prices[vToken]);
    }

    /// @dev Called by the Comptroller when an account leaves a market.
    function updateProtectionState(address vToken) external {}
}
