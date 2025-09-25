// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { VToken } from "../../../Tokens/VTokens/VToken.sol";

interface IFlashLoanFacet {
    function executeFlashLoan(
        address payable onBehalf,
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        bytes memory param
    ) external;
}
