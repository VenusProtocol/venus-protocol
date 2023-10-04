// SPDX-License-Identifier: MIT
// solhint-disable var-name-mixedcase

pragma solidity 0.8.13;

import { SafeCastUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import { FixedMath0x } from "./FixedMath0x.sol";

using SafeCastUpgradeable for uint256;

error InvalidFixedPoint();

/**
 * @title FixedMath
 * @author Venus
 * @notice FixedMath library is used for complex mathematical operations
 */
library FixedMath {
    error InvalidFraction(uint256 n, uint256 d);

    /**
     * @notice Convert some uint256 fraction `n` numerator / `d` denominator to a fixed-point number `f`.
     * @param n numerator
     * @param d denominator
     * @return fixed-point number
     */
    function _toFixed(uint256 n, uint256 d) internal pure returns (int256) {
        if (d.toInt256() < n.toInt256()) revert InvalidFraction(n, d);

        return (n.toInt256() * FixedMath0x.FIXED_1) / int256(d.toInt256());
    }

    /**
     * @notice Divide some unsigned int `u` by a fixed point number `f`
     * @param u unsigned dividend
     * @param f fixed point divisor, in FIXED_1 units
     * @return unsigned int quotient
     */
    function _uintDiv(uint256 u, int256 f) internal pure returns (uint256) {
        if (f < 0) revert InvalidFixedPoint();
        // multiply `u` by FIXED_1 to cancel out the built-in FIXED_1 in f
        return uint256((u.toInt256() * FixedMath0x.FIXED_1) / f);
    }

    /**
     * @notice Multiply some unsigned int `u` by a fixed point number `f`
     * @param u unsigned multiplicand
     * @param f fixed point multiplier, in FIXED_1 units
     * @return unsigned int product
     */
    function _uintMul(uint256 u, int256 f) internal pure returns (uint256) {
        if (f < 0) revert InvalidFixedPoint();
        // divide the product by FIXED_1 to cancel out the built-in FIXED_1 in f
        return uint256((u.toInt256() * f) / FixedMath0x.FIXED_1);
    }

    /// @notice see FixedMath0x
    function _ln(int256 x) internal pure returns (int256) {
        return FixedMath0x._ln(x);
    }

    /// @notice see FixedMath0x
    function _exp(int256 x) internal pure returns (int256) {
        return FixedMath0x._exp(x);
    }
}
