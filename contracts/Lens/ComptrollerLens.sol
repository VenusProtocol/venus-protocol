pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../Tokens/VTokens/VBep20.sol";
import { VToken } from "../Tokens/VTokens/VToken.sol";
import { ExponentialNoError } from "../Utils/ExponentialNoError.sol";
import "../Tokens/EIP20Interface.sol";
import "../Oracle/PriceOracle.sol";
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
        uint sumCollateral; // weighted collateral
        uint sumBorrowPlusEffects;
        uint vTokenBalance;
        uint borrowBalance;
        uint exchangeRateMantissa;
        uint oraclePriceMantissa;
        Exp collateralFactor;
        Exp exchangeRate;
        Exp oraclePrice;
        Exp tokensToDenom;
        Exp liquidationThreshold;
        uint256 totalCollateral; // total Collateral of user
        uint256 averageLT; // Average liquidation threshold of all assets in the snapshot
        uint256 healthFactor; // Health factor of the account, calculated as (weightedCollateral / borrows)
        uint256 healthFactorThreshold; // Health factor threshold for liquidation, calculated as (averageLT * (1e18 + LiquidationIncentiveAvg) / 1e18)
        uint256 liquidationIncentiveAvg; // Average liquidation incentive of all assets in the snapshot
    }

    /**
     * @notice Computes the number of collateral tokens to be seized in a liquidation event
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
        uint priceBorrowedMantissa = ComptrollerInterface(comptroller).oracle().getUnderlyingPrice(
            VToken(vTokenBorrowed)
        );
        uint priceCollateralMantissa = ComptrollerInterface(comptroller).oracle().getUnderlyingPrice(
            VToken(vTokenCollateral)
        );
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
        uint seizeTokens;
        Exp memory numerator;
        Exp memory denominator;
        Exp memory ratio;

        numerator = mul_(
            Exp({ mantissa: ComptrollerInterface(comptroller).liquidationIncentiveMantissa() }),
            Exp({ mantissa: priceBorrowedMantissa })
        );
        denominator = mul_(Exp({ mantissa: priceCollateralMantissa }), Exp({ mantissa: exchangeRateMantissa }));
        ratio = div_(numerator, denominator);

        seizeTokens = mul_ScalarTruncate(ratio, actualRepayAmount);

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
        uint priceCollateralMantissa = ComptrollerInterface(comptroller).oracle().getUnderlyingPrice(
            VToken(vTokenCollateral)
        );
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
        uint seizeTokens;
        Exp memory numerator;
        Exp memory denominator;
        Exp memory ratio;

        numerator = mul_(
            Exp({ mantissa: ComptrollerInterface(comptroller).liquidationIncentiveMantissa() }),
            Exp({ mantissa: priceBorrowedMantissa })
        );
        denominator = mul_(Exp({ mantissa: priceCollateralMantissa }), Exp({ mantissa: exchangeRateMantissa }));
        ratio = div_(numerator, denominator);

        seizeTokens = mul_ScalarTruncate(ratio, actualRepayAmount);

        return (uint(Error.NO_ERROR), seizeTokens);
    }


    /**
     * @dev Internal function to compute base liquidity metrics
          */
    function _computeLiquidityValues(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint redeemTokens,
        uint borrowAmount,
        bool useLiquidationThreshold
    ) internal view returns (AccountLiquidityLocalVars memory vars, uint error) {
        VToken[] memory assets = ComptrollerInterface(comptroller).getAssetsIn(account);

        for (uint i = 0; i < assets.length; i++) {
            VToken asset = assets[i];
            uint oErr;
            (oErr, vars.vTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = asset.getAccountSnapshot(
                account
            );
            if (oErr != 0) {
                return (vars, uint(Error.SNAPSHOT_ERROR));
            }

            // Set the appropriate factor
            if (useLiquidationThreshold) {
                vars.liquidationThreshold = Exp({
                    mantissa: ComptrollerInterface(comptroller).marketLiquidationThreshold(address(asset))
                });
            } else {
                (, uint collateralFactorMantissa) = ComptrollerInterface(comptroller).markets(address(asset));
                vars.collateralFactor = Exp({ mantissa: collateralFactorMantissa });
            }

            vars.exchangeRate = Exp({ mantissa: vars.exchangeRateMantissa });
            vars.oraclePriceMantissa = ComptrollerInterface(comptroller).oracle().getUnderlyingPrice(asset);
            if (vars.oraclePriceMantissa == 0) {
                return (vars, uint(Error.PRICE_ERROR));
            }
            vars.oraclePrice = Exp({ mantissa: vars.oraclePriceMantissa });

            // Calculate tokensToDenom
            Exp memory factorToUse = useLiquidationThreshold ? vars.liquidationThreshold : vars.collateralFactor;
            vars.tokensToDenom = mul_(mul_(factorToUse, vars.exchangeRate), vars.oraclePrice);

            // sumCollateral += tokensToDenom * vTokenBalance
            vars.sumCollateral = mul_ScalarTruncateAddUInt(vars.tokensToDenom, vars.vTokenBalance, vars.sumCollateral);

            // sumBorrowPlusEffects += oraclePrice * borrowBalance
            vars.sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(
                vars.oraclePrice,
                vars.borrowBalance,
                vars.sumBorrowPlusEffects
            );

            // For health factor calculations
            if (useLiquidationThreshold) {
                vars.totalCollateral = mul_ScalarTruncateAddUInt(
                    mul_(vars.oraclePrice, vars.exchangeRate),
                    vars.vTokenBalance,
                    vars.totalCollateral
                );
            }

            // Handle vTokenModify effects
            if (asset == vTokenModify) {
                vars.sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(
                    vars.tokensToDenom,
                    redeemTokens,
                    vars.sumBorrowPlusEffects
                );
                vars.sumBorrowPlusEffects = mul_ScalarTruncateAddUInt(
                    vars.oraclePrice,
                    borrowAmount,
                    vars.sumBorrowPlusEffects
                );
            }
        }

        return (vars, uint(Error.NO_ERROR));
    }

    /**
     * @notice Computes the hypothetical liquidity and shortfall of an account given a hypothetical borrow
     *      A snapshot of the account is taken and the total borrow amount of the account is calculated
     * @param comptroller Address of comptroller
     * @param account Address of the borrowed vToken
     * @param vTokenModify Address of collateral for vToken
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
        (AccountLiquidityLocalVars memory vars, uint err) = _computeLiquidityValues(
            comptroller,
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount,
            false // Uses collateralFactor
        );

        if (err != uint(Error.NO_ERROR)) {
            return (err, 0, 0);
        }

        // Handle VAI debt
        VAIControllerInterface vaiController = ComptrollerInterface(comptroller).vaiController();
        if (address(vaiController) != address(0)) {
            vars.sumBorrowPlusEffects = add_(vars.sumBorrowPlusEffects, vaiController.getVAIRepayAmount(account));
        }

        if (vars.sumCollateral > vars.sumBorrowPlusEffects) {
            return (uint(Error.NO_ERROR), vars.sumCollateral - vars.sumBorrowPlusEffects, 0);
        } else {
            return (uint(Error.NO_ERROR), 0, vars.sumBorrowPlusEffects - vars.sumCollateral);
        }
    }

    /**
     * @notice Computes extended liquidity with health factors (uses liquidationThreshold)
     */
    function getHypotheticalLiquidity(
        address comptroller,
        address account,
        VToken vTokenModify,
        uint redeemTokens,
        uint borrowAmount
    ) external view returns (uint, uint, uint, uint, uint, uint, uint) {
        (AccountLiquidityLocalVars memory vars, uint err) = _computeLiquidityValues(
            comptroller,
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount,
            true // Uses liquidationThreshold
        );
        return _formatHypotheticalLiquidityResult(comptroller, account, vars, err);
    }

    function _formatHypotheticalLiquidityResult(
        address comptroller,
        address account,
        AccountLiquidityLocalVars memory vars,
        uint err
    ) internal view returns (uint, uint, uint, uint, uint, uint, uint) {
        if (err != uint(Error.NO_ERROR)) {
            return (err, 0, 0, 0, 0, 0, 0);
        }

        // Calculate health factors
        if (vars.totalCollateral > 0) {
            vars.averageLT = div_(vars.sumCollateral, vars.totalCollateral);
        }
        if (vars.sumBorrowPlusEffects > 0) {
            vars.healthFactor = div_(vars.sumCollateral, vars.sumBorrowPlusEffects);
        }
        vars.healthFactorThreshold = div_(mul_(vars.averageLT, add_(1e18, vars.liquidationIncentiveAvg)), 1e18);

        // Handle VAI debt
        VAIControllerInterface vaiController = ComptrollerInterface(comptroller).vaiController();
        if (address(vaiController) != address(0)) {
            vars.sumBorrowPlusEffects = add_(vars.sumBorrowPlusEffects, vaiController.getVAIRepayAmount(account));
        }

        if (vars.sumCollateral > vars.sumBorrowPlusEffects) {
            return (
                uint(Error.NO_ERROR),
                vars.sumCollateral - vars.sumBorrowPlusEffects,
                0,
                vars.averageLT,
                vars.healthFactor,
                vars.healthFactorThreshold,
                vars.liquidationIncentiveAvg,

            );
        } else {
            return (
                uint(Error.NO_ERROR),
                0,
                vars.sumBorrowPlusEffects - vars.sumCollateral,
                vars.averageLT,
                vars.healthFactor,
                vars.healthFactorThreshold,
                vars.liquidationIncentiveAvg
            );
        }
    }
}
