// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { VToken } from "../../Tokens/VTokens/VToken.sol";

/// @title IFlashLoanReceiver
/// @notice Interface for flashLoan receiver contract, which execute custom logic with flash-borrowed assets.
/// @dev This interface defines the method that must be implemented by any contract wishing to interact with the flashLoan system.
///      Contracts must ensure they have the means to repay both the flashLoan amount and the associated premium (fee).
interface IFlashLoanReceiver {
    /**
     * @notice Executes an operation after receiving the flash-borrowed assets.
     * @dev Implementation of this function must ensure the borrowed amount plus the premium (fee) is repaid within the same transaction.
     * @param assets The assets that were flash-borrowed.
     * @param amounts The amounts of each of the flash-borrowed assets.
     * @param premiums The premiums (fees) associated with each flash-borrowed asset.
     * @param initiator The address that initiated the flashLoan operation.
     * @param param Additional parameters encoded as bytes. These can be used to pass custom data to the receiver contract.
     * @return True if the operation succeeds and the borrowed amount plus the premium is repaid, false otherwise.
     * @return array of uint256 representing the amounts to be repaid for each asset.
     */
    function executeOperation(
        VToken[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata param
    ) external returns (bool, uint256[] memory);
}
