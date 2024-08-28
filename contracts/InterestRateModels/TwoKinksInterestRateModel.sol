// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { InterestRateModelV8 } from "./InterestRateModelV8.sol";

/**
 * @title TwoKinksInterestRateModel
 * @author Venus
 * @notice An interest rate model with two different slope increase or decrease each after a certain utilization threshold called **kink** is reached.
 */
contract TwoKinksInterestRateModel is InterestRateModelV8 {
    int256 public constant BLOCKS_PER_YEAR = (60 * 60 * 24 * 365) / 3; // (assuming 3s blocks)

    ////////////////////// SLOPE 1 //////////////////////

    /**
     * @notice The multiplier of utilization rate per block that gives the slope 1 of the interest rate scaled by EXP_SCALE
     */
    int256 public immutable MULTIPLIER_PER_BLOCK;

    /**
     * @notice The base interest rate per block which is the y-intercept when utilization rate is 0 scaled by EXP_SCALE
     */
    int256 public immutable BASE_RATE_PER_BLOCK;

    ////////////////////// SLOPE 2 //////////////////////

    /**
     * @notice The utilization point at which the multiplier2 is applied
     */
    int256 public immutable KINK_1;

    /**
     * @notice The multiplier of utilization rate per block that gives the slope 2 of the interest rate scaled by EXP_SCALE
     */
    int256 public immutable MULTIPLIER_2_PER_BLOCK;

    /**
     * @notice The base interest rate per block which is the y-intercept when utilization rate hits KINK_1 scaled by EXP_SCALE
     */
    int256 public immutable BASE_RATE_2_PER_BLOCK;

    /**
     * @notice The maximum kink interest rate scaled by EXP_SCALE
     */
    int256 public immutable RATE_1;

    ////////////////////// SLOPE 3 //////////////////////

    /**
     * @notice The utilization point at which the jump multiplier is applied
     */
    int256 public immutable KINK_2;

    /**
     * @notice The multiplier of utilization rate per block that gives the slope 3 of interest rate scaled by EXP_SCALE
     */
    int256 public immutable JUMP_MULTIPLIER_PER_BLOCK;

    /**
     * @notice The maximum kink interest rate scaled by EXP_SCALE
     */
    int256 public immutable RATE_2;

    /// @notice Base unit for computations, usually used in scaling (multiplications, divisions)
    uint256 internal constant EXP_SCALE = 1e18;

    /**
     * @notice Thrown when a negative value is not allowed
     */
    error NegativeValueNotAllowed();

    /**
     * @notice Thrown when the kink points are not in the correct order
     */
    error InvalidKink();

    /**
     * @notice Construct an interest rate model
     * @param baseRatePerYear_ The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear_ The rate of increase or decrease in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param kink1_ The utilization point at which the multiplier2 is applied
     * @param multiplier2PerYear_ The rate of increase or decrease in interest rate wrt utilization after hitting KINK_1 (scaled by EXP_SCALE)
     * @param baseRate2PerYear_ The additional base APR after hitting KINK_1, as a mantissa (scaled by EXP_SCALE)
     * @param kink2_ The utilization point at which the jump multiplier is applied
     * @param jumpMultiplierPerYear_ The multiplier after hitting KINK_2
     */
    constructor(
        int256 baseRatePerYear_,
        int256 multiplierPerYear_,
        int256 kink1_,
        int256 multiplier2PerYear_,
        int256 baseRate2PerYear_,
        int256 kink2_,
        int256 jumpMultiplierPerYear_
    ) {
        if (baseRatePerYear_ < 0 || baseRate2PerYear_ < 0) {
            revert NegativeValueNotAllowed();
        }

        if (kink2_ <= kink1_ || kink1_ <= 0) {
            revert InvalidKink();
        }

        BASE_RATE_PER_BLOCK = baseRatePerYear_ / BLOCKS_PER_YEAR;
        MULTIPLIER_PER_BLOCK = multiplierPerYear_ / BLOCKS_PER_YEAR;
        KINK_1 = kink1_;
        MULTIPLIER_2_PER_BLOCK = multiplier2PerYear_ / BLOCKS_PER_YEAR;
        BASE_RATE_2_PER_BLOCK = baseRate2PerYear_ / BLOCKS_PER_YEAR;
        KINK_2 = kink2_;
        JUMP_MULTIPLIER_PER_BLOCK = jumpMultiplierPerYear_ / BLOCKS_PER_YEAR;

        int256 expScale = int256(EXP_SCALE);
        RATE_1 = (((KINK_1 * MULTIPLIER_PER_BLOCK) / expScale) + BASE_RATE_PER_BLOCK);

        int256 slope2Util;
        unchecked {
            slope2Util = KINK_2 - KINK_1;
        }
        RATE_2 = ((slope2Util * MULTIPLIER_2_PER_BLOCK) / expScale) + BASE_RATE_2_PER_BLOCK;
    }

    /**
     * @notice Calculates the current borrow rate per slot (block)
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @return The borrow rate percentage per slot (block) as a mantissa (scaled by EXP_SCALE)
     */
    function getBorrowRate(uint256 cash, uint256 borrows, uint256 reserves) external view override returns (uint256) {
        return _getBorrowRate(cash, borrows, reserves);
    }

    /**
     * @notice Calculates the current supply rate per slot (block)
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @param reserveFactorMantissa The current reserve factor for the market
     * @return The supply rate percentage per slot (block) as a mantissa (scaled by EXP_SCALE)
     */
    function getSupplyRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 reserveFactorMantissa
    ) public view virtual override returns (uint256) {
        uint256 oneMinusReserveFactor = EXP_SCALE - reserveFactorMantissa;
        uint256 borrowRate = _getBorrowRate(cash, borrows, reserves);
        uint256 rateToPool = (borrowRate * oneMinusReserveFactor) / EXP_SCALE;
        return (utilizationRate(cash, borrows, reserves) * rateToPool) / EXP_SCALE;
    }

    /**
     * @notice Calculates the utilization rate of the market: `borrows / (cash + borrows - reserves)`
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @return The utilization rate as a mantissa between [0, EXP_SCALE]
     */
    function utilizationRate(uint256 cash, uint256 borrows, uint256 reserves) public pure returns (uint256) {
        // Utilization rate is 0 when there are no borrows
        if (borrows == 0) {
            return 0;
        }

        uint256 rate = (borrows * EXP_SCALE) / (cash + borrows - reserves);

        if (rate > EXP_SCALE) {
            rate = EXP_SCALE;
        }

        return rate;
    }

    /**
     * @notice Calculates the current borrow rate per slot (block), with the error code expected by the market
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @return The borrow rate percentage per slot (block) as a mantissa (scaled by EXP_SCALE)
     */
    function _getBorrowRate(uint256 cash, uint256 borrows, uint256 reserves) internal view returns (uint256) {
        int256 util = int256(utilizationRate(cash, borrows, reserves));
        int256 expScale = int256(EXP_SCALE);

        if (util < KINK_1) {
            return _minCap(((util * MULTIPLIER_PER_BLOCK) / expScale) + BASE_RATE_PER_BLOCK);
        } else if (util < KINK_2) {
            int256 slope2Util;
            unchecked {
                slope2Util = util - KINK_1;
            }
            int256 rate2 = ((slope2Util * MULTIPLIER_2_PER_BLOCK) / expScale) + BASE_RATE_2_PER_BLOCK;

            return _minCap(RATE_1 + rate2);
        } else {
            int256 slope3Util;
            unchecked {
                slope3Util = util - KINK_2;
            }
            int256 rate3 = ((slope3Util * JUMP_MULTIPLIER_PER_BLOCK) / expScale);

            return _minCap(RATE_1 + RATE_2 + rate3);
        }
    }

    /**
     * @notice Returns 0 if number is less than 0, otherwise returns the input
     * @param number The first number
     * @return The maximum of 0 and input number
     */
    function _minCap(int256 number) internal pure returns (uint256) {
        int256 zero;
        return uint256(number > zero ? number : zero);
    }
}
