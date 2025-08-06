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
import { IMarketFacet } from "../interfaces/IMarketFacet.sol";

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
    // No collateralFactorMantissa may exceed this value
    uint256 internal constant collateralFactorMaxMantissa = 0.9e18; // 0.9

    /// @notice Emitted when an account enters a market
    event MarketEntered(VToken indexed vToken, address indexed account);

    /// @notice Emitted when XVS is distributed to VAI Vault
    event DistributedVAIVaultVenus(uint256 amount);

    /// @notice Reverts if the protocol is paused
    function checkProtocolPauseState() internal view {
        if (protocolPaused) {
            revert ProtocolPaused();
        }
    }

    /// @notice Reverts if a certain action is paused on a market
    function checkActionPauseState(address market, Action action) internal view {
        if (actionPaused(market, action)) {
            revert ActionPaused(market, action);
        }
    }

    /// @notice Reverts if the caller is not admin
    function ensureAdmin() internal view {
        if (msg.sender != admin) {
            revert SenderNotAdmin();
        }
    }

    /// @notice Checks the passed address is nonzero, reverts if it is zero
    function ensureNonzeroAddress(address address_) internal pure {
        if (address_ == address(0)) {
            revert ZeroAddressNotAllowed();
        }
    }

    /// @notice Reverts if the market is not listed
    function ensureListed(Market storage market) internal view {
        if (!market.isListed) {
            revert MarketNotListed();
        }
    }

    /// @notice Reverts if the caller is neither admin nor the passed address
    function ensureAdminOr(address privilegedAddress) internal view {
        if (msg.sender != admin && msg.sender != privilegedAddress) {
            revert SenderNotAdminOrPrivileged(msg.sender, privilegedAddress);
        }
    }

    /// @notice Checks the caller is allowed to call the specified fuction, reverts if not
    function ensureAllowed(string memory functionSig) internal view {
        bool isAllowedToCall = IAccessControlManagerV8(accessControl).isAllowedToCall(msg.sender, functionSig);

        if (!isAllowedToCall) {
            revert AccessDenied(functionSig, msg.sender);
        }
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
     * @notice Determine what the liquidity would be if the given amounts were redeemed/borrowed on the basis of liquidation threshold
     * @param account The account to determine liquidity for
     * @param vTokenModify The market to hypothetically redeem/borrow in
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
        uint256 redeemTokens,
        uint256 borrowAmount,
        function(address) external view returns (uint256) weight
    ) internal view returns (uint256, uint256, uint256) {
        (uint256 err, uint256 liquidity, uint256 shortfall) = comptrollerLens.getHypotheticalAccountLiquidity(
            address(this),
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount,
            weight
        );
        return (err, liquidity, shortfall);
    }

    /**
     * @notice Get a snapshot of the health of an account, including average liquidation threshold, total collateral, health factor, health factor threshold,
     *          and average liquidation incentive
     * @param account The account to get the health snapshot for
     * @param vTokenModify The market to hypothetically redeem/borrow in
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @return err Error code
     * @return liquidationThresholdAvg Average liquidation threshold
     * @return totalCollateral Total collateral in excess of borrow requirements
     * @return healthFactor Health factor
     * @dev Note that we calculate the exchangeRateStored for each collateral vToken using stored data,
     *  without calculating accumulated interest.
     */
    function getHypotheticalHealthSnapshot(
        address account,
        VToken vTokenModify,
        uint256 redeemTokens,
        uint256 borrowAmount,
        function(address) external view returns (uint256) weight
    )
        internal
        view
        returns (uint256 err, uint256 liquidationThresholdAvg, uint256 totalCollateral, uint256 healthFactor)
    {
        (err, liquidationThresholdAvg, totalCollateral, healthFactor) = comptrollerLens.getAccountHealthSnapshot(
            address(this),
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount,
            weight
        );
    }

    /**
     * @notice Add the market to the borrower's "assets in" for liquidity calculations
     * @param vToken The market to enter
     * @param borrower The address of the account to modify
     * @return Success indicator for whether the market was entered
     */
    function addToMarketInternal(VToken vToken, address borrower) internal returns (uint256) {
        checkActionPauseState(address(vToken), Action.ENTER_MARKET);
        Market storage marketToJoin = markets[address(vToken)];
        ensureListed(marketToJoin);
        if (marketToJoin.accountMembership[borrower]) {
            // already joined
            return NO_ERROR;
        }
        // survived the gauntlet, add to list
        // NOTE: we store these somewhat redundantly as a significant optimization
        //  this avoids having to iterate through the list for the most common use cases
        //  that is, only when we need to perform liquidity checks
        //  and not whenever we want to check if an account is in a particular market
        marketToJoin.accountMembership[borrower] = true;
        accountAssets[borrower].push(vToken);

        emit MarketEntered(vToken, borrower);

        return NO_ERROR;
    }

    /**
     * @notice Checks for the user is allowed to redeem tokens
     * @param vToken Address of the market
     * @param redeemer Address of the user
     * @param redeemTokens Amount of tokens to redeem
     * @return NO_ERROR if the user is allowed to redeem, otherwise reverts
     * @custom:error InsuffficientLiquidity is thrown if the user has insufficient liquidity to redeem
     */
    function redeemAllowedInternal(
        address vToken,
        address redeemer,
        uint256 redeemTokens
    ) internal view returns (uint256) {
        ensureListed(markets[vToken]);
        /* If the redeemer is not 'in' the market, then we can bypass the liquidity check */
        if (!markets[vToken].accountMembership[redeemer]) {
            return NO_ERROR;
        }
        /* Otherwise, perform a hypothetical liquidity check to guard against shortfall */
        (, , uint256 shortfall) = getHypotheticalAccountLiquidityInternal(
            redeemer,
            VToken(vToken),
            redeemTokens,
            0,
            this.getCollateralFactor
        );
        if (shortfall != 0) {
            revert InsuffficientLiquidity();
        }
        return NO_ERROR;
    }

    /**
     * @notice Returns the XVS address
     * @return The address of XVS token
     */
    function getXVSAddress() external view returns (address) {
        return xvs;
    }

    /**
     * @notice Get the liquidation incentive for a borrower
     * @param borrower The address of the borrower
     * @param vToken The address of the vToken
     * @return incentive The liquidation incentive for the borrower, scaled by 1e18
     */
    function getDynamicLiquidationIncentive(
        address borrower,
        address vToken
    ) external view returns (uint256 incentive) {
        Market storage market = markets[vToken];
        (, uint256 liquidationThresholdAvg, , uint256 healthFactor) = getHypotheticalHealthSnapshot(
            borrower,
            VToken(vToken),
            0,
            0,
            this.getLiquidationThreshold
        );

        incentive = liquidationManager.calculateDynamicLiquidationIncentive(
            healthFactor,
            liquidationThresholdAvg,
            market.maxLiquidationIncentiveMantissa
        );
        return incentive;
    }

    /**
     * @notice Get the collateral factor for a vToken
     * @param vToken The address of the vToken to get the collateral factor for
     * @return The collateral factor for the vToken, scaled by 1e18
     */
    function getCollateralFactor(address vToken) external view returns (uint256) {
        // return Exp({ mantissa: markets[vToken].collateralFactorMantissa });
        return markets[vToken].collateralFactorMantissa;
    }

    /**
     * @notice Get the liquidation threshold for a vToken
     * @param vToken The address of the vToken to get the liquidation threshold for
     * @return The liquidation threshold for the vToken, scaled by 1e18
     */
    function getLiquidationThreshold(address vToken) external view returns (uint256) {
        // return Exp({ mantissa: markets[vToken].liquidationThresholdMantissa });
        return markets[vToken].liquidationThresholdMantissa;
    }
}
