// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IVToken } from "../../Tokens/VTokens/interfaces/IVToken.sol";

interface IComptrollerLens {
    /**
     * @notice Computes the number of collateral tokens to be seized in a liquidation event
     * @param comptroller Address of comptroller
     * @param vTokenBorrowed Address of the borrowed vToken
     * @param vTokenCollateral Address of collateral for the borrow
     * @param actualRepayAmount Repayment amount i.e amount to be repaid of total borrowed amount
     * @return A tuple of error code, and tokens to seize
     */
    function liquidateCalculateSeizeTokens(
        address comptroller,
        address vTokenBorrowed,
        address vTokenCollateral,
        uint actualRepayAmount
    ) external view returns (uint, uint);

    /**
     * @notice Computes the number of VAI tokens to be seized in a liquidation event
     * @param comptroller Address of comptroller
     * @param vTokenCollateral Address of collateral for vToken
     * @param actualRepayAmount Repayment amount i.e amount to be repaid of the total borrowed amount
     * @return A tuple of error code, and tokens to seize
     */
    function liquidateVAICalculateSeizeTokens(
        address comptroller,
        address vTokenCollateral,
        uint actualRepayAmount
    ) external view returns (uint, uint);

    /**
     * @notice Determine the current account liquidity wrt collateral requirements
     * @param comptroller Address of comptroller
     * @param account The account to determine liquidity for
     * @param vTokenModify The market to hypothetically modify
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @return A tuple of error code, liquidity, and shortfall
     */
    function getHypotheticalAccountLiquidity(
        address comptroller,
        address account,
        IVToken vTokenModify,
        uint redeemTokens,
        uint borrowAmount
    ) external view returns (uint, uint, uint);
}
