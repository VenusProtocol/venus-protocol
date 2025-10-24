// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { VToken } from "../../../Tokens/VTokens/VToken.sol";

interface IFlashLoanFacet {
    /// @notice Data structure to hold flash loan related data during execution
    struct FlashLoanFee {
        uint256[] totalFees;
        uint256[] protocolFees;
    }

    function executeFlashLoan(
        address payable onBehalf,
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        bytes memory param
    ) external;
}
