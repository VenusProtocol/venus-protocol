pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import "../Tokens/VTokens/VBep20.sol";
import { VToken } from "../Tokens/VTokens/VToken.sol";
import { ExponentialNoError } from "../Utils/ExponentialNoError.sol";
import "../Utils/ErrorReporter.sol";
import "../Comptroller/ComptrollerInterface.sol";
import "../Comptroller/ComptrollerLensInterface.sol";
import "../Tokens/VAI/VAIControllerInterface.sol";

/**
 * @title ComptrollerLens Contract
 * @author Venus
 * @notice The ComptrollerLens contract has functions to get the number of tokens that
 * can be seized through liquidation, hypothetical account liquidity and shortfall of an account.
 */
contract ComptrollerLens is ComptrollerLensInterface, ComptrollerErrorReporter, ExponentialNoError {
    /**
     * @dev Local vars for avoiding stack-depth limits in calculating account liquidity.
     *  Note that `vTokenBalance` is the number of vTokens the account owns in the market,
     *  whereas `borrowBalance` is the amount of underlying that the account has borrowed.
     */
    struct AccountLiquidityLocalVars {
        // Total collateral value supplied by the account (USD, scaled by 1e18)
        uint256 totalCollateral;
        // Collateral value weighted by each asset's liquidation threshold (USD, scaled by 1e18)
        uint256 weightedCollateral;
        // Total borrowed value by the account (USD, scaled by 1e18)
        uint256 borrows;
        // Additional effects on liquidity (unit depends on context, typically USD)
        uint256 effects;
        // Balance of vTokens held by the account (vTokens)
        uint256 vTokenBalance;
        // Outstanding borrow balance for the account (underlying asset units)
        uint256 borrowBalance;
        // Exchange rate between vToken and underlying asset (scaled by 1e18)
        uint256 exchangeRateMantissa;
        // Price of the underlying asset from the oracle (USD, scaled by 1e18)
        uint256 oraclePriceMantissa;
        // Amount of excess collateral available for borrowing (USD, scaled by 1e18)
        uint256 liquidity;
        // Amount by which the account is undercollateralized (USD, scaled by 1e18)
        uint256 shortfall;
        // Average liquidation threshold across all supplied assets (scaled by 1e18)
        uint256 liquidationThresholdAvg;
        // Health factor of the account, used to assess liquidation risk (scaled by 1e18)
        uint256 healthFactor;
    }

    /**
     * @notice Computes the number of collateral tokens to be seized in a liquidation event
     * @param borrower Address of the borrower
     * @param comptroller Address of comptroller
     * @param vTokenBorrowed Address of the borrowed vToken
     * @param vTokenCollateral Address of collateral for the borrow
     * @param actualRepayAmount Repayment amount i.e amount to be repaid of total borrowed amount
     * @return A tuple of error code, and tokens to seize
     */
    function liquidateCalculateSeizeTokens(
        address borrower,
        address comptroller,
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256) {
        /* Read oracle prices for borrowed and collateral markets */
        uint256 priceBorrowedMantissa = ComptrollerInterface(comptroller).oracle().getUnderlyingPrice(vTokenBorrowed);
        uint256 priceCollateralMantissa = ComptrollerInterface(comptroller).oracle().getUnderlyingPrice(
            vTokenCollateral
        );
        if (priceBorrowedMantissa == 0 || priceCollateralMantissa == 0) {
            return (uint256(Error.PRICE_ERROR), 0);
        }

        /*
         * Get the exchange rate and calculate the number of collateral tokens to seize:
         *  seizeAmount = actualRepayAmount * liquidationIncentive * priceBorrowed / priceCollateral
         *  seizeTokens = seizeAmount / exchangeRate
         *   = actualRepayAmount * (liquidationIncentive * priceBorrowed) / (priceCollateral * exchangeRate)
         */
        uint256 exchangeRateMantissa = VToken(vTokenCollateral).exchangeRateStored();
        uint256 liquidationIncentiveMantissa = ComptrollerInterface(comptroller).getDynamicLiquidationIncentive(
            borrower,
            vTokenCollateral
        );

        uint256 seizeTokens = ComptrollerInterface(comptroller).liquidationManager().calculateSeizeTokens(
            actualRepayAmount,
            liquidationIncentiveMantissa,
            priceBorrowedMantissa,
            priceCollateralMantissa,
            exchangeRateMantissa
        );

        return (uint(Error.NO_ERROR), seizeTokens);
    }

    /**
     * @notice Computes the number of VAI tokens to be seized in a liquidation event
     * @param borrower Address of the borrower
     * @param comptroller Address of comptroller
     * @param vTokenCollateral Address of collateral for vToken
     * @param actualRepayAmount Repayment amount i.e amount to be repaid of the total borrowed amount
     * @return A tuple of error code, and tokens to seize
     */
    function liquidateVAICalculateSeizeTokens(
        address borrower,
        address comptroller,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256) {
        /* Read oracle prices for borrowed and collateral markets */
        uint256 priceBorrowedMantissa = 1e18; // Note: this is VAI
        uint256 priceCollateralMantissa = ComptrollerInterface(comptroller).oracle().getUnderlyingPrice(
            vTokenCollateral
        );
        if (priceCollateralMantissa == 0) {
            return (uint256(Error.PRICE_ERROR), 0);
        }

        /*
         * Get the exchange rate and calculate the number of collateral tokens to seize:
         *  seizeAmount = actualRepayAmount * liquidationIncentive * priceBorrowed / priceCollateral
         *  seizeTokens = seizeAmount / exchangeRate
         *   = actualRepayAmount * (liquidationIncentive * priceBorrowed) / (priceCollateral * exchangeRate)
         */
        uint256 exchangeRateMantissa = VToken(vTokenCollateral).exchangeRateStored(); // Note: reverts on error
        uint256 liquidationIncentiveMantissa = ComptrollerInterface(comptroller).getDynamicLiquidationIncentive(
            borrower,
            vTokenCollateral
        );

        uint256 seizeTokens = ComptrollerInterface(comptroller).liquidationManager().calculateSeizeTokens(
            actualRepayAmount,
            liquidationIncentiveMantissa,
            priceBorrowedMantissa,
            priceCollateralMantissa,
            exchangeRateMantissa
        );

        return (uint256(Error.NO_ERROR), seizeTokens);
    }

    /**
     * @notice Computes the hypothetical liquidity and shortfall of an account given a hypothetical borrow
     *      A snapshot of the account is taken and the total borrow amount of the account is calculated
     * @param comptroller Address of comptroller
     * @param account Address of the account to be queried
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param redeemTokens Number of vTokens being redeemed
     * @param borrowAmount Amount borrowed
     * @return Returns a tuple of error code, liquidity, and shortfall
     */
    function getHypotheticalAccountLiquidity(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount
    ) external view returns (uint256, uint256, uint256) {
        (uint256 errorCode, AccountLiquidityLocalVars memory vars) = _calculateAccountPosition(
            comptroller,
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount
        );

        return (errorCode, vars.liquidity, vars.shortfall);
    }

    /**
     * @notice Computes the hypothetical health snapshot of an account given a hypothetical borrow
     *      A snapshot of the account is taken and the total borrow amount of the account is calculated
     * @param comptroller Address of comptroller
     * @param account Address of the account to be queried
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param redeemTokens Number of vTokens being redeemed
     * @param borrowAmount Amount borrowed
     * @return Returns a tuple of error code, average liquidation threshold, total collateral and health factor.
     */
    function getAccountHealthSnapshot(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount
    ) external view returns (uint256, uint256, uint256, uint256) {
        (uint256 errorCode, AccountLiquidityLocalVars memory vars) = _calculateAccountPosition(
            comptroller,
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount
        );

        return (errorCode, vars.liquidationThresholdAvg, vars.totalCollateral, vars.healthFactor);
    }

    /**
     * @notice Internal function to calculate account position
     * @param comptroller Address of comptroller
     * @param account Address of the account to be queried
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param redeemTokens Number of vTokens being redeemed
     * @param borrowAmount Amount borrowed
     * @return errorCode Returns an error code indicating success or failure
     * @return vars Returns an AccountLiquidityLocalVars struct containing the calculated values
     * @dev This function processes all assets the account is in, calculates their balances, prices,
     *      and computes the total collateral, borrows, and effects of the hypothetical actions.
     *      It also calculates the health factor and average liquidation threshold.
     */
    function _calculateAccountPosition(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount
    ) internal view returns (uint256 errorCode, AccountLiquidityLocalVars memory vars) {
        uint256 oErr;

        // For each asset the account is in
        VToken[] memory assets = ComptrollerInterface(comptroller).getAssetsIn(account);
        uint256 assetsCount = assets.length;
        ResilientOracleInterface oracle = ComptrollerInterface(comptroller).oracle();
        for (uint256 i = 0; i < assetsCount; ++i) {
            VToken asset = assets[i];

            // Read the balances and exchange rate from the vToken
            (oErr, vars.vTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = asset.getAccountSnapshot(
                account
            );
            if (oErr != 0) {
                errorCode = oErr;
                return (errorCode, vars);
            }

            (, , , uint256 liquidationThresholdMantissa, ) = ComptrollerInterface(comptroller).markets(address(asset));

            // Get the normalized price of the asset
            vars.oraclePriceMantissa = oracle.getUnderlyingPrice(address(asset));
            if (vars.oraclePriceMantissa == 0) {
                errorCode = uint256(Error.PRICE_ERROR);
                return (errorCode, vars);
            }

            Exp memory vTokenPrice = mul_(
                Exp({ mantissa: vars.exchangeRateMantissa }),
                Exp({ mantissa: vars.oraclePriceMantissa })
            );
            Exp memory weightedVTokenPrice = mul_(Exp({ mantissa: liquidationThresholdMantissa }), vTokenPrice);

            vars.totalCollateral = mul_ScalarTruncateAddUInt(vTokenPrice, vars.vTokenBalance, vars.totalCollateral);

            vars.liquidationThresholdAvg = mul_ScalarTruncateAddUInt(
                Exp({ mantissa: liquidationThresholdMantissa }),
                mul_(vars.vTokenBalance, vTokenPrice),
                vars.liquidationThresholdAvg
            );

            // weightedCollateral += weightedVTokenPrice * vTokenBalance
            vars.weightedCollateral = mul_ScalarTruncateAddUInt(
                weightedVTokenPrice,
                vars.vTokenBalance,
                vars.weightedCollateral
            );

            // borrows += oraclePrice * borrowBalance
            vars.borrows = mul_ScalarTruncateAddUInt(
                Exp({ mantissa: vars.oraclePriceMantissa }),
                vars.borrowBalance,
                vars.borrows
            );

            if (asset == vTokenModify) {
                // redeem effect: weightedVTokenPrice * redeemTokens
                vars.effects = mul_ScalarTruncateAddUInt(weightedVTokenPrice, redeemTokens, vars.effects);

                // borrow effect: oraclePrice * borrowAmount
                vars.effects = mul_ScalarTruncateAddUInt(
                    Exp({ mantissa: vars.oraclePriceMantissa }),
                    borrowAmount,
                    vars.effects
                );
            }
        }

        VAIControllerInterface vaiController = ComptrollerInterface(comptroller).vaiController();

        if (address(vaiController) != address(0)) {
            vars.effects = add_(vars.effects, vaiController.getVAIRepayAmount(account));
        }

        (vars.healthFactor, vars.liquidationThresholdAvg, vars.liquidity, vars.shortfall) = _finalizeSnapshot(vars);

        errorCode = uint256(Error.NO_ERROR);
    }

    /**
     * @notice Finalizes the snapshot of the account's position
     * @param snapshot The AccountLiquidityLocalVars struct containing the calculated values
     * @return Returns health factor, average liquidation threshold, liquidity and shortfall.
     */
    function _finalizeSnapshot(
        AccountLiquidityLocalVars memory snapshot
    ) internal pure returns (uint256, uint256, uint256, uint256) {
        uint256 healthFactor;
        if (snapshot.totalCollateral > 0) {
            snapshot.liquidationThresholdAvg = div_(snapshot.liquidationThresholdAvg, snapshot.totalCollateral);
        }
        uint256 borrowPlusEffects = snapshot.borrows + snapshot.effects;

        if (borrowPlusEffects > 0) {
            healthFactor = div_(snapshot.weightedCollateral, borrowPlusEffects);
        }

        if (snapshot.weightedCollateral > borrowPlusEffects) {
            snapshot.liquidity = snapshot.weightedCollateral - borrowPlusEffects;
            snapshot.shortfall = 0;
        } else {
            snapshot.liquidity = 0;
            snapshot.shortfall = borrowPlusEffects - snapshot.weightedCollateral;
        }

        return (healthFactor, snapshot.liquidationThresholdAvg, snapshot.liquidity, snapshot.shortfall);
    }
}
