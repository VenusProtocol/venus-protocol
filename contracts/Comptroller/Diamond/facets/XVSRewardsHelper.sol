// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.5.16;

import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { FacetBase } from "./FacetBase.sol";

/**
 * @title XVSRewardsHelper
 * @author Venus
 * @dev This contract contains internal functions used in RewardFacet and PolicyFacet
 * @notice This facet contract contains the shared functions used by the RewardFacet and PolicyFacet
 */
contract XVSRewardsHelper is FacetBase {
    /// @notice Emitted when XVS is distributed to a borrower
    event DistributedBorrowerVenus(
        VToken indexed vToken,
        address indexed borrower,
        uint256 venusDelta,
        uint256 venusBorrowIndex
    );

    /// @notice Emitted when XVS is distributed to a supplier
    event DistributedSupplierVenus(
        VToken indexed vToken,
        address indexed supplier,
        uint256 venusDelta,
        uint256 venusSupplyIndex
    );

    /**
     * @notice Accrue XVS to the market by updating the borrow index
     * @param vToken The market whose borrow index to update
     */
    function updateVenusBorrowIndex(address vToken, Exp memory marketBorrowIndex) internal {
        VenusMarketState storage borrowState = venusBorrowState[vToken];
        uint256 borrowSpeed = venusBorrowSpeeds[vToken];
        uint32 blockNumber = getBlockNumberAsUint32();
        uint256 deltaBlocks = sub_(blockNumber, borrowState.block);
        if (deltaBlocks != 0 && borrowSpeed != 0) {
            uint256 borrowAmount = div_(VToken(vToken).totalBorrows(), marketBorrowIndex);
            uint256 accruedVenus = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount != 0 ? fraction(accruedVenus, borrowAmount) : Double({ mantissa: 0 });
            borrowState.index = safe224(add_(Double({ mantissa: borrowState.index }), ratio).mantissa, "224");
            borrowState.block = blockNumber;
        } else if (deltaBlocks != 0) {
            borrowState.block = blockNumber;
        }
    }

    /**
     * @notice Accrue XVS to the market by updating the supply index
     * @param vToken The market whose supply index to update
     */
    function updateVenusSupplyIndex(address vToken) internal {
        VenusMarketState storage supplyState = venusSupplyState[vToken];
        uint256 supplySpeed = venusSupplySpeeds[vToken];
        uint32 blockNumber = getBlockNumberAsUint32();

        uint256 deltaBlocks = sub_(blockNumber, supplyState.block);
        if (deltaBlocks != 0 && supplySpeed != 0) {
            uint256 supplyTokens = VToken(vToken).totalSupply();
            uint256 accruedVenus = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens != 0 ? fraction(accruedVenus, supplyTokens) : Double({ mantissa: 0 });
            supplyState.index = safe224(add_(Double({ mantissa: supplyState.index }), ratio).mantissa, "224");
            supplyState.block = blockNumber;
        } else if (deltaBlocks != 0) {
            supplyState.block = blockNumber;
        }
    }

    /**
     * @notice Calculate XVS accrued by a supplier and possibly transfer it to them
     * @param vToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute XVS to
     */
    function distributeSupplierVenus(address vToken, address supplier) internal {
        if (address(vaiVaultAddress) != address(0)) {
            releaseToVault();
        }
        uint256 supplyIndex = venusSupplyState[vToken].index;
        uint256 supplierIndex = venusSupplierIndex[vToken][supplier];
        // Update supplier's index to the current index since we are distributing accrued XVS
        venusSupplierIndex[vToken][supplier] = supplyIndex;
        if (supplierIndex == 0 && supplyIndex >= venusInitialIndex) {
            // Covers the case where users supplied tokens before the market's supply state index was set.
            // Rewards the user with XVS accrued from the start of when supplier rewards were first
            // set for the market.
            supplierIndex = venusInitialIndex;
        }
        // Calculate change in the cumulative sum of the XVS per vToken accrued
        Double memory deltaIndex = Double({ mantissa: sub_(supplyIndex, supplierIndex) });
        // Multiply of supplierTokens and supplierDelta
        uint256 supplierDelta = mul_(VToken(vToken).balanceOf(supplier), deltaIndex);
        // Addition of supplierAccrued and supplierDelta
        venusAccrued[supplier] = add_(venusAccrued[supplier], supplierDelta);
        emit DistributedSupplierVenus(VToken(vToken), supplier, supplierDelta, supplyIndex);
    }

    /**
     * @notice Calculate XVS accrued by a borrower and possibly transfer it to them
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol
     * @param vToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute XVS to
     */
    function distributeBorrowerVenus(address vToken, address borrower, Exp memory marketBorrowIndex) internal {
        if (address(vaiVaultAddress) != address(0)) {
            releaseToVault();
        }
        uint256 borrowIndex = venusBorrowState[vToken].index;
        uint256 borrowerIndex = venusBorrowerIndex[vToken][borrower];
        // Update borrowers's index to the current index since we are distributing accrued XVS
        venusBorrowerIndex[vToken][borrower] = borrowIndex;
        if (borrowerIndex == 0 && borrowIndex >= venusInitialIndex) {
            // Covers the case where users borrowed tokens before the market's borrow state index was set.
            // Rewards the user with XVS accrued from the start of when borrower rewards were first
            // set for the market.
            borrowerIndex = venusInitialIndex;
        }
        // Calculate change in the cumulative sum of the XVS per borrowed unit accrued
        Double memory deltaIndex = Double({ mantissa: sub_(borrowIndex, borrowerIndex) });
        uint256 borrowerDelta = mul_(div_(VToken(vToken).borrowBalanceStored(borrower), marketBorrowIndex), deltaIndex);
        venusAccrued[borrower] = add_(venusAccrued[borrower], borrowerDelta);
        emit DistributedBorrowerVenus(VToken(vToken), borrower, borrowerDelta, borrowIndex);
    }
}
