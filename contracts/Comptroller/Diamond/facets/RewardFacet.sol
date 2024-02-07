// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.5.16;

import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { IRewardFacet } from "../interfaces/IRewardFacet.sol";
import { XVSRewardsHelper } from "./XVSRewardsHelper.sol";
import { SafeBEP20, IBEP20 } from "../../../Utils/SafeBEP20.sol";
import { VBep20Interface } from "../../../Tokens/VTokens/VTokenInterfaces.sol";

/**
 * @title RewardFacet
 * @author Venus
 * @dev This facet contains all the methods related to the reward functionality
 * @notice This facet contract provides the external functions related to all claims and rewards of the protocol
 */
contract RewardFacet is IRewardFacet, XVSRewardsHelper {
    /// @notice Emitted when Venus is granted by admin
    event VenusGranted(address indexed recipient, uint256 amount);

    using SafeBEP20 for IBEP20;

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
     * @dev Note: If there is not enough XVS, we do not perform the transfer all
     * @param user The address of the user to transfer XVS to
     * @param amount The amount of XVS to (possibly) transfer
     * @param shortfall The shortfall of the user
     * @param collateral Whether or not we will use user's venus reward as collateral to pay off the debt
     * @return The amount of XVS which was NOT transferred to the user
     */
    function grantXVSInternal(
        address user,
        uint256 amount,
        uint256 shortfall,
        bool collateral
    ) internal returns (uint256) {
        // If the user is blacklisted, they can't get XVS rewards
        require(
            user != 0xEF044206Db68E40520BfA82D45419d498b4bc7Bf &&
                user != 0x7589dD3355DAE848FDbF75044A3495351655cB1A &&
                user != 0x33df7a7F6D44307E1e5F3B15975b47515e5524c0 &&
                user != 0x24e77E5b74B30b026E9996e4bc3329c881e24968,
            "Blacklisted"
        );

        if (amount == 0 || amount > IBEP20(getXVSAddress()).balanceOf(address(this))) {
            return amount;
        }

        if (shortfall == 0) {
            IBEP20(getXVSAddress()).safeTransfer(user, amount);
            return 0;
        }
        // If user's bankrupt and doesn't use pending xvs as collateral, don't grant
        // anything, otherwise, we will transfer the pending xvs as collateral to
        // vXVS token and mint vXVS for the user
        //
        // If mintBehalf failed, don't grant any xvs
        require(collateral, "bankrupt");

        IBEP20(getXVSAddress()).safeApprove(getXVSVTokenAddress(), 0);
        IBEP20(getXVSAddress()).safeApprove(getXVSVTokenAddress(), amount);
        require(
            VBep20Interface(getXVSVTokenAddress()).mintBehalf(user, amount) == uint256(Error.NO_ERROR),
            "mint behalf error"
        );

        // set venusAccrued[user] to 0
        return 0;
    }

    /*** Venus Distribution Admin ***/

    /**
     * @notice Transfer XVS to the recipient
     * @dev Allows the contract admin to transfer XVS to any recipient based on the recipient's shortfall
     *      Note: If there is not enough XVS, we do not perform the transfer all
     * @param recipient The address of the recipient to transfer XVS to
     * @param amount The amount of XVS to (possibly) transfer
     */
    function _grantXVS(address recipient, uint256 amount) external {
        ensureAdmin();
        uint256 amountLeft = grantXVSInternal(recipient, amount, 0, false);
        require(amountLeft == 0, "no xvs");
        emit VenusGranted(recipient, amount);
    }

    /**
     * @notice Return the address of the XVS vToken
     * @return The address of XVS vToken
     */
    function getXVSVTokenAddress() public pure returns (address) {
        return 0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D;
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
        uint256 j;
        uint256 holdersLength = holders.length;
        uint256 vTokensLength = vTokens.length;
        for (uint256 i; i < vTokensLength; ++i) {
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
            (, , uint256 shortfall) = getHypotheticalAccountLiquidityInternal(holder, VToken(address(0)), 0, 0);

            uint256 value = venusAccrued[holder];
            venusAccrued[holder] = 0;

            uint256 returnAmount = grantXVSInternal(holder, value, shortfall, collateral);

            // returnAmount can only be positive if balance of xvsAddress is less than grant amount(venusAccrued[holder])
            if (returnAmount != 0) {
                venusAccrued[holder] = returnAmount;
            }
        }
    }
}
