// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.5.16;

import { FlashLoanSimpleReceiverBase } from "../FlashLoan/base/FlashLoanSimpleReceiverBase.sol";
import { VTokenInterface } from "../Tokens/VTokens/VTokenInterfaces.sol";
import { EIP20NonStandardInterface } from "../Tokens/EIP20NonStandardInterface.sol";

/// @title MockFlashLoanSimpleReceiver
/// @notice This contract serves as a mock implementation for a flash loan receiver, utilizing the
///         FlashLoanSimpleReceiverBase as a foundation. It provides the ability to request a flash loan and
///         defines how the loan is repaid by implementing custom logic in the `executeOperation` function.
contract MockFlashLoanSimpleReceiver is FlashLoanSimpleReceiverBase {
    /**
     * @notice Constructor that initializes the flashLoan receiver with a reference to the VToken contract.
     * @param vToken The address of the VTokenInterface contract that supports flashLoan functionality.
     */
    constructor(VTokenInterface vToken) public FlashLoanSimpleReceiverBase(vToken) {}

    /**
     * @notice Requests a flash loan from the VToken contract.
     * @param amount_ The amount of tokens to borrow through the flash loan.
     * @dev This function calls the `executeFlashLoan` function of the VToken contract.
     */
    function requestFlashLoan(uint256 amount_, address payable receiver) external {
        //address payable receiver = payable(address(this)); // Receiver address is this contract itself
        uint256 amount = amount_; // Set the requested amount

        // Request the flashLoan from the VToken contract
        VTOKEN.executeFlashLoan(receiver, amount);
    }

    /**
     * @notice This function is invoked after receiving the flash loan to handle the loan execution.
     * @dev Custom logic for the use of the borrowed amount is implemented in this function.
     *      It is important that the total borrowed amount plus the premium is repaid.
     * @param asset The address of the token being borrowed in the flash loan.
     * @param amount The amount of tokens borrowed.
     * @param premium The fee for the flash loan, typically a small percentage of the borrowed amount.
     * @param initiator The address that initiated the flash loan.
     * @param param Additional parameters passed along with the flash loan (can be empty).
     * @return Returns true if the operation is successful.
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata param
    ) external returns (bool) {
        // 👇 Your custom logic for the flash loan should be implemented here 👇
        /** YOUR CUSTOM LOGIC HERE */
        initiator;
        param;
        // 👆 Your custom logic for the flash loan should be implemented above here 👆

        // Calculate the total repayment amount (loan amount + premium)
        uint256 total = amount + premium;

        // Transfer the total amount (principal + premium) back to the VToken contract to repay the loan
        EIP20NonStandardInterface(asset).transfer(address(VTOKEN), total);

        // Return true to indicate successful execution of the flash loan operation
        return true;
    }
}
