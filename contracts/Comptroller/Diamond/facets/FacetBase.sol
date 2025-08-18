// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";

import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { ComptrollerErrorReporter } from "../../../Utils/ErrorReporter.sol";
import { ExponentialNoError } from "../../../Utils/ExponentialNoError.sol";
import { IVAIVault, Action } from "../../../Comptroller/ComptrollerInterface.sol";
import { ComptrollerV17Storage } from "../../../Comptroller/ComptrollerStorage.sol";
import { IFacetBase } from "../interfaces/IFacetBase.sol";

/**
 * @title FacetBase
 * @author Venus
 * @notice This facet contract contains functions related to access and checks
 */
contract FacetBase is IFacetBase, ComptrollerV17Storage, ExponentialNoError, ComptrollerErrorReporter {
    using SafeERC20 for IERC20;

    /// @notice The initial Venus index for a market
    uint224 public constant venusInitialIndex = 1e36;
    // closeFactorMantissa must be strictly greater than this value
    uint256 internal constant closeFactorMinMantissa = 0.05e18; // 0.05
    // closeFactorMantissa must not exceed this value
    uint256 internal constant closeFactorMaxMantissa = 0.9e18; // 0.9
    // poolId for core Pool
    uint96 internal constant corePoolId = 0;
    /// @notice Flag to indicate collateral factors should be used for weighting
    bool internal constant useCollateralFactor = true;
    /// @notice Flag to indicate liquidation thresholds should be used for weighting
    bool internal constant useLiquidationThreshold = false;

    /// @notice Emitted when an account enters a market
    event MarketEntered(VToken indexed vToken, address indexed account);

    /// @notice Emitted when XVS is distributed to VAI Vault
    event DistributedVAIVaultVenus(uint256 amount);

    /// @notice Reverts if the protocol is paused
    function checkProtocolPauseState() internal view {
        require(!protocolPaused, "protocol is paused");
    }

    /// @notice Reverts if a certain action is paused on a market
    function checkActionPauseState(address market, Action action) internal view {
        require(!actionPaused(market, action), "action is paused");
    }

    /// @notice Reverts if the caller is not admin
    function ensureAdmin() internal view {
        require(msg.sender == admin, "only admin can");
    }

    /// @notice Checks the passed address is nonzero
    function ensureNonzeroAddress(address someone) internal pure {
        require(someone != address(0), "can't be zero address");
    }

    /// @notice Reverts if the market is not listed
    function ensureListed(Market storage market) internal view {
        require(market.isListed, "market not listed");
    }

    /// @notice Reverts if the caller is neither admin nor the passed address
    function ensureAdminOr(address privilegedAddress) internal view {
        require(msg.sender == admin || msg.sender == privilegedAddress, "access denied");
    }

    /// @notice Checks the caller is allowed to call the specified fuction
    function ensureAllowed(string memory functionSig) internal view {
        require(IAccessControlManagerV8(accessControl).isAllowedToCall(msg.sender, functionSig), "access denied");
    }

    /**
     * @notice Checks if a certain action is paused on a market
     * @param action Action id
     * @param market vToken address
     */
    function actionPaused(address market, Action action) public view returns (bool) {
        return _actionPaused[market][uint256(action)];
    }

    /**
     * @notice Get the latest block number
     */
    function getBlockNumber() internal view virtual returns (uint256) {
        return block.number;
    }

    /**
     * @notice Get the latest block number with the safe32 check
     */
    function getBlockNumberAsUint32() internal view returns (uint32) {
        return safe32(getBlockNumber(), "block # > 32 bits");
    }

    /**
     * @notice Transfer XVS to VAI Vault
     */
    function releaseToVault() internal {
        if (releaseStartBlock == 0 || getBlockNumber() < releaseStartBlock) {
            return;
        }

        IERC20 xvs_ = IERC20(xvs);

        uint256 xvsBalance = xvs_.balanceOf(address(this));
        if (xvsBalance == 0) {
            return;
        }

        uint256 actualAmount;
        uint256 deltaBlocks = sub_(getBlockNumber(), releaseStartBlock);
        // releaseAmount = venusVAIVaultRate * deltaBlocks
        uint256 releaseAmount_ = mul_(venusVAIVaultRate, deltaBlocks);

        if (xvsBalance >= releaseAmount_) {
            actualAmount = releaseAmount_;
        } else {
            actualAmount = xvsBalance;
        }

        if (actualAmount < minReleaseAmount) {
            return;
        }

        releaseStartBlock = getBlockNumber();

        xvs_.safeTransfer(vaiVaultAddress, actualAmount);
        emit DistributedVAIVaultVenus(actualAmount);

        IVAIVault(vaiVaultAddress).updatePendingRewards();
    }

    /**
     * @notice Determine what the account liquidity would be if the given amounts were redeemed/borrowed
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @param useCollateralFactor If true, uses collateral factors for asset weighting;
     *                            if false, uses liquidation thresholds instead.
     * @dev Note that we calculate the exchangeRateStored for each collateral vToken using stored data,
     *  without calculating accumulated interest.
     * @return (possible error code,
                hypothetical account liquidity in excess of collateral requirements,
     *          hypothetical account shortfall below collateral requirements)
     */
    function getHypotheticalAccountLiquidityInternal(
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount,
        bool useCollateralFactor
    ) internal view returns (Error, uint256, uint256) {
        (uint256 err, uint256 liquidity, uint256 shortfall) = comptrollerLens.getHypotheticalAccountLiquidity(
            address(this),
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount,
            useCollateralFactor
        );
        return (Error(err), liquidity, shortfall);
    }

    /**
     * @notice Add the market to the borrower's "assets in" for liquidity calculations
     * @param vToken The market to enter
     * @param borrower The address of the account to modify
     * @return Success indicator for whether the market was entered
     */
    function addToMarketInternal(VToken vToken, address borrower) internal returns (Error) {
        checkActionPauseState(address(vToken), Action.ENTER_MARKET);
        Market storage marketToJoin = _poolMarkets[getCorePoolMarketIndex(address(vToken))];
        ensureListed(marketToJoin);
        if (marketToJoin.accountMembership[borrower]) {
            // already joined
            return Error.NO_ERROR;
        }
        // survived the gauntlet, add to list
        // NOTE: we store these somewhat redundantly as a significant optimization
        //  this avoids having to iterate through the list for the most common use cases
        //  that is, only when we need to perform liquidity checks
        //  and not whenever we want to check if an account is in a particular market
        marketToJoin.accountMembership[borrower] = true;
        accountAssets[borrower].push(vToken);

        emit MarketEntered(vToken, borrower);

        return Error.NO_ERROR;
    }

    /**
     * @notice Checks for the user is allowed to redeem tokens
     * @param vToken Address of the market
     * @param redeemer Address of the user
     * @param redeemTokens Amount of tokens to redeem
     * @return Success indicator for redeem is allowed or not
     */
    function redeemAllowedInternal(
        address vToken,
        address redeemer,
        uint256 redeemTokens
    ) internal view returns (uint256) {
        ensureListed(_poolMarkets[getCorePoolMarketIndex(vToken)]);
        /* If the redeemer is not 'in' the market, then we can bypass the liquidity check */
        if (!_poolMarkets[getCorePoolMarketIndex(vToken)].accountMembership[redeemer]) {
            return uint256(Error.NO_ERROR);
        }
        /* Otherwise, perform a hypothetical liquidity check to guard against shortfall */
        (Error err, , uint256 shortfall) = getHypotheticalAccountLiquidityInternal(
            redeemer,
            VToken(vToken),
            redeemTokens,
            0,
            useCollateralFactor
        );
        if (err != Error.NO_ERROR) {
            return uint256(err);
        }
        if (shortfall != 0) {
            return uint256(Error.INSUFFICIENT_LIQUIDITY);
        }
        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Returns the XVS address
     * @return The address of XVS token
     */
    function getXVSAddress() external view returns (address) {
        return xvs;
    }

    /**
     * @notice Get the core pool collateral factor for a vToken
     * @param vToken The address of the vToken to get the collateral factor for
     * @return The collateral factor for the vToken, scaled by 1e18
     */
    function getCollateralFactor(address vToken) external view returns (uint256) {
        (uint256 cf, , ) = getLiquidationParams(corePoolId, vToken);
        return cf;
    }

    /**
     * @notice Get the core pool liquidation threshold for a vToken
     * @param vToken The address of the vToken to get the liquidation threshold for
     * @return The liquidation threshold for the vToken, scaled by 1e18
     */
    function getLiquidationThreshold(address vToken) external view returns (uint256) {
        (, uint256 lt, ) = getLiquidationParams(corePoolId, vToken);
        return lt;
    }

    /**
     * @notice Get the liquidation Incentive for a vToken
     * @param vToken The address of the vToken whose liquidation Incentive is being queried.
     * @return The liquidation Incentive for the vToken, scaled by 1e18
     */
    function getLiquidationIncentive(address vToken) external view returns (uint256) {
        (, , uint256 li) = getLiquidationParams(corePoolId, vToken);
        return li;
    }

    /**
     * @notice Returns the effective loan-to-value factor (collateral factor or liquidation threshold) for a given account and market.
     * @dev This value should be used when calculating account liquidity and during liquidation checks.
     * @param account The account whose pool is used to determine the market's risk parameters.
     * @param vToken The address of the vToken market.
     * @param useCollateralFactor If true, returns the collateral factor; if false, returns the liquidation threshold.
     * @return factor The effective loan-to-value factor, scaled by 1e18.
     */
    function getEffectiveLtvFactor(
        address account,
        address vToken,
        bool useCollateralFactor
    ) external view returns (uint256) {
        (uint256 cf, uint256 lt, ) = getLiquidationParams(userPoolId[account], vToken);
        if (useCollateralFactor) return cf;
        else return lt;
    }

    /**
     * @notice Get the Effective liquidation Incentive for a vToken
     * @dev This value should be used when calculating account liquidity and during liquidation checks.
     * @param account The address of the account for which to fetch the liquidation Incentive.
     * @param vToken The address of the vToken whose liquidation Incentive is being queried.
     * @return The liquidation Incentive for the vToken, scaled by 1e18
     */
    function getEffectiveLiquidationIncentive(address account, address vToken) external view returns (uint256) {
        (, , uint256 li) = getLiquidationParams(userPoolId[account], vToken);
        return li;
    }

    /**
     * @notice Returns the full list of vTokens for a given pool ID.
     * @param poolId The ID of the pool whose vTokens are being queried.
     * @return An array of vToken addresses associated with the pool.
     */
    function getPoolVTokens(uint96 poolId) external view returns (address[] memory) {
        return pools[poolId].vTokens;
    }

    /**
     * @notice Returns the market index for a given vToken
     * @dev Computes a unique key for a (poolId, market) pair used in the `_poolMarkets` mapping.
     * - For the core pool (`poolId == 0`), this results in the address being left-padded to 32 bytes,
     *   maintaining backward compatibility with legacy mappings.
     * - For other pools, packs the `poolId` and `market` address into a single `bytes32` key,
     *   The first 96 bits are used for the `poolId`, and the remaining 160 bits for the `market` address.
     * @param poolId The ID of the pool.
     * @param vToken The address of the market (vToken).
     * @return A `bytes32` key that uniquely represents the (poolId, market) pair.
     */
    function getPoolMarketIndex(uint96 poolId, address vToken) public pure returns (bytes32) {
        return bytes32((uint256(poolId) << 160) | uint160(vToken));
    }

    /**
     * @dev Returns the market index for a given vToken in the Core Pool (poolId = 0)
     * @param vToken The address of the vToken
     * @return The bytes32 key used to index into the _poolMarkets mapping for the Core Pool
     */
    function getCorePoolMarketIndex(address vToken) internal pure returns (bytes32) {
        return getPoolMarketIndex(corePoolId, vToken);
    }

    /**
     * @notice Determine the current account liquidity wrt collateral requirements
     * @param account The account get liquidity for
     * @param useCollateralFactor If true, uses collateral factors for weighting assets;
     *                            if false, uses liquidation thresholds instead.
     * @return (possible error code (semi-opaque),
     * account liquidity in excess of collateral requirements,
     * account shortfall below collateral requirements)
     */
    function _getAccountLiquidity(
        address account,
        bool useCollateralFactor
    ) internal view returns (uint256, uint256, uint256) {
        (Error err, uint256 liquidity, uint256 shortfall) = getHypotheticalAccountLiquidityInternal(
            account,
            VToken(address(0)),
            0,
            0,
            useCollateralFactor
        );

        return (uint256(err), liquidity, shortfall);
    }

    /**
     * @notice Returns only the core risk parameters (CF, LI, LT) for a vToken in a specific pool.
     * @dev If not configured in the given pool, falls back to core pool (poolId = 0).
     * @return collateralFactorMantissa The max borrowable percentage of collateral, in mantissa.
     * @return liquidationThresholdMantissa The threshold at which liquidation is triggered, in mantissa.
     * @return maxLiquidationIncentiveMantissa The max liquidation incentive allowed for this market, in mantissa.
     */
    function getLiquidationParams(
        uint96 poolId,
        address vToken
    )
        internal
        view
        returns (
            uint256 collateralFactorMantissa,
            uint256 liquidationThresholdMantissa,
            uint256 maxLiquidationIncentiveMantissa
        )
    {
        bytes32 coreKey = getPoolMarketIndex(corePoolId, vToken);
        bytes32 poolKey = getPoolMarketIndex(poolId, vToken);

        Market storage market;

        if (poolId == 0) {
            market = _poolMarkets[coreKey];
        } else {
            Market storage poolMarket = _poolMarkets[poolKey];

            if (poolMarket.isListed) {
                market = poolMarket;
            } else {
                market = _poolMarkets[coreKey];
            }
        }

        return (
            market.collateralFactorMantissa,
            market.liquidationThresholdMantissa,
            market.liquidationIncentiveMantissa
        );
    }
}
