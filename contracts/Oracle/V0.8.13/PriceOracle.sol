pragma solidity ^0.8.13;

import "../../Tokens/V0.8.13/VTokens/VToken.sol";

abstract contract PriceOracle {
    /// @notice Indicator that this is a PriceOracle contract (for inspection)
    bool public constant isPriceOracle = true;

    /**
     * @notice Get the underlying price of a vToken asset
     * @param vToken The vToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18).
     *  Zero means the price is unavailable.
     */
    function getUnderlyingPrice(VToken vToken) external view virtual returns (uint);
}