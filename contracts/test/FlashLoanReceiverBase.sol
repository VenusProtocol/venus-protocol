// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.5.16;

import { IFlashLoanReceiver } from "../FlashLoan/interfaces/IFlashLoanReceiver.sol";
import { ComptrollerInterface } from "../Comptroller/ComptrollerInterface.sol";

/// @title FlashLoanReceiverBase
/// @notice A base contract for implementing flashLoan receiver logic.
/// @dev This abstract contract provides the necessary structure for inheriting contracts to implement the `IFlashLoanReceiver` interface.
///      It stores a reference to the Comptroller contract, which manages various aspects of the protocol.
contract FlashLoanReceiverBase is IFlashLoanReceiver {
    /// @notice The Comptroller contract that governs the protocol.
    /// @dev This variable stores the address of the Comptroller contract, which cannot be changed after deployment.
    ComptrollerInterface public COMPTROLLER;

    /**
     * @notice Constructor to initialize the base contract with the Comptroller address.
     * @param comptroller_ The address of the Comptroller contract that oversees the protocol.
     */
    constructor(address comptroller_) public {
        COMPTROLLER = ComptrollerInterface(comptroller_);
    }
}
