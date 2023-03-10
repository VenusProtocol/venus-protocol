pragma solidity 0.8.13;

import "../../Oracle/PriceOracle.sol";
import "../../Tokens/VTokens/VToken.sol";
import "../../Utils/ErrorReporter.sol";
import "../../Tokens/XVS/XVS.sol";
import "../../Tokens/VAI/VAI.sol";
import "../libraries/LibAccessCheck.sol";
import "../libraries/LibHelper.sol";
import "../libraries/appStorage.sol";
import "../../Governance/IAccessControlManager.sol";

contract RewardFacet is ComptrollerErrorReporter, ExponentialNoError {
    AppStorage internal s;
    /// @notice Emitted when Venus is granted by admin
    event VenusGranted(address recipient, uint amount);

    /// @notice Emitted when XVS is distributed to VAI Vault
    event DistributedVAIVaultVenus(uint amount);

    /**
     * @notice Claim all the xvs accrued by holder in all markets and VAI
     * @param holder The address to claim XVS for
     */
    function claimVenus(address holder) public {
        return claimVenus(holder, s.allMarkets);
    }

    /**
     * @notice Claim all the xvs accrued by holder in the specified markets
     * @param holder The address to claim XVS for
     * @param vTokens The list of markets to claim XVS in
     */
    function claimVenus(address holder, VToken[] memory vTokens) public {
        address[] memory holders = new address[](1);
        holders[0] = holder;
        claimVenus(holders, vTokens, true, true);
    }

    /**
     * @notice Claim all xvs accrued by the holders
     * @param holders The addresses to claim XVS for
     * @param vTokens The list of markets to claim XVS in
     * @param borrowers Whether or not to claim XVS earned by borrowing
     * @param suppliers Whether or not to claim XVS earned by supplying
     */
    function claimVenus(address[] memory holders, VToken[] memory vTokens, bool borrowers, bool suppliers) public {
        claimVenus(holders, vTokens, borrowers, suppliers, false);
    }

    /**
     * @notice Claim all the xvs accrued by holder in all markets, a shorthand for `claimVenus` with collateral set to `true`
     * @param holder The address to claim XVS for
     */
    function claimVenusAsCollateral(address holder) external {
        address[] memory holders = new address[](1);
        holders[0] = holder;
        claimVenus(holders, s.allMarkets, true, true, true);
    }

    /**
     * @notice Transfer XVS to the user with user's shortfall considered
     * @dev Note: If there is not enough XVS, we do not perform the transfer all.
     * @param user The address of the user to transfer XVS to
     * @param amount The amount of XVS to (possibly) transfer
     * @param shortfall The shortfall of the user
     * @param collateral Whether or not we will use user's venus reward as collateral to pay off the debt
     * @return The amount of XVS which was NOT transferred to the user
     */
    function grantXVSInternal(address user, uint amount, uint shortfall, bool collateral) internal returns (uint) {
        // If the user is blacklisted, they can't get XVS rewards
        require(
            user != 0xEF044206Db68E40520BfA82D45419d498b4bc7Bf &&
                user != 0x7589dD3355DAE848FDbF75044A3495351655cB1A &&
                user != 0x33df7a7F6D44307E1e5F3B15975b47515e5524c0 &&
                user != 0x24e77E5b74B30b026E9996e4bc3329c881e24968,
            "Blacklisted"
        );

        XVS xvs = XVS(getXVSAddress());

        if (amount == 0 || amount > xvs.balanceOf(address(this))) {
            return amount;
        }

        if (shortfall == 0) {
            xvs.transfer(user, amount);
            return 0;
        }
        // If user's bankrupt and doesn't use pending xvs as collateral, don't grant
        // anything, otherwise, we will transfer the pending xvs as collateral to
        // vXVS token and mint vXVS for the user.
        //
        // If mintBehalf failed, don't grant any xvs
        require(collateral, "bankrupt accounts can only collateralize their pending xvs rewards");

        xvs.approve(getXVSVTokenAddress(), amount);
        require(
            VBep20Interface(getXVSVTokenAddress()).mintBehalf(user, amount) == uint(Error.NO_ERROR),
            "mint behalf error during collateralize xvs"
        );

        // set venusAccrue[user] to 0
        return 0;
    }

    /*** Venus Distribution Admin ***/

    /**
     * @notice Transfer XVS to the recipient
     * @dev Note: If there is not enough XVS, we do not perform the transfer all.
     * @param recipient The address of the recipient to transfer XVS to
     * @param amount The amount of XVS to (possibly) transfer
     */
    function _grantXVS(address recipient, uint amount) external {
        LibAccessCheck.ensureAdminOr(s.comptrollerImplementation);
        uint amountLeft = grantXVSInternal(recipient, amount, 0, false);
        require(amountLeft == 0, "insufficient xvs for grant");
        emit VenusGranted(recipient, amount);
    }

    function getBlockNumber() public view returns (uint) {
        return block.number;
    }

    /**
     * @notice Return the address of the XVS token
     * @return The address of XVS
     */
    function getXVSAddress() public view returns (address) {
        return 0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63;
    }

    /**
     * @notice Return the address of the XVS vToken
     * @return The address of XVS vToken
     */
    function getXVSVTokenAddress() public view returns (address) {
        return 0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D;
    }

    /**
     * @notice Checks if a certain action is paused on a market
     * @param action Action id
     * @param market vToken address
     */
    function actionPaused(address market, LibAccessCheck.Action action) public view returns (bool) {
        return s._actionPaused[market][uint(action)];
    }

    /*** VAI functions ***/

    /**
     * @notice Transfer XVS to VAI Vault
     */
    function releaseToVault() public {
        if (s.releaseStartBlock == 0 || getBlockNumber() < s.releaseStartBlock) {
            return;
        }

        XVS xvs = XVS(getXVSAddress());

        uint256 xvsBalance = xvs.balanceOf(address(this));
        if (xvsBalance == 0) {
            return;
        }

        uint256 actualAmount;
        uint256 deltaBlocks = sub_(getBlockNumber(), s.releaseStartBlock);
        // releaseAmount = venusVAIVaultRate * deltaBlocks
        uint256 _releaseAmount = mul_(s.venusVAIVaultRate, deltaBlocks);

        if (xvsBalance >= _releaseAmount) {
            actualAmount = _releaseAmount;
        } else {
            actualAmount = xvsBalance;
        }

        if (actualAmount < s.minReleaseAmount) {
            return;
        }

        s.releaseStartBlock = getBlockNumber();

        xvs.transfer(s.vaiVaultAddress, actualAmount);
        emit DistributedVAIVaultVenus(actualAmount);

        IVAIVault(s.vaiVaultAddress).updatePendingRewards();
    }

    /**
     * @notice Claim all xvs accrued by the holders
     * @param holders The addresses to claim XVS for
     * @param vTokens The list of markets to claim XVS in
     * @param borrowers Whether or not to claim XVS earned by borrowing
     * @param suppliers Whether or not to claim XVS earned by supplying
     * @param collateral Whether or not to use XVS earned as collateral, only takes effect when the holder has a shortfall
     */
    function claimVenus(
        address[] memory holders,
        VToken[] memory vTokens,
        bool borrowers,
        bool suppliers,
        bool collateral
    ) public {
        uint j;
        uint256 holdersLength = holders.length;
        for (uint i; i < vTokens.length; ++i) {
            VToken vToken = vTokens[i];
            LibAccessCheck.ensureListed(s.markets[address(vToken)]);
            if (borrowers) {
                Exp memory borrowIndex = Exp({ mantissa: vToken.borrowIndex() });
                updateVenusBorrowIndex(address(vToken), borrowIndex);
                for (j = 0; j < holdersLength; ++j) {
                    distributeBorrowerVenus(address(vToken), holders[j], borrowIndex);
                }
            }
            if (suppliers) {
                updateVenusSupplyIndex(address(vToken));
                for (j = 0; j < holdersLength; ++j) {
                    distributeSupplierVenus(address(vToken), holders[j]);
                }
            }
        }

        for (j = 0; j < holdersLength; ++j) {
            address holder = holders[j];
            // If there is a positive shortfall, the XVS reward is accrued,
            // but won't be granted to this holder
            (, , uint shortfall) = LibHelper.getHypotheticalAccountLiquidityInternal(holder, VToken(address(0)), 0, 0);
            s.venusAccrued[holder] = grantXVSInternal(holder, s.venusAccrued[holder], shortfall, collateral);
        }
    }

       /**
     * @notice Accrue XVS to the market by updating the borrow index
     * @param vToken The market whose borrow index to update
     */
    function updateVenusBorrowIndex(address vToken, ExponentialNoError.Exp memory marketBorrowIndex) internal {
        VenusMarketState storage borrowState = s.venusBorrowState[vToken];
        uint borrowSpeed = s.venusBorrowSpeeds[vToken];
        uint32 blockNumber = safe32(
            LibAccessCheck.getBlockNumber(),
            "block number exceeds 32 bits"
        );
        uint deltaBlocks = sub_(uint(blockNumber), uint(borrowState.block));
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint borrowAmount = div_(VToken(vToken).totalBorrows(), marketBorrowIndex);
            uint venusAccrued = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount > 0
                ? fraction(venusAccrued, borrowAmount)
                : Double({ mantissa: 0 });
            borrowState.index = safe224(
                    add_(Double({ mantissa: borrowState.index }), ratio)
                    .mantissa,
                "new index exceeds 224 bits"
            );
            borrowState.block = blockNumber;
        } else if (deltaBlocks > 0) {
            borrowState.block = blockNumber;
        }
    }

     /**
     * @notice Accrue XVS to the market by updating the supply index
     * @param vToken The market whose supply index to update
     */
    function updateVenusSupplyIndex(address vToken) internal {
        VenusMarketState storage supplyState = s.venusSupplyState[vToken];
        uint supplySpeed = s.venusSupplySpeeds[vToken];
        uint32 blockNumber = safe32(
            LibAccessCheck.getBlockNumber(),
            "block number exceeds 32 bits"
        );
        uint deltaBlocks = sub_(uint(blockNumber), uint(supplyState.block));
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint supplyTokens = VToken(vToken).totalSupply();
            uint venusAccrued = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens > 0
                ? fraction(venusAccrued, supplyTokens)
                : Double({ mantissa: 0 });
            supplyState.index = safe224(
                    add_(Double({ mantissa: supplyState.index }), ratio)
                    .mantissa,
                "new index exceeds 224 bits"
            );
            supplyState.block = blockNumber;
        } else if (deltaBlocks > 0) {
            supplyState.block = blockNumber;
        }
    }

    /**
     * @notice Calculate XVS accrued by a supplier and possibly transfer it to them
     * @param vToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute XVS to
     */
    function distributeSupplierVenus(address vToken, address supplier) internal {
        if (address(s.vaiVaultAddress) != address(0)) {
            // releaseToVault();
        }
        uint supplyIndex = s.venusSupplyState[vToken].index;
        uint supplierIndex = s.venusSupplierIndex[vToken][supplier];
        // Update supplier's index to the current index since we are distributing accrued XVS
        s.venusSupplierIndex[vToken][supplier] = supplyIndex;
        if (supplierIndex == 0 && supplyIndex >= LibHelper.venusInitialIndex) {
            // Covers the case where users supplied tokens before the market's supply state index was set.
            // Rewards the user with XVS accrued from the start of when supplier rewards were first
            // set for the market.
            supplierIndex = LibHelper.venusInitialIndex;
        }
        // Calculate change in the cumulative sum of the XVS per vToken accrued
        Double memory deltaIndex = Double({
            mantissa: sub_(supplyIndex, supplierIndex)
        });
        // Multiply of supplierTokens and supplierDelta
        uint supplierDelta = mul_(VToken(vToken).balanceOf(supplier), deltaIndex);
        // Addition of supplierAccrued and supplierDelta
        s.venusAccrued[supplier] = add_(s.venusAccrued[supplier], supplierDelta);
        // emit DistributedSupplierVenus(VToken(vToken), supplier, supplierDelta, supplyIndex);
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
        if (address(s.vaiVaultAddress) != address(0)) {
            // releaseToVault();
        }
        uint borrowIndex = s.venusBorrowState[vToken].index;
        uint borrowerIndex = s.venusBorrowerIndex[vToken][borrower];
        // Update borrowers's index to the current index since we are distributing accrued XVS
        s.venusBorrowerIndex[vToken][borrower] = borrowIndex;
        if (borrowerIndex == 0 && borrowIndex >= LibHelper.venusInitialIndex) {
            // Covers the case where users borrowed tokens before the market's borrow state index was set.
            // Rewards the user with XVS accrued from the start of when borrower rewards were first
            // set for the market.
            borrowerIndex = LibHelper.venusInitialIndex;
        }
        // Calculate change in the cumulative sum of the XVS per borrowed unit accrued
        Double memory deltaIndex = Double({
            mantissa: sub_(borrowIndex, borrowerIndex)
        });
        uint borrowerDelta = mul_(
            div_(VToken(vToken).borrowBalanceStored(borrower), marketBorrowIndex),
            deltaIndex
        );
        s.venusAccrued[borrower] = add_(s.venusAccrued[borrower], borrowerDelta);
        // emit DistributedBorrowerVenus(VToken(vToken), borrower, borrowerDelta, borrowIndex);
    }

}
