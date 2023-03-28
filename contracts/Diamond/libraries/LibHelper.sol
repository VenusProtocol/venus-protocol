pragma solidity 0.8.13;
import "../../Tokens/V0.8.13/VTokens/VToken.sol";
import "./appStorage.sol";
import "./LibAccessCheck.sol";
import "../../Utils/V0.8.13/ErrorReporter.sol";
import "./LibExponentialNoError.sol";

import "../../Utils/V0.8.13/ExponentialNoError.sol";

library LibHelper {
    /// @notice The initial Venus index for a market
    uint224 public constant venusInitialIndex = 1e36;
    // closeFactorMantissa must be strictly greater than this value
    uint internal constant closeFactorMinMantissa = 0.05e18; // 0.05
    // closeFactorMantissa must not exceed this value
    uint internal constant closeFactorMaxMantissa = 0.9e18; // 0.9
    // No collateralFactorMantissa may exceed this value
    uint internal constant collateralFactorMaxMantissa = 0.9e18; // 0.9

    /**
     * @notice Determine what the account liquidity would be if the given amounts were redeemed/borrowed
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @dev Note that we calculate the exchangeRateStored for each collateral vToken using stored data,
     *  without calculating accumulated interest.
     * @return (possible error code,
                hypothetical account liquidity in excess of collateral requirements,
     *          hypothetical account shortfall below collateral requirements)
     */
    function getHypotheticalAccountLiquidityInternal(
        address account,
        VToken vTokenModify,
        uint redeemTokens,
        uint borrowAmount
    ) internal view returns (ComptrollerErrorReporter.Error, uint, uint) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        (uint err, uint liquidity, uint shortfall) = s.comptrollerLens.getHypotheticalAccountLiquidity(
            address(this),
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount
        );
        return (ComptrollerErrorReporter.Error(err), liquidity, shortfall);
    }

    /**
     * @notice Add the market to the borrower's "assets in" for liquidity calculations
     * @param vToken The market to enter
     * @param borrower The address of the account to modify
     * @return Success indicator for whether the market was entered
     */
    function addToMarketInternal(VToken vToken, address borrower) internal returns (ComptrollerErrorReporter.Error) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        LibAccessCheck.checkActionPauseState(address(vToken), LibAccessCheck.Action.ENTER_MARKET);
        Market storage marketToJoin = s.markets[address(vToken)];
        LibAccessCheck.ensureListed(marketToJoin);
        if (marketToJoin.accountMembership[borrower]) {
            // already joined
            return ComptrollerErrorReporter.Error.NO_ERROR;
        }
        // survived the gauntlet, add to list
        // NOTE: we store these somewhat redundantly as a significant optimization
        //  this avoids having to iterate through the list for the most common use cases
        //  that is, only when we need to perform liquidity checks
        //  and not whenever we want to check if an account is in a particular market
        marketToJoin.accountMembership[borrower] = true;
        s.accountAssets[borrower].push(vToken);
        // emit MarketEntered(vToken, borrower);
        return ComptrollerErrorReporter.Error.NO_ERROR;
    }

    function redeemAllowedInternal(address vToken, address redeemer, uint redeemTokens) internal view returns (uint) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        LibAccessCheck.ensureListed(s.markets[vToken]);
        /* If the redeemer is not 'in' the market, then we can bypass the liquidity check */
        if (!s.markets[vToken].accountMembership[redeemer]) {
            return uint(ComptrollerErrorReporter.Error.NO_ERROR);
        }
        /* Otherwise, perform a hypothetical liquidity check to guard against shortfall */
        (ComptrollerErrorReporter.Error err, , uint shortfall) = getHypotheticalAccountLiquidityInternal(
            redeemer,
            VToken(vToken),
            redeemTokens,
            0
        );
        if (err != ComptrollerErrorReporter.Error.NO_ERROR) {
            return uint(err);
        }
        if (shortfall != 0) {
            return uint(ComptrollerErrorReporter.Error.INSUFFICIENT_LIQUIDITY);
        }
        return uint(ComptrollerErrorReporter.Error.NO_ERROR);
    }
}
