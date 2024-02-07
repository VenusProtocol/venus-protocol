// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.5.16;

import { VToken, ComptrollerErrorReporter, ExponentialNoError } from "../../../Tokens/VTokens/VToken.sol";
import { IVAIVault } from "../../../Comptroller/ComptrollerInterface.sol";
import { ComptrollerV15Storage } from "../../../Comptroller/ComptrollerStorage.sol";
import { IAccessControlManagerV5 } from "@venusprotocol/governance-contracts/contracts/Governance/IAccessControlManagerV5.sol";

import { SafeBEP20, IBEP20 } from "../../../Utils/SafeBEP20.sol";

/**
 * @title FacetBase
 * @author Venus
 * @notice This facet contract contains functions related to access and checks
 */
contract FacetBase is ComptrollerV15Storage, ExponentialNoError, ComptrollerErrorReporter {
    using SafeBEP20 for IBEP20;

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
        require(IAccessControlManagerV5(accessControl).isAllowedToCall(msg.sender, functionSig), "access denied");
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
    function getBlockNumber() internal view returns (uint256) {
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

        uint256 xvsBalance = IBEP20(getXVSAddress()).balanceOf(address(this));
        if (xvsBalance == 0) {
            return;
        }

        uint256 actualAmount;
        uint256 deltaBlocks = sub_(getBlockNumber(), releaseStartBlock);
        // releaseAmount = venusVAIVaultRate * deltaBlocks
        uint256 _releaseAmount = mul_(venusVAIVaultRate, deltaBlocks);

        if (xvsBalance >= _releaseAmount) {
            actualAmount = _releaseAmount;
        } else {
            actualAmount = xvsBalance;
        }

        if (actualAmount < minReleaseAmount) {
            return;
        }

        releaseStartBlock = getBlockNumber();

        IBEP20(getXVSAddress()).safeTransfer(vaiVaultAddress, actualAmount);
        emit DistributedVAIVaultVenus(actualAmount);

        IVAIVault(vaiVaultAddress).updatePendingRewards();
    }

    /**
     * @notice Return the address of the XVS token
     * @return The address of XVS
     */
    function getXVSAddress() public pure returns (address) {
        return 0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63;
    }

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
        uint256 redeemTokens,
        uint256 borrowAmount
    ) internal view returns (Error, uint256, uint256) {
        (uint256 err, uint256 liquidity, uint256 shortfall) = comptrollerLens.getHypotheticalAccountLiquidity(
            address(this),
            account,
            vTokenModify,
            redeemTokens,
            borrowAmount
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
        Market storage marketToJoin = markets[address(vToken)];
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
        ensureListed(markets[vToken]);
        /* If the redeemer is not 'in' the market, then we can bypass the liquidity check */
        if (!markets[vToken].accountMembership[redeemer]) {
            return uint256(Error.NO_ERROR);
        }
        /* Otherwise, perform a hypothetical liquidity check to guard against shortfall */
        (Error err, , uint256 shortfall) = getHypotheticalAccountLiquidityInternal(
            redeemer,
            VToken(vToken),
            redeemTokens,
            0
        );
        if (err != Error.NO_ERROR) {
            return uint256(err);
        }
        if (shortfall != 0) {
            return uint256(Error.INSUFFICIENT_LIQUIDITY);
        }
        return uint256(Error.NO_ERROR);
    }
}
