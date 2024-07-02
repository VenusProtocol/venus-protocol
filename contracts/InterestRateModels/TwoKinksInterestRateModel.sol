pragma solidity ^0.5.16;

import "../Utils/SafeMath.sol";
import "../Utils/SignedSafeMath.sol";
import "./InterestRateModel.sol";

/**
 * @title Venus's TwoKinksInterestRateModel Contract
 * @author Venus
 */
contract TwoKinksInterestRateModel is InterestRateModel {
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    /**
     * @notice The approximate number of blocks per year that is assumed by the interest rate model
     */
    int256 public constant blocksPerYear = (60 * 60 * 24 * 365) / 3; // (assuming 3s blocks)

    ////////////////////// SLOPE 1 //////////////////////

    /**
     * @notice The multiplier of utilization rate per block or second that gives the slope 1 of the interest rate
     */
    int256 public multiplierPerBlock;

    /**
     * @notice The base interest rate per block or second which is the y-intercept when utilization rate is 0
     */
    int256 public baseRatePerBlock;

    ////////////////////// SLOPE 2 //////////////////////

    /**
     * @notice The utilization point at which the multiplier2 is applied
     */
    int256 public kink1;

    /**
     * @notice The multiplier of utilization rate per block or second that gives the slope 2 of the interest rate
     */
    int256 public multiplier2PerBlock;

    /**
     * @notice The base interest rate per block or second which is the y-intercept when utilization rate hits kink1
     */
    int256 public baseRate2PerBlock;

    ////////////////////// SLOPE 3 //////////////////////

    /**
     * @notice The utilization point at which the jump multiplier is applied
     */
    int256 public kink2;

    /**
     * @notice The multiplier per block or second after hitting kink2
     */
    int256 public jumpMultiplierPerBlock;

    /**
     * @notice Construct an interest rate model
     * @param multiplierPerYear The rate of increase in interest rate wrt utilization (scaled by 1e18)
     * @param baseRatePerYear The approximate target base APR, as a mantissa (scaled by 1e18)
     * @param kink1_ The utilization point at which the multiplier2 is applied
     * @param multiplier2PerYear The multiplier after hitting kink1
     * @param baseRate2PerYear The base rate after hitting kink1
     * @param kink2_ The utilization point at which the jump multiplier is applied
     * @param jumpMultiplierPerYear The multiplierPerBlock after hitting a specified utilization point
     */
    constructor(
        int256 multiplierPerYear, 
        int256 baseRatePerYear, 
        int256 kink1_,
        int256 multiplier2PerYear,
        int256 baseRate2PerYear,
        int256 kink2_,
        int256 jumpMultiplierPerYear
    ) public {
        require(baseRatePerYear > 0, "baseRatePerYear must be greater than zero");
        require(baseRate2PerYear > 0, "baseRate2PerYear must be greater than zero");
        require(kink1_ > 0, "kink1 must be greater than zero");
        require(kink2_ > 0, "kink2 must be greater than zero");

        multiplierPerBlock = multiplierPerYear.div(blocksPerYear);
        baseRatePerBlock = baseRatePerYear.div(blocksPerYear);
        kink1 = kink1_;
        multiplier2PerBlock = multiplier2PerYear.div(blocksPerYear);
        baseRate2PerBlock = baseRate2PerYear.div(blocksPerYear);
        kink2 = kink2_;
        jumpMultiplierPerBlock = jumpMultiplierPerYear.div(blocksPerYear);
    }

    /**
     * @notice Calculates the utilization rate of the market: `borrows / (cash + borrows - reserves)`
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market (currently unused)
     * @return The utilization rate as a mantissa between [0, 1e18]
     */
    function utilizationRate(uint256 cash, uint256 borrows, uint256 reserves) public pure returns (uint256) {
        // Utilization rate is 0 when there are no borrows
        if (borrows == 0) {
            return 0;
        }

        return borrows.mul(1e18).div(cash.add(borrows).sub(reserves));
    }

    /**
     * @notice Calculates the current borrow rate per block, with the error code expected by the market
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @return The borrow rate percentage per block as a mantissa (scaled by 1e18)
     */
    function getBorrowRate(uint256 cash, uint256 borrows, uint256 reserves) public view returns (uint256) {
        int256 util = int256(utilizationRate(cash, borrows, reserves));
        int256 expScale = int256(1e18);

        if (util < kink1) {
            return _max(0, util.mul(multiplierPerBlock).div(expScale).add(baseRatePerBlock));
        } else if (util < kink2) {
            int256 rate1 = util.mul(multiplierPerBlock).div(expScale).add(baseRatePerBlock);
            int256 rate2 = util.sub(kink1).mul(multiplier2PerBlock).div(expScale).add(baseRate2PerBlock);
            return _max(0, rate1.add(rate2));
        } else {
            int256 rate1 = util.mul(multiplierPerBlock).div(expScale).add(baseRatePerBlock);
            int256 rate2 = kink2.sub(kink1).mul(multiplier2PerBlock).div(expScale).add(baseRate2PerBlock);
            int256 rate3 = util.sub(kink2).mul(jumpMultiplierPerBlock).div(expScale).add(rate2);
            return _max(0, rate1.add(rate2).add(rate3));
        }
    }

    /**
     * @notice Calculates the current supply rate per block
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @param reserveFactorMantissa The current reserve factor for the market
     * @return The supply rate percentage per block as a mantissa (scaled by 1e18)
     */
    function getSupplyRate(
        uint256 cash,
        uint256 borrows,
        uint256 reserves,
        uint256 reserveFactorMantissa
    ) public view returns (uint256) {
        uint256 oneMinusReserveFactor = uint256(1e18).sub(reserveFactorMantissa);
        uint256 borrowRate = getBorrowRate(cash, borrows, reserves);
        uint256 rateToPool = borrowRate.mul(oneMinusReserveFactor).div(1e18);
        return utilizationRate(cash, borrows, reserves).mul(rateToPool).div(1e18);
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
