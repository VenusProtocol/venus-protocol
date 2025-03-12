// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.5.16;

import { IFlashLoanSimpleReceiver } from "../FlashLoan/interfaces/IFlashLoanSimpleReceiver.sol";
import { VToken } from "../Tokens/VTokens/VToken.sol";

/**
 * @title FlashLoanSimpleReceiverBase
 * @author Venus
 * @notice Base contract to develop a flashLoan-receiver contract.
 * @dev This contract serves as a foundational contract for implementing custom flash loan receiver logic.
 * Inheritors of this contract need to implement the `executeOperation` function defined in the `IFlashLoanSimpleReceiver` interface.
 */
contract FlashLoanSimpleReceiverBase is IFlashLoanSimpleReceiver {
    /// @notice The VToken contract used to initiate and handle flash loan
    /// @dev This is a reference to the VToken, which enables the flash loan functionality.
    VToken public VTOKEN;

    /// @notice Initializes the base contract by setting the VToken address
    /// @param vToken_ The address of the VToken contract that supports flash loan
    constructor(VToken vToken_) public {
        VTOKEN = vToken_;
    }
}
