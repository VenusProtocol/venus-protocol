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
    struct AccountSnapshotLocal {
        uint256 assetsCount;
        // Balance of vTokens held by the account (vTokens)
        uint256 vTokenBalance;
        // Outstanding borrow balance for the account (underlying asset units)
        uint256 borrowBalance;
        // Exchange rate between vToken and underlying asset (scaled by 1e18)
        uint256 exchangeRateMantissa;
        // Price of the underlying asset from the oracle (USD, scaled by 1e18)
        uint256 oraclePriceMantissa;
        // Error code for operations
        uint256 err;
    }

    /**
     * @notice Computes the number of collateral tokens to be seized in a liquidation event
     * @param comptroller Address of comptroller
     * @param borrower The address of the borrower to be liquidated
     * @param vTokenBorrowed Address of the borrowed vToken
     * @param vTokenCollateral Address of collateral for the borrow
     * @param actualRepayAmount Repayment amount i.e amount to be repaid of total borrowed amount
     * @return A tuple of error code, and tokens to seize
     */
    function liquidateCalculateSeizeTokens(
        address comptroller,
        address borrower,
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
        uint256 seizeTokens = _calculateSeizeTokens(
            actualRepayAmount,
            liquidationIncentiveMantissa,
            priceBorrowedMantissa,
            priceCollateralMantissa,
            exchangeRateMantissa
        );
        return (uint(Error.NO_ERROR), seizeTokens);
    }

    /**
     * @notice Computes the number of collateral tokens to be seized in a liquidation event
     * @param comptroller Address of comptroller
     * @param vTokenBorrowed Address of the borrowed vToken
     * @param vTokenCollateral Address of collateral for the borrow
     * @param actualRepayAmount Repayment amount i.e amount to be repaid of total borrowed amount
     * @param liquidationIncentiveMantissa The liquidation incentive, scaled by 1e18
     * @return A tuple of error code, and tokens to seize
     */
    function liquidateCalculateSeizeTokens(
        address comptroller,
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount,
        uint256 liquidationIncentiveMantissa
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

        uint256 seizeTokens = _calculateSeizeTokens(
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
     * @param comptroller Address of comptroller
     * @param vTokenCollateral Address of collateral for vToken
     * @param actualRepayAmount Repayment amount i.e amount to be repaid of the total borrowed amount
     * @param liquidationIncentiveMantissa The liquidation incentive, scaled by 1e18
     * @return A tuple of error code, and tokens to seize
     */
    function liquidateVAICalculateSeizeTokens(
        address comptroller,
        address vTokenCollateral,
        uint256 actualRepayAmount,
        uint256 liquidationIncentiveMantissa
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

        uint256 seizeTokens = _calculateSeizeTokens(
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
        (uint256 errorCode, AccountSnapshot memory snapshot) = _calculateAccountPosition(
            comptroller,
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount,
            ComptrollerInterface(comptroller).getCollateralFactor
        );

        return (errorCode, snapshot.liquidity, snapshot.shortfall);
    }

    /**
     * @notice Computes the hypothetical health snapshot of an account given a hypothetical borrow
     *      A snapshot of the account is taken and the total borrow amount of the account is calculated
     * @param comptroller Address of comptroller
     * @param account Address of the account to be queried
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param redeemTokens Number of vTokens being redeemed
     * @param borrowAmount Amount borrowed
     * @return Returns AccountSnapshot struct containing the account's position
     */
    function getAccountHealthSnapshot(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount
    ) external view returns (uint256, AccountSnapshot memory) {
        (uint256 errorCode, AccountSnapshot memory snapshot) = _calculateAccountPosition(
            comptroller,
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount,
            ComptrollerInterface(comptroller).getLiquidationThreshold
        );

        return (errorCode, snapshot);
    }

    /**
     * @notice Internal function to calculate account position
     * @param comptroller Address of comptroller
     * @param account Address of the account to be queried
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param redeemTokens Number of vTokens being redeemed
     * @param borrowAmount Amount borrowed
     * @param weight Function to get the collateral factor or liquidation threshold for a vToken
     * @return errorCode Returns an error code indicating success or failure
     * @return snapshot Returns an AccountSnapshot struct containing the calculated values
     * @dev This function processes all assets the account is in, calculates their balances, prices,
     *      and computes the total collateral, borrows, and effects of the hypothetical actions.
     *      It also calculates the health factor and average liquidation threshold.
     */
    function _calculateAccountPosition(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount,
        function(address) external view returns (uint256) weight
    ) internal view returns (uint256 errorCode, AccountSnapshot memory snapshot) {
        AccountSnapshotLocal memory vars;

        // For each asset the account is in
        VToken[] memory assets = ComptrollerInterface(comptroller).getAssetsIn(account);
        vars.assetsCount = assets.length;
        ResilientOracleInterface oracle = ComptrollerInterface(comptroller).oracle();

        for (uint256 i = 0; i < vars.assetsCount; ++i) {
            VToken asset = assets[i];

            // Read the balances and exchange rate from the vToken
            (vars.err, vars.vTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = asset.getAccountSnapshot(
                account
            );
            if (vars.err != 0) {
                errorCode = vars.err;
                return (errorCode, snapshot);
            }

            // Get the normalized price of the asset
            vars.oraclePriceMantissa = oracle.getUnderlyingPrice(address(asset));
            if (vars.oraclePriceMantissa == 0) {
                errorCode = uint256(Error.PRICE_ERROR);
                return (errorCode, snapshot);
            }

            Exp memory vTokenPrice = mul_(
                Exp({ mantissa: vars.exchangeRateMantissa }),
                Exp({ mantissa: vars.oraclePriceMantissa })
            );

            Exp memory weightedVTokenPrice = mul_(Exp({ mantissa: weight(address(asset)) }), vTokenPrice);

            if (asset == vTokenModify) {
                // redeem effect: reduce the vToken balance
                if (redeemTokens > 0) {
                    vars.vTokenBalance = vars.vTokenBalance - redeemTokens;
                }

                // borrow effect: oraclePrice * borrowAmount
                snapshot.borrows = mul_ScalarTruncateAddUInt(
                    Exp({ mantissa: vars.oraclePriceMantissa }),
                    borrowAmount,
                    snapshot.borrows
                );
            }

            snapshot.totalCollateral = mul_ScalarTruncateAddUInt(
                vTokenPrice,
                vars.vTokenBalance,
                snapshot.totalCollateral
            );

            // weightedCollateral += weightedVTokenPrice * vTokenBalance
            snapshot.weightedCollateral = mul_ScalarTruncateAddUInt(
                weightedVTokenPrice,
                vars.vTokenBalance,
                snapshot.weightedCollateral
            );

            // borrows += oraclePrice * borrowBalance
            snapshot.borrows = mul_ScalarTruncateAddUInt(
                Exp({ mantissa: vars.oraclePriceMantissa }),
                vars.borrowBalance,
                snapshot.borrows
            );
        }

        VAIControllerInterface vaiController = ComptrollerInterface(comptroller).vaiController();

        if (address(vaiController) != address(0)) {
            snapshot.borrows = add_(snapshot.borrows, vaiController.getVAIRepayAmount(account));
        }

        _finalizeSnapshot(snapshot);

        errorCode = uint256(Error.NO_ERROR);
    }

    /**
     * @notice Finalizes the snapshot of the account's position
     * @param snapshot The AccountSnapshot struct containing the calculated values
     */
    function _finalizeSnapshot(AccountSnapshot memory snapshot) internal pure {
        if (snapshot.totalCollateral > 0) {
            snapshot.liquidationThresholdAvg = div_(snapshot.weightedCollateral, snapshot.totalCollateral);
        }

        if (snapshot.borrows > 0) {
            snapshot.healthFactor = div_(snapshot.weightedCollateral, snapshot.borrows);
        } else {
            snapshot.healthFactor = type(uint256).max;
        }

        if (snapshot.weightedCollateral > snapshot.borrows) {
            snapshot.liquidity = snapshot.weightedCollateral - snapshot.borrows;
            snapshot.shortfall = 0;
        } else {
            snapshot.liquidity = 0;
            snapshot.shortfall = snapshot.borrows - snapshot.weightedCollateral;
        }
    }

    /**
     * @notice Calculate the number of tokens to seize during liquidation
     * @param actualRepayAmount The amount of debt being repaid in the liquidation
     * @param liquidationIncentiveMantissa The liquidation incentive, scaled by 1e18
     * @param priceBorrowedMantissa The price of the borrowed asset, scaled by 1e18
     * @param priceCollateralMantissa The price of the collateral asset, scaled by 1e18
     * @param exchangeRateMantissa The exchange rate of the collateral asset, scaled by 1e18
     * @return seizeTokens The number of tokens to seize during liquidation, scaled by 1e18
     */
    function _calculateSeizeTokens(
        uint256 actualRepayAmount,
        uint256 liquidationIncentiveMantissa,
        uint256 priceBorrowedMantissa,
        uint256 priceCollateralMantissa,
        uint256 exchangeRateMantissa
    ) internal pure returns (uint256 seizeTokens) {
        Exp memory numerator = mul_(
            Exp({ mantissa: liquidationIncentiveMantissa }),
            Exp({ mantissa: priceBorrowedMantissa })
        );
        Exp memory denominator = mul_(
            Exp({ mantissa: priceCollateralMantissa }),
            Exp({ mantissa: exchangeRateMantissa })
        );

        seizeTokens = mul_ScalarTruncate(div_(numerator, denominator), actualRepayAmount);
    }
}
