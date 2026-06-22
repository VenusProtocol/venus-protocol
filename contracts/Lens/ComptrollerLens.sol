// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { VToken } from "../Tokens/VTokens/VToken.sol";
import { ExponentialNoError } from "../Utils/ExponentialNoError.sol";
import { ComptrollerErrorReporter } from "../Utils/ErrorReporter.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";
import { ComptrollerInterface } from "../Comptroller/ComptrollerInterface.sol";
import { ComptrollerLensInterface } from "../Comptroller/ComptrollerLensInterface.sol";
import { VAIControllerInterface } from "../Tokens/VAI/VAIControllerInterface.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";
import { WeightFunction } from "../Comptroller/Diamond/interfaces/IFacetBase.sol";

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
        uint sumCollateral;
        uint sumBorrowPlusEffects;
        uint vTokenBalance;
        uint borrowBalance;
        uint exchangeRateMantissa;
        uint oraclePriceMantissa;
        Exp weightedFactor;
        Exp exchangeRate;
        Exp tokensToDenom;
        Exp collateralPrice;
        Exp debtPrice;
        IDeviationBoundedOracle boundedOracle;
        ResilientOracleInterface spotOracle;
    }

    /**
     * @notice Computes the number of collateral tokens to be seized in a liquidation event
     * @dev This will be used only in vBNB
     * @param comptroller Address of comptroller
     * @param vTokenBorrowed Address of the borrowed vToken
     * @param vTokenCollateral Address of collateral for the borrow
     * @param actualRepayAmount Repayment amount i.e amount to be repaid of total borrowed amount
     * @return A tuple of error code, and tokens to seize
     */
    function liquidateCalculateSeizeTokens(
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
        uint exchangeRateMantissa = VToken(vTokenCollateral).exchangeRateStored(); // Note: reverts on error
        uint liquidationIncentiveMantissa = ComptrollerInterface(comptroller).getLiquidationIncentive(vTokenCollateral);

        uint seizeTokens = _calculateSeizeTokens(
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
     * @param borrower Address of borrower whose collateral is being seized
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
        uint exchangeRateMantissa = VToken(vTokenCollateral).exchangeRateStored(); // Note: reverts on error
        uint liquidationIncentiveMantissa = ComptrollerInterface(comptroller).getEffectiveLiquidationIncentive(
            borrower,
            vTokenCollateral
        );

        uint seizeTokens = _calculateSeizeTokens(
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
     * @return A tuple of error code, and tokens to seize
     */
    function liquidateVAICalculateSeizeTokens(
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
        uint liquidationIncentiveMantissa = ComptrollerInterface(comptroller).getLiquidationIncentive(vTokenCollateral);
        uint seizeTokens = _calculateSeizeTokens(
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
     * @param account Address of the borrowed vToken
     * @param vTokenModify Address of collateral for vToken
     * @param redeemTokens Number of vTokens being redeemed
     * @param borrowAmount Amount borrowed
     * @param weightingStrategy The weighting strategy to use:
     *                          - `WeightFunction.USE_COLLATERAL_FACTOR` to use collateral factor
     *                          - `WeightFunction.USE_LIQUIDATION_THRESHOLD` to use liquidation threshold
     * @return Returns a tuple of error code, liquidity, and shortfall
     */
    function getHypotheticalAccountLiquidity(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint redeemTokens,
        uint borrowAmount,
        WeightFunction weightingStrategy
    ) external view returns (uint, uint, uint) {
        (uint errorCode, AccountLiquidityLocalVars memory vars) = _calculateAccountPosition(
            comptroller,
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount,
            weightingStrategy
        );
        if (errorCode != 0) {
            return (errorCode, 0, 0);
        }

        // These are safe, as the underflow condition is checked first
        if (vars.sumCollateral > vars.sumBorrowPlusEffects) {
            return (uint(Error.NO_ERROR), vars.sumCollateral - vars.sumBorrowPlusEffects, 0);
        } else {
            return (uint(Error.NO_ERROR), 0, vars.sumBorrowPlusEffects - vars.sumCollateral);
        }
    }

    /**
     * @notice Computes an account's aggregate weighted-collateral and total-borrow values,
     *         optionally applying hypothetical redeem/borrow effects on a single market.
     * @dev Pricing differs by weighting strategy:
     *      - USE_COLLATERAL_FACTOR: collateral is valued at `DeviationBoundedOracle.getBoundedCollateralPriceView`,
     *        borrows at `getBoundedDebtPriceView`.
     *      - USE_LIQUIDATION_THRESHOLD: both collateral and borrows use the spot oracle price.
     *      VAI borrows (from `vaiController.getVAIRepayAmount`) are added to `sumBorrowPlusEffects` after
     *      the per-asset loop, regardless of weighting strategy.
     * @param comptroller Address of the comptroller whose markets and oracle are used
     * @param account Address of the account whose position is being computed
     * @param vTokenModify Market to apply hypothetical effects on; pass `VToken(address(0))` for none
     * @param redeemTokens Number of vTokens hypothetically redeemed from `vTokenModify`
     * @param borrowAmount Amount of underlying hypothetically borrowed from `vTokenModify`
     * @param weightingStrategy USE_COLLATERAL_FACTOR for borrow/entry checks; USE_LIQUIDATION_THRESHOLD for liquidation checks
     * @return oErr 0 on success, or a non-zero `Error` code (SNAPSHOT_ERROR or PRICE_ERROR) on failure
     * @return vars Accumulated position data; `sumCollateral` and `sumBorrowPlusEffects` are the primary outputs
     */
    function _calculateAccountPosition(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint redeemTokens,
        uint borrowAmount,
        WeightFunction weightingStrategy
    ) internal view returns (uint oErr, AccountLiquidityLocalVars memory vars) {
        // For each asset the account is in
        VToken[] memory assets = ComptrollerInterface(comptroller).getAssetsIn(account);
        uint assetsCount = assets.length;
        if (weightingStrategy == WeightFunction.USE_COLLATERAL_FACTOR) {
            vars.boundedOracle = ComptrollerInterface(comptroller).deviationBoundedOracle();
        } else {
            vars.spotOracle = ComptrollerInterface(comptroller).oracle();
        }
        for (uint i = 0; i < assetsCount; ++i) {
            VToken asset = assets[i];

            // Read the balances and exchange rate from the vToken
            (oErr, vars.vTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = asset.getAccountSnapshot(
                account
            );
            if (oErr != 0) {
                // semi-opaque error code, we assume NO_ERROR == 0 is invariant between upgrades
                return (uint(Error.SNAPSHOT_ERROR), vars);
            }

            vars.weightedFactor = Exp({
                mantissa: ComptrollerInterface(comptroller).getEffectiveLtvFactor(
                    account,
                    address(asset),
                    weightingStrategy
                )
            });
            vars.exchangeRate = Exp({ mantissa: vars.exchangeRateMantissa });

            // Skip entered markets where the account has neither supply nor debt and which are
            // not the market being modified
            if (asset != vTokenModify && vars.vTokenBalance == 0 && vars.borrowBalance == 0) {
                continue;
            }

            // Determine bounded prices for CF path
            if (weightingStrategy == WeightFunction.USE_COLLATERAL_FACTOR) {
                (uint256 collateralPriceMantissa, uint256 debtPriceMantissa) = vars.boundedOracle.getBoundedPricesView(
                    address(asset)
                );
                if (collateralPriceMantissa == 0 || debtPriceMantissa == 0) {
                    return (uint(Error.PRICE_ERROR), vars);
                }
                vars.collateralPrice = Exp({ mantissa: collateralPriceMantissa });
                vars.debtPrice = Exp({ mantissa: debtPriceMantissa });
            } else {
                // LT path — always spot
                vars.oraclePriceMantissa = vars.spotOracle.getUnderlyingPrice(address(asset));
                if (vars.oraclePriceMantissa == 0) {
                    return (uint(Error.PRICE_ERROR), vars);
                }
                vars.collateralPrice = Exp({ mantissa: vars.oraclePriceMantissa });
                vars.debtPrice = Exp({ mantissa: vars.oraclePriceMantissa });
            }

            // Pre-compute a conversion factor from tokens -> bnb (normalized price value)
            vars.tokensToDenom = mul_(mul_(vars.weightedFactor, vars.exchangeRate), vars.collateralPrice);

            // sumCollateral += tokensToDenom * vTokenBalance
            vars.sumCollateral = mul_ScalarTruncateAddUInt(vars.tokensToDenom, vars.vTokenBalance, vars.sumCollateral);

            // sumBorrowPlusEffects += debtPrice * borrowBalance
            vars.sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(
                vars.debtPrice,
                vars.borrowBalance,
                vars.sumBorrowPlusEffects
            );

            // Calculate effects of interacting with vTokenModify
            if (asset == vTokenModify) {
                // redeem effect — uses collateral-bounded tokensToDenom
                vars.sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(
                    vars.tokensToDenom,
                    redeemTokens,
                    vars.sumBorrowPlusEffects
                );

                // borrow effect — uses debt-bounded price
                vars.sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(
                    vars.debtPrice,
                    borrowAmount,
                    vars.sumBorrowPlusEffects
                );
            }
        }

        VAIControllerInterface vaiController = ComptrollerInterface(comptroller).vaiController();

        if (address(vaiController) != address(0)) {
            vars.sumBorrowPlusEffects = add_(vars.sumBorrowPlusEffects, vaiController.getVAIRepayAmount(account));
        }
        oErr = uint(Error.NO_ERROR);
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
        uint actualRepayAmount,
        uint liquidationIncentiveMantissa,
        uint priceBorrowedMantissa,
        uint priceCollateralMantissa,
        uint exchangeRateMantissa
    ) internal pure returns (uint seizeTokens) {
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
