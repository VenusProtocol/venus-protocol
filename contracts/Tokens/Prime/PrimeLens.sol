// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { IPrimeV2 } from "./Interfaces/IPrimeV2.sol";
import { IPrimeLiquidityProvider } from "./Interfaces/IPrimeLiquidityProvider.sol";
import { IVToken } from "./Interfaces/IVToken.sol";
import { Scores } from "./libs/Scores.sol";

/**
 * @title IPrimeV2WithStorage
 * @notice Subset of PrimeV2 state used by the lens. Mirrors the auto-getters exposed by
 *         `PrimeV2StorageV1` plus the TimeManagerV8 / constructor-set values.
 */
interface IPrimeV2WithStorage {
    function alphaNumerator() external view returns (uint128);

    function alphaDenominator() external view returns (uint128);

    function oracle() external view returns (ResilientOracleInterface);

    function primeLiquidityProvider() external view returns (address);

    function xvsVaultRewardToken() external view returns (address);

    function blocksOrSecondsPerYear() external view returns (uint256);

    function xvsBalanceOfUser(address user) external view returns (uint256);

    function markets(
        address market
    )
        external
        view
        returns (
            uint256 supplyMultiplier,
            uint256 borrowMultiplier,
            uint256 rewardIndex,
            uint256 sumOfMembersScore,
            bool exists
        );

    function interests(
        address market,
        address user
    ) external view returns (uint256 accrued, uint256 score, uint256 rewardIndex, uint256 lifetimeAccrued);

    function vTokenForAsset(address underlying) external view returns (address);

    function NATIVE_MARKET() external view returns (address);

    function WRAPPED_NATIVE_TOKEN() external view returns (address);
}

/**
 * @title PrimeLens
 * @author Venus
 * @notice Off-chain helper for computing per-user APR figures against a deployed PrimeV2.
 * @dev Stateless view-only contract. All state is read from PrimeV2's public mappings.
 *      Lives in a separate deployment to keep PrimeV2 implementation under the 24,576-byte
 *      EVM contract-size limit.
 */
contract PrimeLens {
    uint256 private constant EXP_SCALE = 1e18;
    uint256 private constant MAXIMUM_BPS = 1e4;

    /// @notice PrimeV2 contract this lens reads from
    IPrimeV2WithStorage public immutable primeV2;

    error InvalidAddress();

    constructor(address primeV2_) {
        if (primeV2_ == address(0)) revert InvalidAddress();
        primeV2 = IPrimeV2WithStorage(primeV2_);
    }

    /**
     * @notice Returns supply and borrow APR for the user in a given market based on current state
     * @param market The market for which to fetch the APR
     * @param user The account for which to get the APR
     * @return aprInfo APR information for the user for the given market
     */
    function calculateAPR(address market, address user) external view returns (IPrimeV2.APRInfo memory aprInfo) {
        IVToken vToken = IVToken(market);
        uint256 borrow = vToken.borrowBalanceStored(user);
        uint256 exchangeRate = vToken.exchangeRateStored();
        uint256 balanceOfAccount = vToken.balanceOf(user);
        uint256 supply = (exchangeRate * balanceOfAccount) / EXP_SCALE;

        (, , , uint256 sumOfMembersScore, ) = primeV2.markets(market);
        (, uint256 userScore, , ) = primeV2.interests(market, user);

        aprInfo.userScore = userScore;
        aprInfo.totalScore = sumOfMembersScore;
        aprInfo.xvsBalanceForScore = primeV2.xvsBalanceOfUser(user);

        IPrimeV2.Capital memory capital = _capitalForScore(aprInfo.xvsBalanceForScore, borrow, supply, market);

        aprInfo.capital = capital.capital;
        aprInfo.cappedSupply = capital.cappedSupply;
        aprInfo.cappedBorrow = capital.cappedBorrow;
        aprInfo.supplyCapUSD = capital.supplyCapUSD;
        aprInfo.borrowCapUSD = capital.borrowCapUSD;

        (aprInfo.supplyAPR, aprInfo.borrowAPR) = _calculateUserAPR(
            market,
            supply,
            borrow,
            aprInfo.cappedSupply,
            aprInfo.cappedBorrow,
            aprInfo.userScore,
            aprInfo.totalScore
        );
    }

    /**
     * @notice Returns supply and borrow APR for hypothetical supply, borrow and XVS staked
     * @param market The market for which to fetch the APR
     * @param user The account for which to get the APR
     * @param borrow Hypothetical borrow amount
     * @param supply Hypothetical supply amount
     * @param xvsStaked Hypothetical staked XVS amount
     * @return aprInfo APR information for the user for the given market
     */
    function estimateAPR(
        address market,
        address user,
        uint256 borrow,
        uint256 supply,
        uint256 xvsStaked
    ) external view returns (IPrimeV2.APRInfo memory aprInfo) {
        (, , , uint256 sumOfMembersScore, ) = primeV2.markets(market);
        (, uint256 userScore, , ) = primeV2.interests(market, user);

        aprInfo.totalScore = sumOfMembersScore - userScore;
        aprInfo.xvsBalanceForScore = xvsStaked;

        IPrimeV2.Capital memory capital = _capitalForScore(xvsStaked, borrow, supply, market);

        aprInfo.capital = capital.capital;
        aprInfo.cappedSupply = capital.cappedSupply;
        aprInfo.cappedBorrow = capital.cappedBorrow;
        aprInfo.supplyCapUSD = capital.supplyCapUSD;
        aprInfo.borrowCapUSD = capital.borrowCapUSD;

        uint256 decimals = IERC20MetadataUpgradeable(_getUnderlying(market)).decimals();
        uint256 scaledCapital = aprInfo.capital * (10 ** (18 - decimals));

        aprInfo.userScore = Scores._calculateScore(
            xvsStaked,
            scaledCapital,
            primeV2.alphaNumerator(),
            primeV2.alphaDenominator()
        );

        aprInfo.totalScore = aprInfo.totalScore + aprInfo.userScore;

        (aprInfo.supplyAPR, aprInfo.borrowAPR) = _calculateUserAPR(
            market,
            supply,
            borrow,
            aprInfo.cappedSupply,
            aprInfo.cappedBorrow,
            aprInfo.userScore,
            aprInfo.totalScore
        );
    }

    /**
     * @notice The total income that's going to be distributed in a year to Prime token holders for a market
     * @param vToken The market for which to fetch the total income
     * @return amount The annualized distribution income
     */
    function incomeDistributionYearly(address vToken) public view returns (uint256 amount) {
        uint256 perBlockOrSecond = IPrimeLiquidityProvider(primeV2.primeLiquidityProvider())
            .getEffectiveDistributionSpeed(_getUnderlying(vToken));
        amount = primeV2.blocksOrSecondsPerYear() * perBlockOrSecond;
    }

    function _capitalForScore(
        uint256 xvsBalanceForScore,
        uint256 borrow,
        uint256 supply,
        address market
    ) internal view returns (IPrimeV2.Capital memory capital) {
        (uint256 supplyMultiplier, uint256 borrowMultiplier, , , ) = primeV2.markets(market);

        ResilientOracleInterface oracle = primeV2.oracle();
        uint256 xvsPrice = oracle.getPrice(primeV2.xvsVaultRewardToken());

        capital.borrowCapUSD = (xvsPrice * xvsBalanceForScore * borrowMultiplier) / (EXP_SCALE * EXP_SCALE);
        capital.supplyCapUSD = (xvsPrice * xvsBalanceForScore * supplyMultiplier) / (EXP_SCALE * EXP_SCALE);

        uint256 tokenPrice = oracle.getUnderlyingPrice(market);

        capital.cappedSupply = supply;
        capital.cappedBorrow = borrow;

        if (supply > 0 && tokenPrice > 0) {
            uint256 supplyUSD = (supply * tokenPrice) / EXP_SCALE;
            if (supplyUSD > capital.supplyCapUSD) {
                capital.cappedSupply = (capital.supplyCapUSD * EXP_SCALE) / tokenPrice;
            }
        }

        if (borrow > 0 && tokenPrice > 0) {
            uint256 borrowUSD = (borrow * tokenPrice) / EXP_SCALE;
            if (borrowUSD > capital.borrowCapUSD) {
                capital.cappedBorrow = (capital.borrowCapUSD * EXP_SCALE) / tokenPrice;
            }
        }

        capital.capital = capital.cappedSupply + capital.cappedBorrow;
    }

    function _calculateUserAPR(
        address vToken,
        uint256 totalSupply,
        uint256 totalBorrow,
        uint256 totalCappedSupply,
        uint256 totalCappedBorrow,
        uint256 userScore,
        uint256 totalScore
    ) internal view returns (uint256 supplyAPR, uint256 borrowAPR) {
        if (totalScore == 0) return (0, 0);

        uint256 userYearlyIncome = (userScore * incomeDistributionYearly(vToken)) / totalScore;

        uint256 totalCappedValue = totalCappedSupply + totalCappedBorrow;
        if (totalCappedValue == 0) return (0, 0);

        uint256 userSupplyIncomeYearly = (userYearlyIncome * totalCappedSupply) / totalCappedValue;
        uint256 userBorrowIncomeYearly = (userYearlyIncome * totalCappedBorrow) / totalCappedValue;

        supplyAPR = totalSupply == 0 ? 0 : ((userSupplyIncomeYearly * MAXIMUM_BPS) / totalSupply);
        borrowAPR = totalBorrow == 0 ? 0 : ((userBorrowIncomeYearly * MAXIMUM_BPS) / totalBorrow);
    }

    function _getUnderlying(address vToken) internal view returns (address) {
        if (vToken == primeV2.NATIVE_MARKET()) {
            return primeV2.WRAPPED_NATIVE_TOKEN();
        }
        return IVToken(vToken).underlying();
    }
}
