// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

/// @title IFlashLoanSimpleReceiver
/// @notice Interface for flashLoan receiver contract, which execute custom logic with flash-borrowed asset.
/// @dev This interface defines the method that must be implemented by any contract wishing to interact with the flashLoan system.
///      Contracts must ensure they have the means to repay both the flashLoan amount and the associated premium (fee).
interface IFlashLoanSimpleReceiver {
    /**
     * @notice Executes an operation after receiving the flash-borrowed asset
     * @dev Ensure that the contract can return the debt + premium, e.g., has
     *      enough funds to repay and has to transfer the debt + premium to the VToken
     * @param asset The address of the flash-borrowed asset
     * @param amount The amount of the flash-borrowed asset
     * @param premium The premium (fee) associated with flash-borrowed asset
     * @param onBehalf The address of the user whose debt position will be used for the flashLoan.
     * @param param The byte-encoded param passed when initiating the flashLoan
     * @return True if the execution of the operation succeeds, false otherwise
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address onBehalf,
        bytes calldata param
    ) external returns (bool);
}
