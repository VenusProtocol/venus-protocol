pragma solidity 0.5.16;

import "../Utils/SafeMath.sol";

/**
 * @title Logic for Venus stable rate.
 */
contract StableRateModel {
    using SafeMath for uint;

    event NewStableInterestParams(uint256 baseRatePerBlock, uint256 stableRatePremium, uint256 optimalStableLoanRatio);

    /// @notice Indicator that this is an InterestRateModel contract (for inspection)
    bool public constant isInterestRateModel = true;

    uint256 private constant BASE = 1e18;

    /// @notice The approximate number of blocks per year that is assumed by the interest rate model
    uint256 public constant blocksPerYear = 2102400;

    /// @notice The stable base interest rate which is the y-intercept when utilization rate is 0(also known by base_premium)
    uint256 public baseRatePerBlock;

    /// @notice The premium rate applicable on optimal stable loan rate(also known by stable_rate_slope)
    uint256 public stableRatePremium;

    /// @notice The factor to be applied to the stable rate premium before adding to the interest rate
    uint256 public optimalStableLoanRatio;

    /// @notice The address of the owner, i.e. the Timelock contract, which can update parameters directly
    address public owner;

    /**
     * @param baseRatePerYear_ The approximate target base APR, as a mantissa (scaled by BASE)
     * @param stableRatePremium_ The multiplierPerBlock after hitting a specified utilization point
     * @param optimalStableLoanRatio_ Optimal stable loan rate percentage.
     * @param owner_ Address of the owner for this model(Governance)
     */
    constructor(
        uint256 baseRatePerYear_,
        uint256 stableRatePremium_,
        uint256 optimalStableLoanRatio_,
        address owner_
    ) public {
        owner = owner_;

        updateStableRateModelInternal(baseRatePerYear_, stableRatePremium_, optimalStableLoanRatio_);
    }

    /**
     * @notice Updates the parameters of the interest rate model (only callable by owner, i.e. Timelock)
     * @param baseRatePerYear_ The approximate target base APR, as a mantissa (scaled by BASE)
     * @param stableRatePremium_ The multiplierPerBlock after hitting a specified utilization point
     * @param optimalStableLoanRatio_ Optimal stable loan rate percentage.
     * @notice Emits NewStableInterestParams, after updating the parameters
     * @notice Only governance
     */
    function updateStableRateModel(
        uint256 baseRatePerYear_,
        uint256 stableRatePremium_,
        uint256 optimalStableLoanRatio_
    ) external {
        require(msg.sender == owner, "StableRateModel: only owner may call this function.");

        updateStableRateModelInternal(baseRatePerYear_, stableRatePremium_, optimalStableLoanRatio_);
    }

    /**
     * @notice Calculates the ratio of the stable borrows to total borrows
     * @param stableBorrows The amount of stable borrows in the market
     * @param totalBorrows The amount of total borrows in the market
     * @return The stable loan rate as a mantissa between [0, BASE]
     */
    function stableLoanRatio(uint256 stableBorrows, uint256 totalBorrows) public pure returns (uint256) {
        // Loan ratio is 0 when there are no stable borrows
        if (totalBorrows == 0) {
            return 0;
        }

        return (stableBorrows * BASE) / totalBorrows;
    }

    /**
     * @notice Calculates the current borrow rate per block, with the error code expected by the market
     * @param stableBorrows The amount of stable borrows in the market
     * @param totalBorrows The amount of borrows in the market
     * @param variableBorrowRate Current variable borrow rate per block of the protocol
     * @return The borrow rate percentage per block as a mantissa (scaled by BASE)
     */
    function getBorrowRate(
        uint256 stableBorrows,
        uint256 totalBorrows,
        uint256 variableBorrowRate
    ) external view returns (uint256) {
        uint256 loanRatio = stableLoanRatio(stableBorrows, totalBorrows);
        uint256 excessLoanRatio = calculateLoanRatioDiff(loanRatio);

        return (variableBorrowRate + baseRatePerBlock + ((stableRatePremium * excessLoanRatio) / BASE));
    }

    /**
     * @notice Internal function to update the parameters of the interest rate model
     * @param baseRatePerYear_ The approximate target base APR, as a mantissa (scaled by BASE)
     * @param stableRatePremium_ The multiplierPerBlock after hitting a specified utilization point
     * @param optimalStableLoanRatio_ Optimal stable loan rate percentage.
     */
    function updateStableRateModelInternal(
        uint256 baseRatePerYear_,
        uint256 stableRatePremium_,
        uint256 optimalStableLoanRatio_
    ) internal {
        require(
            baseRatePerYear_ > blocksPerYear,
            "StableRateModel: baseRatePerYear should be greater than blocksPerYear"
        );
        baseRatePerBlock = baseRatePerYear_.div(blocksPerYear);
        stableRatePremium = stableRatePremium_;
        optimalStableLoanRatio = optimalStableLoanRatio_;

        emit NewStableInterestParams(baseRatePerBlock, stableRatePremium, optimalStableLoanRatio);
    }

    /**
     * @notice Calculates the difference of stableLoanRatio and the optimalStableLoanRatio
     * @param loanRatio Stable loan ratio for stable borrows in the market
     * @return The difference between the stableLoanRatio and optimal loan rate as a mantissa between [0, BASE]
     */
    function calculateLoanRatioDiff(uint256 loanRatio) internal view returns (uint256) {
        if (loanRatio == 0 || optimalStableLoanRatio > loanRatio) {
            return 0;
        }

        return (loanRatio - optimalStableLoanRatio);
    }
}
