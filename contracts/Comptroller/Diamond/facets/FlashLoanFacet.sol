// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { IFlashLoanFacet } from "../interfaces/IFlashLoanFacet.sol";
import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { FacetBase } from "./FacetBase.sol";
import { IFlashLoanReceiver } from "../../../FlashLoan/interfaces/IFlashLoanReceiver.sol";
import { ReentrancyGuardTransient } from "../../../Utils/ReentrancyGuardTransient.sol";

/**
 * @title FlashLoanFacet
 * @author Venus
 * @notice This facet contains all the methods related to flash loans
 * @dev This contract implements flash loan functionality allowing users to borrow assets temporarily
 *      within a single transaction. Users can borrow multiple assets simultaneously and have the
 *      flexibility to repay partially, with unpaid balances automatically converted to debt positions.
 *      The contract supports protocol fee collection and integrates with the Venus lending protocol.
 */
contract FlashLoanFacet is IFlashLoanFacet, FacetBase, ReentrancyGuardTransient {
    /// @notice Maximum number of assets that can be flash loaned in a single transaction
    uint256 public constant MAX_FLASHLOAN_ASSETS = 200;

    /// @notice Emitted when the flash loan is successfully executed
    event FlashLoanExecuted(address indexed receiver, VToken[] assets, uint256[] amounts);

    /// @notice Emitted when a flash loan is repaid (fully or partially) and shows debt position status
    event FlashLoanRepaid(
        address indexed receiver,
        address indexed onBehalf,
        address indexed asset,
        uint256 repaidAmount,
        uint256 remainingDebt
    );

    /**
     * @notice Executes a flashLoan operation with the requested assets.
     * @dev Transfers the specified assets to the receiver contract and handles repayment.
     * @param onBehalf The address of the user whose debt position will be used for the flashLoan.
     * @param receiver The address of the contract that will receive the flashLoan amount and execute the operation.
     * @param vTokens The addresses of the vToken assets to be loaned.
     * @param underlyingAmounts The amounts of each underlying assets to be loaned.
     * @param param The bytes passed in the executeOperation call.
     * @custom:error FlashLoanNotEnabled is thrown if the flash loan is not enabled for the asset.
     * @custom:error FlashLoanPausedSystemWide is thrown if flash loans are paused system-wide.
     * @custom:error InvalidAmount is thrown if the requested amount is zero.
     * @custom:error TooManyAssetsRequested is thrown if the number of requested assets exceeds the maximum limit.
     * @custom:error NoAssetsRequested is thrown if no assets are requested for the flash loan.
     * @custom:error InvalidFlashLoanParams is thrown if the flash loan params are invalid.
     * @custom:error MarketNotListed is thrown if the specified vToken market is not listed.
     * @custom:error SenderNotAuthorizedForFlashLoan is thrown if the sender is not authorized to use flashloan.
     * @custom:error NotAnApprovedDelegate is thrown if `msg.sender` is not `onBehalf` or an approved delegate for `onBehalf`.
     * @custom:event Emits FlashLoanExecuted on success
     */
    function executeFlashLoan(
        address payable onBehalf,
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        bytes memory param
    ) external nonReentrant {
        if (flashLoanPaused) {
            revert FlashLoanPausedSystemWide();
        }

        ensureNonzeroAddress(onBehalf);

        uint256 len = vTokens.length;
        Market storage market;

        // vTokens array must not be empty
        if (len == 0) {
            revert NoAssetsRequested();
        }
        // Add maximum array length check to prevent gas limit issues
        if (len > MAX_FLASHLOAN_ASSETS) {
            revert TooManyAssetsRequested(len, MAX_FLASHLOAN_ASSETS);
        }

        // All arrays must have the same length and not be zero
        if (len != underlyingAmounts.length) {
            revert InvalidFlashLoanParams();
        }

        for (uint256 i; i < len; ++i) {
            market = getCorePoolMarket(address(vTokens[i]));
            if (!market.isListed) {
                revert MarketNotListed(address(vTokens[i]));
            }
            if (!(vTokens[i]).isFlashLoanEnabled()) {
                revert FlashLoanNotEnabled();
            }
            if (underlyingAmounts[i] == 0) {
                revert InvalidAmount();
            }
        }

        ensureNonzeroAddress(receiver);

        if (!authorizedFlashLoan[msg.sender]) {
            revert SenderNotAuthorizedForFlashLoan(msg.sender);
        }

        if (msg.sender != onBehalf && !approvedDelegates[onBehalf][msg.sender]) {
            revert NotAnApprovedDelegate();
        }

        // Execute flash loan phases
        _executeFlashLoanPhases(onBehalf, receiver, vTokens, underlyingAmounts, param);

        emit FlashLoanExecuted(receiver, vTokens, underlyingAmounts);
    }

    /**
     * @notice Executes all flash loan phases in sequence
     * @dev Orchestrates the complete flash loan process through three phases:
     *      Phase 1: Calculate fees and transfer assets to receiver
     *      Phase 2: Execute custom operations on receiver contract
     *      Phase 3: Handle repayment and debt position creation
     * @param onBehalf The address whose debt position will be used for any unpaid flash loan balance
     * @param receiver The address of the contract receiving the flash loan
     * @param vTokens Array of vToken contracts for the assets being borrowed
     * @param underlyingAmounts Array of amounts being borrowed for each asset
     * @param param Additional parameters passed to the receiver contract
     */
    function _executeFlashLoanPhases(
        address payable onBehalf,
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        bytes memory param
    ) internal {
        FlashLoanFee memory flashLoanData;
        //Cache array length
        uint256 vTokensLength = vTokens.length;
        // Initialize arrays
        flashLoanData.totalFees = new uint256[](vTokensLength);
        flashLoanData.protocolFees = new uint256[](vTokensLength);

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
        _executePhase3(onBehalf, receiver, vTokens, underlyingAmounts, tokensApproved, flashLoanData);
    }

    /**
     * @notice Phase 1: Calculate fees and transfer assets to receiver
     * @dev For each requested asset:
     *      - Calculates total fee and protocol fee using the vToken's fee structure
     *      - Transfers the requested amount from the vToken to the receiver
     *      - Updates flash loan tracking in the vToken contract
     * @param receiver The address receiving the flash loan assets
     * @param vTokens Array of vToken contracts for the assets being borrowed
     * @param underlyingAmounts Array of amounts being borrowed for each asset
     * @param flashLoanData Struct containing fee arrays to be populated
     */
    function _executePhase1(
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        FlashLoanFee memory flashLoanData
    ) internal {
        //Cache array length
        uint256 vTokensLength = vTokens.length;

        for (uint256 i; i < vTokensLength; ++i) {
            (flashLoanData.totalFees[i], flashLoanData.protocolFees[i]) = vTokens[i].calculateFlashLoanFee(
                underlyingAmounts[i]
            );

            // Transfer the asset to receiver
            vTokens[i].transferOutUnderlyingFlashLoan(receiver, underlyingAmounts[i]);
        }
    }

    /**
     * @notice Phase 2: Execute custom operations on receiver contract
     * @dev Calls the receiver contract's executeOperation function, allowing it to perform
     *      custom logic with the borrowed assets. The receiver must return success status
     *      and specify repayment amounts for each asset.
     * @param onBehalf The address whose debt position will be used for any unpaid balance
     * @param receiver The address of the contract executing custom operations
     * @param vTokens Array of vToken contracts for the borrowed assets
     * @param underlyingAmounts Array of amounts that were borrowed for each asset
     * @param totalFees Array of total fees for each borrowed asset
     * @param param Additional parameters passed to the receiver's executeOperation function
     * @return tokensApproved Array of amounts the receiver approved for repayment
     * @custom:error ExecuteFlashLoanFailed is thrown if the receiver's executeOperation returns false
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
            msg.sender,
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
     * @dev Processes repayment for each asset in the flash loan:
     *      - Ensures minimum fee repayment for each asset
     *      - Creates debt positions for any unpaid balances
     *      - Handles protocol fee distribution automatically
     * @param onBehalf The address whose debt position will be used for any unpaid balance
     * @param receiver The address providing the repayment
     * @param vTokens Array of vToken contracts for the borrowed assets
     * @param underlyingAmounts Array of amounts that were originally borrowed for each asset
     * @param underlyingAmountsToRepay Array of amounts to be repaid for each asset
     * @param flashLoanData Struct containing calculated fees for each asset
     */
    function _executePhase3(
        address payable onBehalf,
        address payable receiver,
        VToken[] memory vTokens,
        uint256[] memory underlyingAmounts,
        uint256[] memory underlyingAmountsToRepay,
        FlashLoanFee memory flashLoanData
    ) internal {
        //Cache array length
        uint256 vTokensLength = vTokens.length;

        for (uint256 i; i < vTokensLength; ++i) {
            _handleFlashLoan(
                vTokens[i],
                onBehalf,
                receiver,
                underlyingAmounts[i],
                underlyingAmountsToRepay[i],
                flashLoanData.totalFees[i],
                flashLoanData.protocolFees[i]
            );
        }
    }

    /**
     * @notice Handles the repayment and fee logic for a flash loan.
     * @dev This function processes flash loan repayment with the following logic:
     *      1. Ensures the repayment amount is at least equal to the total fee (minimum requirement).
     *      2. Caps the repayment to prevent over-repayment (borrowedAmount + totalFee maximum).
     *      3. Transfers the actual repayment amount from the receiver to the vToken.
     *      4. If repayment is less than the full amount (borrowedAmount + totalFee), creates a debt position
     *         for the unpaid balance on the onBehalf address.
     *      5. Protocol fees are automatically handled within the transferInUnderlyingFlashLoan function.
     * @param vToken The vToken contract for the asset being flash loaned.
     * @param onBehalf The address whose debt position will be used if there is any unpaid flash loan balance.
     * @param receiver The address that received the flash loan and is providing the repayment.
     * @param borrowedAmount The original amount that was borrowed (passed from underlyingAmounts).
     * @param repayAmount The amount being repaid by the receiver (may be partial or full repayment).
     * @param totalFee The total fee charged for the flash loan (minimum required repayment).
     * @param protocolFee The portion of the total fee allocated to the protocol.
     * @custom:error NotEnoughRepayment is thrown if repayAmount is less than the minimum required fee.
     * @custom:error FailedToCreateDebtPosition is thrown if debt position creation fails for unpaid balance.
     */
    function _handleFlashLoan(
        VToken vToken,
        address payable onBehalf,
        address payable receiver,
        uint256 borrowedAmount,
        uint256 repayAmount,
        uint256 totalFee,
        uint256 protocolFee
    ) internal {
        uint256 maxExpectedRepayment = borrowedAmount + totalFee;
        uint256 actualRepayAmount = repayAmount > maxExpectedRepayment ? maxExpectedRepayment : repayAmount;

        if (actualRepayAmount < totalFee) {
            revert NotEnoughRepayment(actualRepayAmount, totalFee);
        }

        // Transfer repayment (this will handle the protocol fee as well)
        uint256 actualAmountTransferred = vToken.transferInUnderlyingFlashLoan(
            receiver,
            actualRepayAmount,
            totalFee,
            protocolFee
        );

        // Default for full repayment
        uint256 leftUnpaidBalance;

        if (maxExpectedRepayment > actualAmountTransferred) {
            // If there is any unpaid balance, it becomes an ongoing debt
            leftUnpaidBalance = maxExpectedRepayment - actualAmountTransferred;

            uint256 debtError = vToken.flashLoanDebtPosition(onBehalf, leftUnpaidBalance);
            if (debtError != 0) {
                revert FailedToCreateDebtPosition();
            }
        }

        // Emit event for partial repayment with debt position creation
        emit FlashLoanRepaid(
            receiver,
            onBehalf,
            address(vToken.underlying()),
            actualAmountTransferred,
            leftUnpaidBalance
        );
    }
}
