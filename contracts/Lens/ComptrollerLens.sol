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
        uint totalCollateral;
        uint weightedCollateral;
        uint borrows;
        uint effects;
        uint vTokenBalance;
        uint borrowBalance;
        uint exchangeRateMantissa;
        uint oraclePriceMantissa;
        uint liquidity;
        uint shortfall;
        uint256 averageLT; // Average liquidation threshold of all assets in the snapshot
        uint256 healthFactor; // Health factor of the account, calculated as (weightedCollateral / borrows)
        uint256 healthFactorThreshold; // Health factor threshold for liquidation, calculated as (averageLT * (1e18 + LiquidationIncentiveAvg) / 1e18)
        uint256 liquidationIncentiveAvg; // Average liquidation incentive of all assets in the snapshot
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
        uint actualRepayAmount
    ) external view returns (uint, uint) {
        /* Read oracle prices for borrowed and collateral markets */
        uint priceBorrowedMantissa = ComptrollerInterface(comptroller).oracle().getUnderlyingPrice(vTokenBorrowed);
        uint priceCollateralMantissa = ComptrollerInterface(comptroller).oracle().getUnderlyingPrice(vTokenCollateral);
        if (priceBorrowedMantissa == 0 || priceCollateralMantissa == 0) {
            return (uint(Error.PRICE_ERROR), 0);
        }

        /*
         * Get the exchange rate and calculate the number of collateral tokens to seize:
         *  seizeAmount = actualRepayAmount * liquidationIncentive * priceBorrowed / priceCollateral
         *  seizeTokens = seizeAmount / exchangeRate
         *   = actualRepayAmount * (liquidationIncentive * priceBorrowed) / (priceCollateral * exchangeRate)
         */
        uint exchangeRateMantissa = VToken(vTokenCollateral).exchangeRateStored();
        uint liquidationIncentiveMantissa = ComptrollerInterface(comptroller).getDynamicLiquidationIncentive(
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
        uint actualRepayAmount
    ) external view returns (uint, uint) {
        /* Read oracle prices for borrowed and collateral markets */
        uint priceBorrowedMantissa = 1e18; // Note: this is VAI
        uint priceCollateralMantissa = ComptrollerInterface(comptroller).oracle().getUnderlyingPrice(vTokenCollateral);
        if (priceCollateralMantissa == 0) {
            return (uint(Error.PRICE_ERROR), 0);
        }

        /*
         * Get the exchange rate and calculate the number of collateral tokens to seize:
         *  seizeAmount = actualRepayAmount * liquidationIncentive * priceBorrowed / priceCollateral
         *  seizeTokens = seizeAmount / exchangeRate
         *   = actualRepayAmount * (liquidationIncentive * priceBorrowed) / (priceCollateral * exchangeRate)
         */
        uint exchangeRateMantissa = VToken(vTokenCollateral).exchangeRateStored(); // Note: reverts on error
        uint liquidationIncentiveMantissa = ComptrollerInterface(comptroller).getDynamicLiquidationIncentive(
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
        uint redeemTokens,
        uint borrowAmount
    ) external view returns (uint, uint, uint) {
        AccountLiquidityLocalVars memory vars = _calculateAccountPosition(
            comptroller,
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount
        );

        return (uint(Error.NO_ERROR), vars.liquidity, vars.shortfall);
    }

    /**
     * @notice Computes the hypothetical health snapshot of an account given a hypothetical borrow
     *      A snapshot of the account is taken and the total borrow amount of the account is calculated
     * @param comptroller Address of comptroller
     * @param account Address of the account to be queried
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param redeemTokens Number of vTokens being redeemed
     * @param borrowAmount Amount borrowed
     * @return Returns a tuple of error code, average liquidation threshold, total collateral, health factor,
     *          health factor threshold, and average liquidation incentive
     */
    function getAccountHealthSnapshot(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint redeemTokens,
        uint borrowAmount
    ) external view returns (uint, uint, uint, uint, uint, uint) {
        AccountLiquidityLocalVars memory vars = _calculateAccountPosition(
            comptroller,
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount
        );

        return (
            uint(Error.NO_ERROR),
            vars.averageLT,
            vars.totalCollateral,
            vars.healthFactor,
            vars.healthFactorThreshold,
            vars.liquidationIncentiveAvg
        );
    }

    /**
     * @notice Internal function to calculate account position
     * @param comptroller Address of comptroller
     * @param account Address of the account to be queried
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param redeemTokens Number of vTokens being redeemed
     * @param borrowAmount Amount borrowed
     * @return vars Returns an AccountLiquidityLocalVars struct containing the calculated values
     * @dev This function processes all assets the account is in, calculates their balances, prices,
     *      and computes the total collateral, borrows, and effects of the hypothetical actions.
     *      It also calculates the health factor, average liquidation threshold, and liquidation incentive.
     */
    function _calculateAccountPosition(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint redeemTokens,
        uint borrowAmount
    ) internal view returns (AccountLiquidityLocalVars memory vars) {
        uint oErr;

        // For each asset the account is in
        VToken[] memory assets = ComptrollerInterface(comptroller).getAssetsIn(account);
        uint assetsCount = assets.length;
        for (uint i = 0; i < assetsCount; ++i) {
            VToken asset = assets[i];

            // Read the balances and exchange rate from the vToken
            (oErr, vars.vTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = asset.getAccountSnapshot(
                account
            );
            if (oErr != 0) {
                // semi-opaque error code, we assume NO_ERROR == 0 is invariant between upgrades
                return vars;
            }

            (
                ,
                uint collateralFactorMantissa,
                ,
                uint liquidationThresholdMantissa,
                uint liquidationIncentiveMantissa
            ) = ComptrollerInterface(comptroller).markets(address(asset));
            vars.liquidationIncentiveAvg = add_(vars.liquidationIncentiveAvg, liquidationIncentiveMantissa);

            // Get the normalized price of the asset
            vars.oraclePriceMantissa = ComptrollerInterface(comptroller).oracle().getUnderlyingPrice(address(asset));
            if (vars.oraclePriceMantissa == 0) {
                return vars;
            }

            Exp memory vTokenPrice = mul_(
                Exp({ mantissa: vars.exchangeRateMantissa }),
                Exp({ mantissa: vars.oraclePriceMantissa })
            );
            Exp memory weightedVTokenPrice = mul_(Exp({ mantissa: liquidationThresholdMantissa }), vTokenPrice);

            vars.totalCollateral = mul_ScalarTruncateAddUInt(vTokenPrice, vars.vTokenBalance, vars.totalCollateral);

            vars.averageLT = mul_ScalarTruncateAddUInt(
                Exp({ mantissa: liquidationThresholdMantissa }),
                mul_(vars.vTokenBalance, vTokenPrice),
                vars.averageLT
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

        (
            vars.healthFactor,
            vars.healthFactorThreshold,
            vars.averageLT,
            vars.liquidity,
            vars.shortfall
        ) = _finalizeSnapshot(vars);

        if (assetsCount > 0) {
            vars.liquidationIncentiveAvg = div_(vars.liquidationIncentiveAvg, assetsCount);
        }
    }

    /**
     * @notice Finalizes the snapshot of the account's position
     * @param snapshot The AccountLiquidityLocalVars struct containing the calculated values
     * @return Returns health factor, health factor threshold, average liquidation threshold,
     *          liquidity, shortfall, and average liquidation incentive
     */
    function _finalizeSnapshot(
        AccountLiquidityLocalVars memory snapshot
    ) internal pure returns (uint, uint, uint, uint, uint) {
        uint healthFactor;
        uint healthFactorThreshold;
        if (snapshot.totalCollateral > 0) {
            snapshot.averageLT = div_(snapshot.averageLT, snapshot.totalCollateral);
        }
        uint borrowPlusEffects = snapshot.borrows + snapshot.effects;

        if (borrowPlusEffects > 0) {
            healthFactor = div_(snapshot.weightedCollateral, borrowPlusEffects);
        }
        healthFactorThreshold = div_(snapshot.averageLT * (1e18 + snapshot.liquidationIncentiveAvg), 1e18);

        if (snapshot.weightedCollateral > borrowPlusEffects) {
            snapshot.liquidity = snapshot.weightedCollateral - borrowPlusEffects;
            snapshot.shortfall = 0;
        } else {
            snapshot.liquidity = 0;
            snapshot.shortfall = borrowPlusEffects - snapshot.weightedCollateral;
        }

        return (healthFactor, healthFactorThreshold, snapshot.averageLT, snapshot.liquidity, snapshot.shortfall);
    }
}
