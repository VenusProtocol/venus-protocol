// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import { SafeCastUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import { FixedMath } from "./FixedMath.sol";

using SafeCastUpgradeable for uint256;

/**
 * @title Scores
 * @author Venus
 * @notice Scores library is used to calculate score of users
 */
library Scores {
    /**
     * @notice Calculate a membership score given some amount of `xvs` and `capital`, along
     *  with some 𝝰 = `alphaNumerator` / `alphaDenominator`.
     * @param xvs amount of xvs (xvs, 1e18 decimal places)
     * @param capital amount of capital (1e18 decimal places)
     * @param alphaNumerator alpha param numerator
     * @param alphaDenominator alpha param denominator
     * @return membership score with 1e18 decimal places
     *
     * @dev 𝝰 must be in the range [0, 1]
     */
    function _calculateScore(
        uint256 xvs,
        uint256 capital,
        uint256 alphaNumerator,
        uint256 alphaDenominator
    ) internal pure returns (uint256) {
        // Score function is:
        // xvs^𝝰 * capital^(1-𝝰)
        //    = capital * capital^(-𝝰) * xvs^𝝰
        //    = capital * (xvs / capital)^𝝰
        //    = capital * (e ^ (ln(xvs / capital))) ^ 𝝰
        //    = capital * e ^ (𝝰 * ln(xvs / capital))     (1)
        // or
        //    = capital / ( 1 / e ^ (𝝰 * ln(xvs / capital)))
        //    = capital / (e ^ (𝝰 * ln(xvs / capital)) ^ -1)
        //    = capital / e ^ (𝝰 * -1 * ln(xvs / capital))
        //    = capital / e ^ (𝝰 * ln(capital / xvs))     (2)
        //
        // To avoid overflows, use (1) when xvs < capital and
        // use (2) when capital < xvs

        // If any side is 0, exit early
        if (xvs == 0 || capital == 0) return 0;

        // If both sides are equal, we have:
        // xvs^𝝰 * capital^(1-𝝰)
        //    = xvs^𝝰 * xvs^(1-𝝰)
        //    = xvs^(𝝰 + 1 - 𝝰)     = xvs
        if (xvs == capital) return xvs;

        bool lessxvsThanCapital = xvs < capital;

        // (xvs / capital) or (capital / xvs), always in range (0, 1)
        int256 ratio = lessxvsThanCapital ? FixedMath._toFixed(xvs, capital) : FixedMath._toFixed(capital, xvs);

        // e ^ ( ln(ratio) * 𝝰 )
        int256 exponentiation = FixedMath._exp(
            (FixedMath._ln(ratio) * alphaNumerator.toInt256()) / alphaDenominator.toInt256()
        );

        if (lessxvsThanCapital) {
            // capital * e ^ (𝝰 * ln(xvs / capital))
            return FixedMath._uintMul(capital, exponentiation);
        }

        // capital / e ^ (𝝰 * ln(capital / xvs))
        return FixedMath._uintDiv(capital, exponentiation);
    }
}
