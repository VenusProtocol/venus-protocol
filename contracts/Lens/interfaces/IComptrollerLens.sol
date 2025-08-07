// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IVToken } from "../../Tokens/VTokens/interfaces/IVToken.sol";

interface IComptrollerLens {
    function liquidateCalculateSeizeTokens(
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
        IVToken vTokenModify,
        uint redeemTokens,
        uint borrowAmount
    ) external view returns (uint, uint, uint);
}
