// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { InterestRateModelV8 } from "./InterestRateModelV8.sol";

/**
 * @title Venus's IRateModelWithUtilization Interface
 * @author Venus
 */
abstract contract IRateModelWithUtilization is InterestRateModelV8 {
    /**
     * @notice Calculates the utilization rate of the market: `borrows / (cash + borrows - reserves)`
     * @param cash The amount of cash in the market
     * @param borrows The amount of borrows in the market
     * @param reserves The amount of reserves in the market
     * @return The utilization rate as a mantissa between [0, EXP_SCALE]
     */
    function utilizationRate(uint256 cash, uint256 borrows, uint256 reserves) external view virtual returns (uint256);
}
