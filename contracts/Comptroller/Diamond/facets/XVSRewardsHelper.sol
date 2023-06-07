pragma solidity 0.5.16;

import "../../../Utils/ExponentialNoError.sol";
import "../interfaces/IXVS.sol";
import "./FacetBase.sol";

/**
 * @dev This contract contains internal functions used in RewardFacet and PolicyFacet
 */
contract XVSRewardsHelper is ComptrollerErrorReporter, ExponentialNoError, FacetBase {
    /// @notice Emitted when XVS is distributed to VAI Vault
    event DistributedVAIVaultVenus(uint amount);

    /// @notice Emitted when XVS is distributed to a borrower
    event DistributedBorrowerVenus(
        VToken indexed vToken,
        address indexed borrower,
        uint venusDelta,
        uint venusBorrowIndex
    );

    /// @notice Emitted when XVS is distributed to a supplier
    event DistributedSupplierVenus(
        VToken indexed vToken,
        address indexed supplier,
        uint venusDelta,
        uint venusSupplyIndex
    );

    /**
     * @notice Accrue XVS to the market by updating the borrow index
     * @param vToken The market whose borrow index to update
     */
    function updateVenusBorrowIndex(address vToken, ExponentialNoError.Exp memory marketBorrowIndex) internal {
        VenusMarketState storage borrowState = venusBorrowState[vToken];
        uint borrowSpeed = venusBorrowSpeeds[vToken];
        uint blockNumber = block.number;
        uint deltaBlocks = sub_(uint(blockNumber), uint(borrowState.block));
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint borrowAmount = div_(VToken(vToken).totalBorrows(), marketBorrowIndex);
            uint venusAccrued = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(venusAccrued, borrowAmount) : Double({ mantissa: 0 });
            borrowState.index = safe224(
                add_(Double({ mantissa: borrowState.index }), ratio).mantissa,
                "new index exceeds 224 bits"
            );
            borrowState.block = uint32(blockNumber);
        } else if (deltaBlocks > 0) {
            borrowState.block = uint32(blockNumber);
        }
    }

    /**
     * @notice Accrue XVS to the market by updating the supply index
     * @param vToken The market whose supply index to update
     */
    function updateVenusSupplyIndex(address vToken) internal {
        VenusMarketState storage supplyState = venusSupplyState[vToken];
        uint supplySpeed = venusSupplySpeeds[vToken];
        uint blockNumber = block.number;

        uint deltaBlocks = sub_(uint(blockNumber), uint(supplyState.block));
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint supplyTokens = VToken(vToken).totalSupply();
            uint venusAccrued = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(venusAccrued, supplyTokens) : Double({ mantissa: 0 });
            supplyState.index = safe224(
                add_(Double({ mantissa: supplyState.index }), ratio).mantissa,
                "new index exceeds 224 bits"
            );
            supplyState.block = uint32(blockNumber);
        } else if (deltaBlocks > 0) {
            supplyState.block = uint32(blockNumber);
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
        uint supplyIndex = venusSupplyState[vToken].index;
        uint supplierIndex = venusSupplierIndex[vToken][supplier];
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
        uint supplierDelta = mul_(VToken(vToken).balanceOf(supplier), deltaIndex);
        // Addition of supplierAccrued and supplierDelta
        venusAccrued[supplier] = add_(venusAccrued[supplier], supplierDelta);
        emit DistributedSupplierVenus(VToken(vToken), supplier, supplierDelta, supplyIndex);
    }

    /**
     * @notice Calculate XVS accrued by a borrower and possibly transfer it to them
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param vToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute XVS to
     */
    function distributeBorrowerVenus(
        address vToken,
        address borrower,
        ExponentialNoError.Exp memory marketBorrowIndex
    ) internal {
        if (address(vaiVaultAddress) != address(0)) {
            releaseToVault();
        }
        uint borrowIndex = venusBorrowState[vToken].index;
        uint borrowerIndex = venusBorrowerIndex[vToken][borrower];
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
        uint borrowerDelta = mul_(div_(VToken(vToken).borrowBalanceStored(borrower), marketBorrowIndex), deltaIndex);
        venusAccrued[borrower] = add_(venusAccrued[borrower], borrowerDelta);
        emit DistributedBorrowerVenus(VToken(vToken), borrower, borrowerDelta, borrowIndex);
    }

    /**
     * @notice Transfer XVS to VAI Vault
     */
    function releaseToVault() public {
        if (releaseStartBlock == 0 || getBlockNumber() < releaseStartBlock) {
            return;
        }

        uint256 xvsBalance = IXVS(getXVSAddress()).balanceOf(address(this));
        if (xvsBalance == 0) {
            return;
        }

        uint256 actualAmount;
        uint256 deltaBlocks = sub_(getBlockNumber(), releaseStartBlock);
        // releaseAmount = venusVAIVaultRate * deltaBlocks
        uint256 _releaseAmount = mul_(venusVAIVaultRate, deltaBlocks);

        if (xvsBalance >= _releaseAmount) {
            actualAmount = _releaseAmount;
        } else {
            actualAmount = xvsBalance;
        }

        if (actualAmount < minReleaseAmount) {
            return;
        }

        releaseStartBlock = getBlockNumber();

        IXVS(getXVSAddress()).transfer(vaiVaultAddress, actualAmount);
        emit DistributedVAIVaultVenus(actualAmount);

        IVAIVault(vaiVaultAddress).updatePendingRewards();
    }

    /**
     * @notice Return the address of the XVS token
     * @return The address of XVS
     */
    function getXVSAddress() public pure returns (address) {
        return 0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63;
    }
}
