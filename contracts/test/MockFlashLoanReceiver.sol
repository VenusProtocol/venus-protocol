// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { FlashLoanReceiverBase } from "./FlashLoanReceiverBase.sol";
import { ComptrollerInterface } from "../Comptroller/ComptrollerInterface.sol";
import { VToken } from "../Tokens/VTokens/VToken.sol";
import { IERC20NonStandard } from "../Tokens/test/IERC20NonStandard.sol";

/// @title MockFlashLoanReceiver
/// @notice A mock implementation of a flashLoan receiver contract that interacts with the Comptroller to request and handle flash loans.
/// @dev This contract extends `FlashLoanReceiverBase` and implements custom logic to request flash loans and repay them.
contract MockFlashLoanReceiver is FlashLoanReceiverBase {
    /**
     * @notice Constructor to initialize the flashLoan receiver with the Comptroller contract.
     * @param comptroller The address of the Comptroller contract used to request flash loans.
     */
    constructor(ComptrollerInterface comptroller) FlashLoanReceiverBase(comptroller) {}

    /**
     * @notice Requests a flash loan from the Comptroller contract.
     * @dev This function calls the `executeFlashLoan` function from the Comptroller to initiate a flash loan.
     * @param assets An array of VToken contracts that support flash loans.
     * @param amount An array of amounts to borrow in the flash loan for each corresponding asset.
     * @param receiver The address of the contract that will receive the flashLoan and execute the operation.
     * @param modes An array indicating the repayment mode for each asset (0 = no debt, 1 = create debt).
     * @param onBehalfOf The address that will incur the debt if modes are set to 1.
     * @param param Additional encoded parameters passed with the flash loan.
     */
    function requestFlashLoan(
        VToken[] calldata assets,
        uint256[] calldata amount,
        address payable receiver,
        uint256[] calldata modes,
        address onBehalfOf,
        bytes calldata param
    ) external {
        // Request the flashLoan from the Comptroller contract
        COMPTROLLER.executeFlashLoan(receiver, assets, amount, modes, onBehalfOf, param);
    }

    /**
     * @notice Executes custom logic after receiving the flash loan.
     * @dev This function is called by the Comptroller contract as part of the flashLoan process.
     *      It must repay the loan amount plus the premium for each borrowed asset.
     * @param assets The addresses of the VToken contracts for the flash-borrowed assets.
     * @param amounts The amounts of each asset borrowed.
     * @param premiums The fees for each flash-borrowed asset.
     * @param initiator The address that initiated the flash loan.
     * @param param Additional encoded parameters passed with the flash loan.
     * @return True if the operation succeeds and the debt plus premium is repaid, false otherwise.
     */
    function executeOperation(
        VToken[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata param
    ) external virtual returns (bool) {
        // 👇 Your custom logic for the flash loan should be implemented here 👇
        /** YOUR CUSTOM LOGIC HERE */
        initiator;
        param;
        // 👆 Your custom logic for the flash loan should be implemented above here 👆

        // Calculate the total repayment amount (loan amount + premium) for each borrowed asset
        uint256 len = assets.length;
        for (uint256 k; k < len; ) {
            uint256 total = amounts[k] + premiums[k];

            // Transfer the repayment (amount + premium) back to the VToken contract
            IERC20NonStandard(assets[k].underlying()).approve(address(assets[k]), total);

            ++k;
        }

        // Return true to indicate successful execution of the flash loan operation
        return true;
    }
}
