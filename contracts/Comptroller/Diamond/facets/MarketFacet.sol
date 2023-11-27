// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.5.16;

import { IMarketFacet } from "../interfaces/IMarketFacet.sol";
import { FacetBase } from "./FacetBase.sol";
import { VToken } from "../../../Tokens/VTokens/VToken.sol";

/**
 * @title MarketFacet
 * @author Venus
 * @dev This facet contains all the methods related to the market's management in the pool
 * @notice This facet contract contains functions regarding markets
 */
contract MarketFacet is IMarketFacet, FacetBase {
    /// @notice Emitted when an admin supports a market
    event MarketListed(VToken indexed vToken);

    /// @notice Emitted when an account exits a market
    event MarketExited(VToken indexed vToken, address indexed account);

    /// @notice Emitted when the borrowing delegate rights are updated for an account
    event DelegateUpdated(address indexed borrower, address indexed delegate, bool allowDelegatedBorrows);

    /// @notice Indicator that this is a Comptroller contract (for inspection)
    function isComptroller() public pure returns (bool) {
        return true;
    }

    /**
     * @notice Returns the assets an account has entered
     * @param account The address of the account to pull assets for
     * @return A dynamic list with the assets the account has entered
     */
    function getAssetsIn(address account) external view returns (VToken[] memory) {
        return accountAssets[account];
    }

    /**
     * @notice Return all of the markets
     * @dev The automatic getter may be used to access an individual market
     * @return The list of market addresses
     */
    function getAllMarkets() external view returns (VToken[] memory) {
        return allMarkets;
    }

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in vToken.liquidateBorrowFresh)
     * @param vTokenBorrowed The address of the borrowed vToken
     * @param vTokenCollateral The address of the collateral vToken
     * @param actualRepayAmount The amount of vTokenBorrowed underlying to convert into vTokenCollateral tokens
     * @return (errorCode, number of vTokenCollateral tokens to be seized in a liquidation)
     */
    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256) {
        (uint256 err, uint256 seizeTokens) = comptrollerLens.liquidateCalculateSeizeTokens(
            address(this),
            vTokenBorrowed,
            vTokenCollateral,
            actualRepayAmount
        );
        return (err, seizeTokens);
    }

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in vToken.liquidateBorrowFresh)
     * @param vTokenCollateral The address of the collateral vToken
     * @param actualRepayAmount The amount of vTokenBorrowed underlying to convert into vTokenCollateral tokens
     * @return (errorCode, number of vTokenCollateral tokens to be seized in a liquidation)
     */
    function liquidateVAICalculateSeizeTokens(
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256) {
        (uint256 err, uint256 seizeTokens) = comptrollerLens.liquidateVAICalculateSeizeTokens(
            address(this),
            vTokenCollateral,
            actualRepayAmount
        );
        return (err, seizeTokens);
    }

    /**
     * @notice Returns whether the given account is entered in the given asset
     * @param account The address of the account to check
     * @param vToken The vToken to check
     * @return True if the account is in the asset, otherwise false
     */
    function checkMembership(address account, VToken vToken) external view returns (bool) {
        return markets[address(vToken)].accountMembership[account];
    }

    /**
     * @notice Add assets to be included in account liquidity calculation
     * @param vTokens The list of addresses of the vToken markets to be enabled
     * @return Success indicator for whether each corresponding market was entered
     */
    function enterMarkets(address[] calldata vTokens) external returns (uint256[] memory) {
        uint256 len = vTokens.length;

        uint256[] memory results = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            results[i] = uint256(addToMarketInternal(VToken(vTokens[i]), msg.sender));
        }

        return results;
    }

    /**
     * @notice Removes asset from sender's account liquidity calculation
     * @dev Sender must not have an outstanding borrow balance in the asset,
     *  or be providing necessary collateral for an outstanding borrow
     * @param vTokenAddress The address of the asset to be removed
     * @return Whether or not the account successfully exited the market
     */
    function exitMarket(address vTokenAddress) external returns (uint256) {
        checkActionPauseState(vTokenAddress, Action.EXIT_MARKET);

        VToken vToken = VToken(vTokenAddress);
        /* Get sender tokensHeld and amountOwed underlying from the vToken */
        (uint256 oErr, uint256 tokensHeld, uint256 amountOwed, ) = vToken.getAccountSnapshot(msg.sender);
        require(oErr == 0, "getAccountSnapshot failed"); // semi-opaque error code

        /* Fail if the sender has a borrow balance */
        if (amountOwed != 0) {
            return fail(Error.NONZERO_BORROW_BALANCE, FailureInfo.EXIT_MARKET_BALANCE_OWED);
        }

        /* Fail if the sender is not permitted to redeem all of their tokens */
        uint256 allowed = redeemAllowedInternal(vTokenAddress, msg.sender, tokensHeld);
        if (allowed != 0) {
            return failOpaque(Error.REJECTION, FailureInfo.EXIT_MARKET_REJECTION, allowed);
        }

        Market storage marketToExit = markets[address(vToken)];

        /* Return true if the sender is not already ‘in’ the market */
        if (!marketToExit.accountMembership[msg.sender]) {
            return uint256(Error.NO_ERROR);
        }

        /* Set vToken account membership to false */
        delete marketToExit.accountMembership[msg.sender];

        /* Delete vToken from the account’s list of assets */
        // In order to delete vToken, copy last item in list to location of item to be removed, reduce length by 1
        VToken[] storage userAssetList = accountAssets[msg.sender];
        uint256 len = userAssetList.length;
        uint256 i;
        for (; i < len; ++i) {
            if (userAssetList[i] == vToken) {
                userAssetList[i] = userAssetList[len - 1];
                userAssetList.length--;
                break;
            }
        }

        // We *must* have found the asset in the list or our redundant data structure is broken
        assert(i < len);

        emit MarketExited(vToken, msg.sender);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Add the market to the markets mapping and set it as listed
     * @dev Allows a privileged role to add and list markets to the Comptroller
     * @param vToken The address of the market (token) to list
     * @return uint256 0=success, otherwise a failure. (See enum Error for details)
     */
    function _supportMarket(VToken vToken) external returns (uint256) {
        ensureAllowed("_supportMarket(address)");

        if (markets[address(vToken)].isListed) {
            return fail(Error.MARKET_ALREADY_LISTED, FailureInfo.SUPPORT_MARKET_EXISTS);
        }

        vToken.isVToken(); // Sanity check to make sure its really a VToken

        // Note that isVenus is not in active use anymore
        Market storage newMarket = markets[address(vToken)];
        newMarket.isListed = true;
        newMarket.isVenus = false;
        newMarket.collateralFactorMantissa = 0;

        _addMarketInternal(vToken);
        _initializeMarket(address(vToken));

        emit MarketListed(vToken);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Grants or revokes the borrowing delegate rights to / from an account
     *  If allowed, the delegate will be able to borrow funds on behalf of the sender
     *  Upon a delegated borrow, the delegate will receive the funds, and the borrower
     *  will see the debt on their account
     * @param delegate The address to update the rights for
     * @param allowBorrows Whether to grant (true) or revoke (false) the rights
     */
    function updateDelegate(address delegate, bool allowBorrows) external {
        _updateDelegate(msg.sender, delegate, allowBorrows);
    }

    function _updateDelegate(address borrower, address delegate, bool allowBorrows) internal {
        approvedDelegates[borrower][delegate] = allowBorrows;
        emit DelegateUpdated(borrower, delegate, allowBorrows);
    }

    function _addMarketInternal(VToken vToken) internal {
        uint256 allMarketsLength = allMarkets.length;
        for (uint256 i; i < allMarketsLength; ++i) {
            require(allMarkets[i] != vToken, "already added");
        }
        allMarkets.push(vToken);
    }

    function _initializeMarket(address vToken) internal {
        uint32 blockNumber = getBlockNumberAsUint32();

        VenusMarketState storage supplyState = venusSupplyState[vToken];
        VenusMarketState storage borrowState = venusBorrowState[vToken];

        /*
         * Update market state indices
         */
        if (supplyState.index == 0) {
            // Initialize supply state index with default value
            supplyState.index = venusInitialIndex;
        }

        if (borrowState.index == 0) {
            // Initialize borrow state index with default value
            borrowState.index = venusInitialIndex;
        }

        /*
         * Update market state block numbers
         */
        supplyState.block = borrowState.block = blockNumber;
    }
}
