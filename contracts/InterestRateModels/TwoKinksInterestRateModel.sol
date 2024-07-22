// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { InterestRateModelV8 } from "./InterestRateModelV8.sol";

/**
 * @title TwoKinksInterestRateModel
 * @author Venus
 * @notice An interest rate model with two different steep increase each after a certain utilization threshold called **kink** is reached.
 */
contract TwoKinksInterestRateModel is InterestRateModelV8 {
    int256 public constant BLOCKS_PER_YEAR = (60 * 60 * 24 * 365) / 3; // (assuming 3s blocks)

    ////////////////////// SLOPE 1 //////////////////////

    /**
     * @notice The multiplier of utilization rate per block that gives the slope 1 of the interest rate
     */
    int256 public immutable MULTIPLIER_PER_BLOCK;

    /**
     * @notice The base interest rate per block which is the y-intercept when utilization rate is 0
     */
    int256 public immutable BASE_RATE_PER_BLOCK;

    ////////////////////// SLOPE 2 //////////////////////

    /**
     * @notice The utilization point at which the multiplier2 is applied
     */
    int256 public immutable KINK_1;

    /**
     * @notice The multiplier of utilization rate per block that gives the slope 2 of the interest rate
     */
    int256 public immutable MULTIPLIER_2_PER_BLOCK;

    /**
     * @notice The base interest rate per block which is the y-intercept when utilization rate hits KINK_1
     */
    int256 public immutable BASE_RATE_2_PER_BLOCK;

    ////////////////////// SLOPE 3 //////////////////////

    /**
     * @notice The utilization point at which the jump multiplier is applied
     */
    int256 public immutable KINK_2;

    /**
     * @notice The multiplier per block after hitting KINK_2
     */
    int256 public immutable JUMP_MULTIPLIER_PER_BLOCK;

    /// @notice Base unit for computations, usually used in scaling (multiplications, divisions)
    uint256 internal constant EXP_SCALE = 1e18;

    /**
     * @notice Thrown when a negative value is not allowed
     */
    error NegativeValueNotAllowed();

    /**
     * @notice Construct an interest rate model
     * @param baseRatePerYear_ The approximate target base APR, as a mantissa (scaled by EXP_SCALE)
     * @param multiplierPerYear_ The rate of increase in interest rate wrt utilization (scaled by EXP_SCALE)
     * @param kink1_ The utilization point at which the multiplier2 is applied
     * @param multiplier2PerYear_ The rate of increase in interest rate wrt utilization after hitting KINK_1 (scaled by EXP_SCALE)
     * @param baseRate2PerYear_ The approximate target base APR after hitting KINK_1, as a mantissa (scaled by EXP_SCALE)
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
        if (baseRatePerYear_ < 0 || baseRate2PerYear_ < 0 || kink1_ < 0 || kink2_ < 0) {
            revert NegativeValueNotAllowed();
        }

        BASE_RATE_PER_BLOCK = baseRatePerYear_ / BLOCKS_PER_YEAR;
        MULTIPLIER_PER_BLOCK = multiplierPerYear_ / BLOCKS_PER_YEAR;
        KINK_1 = kink1_;
        MULTIPLIER_2_PER_BLOCK = multiplier2PerYear_ / BLOCKS_PER_YEAR;
        BASE_RATE_2_PER_BLOCK = baseRate2PerYear_ / BLOCKS_PER_YEAR;
        KINK_2 = kink2_;
        JUMP_MULTIPLIER_PER_BLOCK = jumpMultiplierPerYear_ / BLOCKS_PER_YEAR;
    }

    /**
     * @notice Calculates the current borrow rate per slot (block)
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @return The borrow rate percentage per slot (block) as a mantissa (scaled by 1e18)
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
     * @param reserves The amount of reserves in the market (currently unused)
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
            return _max(0, ((util * MULTIPLIER_PER_BLOCK) / expScale) + BASE_RATE_PER_BLOCK);
        } else if (util < KINK_2) {
            int256 rate1 = (((KINK_1 * MULTIPLIER_PER_BLOCK) / expScale) + BASE_RATE_PER_BLOCK);
            int256 rate2 = (((util - KINK_1) * MULTIPLIER_2_PER_BLOCK) / expScale) + BASE_RATE_2_PER_BLOCK;

            return _max(0, rate1 + rate2);
        } else {
            int256 rate1 = (((KINK_1 * MULTIPLIER_PER_BLOCK) / expScale) + BASE_RATE_PER_BLOCK);
            int256 rate2 = (((KINK_2 - KINK_1) * MULTIPLIER_2_PER_BLOCK) / expScale) + BASE_RATE_2_PER_BLOCK;
            int256 rate3 = (((util - KINK_2) * JUMP_MULTIPLIER_PER_BLOCK) / expScale);

            return _max(0, rate1 + rate2 + rate3);
        }
    }

    /**
     * @notice Returns the larger of two numbers
     * @param a The first number
     * @param b The second number
     * @return The larger of the two numbers
     */
    function _max(int256 a, int256 b) internal pure returns (uint256) {
        return uint256(a > b ? a : b);
    }
}
