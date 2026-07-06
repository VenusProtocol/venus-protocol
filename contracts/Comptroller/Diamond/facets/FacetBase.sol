// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IAccessControlManagerV8 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV8.sol";

import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { ComptrollerErrorReporter } from "../../../Utils/ErrorReporter.sol";
import { ExponentialNoError } from "../../../Utils/ExponentialNoError.sol";
import { IVAIVault, Action } from "../../../Comptroller/ComptrollerInterface.sol";
import { ComptrollerV19Storage } from "../../../Comptroller/ComptrollerStorage.sol";
import { IDeviationBoundedOracle } from "@venusprotocol/oracle/contracts/interfaces/IDeviationBoundedOracle.sol";
import { PoolMarketId } from "../../../Comptroller/Types/PoolMarketId.sol";
import { IFacetBase, WeightFunction } from "../interfaces/IFacetBase.sol";

/**
 * @title FacetBase
 * @author Venus
 * @notice This facet contract contains functions related to access and checks
 */
contract FacetBase is IFacetBase, ComptrollerV19Storage, ExponentialNoError, ComptrollerErrorReporter {
    using SafeERC20 for IERC20;

    /// @notice The initial Venus index for a market
    uint224 public constant venusInitialIndex = 1e36;
    // poolId for core Pool
    uint96 public constant corePoolId = 0;
    // closeFactorMantissa must be strictly greater than this value
    uint256 internal constant closeFactorMinMantissa = 0.05e18; // 0.05
    // closeFactorMantissa must not exceed this value
    uint256 internal constant closeFactorMaxMantissa = 0.9e18; // 0.9

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
     * @notice Computes hypothetical account liquidity after applying the given redeem/borrow amounts.
     *         Use this in state-changing contexts (hooks, claim flows, pool selection).
     *         When `weightingStrategy` is USE_COLLATERAL_FACTOR, calls `_updateProtectionStates` before
     *         delegating to the lens, which updates the bounded price and enables protection if the deviation
     *         exceeds the threshold.
     * @param account The account to determine liquidity for
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param redeemTokens The number of vTokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @param weightingStrategy USE_COLLATERAL_FACTOR for borrow/entry checks; USE_LIQUIDATION_THRESHOLD for liquidation checks
     * @return err    Possible error code
     * @return liquidity  Hypothetical excess liquidity above collateral requirements (0 if in shortfall)
     * @return shortfall  Hypothetical shortfall below collateral requirements (0 if solvent)
     */
    function getHypotheticalAccountLiquidityInternal(
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount,
        WeightFunction weightingStrategy
    ) internal returns (Error, uint256, uint256) {
        // Populate the DBO transient price cache (EIP-1153) for all entered assets.
        // Required on the CF path so bounded prices are computed once and reused
        // by view functions (e.g. getBoundedCollateralPriceView / getBoundedDebtPriceView)
        // within the same transaction.
        if (weightingStrategy == WeightFunction.USE_COLLATERAL_FACTOR) {
            _updateProtectionStates(account);
        }
        (uint256 err, uint256 liquidity, uint256 shortfall) = comptrollerLens.getHypotheticalAccountLiquidity(
            address(this),
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount,
            weightingStrategy
        );
        return (Error(err), liquidity, shortfall);
    }

    /**
     * @notice View-only variant: reads bounded prices from the DeviationBoundedOracle without updating
     *         the transient cache. Use this only in external view functions where state mutation is not
     *         permitted. On write paths use `getHypotheticalAccountLiquidityInternal` instead.
     * @dev If `getHypotheticalAccountLiquidityInternal` (or any code that calls `_updateProtectionStates`)
     *      was already executed earlier in the same transaction, the DBO transient cache will already be
     *      populated and this function will read from it gas-efficiently — no recomputation occurs.
     *      If called in a standalone view context (cold cache), the DBO must compute bounded prices from
     *      scratch on each call; results are still correct but cost more gas.
     * @param account The account to determine liquidity for
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param redeemTokens The number of vTokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @param weightingStrategy USE_COLLATERAL_FACTOR for borrow/entry checks; USE_LIQUIDATION_THRESHOLD for liquidation checks
     * @return err    Possible error code
     * @return liquidity  Hypothetical excess liquidity above collateral requirements (0 if in shortfall)
     * @return shortfall  Hypothetical shortfall below collateral requirements (0 if solvent)
     */
    function getHypotheticalAccountLiquidityInternalView(
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount,
        WeightFunction weightingStrategy
    ) internal view returns (Error, uint256, uint256) {
        (uint256 err, uint256 liquidity, uint256 shortfall) = comptrollerLens.getHypotheticalAccountLiquidity(
            address(this),
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount,
            weightingStrategy
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
        Market storage marketToJoin = getCorePoolMarket(address(vToken));
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
    function redeemAllowedInternal(address vToken, address redeemer, uint256 redeemTokens) internal returns (uint256) {
        ensureListed(getCorePoolMarket(vToken));
        /* If the redeemer is not 'in' the market, then we can bypass the liquidity check */
        if (!getCorePoolMarket(vToken).accountMembership[redeemer]) {
            return uint256(Error.NO_ERROR);
        }
        /* Otherwise, perform a hypothetical liquidity check to guard against shortfall */
        (Error err, , uint256 shortfall) = getHypotheticalAccountLiquidityInternal(
            redeemer,
            VToken(vToken),
            redeemTokens,
            0,
            WeightFunction.USE_COLLATERAL_FACTOR
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
     * @notice Returns the unique market index for the given poolId and vToken pair
     * @dev Computes a unique key for a (poolId, market) pair used in the `_poolMarkets` mapping
     * - For the core pool (`poolId == 0`), this results in the address being left-padded to 32 bytes,
     *   maintaining backward compatibility with legacy mappings
     * - For other pools, packs the `poolId` and `market` address into a single `bytes32` key,
     *   The first 96 bits are used for the `poolId`, and the remaining 160 bits for the `market` address
     * @param poolId The ID of the pool
     * @param vToken The address of the market (vToken)
     * @return PoolMarketId The `bytes32` key that uniquely represents the (poolId, vToken) pair
     */
    function getPoolMarketIndex(uint96 poolId, address vToken) public pure returns (PoolMarketId) {
        return PoolMarketId.wrap(bytes32((uint256(poolId) << 160) | uint160(vToken)));
    }

    /**
     * @dev Returns the Market struct for the given vToken in the Core Pool (`poolId = 0`)
     * @param vToken The vToken address for which the market details are requested
     * @return market The Market struct corresponding to the (corePoolId, vToken) pair
     */
    function getCorePoolMarket(address vToken) internal view returns (Market storage) {
        return _poolMarkets[getPoolMarketIndex(corePoolId, vToken)];
    }

    /**
     * @notice Updates the DeviationBoundedOracle protection state for all assets the account has entered
     * @dev This populates the transient price cache so subsequent view calls in the same transaction
     *      are gas-efficient. Should be called before any liquidity calculation in the CF path.
     * @param account The account whose collateral assets need protection state updates
     */
    function _updateProtectionStates(address account) internal {
        IDeviationBoundedOracle boundedOracle = deviationBoundedOracle;
        VToken[] memory assets = accountAssets[account];
        uint256 len = assets.length;
        for (uint256 i; i < len; ++i) {
            boundedOracle.updateProtectionState(address(assets[i]));
        }
    }
}
