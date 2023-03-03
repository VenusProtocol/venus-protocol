pragma solidity ^0.5.16;

import "../Oracle/PriceOracle.sol";
import "../Tokens/VTokens/VToken.sol";
import "../Utils/ErrorReporter.sol";
import "../Tokens/XVS/XVS.sol";
import "../Tokens/VAI/VAI.sol";
import "../Governance/IAccessControlManager.sol";

contract RewardFacet is  ComptrollerErrorReporter, ExponentialNoError {
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
        return claimVenus(holder, allMarkets);
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
        claimVenus(holders, allMarkets, true, true, true);
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
        ensureAdminOr(comptrollerImplementation);
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
    function actionPaused(address market, Action action) public view returns (bool) {
        return _actionPaused[market][uint(action)];
    }

    /*** VAI functions ***/

    /**
     * @notice Transfer XVS to VAI Vault
     */
    function releaseToVault() public {
        if (releaseStartBlock == 0 || getBlockNumber() < releaseStartBlock) {
            return;
        }

        XVS xvs = XVS(getXVSAddress());

        uint256 xvsBalance = xvs.balanceOf(address(this));
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

        s.releaseStartBlock = getBlockNumber();

        xvs.transfer(vaiVaultAddress, actualAmount);
        emit DistributedVAIVaultVenus(actualAmount);

        IVAIVault(vaiVaultAddress).updatePendingRewards();
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
            ensureListed(markets[address(vToken)]);
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
            (, , uint shortfall) = getHypotheticalAccountLiquidityInternal(holder, VToken(0), 0, 0);
            venusAccrued[holder] = grantXVSInternal(holder, venusAccrued[holder], shortfall, collateral);
        }
    }

}
    