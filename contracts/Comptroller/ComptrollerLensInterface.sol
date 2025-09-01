// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { VToken } from "../Tokens/VTokens/VToken.sol";
import { WeightFunction } from "./Diamond/interfaces/IFacetBase.sol";

interface ComptrollerLensInterface {
    function liquidateCalculateSeizeTokens(
        address comptroller,
        address vTokenBorrowed,
        address vTokenCollateral,
        uint actualRepayAmount
    ) external view returns (uint, uint);

    function liquidateCalculateSeizeTokens(
        address borrower,
        address comptroller,
        address vTokenBorrowed,
        address vTokenCollateral,
        uint actualRepayAmount
    ) external view returns (uint, uint);

    function liquidateVAICalculateSeizeTokens(
        address comptroller,
        address vTokenCollateral,
        uint actualRepayAmount
    ) external view returns (uint, uint);

    function getHypotheticalAccountLiquidity(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint redeemTokens,
        uint borrowAmount,
        WeightFunction weightingStrategy
    ) external view returns (uint, uint, uint);
}
