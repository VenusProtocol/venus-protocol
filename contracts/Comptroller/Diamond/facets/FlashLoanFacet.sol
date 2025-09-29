// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { IFlashLoanFacet } from "../interfaces/IFlashLoanFacet.sol";
import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { FacetBase } from "./FacetBase.sol";
import { IFlashLoanReceiver } from "../../../FlashLoan/interfaces/IFlashLoanReceiver.sol";
import { IProtocolShareReserve } from "../../../external/IProtocolShareReserve.sol";

contract FlashLoanFacet is IFlashLoanFacet, FacetBase {
    /// @notice Emitted when the flash loan is successfully executed
    event FlashLoanExecuted(address indexed receiver, VToken[] assets, uint256[] amounts);

    /**
     * @notice Executes a flashLoan operation with the requested assets.
     * @dev Transfers the specified assets to the receiver contract and handles repayment.
     * @param onBehalf The address of the user whose debt position will be used for the flashLoan.
     * @param receiver The address of the contract that will receive the flashLoan amount and execute the operation.
     * @param vTokens The addresses of the vToken assets to be loaned.
     * @param underlyingAmounts The amounts of each underlying assets to be loaned.
     * @param param The bytes passed in the executeOperation call.
     * @custom:error FlashLoanNotEnabled is thrown if the flash loan is not enabled for the asset.
     * @custom:error InvalidAmount is thrown if the requested amount is zero.
     * @custom:error NoAssetsRequested is thrown if no assets are requested for the flash loan.
     * @custom:error InvalidFlashLoanParams is thrown if the flash loan params are invalid.
     * @custom:error SenderNotAuthorizedForFlashLoan is thrown if the sender is not authorized to use flashloan.
     * @custom:event Emits FlashLoanExecuted on success
     */
    function executeFlashLoan(
        address payable onBehalf,
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        bytes memory param
    ) external {
        for (uint256 i; i < vTokens.length; ++i) {
            if (!(vTokens[i]).isFlashLoanEnabled()) revert FlashLoanNotEnabled();
            if (underlyingAmounts[i] == 0) revert InvalidAmount();
        }
        // vTokens array must not be empty
        if (vTokens.length == 0) {
            revert NoAssetsRequested();
        }
        // All arrays must have the same length and not be zero
        if (vTokens.length != underlyingAmounts.length) {
            revert InvalidFlashLoanParams();
        }

        ensureNonzeroAddress(receiver);

        if (!authorizedFlashLoan[msg.sender]) {
            revert SenderNotAuthorizedForFlashLoan(msg.sender);
        }

        if (!approvedDelegates[onBehalf][msg.sender]) {
            revert NotAnApprovedDelegate();
        }

        // Execute flash loan phases
        _executeFlashLoanPhases(onBehalf, receiver, vTokens, underlyingAmounts, param);

        emit FlashLoanExecuted(receiver, vTokens, underlyingAmounts);
    }

    /**
     * @notice Executes all flash loan phases
     */
    function _executeFlashLoanPhases(
        address payable onBehalf,
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        bytes memory param
    ) internal {
        FlashLoanData memory flashLoanData;
        // Initialize arrays
        flashLoanData.totalFees = new uint256[](vTokens.length);
        flashLoanData.protocolFees = new uint256[](vTokens.length);
        flashLoanData.actualRepayments = new uint256[](vTokens.length);
        flashLoanData.remainingDebts = new uint256[](vTokens.length);

        // Phase 1: Calculate fees and transfer assets
        _executePhase1(receiver, vTokens, underlyingAmounts, flashLoanData);
        // Phase 2: Execute operations on receiver contract
        uint256[] memory tokensApproved = _executePhase2(
            onBehalf,
            receiver,
            vTokens,
            underlyingAmounts,
            flashLoanData.totalFees,
            param
        );
        // Phase 3: Handles repayment
        _executePhase3(onBehalf, receiver, vTokens, tokensApproved, flashLoanData);
    }

    /**
     * @notice Phase 1: Calculate fees and transfer assets to receiver
     */
    function _executePhase1(
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        FlashLoanData memory flashLoanData
    ) internal {
        for (uint256 i; i < vTokens.length; ++i) {
            (flashLoanData.totalFees[i], flashLoanData.protocolFees[i]) = vTokens[i].calculateFlashLoanFee(
                underlyingAmounts[i]
            );

            // Transfer the asset to receiver
            vTokens[i].transferOutUnderlyingFlashLoan(receiver, underlyingAmounts[i]);
        }
    }

    /**
     * @notice Phase 2: Execute operations on receiver contract
     */
    function _executePhase2(
        address payable onBehalf,
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        uint256[] memory totalFees,
        bytes memory param
    ) internal returns (uint256[] memory) {
        (bool success, uint256[] memory tokensApproved) = IFlashLoanReceiver(receiver).executeOperation(
            vTokens,
            underlyingAmounts,
            totalFees,
            onBehalf,
            param
        );

        if (!success) {
            revert ExecuteFlashLoanFailed();
        }
        return tokensApproved;
    }

    /**
     * @notice Phase 3: Handles repayment based on full or partial repayment
     * @dev If full repayment is made, transfer protocol fee to protocol share reserve and update state.
     *      If partial repayment is made, create an ongoing debt position for the unpaid balance.
     */
    function _executePhase3(
        address payable onBehalf,
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmountsToRepay,
        FlashLoanData memory flashLoanData
    ) internal {
        for (uint256 i; i < vTokens.length; ++i) {
            _handleFlashLoan(
                vTokens[i],
                onBehalf,
                receiver,
                underlyingAmountsToRepay[i],
                flashLoanData.totalFees[i],
                flashLoanData.protocolFees[i]
            );
        }
    }

    /**
     * @notice Handles the repayment and fee logic for a flash loan.
     * @dev Transfers the repaid amount from the receiver, checks if the full amount plus fee is repaid,
     *      and either settles the protocol fee or creates an ongoing debt position for any unpaid balance.
     *      Updates the protocol share reserve state if the protocol fee is transferred.
     * @param vToken The vToken contract for the asset being flash loaned.
     * @param onBehalf The address of the EOA who initiated the flash loan.
     * @param receiver The address that received the flash loan and is repaying.
     * @param amountRepaid The amount repaid by the receiver (principal + fee).
     * @param totalFee The total fee charged for the flash loan.
     * @param protocolFee The portion of the total fee allocated to the protocol.
     */
    function _handleFlashLoan(
        VToken vToken,
        address payable onBehalf,
        address payable receiver,
        uint256 amountRepaid,
        uint256 totalFee,
        uint256 protocolFee
    ) internal {
        uint256 borrowedFlashLoanAmount = vToken.flashLoanAmount();
        uint256 maxExpectedRepayment = borrowedFlashLoanAmount + totalFee;
        uint256 actualRepayment = amountRepaid > maxExpectedRepayment ? maxExpectedRepayment : amountRepaid;

        if (actualRepayment < totalFee) {
            revert NotEnoughRepayment(actualRepayment, totalFee);
        }

        // Transfer repayment (this will handle the protocol fee as well)
        uint256 actualAmountTransferred = vToken.transferInUnderlyingFlashLoan(
            receiver,
            actualRepayment,
            totalFee,
            protocolFee
        );

        if (maxExpectedRepayment > actualAmountTransferred) {
            // If there is any unpaid balance, it becomes an ongoing debt
            uint256 leftUnpaidBalance = maxExpectedRepayment - actualAmountTransferred;

            uint256 debtError = vToken.borrowDebtPosition(onBehalf, leftUnpaidBalance);
            if (debtError != 0) {
                revert FailedToCreateDebtPosition();
            }
        }
    }
}
