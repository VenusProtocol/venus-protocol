// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { Action } from "../../ComptrollerInterface.sol";
import { IMarketFacet } from "../interfaces/IMarketFacet.sol";
import { FacetBase } from "./FacetBase.sol";

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

    /// @notice Emitted when the borrowing or redeeming delegate rights are updated for an account
    event DelegateUpdated(address indexed approver, address indexed delegate, bool approved);

    /// @notice Emitted when an admin unlists a market
    event MarketUnlisted(address indexed vToken);

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
        uint256 len;
        VToken[] memory _accountAssets = accountAssets[account];
        uint256 _accountAssetsLength = _accountAssets.length;

        VToken[] memory assetsIn = new VToken[](_accountAssetsLength);

        for (uint256 i; i < _accountAssetsLength; ++i) {
            Market storage market = markets[address(_accountAssets[i])];
            if (market.isListed) {
                assetsIn[len] = _accountAssets[i];
                ++len;
            }
        }

        assembly {
            mstore(assetsIn, len)
        }

        return assetsIn;
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
        address borrower,
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256) {
        (uint256 err, uint256 seizeTokens) = comptrollerLens.liquidateCalculateSeizeTokens(
            borrower,
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
        address borrower,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256) {
        (uint256 err, uint256 seizeTokens) = comptrollerLens.liquidateVAICalculateSeizeTokens(
            borrower,
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
     * @notice Check if a market is marked as listed (active)
     * @param vToken vToken Address for the market to check
     * @return listed True if listed otherwise false
     */
    function isMarketListed(VToken vToken) external view returns (bool) {
        return markets[address(vToken)].isListed;
    }

    /**
     * @notice Add assets to be included in account liquidity calculation
     * @param vTokens The list of addresses of the vToken markets to be enabled
     * @return errors An array of NO_ERROR
     * @custom:event MarketEntered is emitted for each market on success
     * @custom:error ActionPaused error is thrown if entering any of the markets is paused
     * @custom:error MarketNotListed error is thrown if any of the markets is not listed
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
     * @notice Unlist a market by setting isListed to false
     * @dev Checks if market actions are paused and borrowCap/supplyCap/CF are set to 0
     * @param market The address of the market (vToken) to unlist
     * @return uint256 Always NO_ERROR
     * @custom:event MarketUnlisted is emitted on success
     * @custom:error MarketNotListed error is thrown when the market is not listed
     * @custom:error ActionNotPaused error is thrown if any of the actions are not paused
     * @custom:error BorrowCapIsNotZero error is thrown if borrow cap is not zero
     * @custom:error SupplyCapIsNotZero error is thrown if supply cap is not zero
     * @custom:error CollateralFactorIsNotZero error is thrown if collateral factor is not zero
     */
    function unlistMarket(address market) external returns (uint256) {
        ensureAllowed("unlistMarket(address)");

        Market storage _market = markets[market];

        if (!_market.isListed) {
            revert MarketNotListed();
        }

        if (!actionPaused(market, Action.BORROW)) {
            revert ActionNotPaused(Action.BORROW);
        }

        if (!actionPaused(market, Action.MINT)) {
            revert ActionNotPaused(Action.MINT);
        }

        if (!actionPaused(market, Action.REDEEM)) {
            revert ActionNotPaused(Action.REDEEM);
        }

        if (!actionPaused(market, Action.REPAY)) {
            revert ActionNotPaused(Action.REPAY);
        }

        if (!actionPaused(market, Action.ENTER_MARKET)) {
            revert ActionNotPaused(Action.ENTER_MARKET);
        }

        if (!actionPaused(market, Action.LIQUIDATE)) {
            revert ActionNotPaused(Action.LIQUIDATE);
        }

        if (!actionPaused(market, Action.SEIZE)) {
            revert ActionNotPaused(Action.SEIZE);
        }

        if (!actionPaused(market, Action.TRANSFER)) {
            revert ActionNotPaused(Action.TRANSFER);
        }

        if (!actionPaused(market, Action.EXIT_MARKET)) {
            revert ActionNotPaused(Action.EXIT_MARKET);
        }

        if (borrowCaps[market] != 0) {
            revert BorrowCapIsNotZero();
        }

        if (supplyCaps[market] != 0) {
            revert SupplyCapIsNotZero();
        }

        if (_market.collateralFactorMantissa != 0) {
            revert CollateralFactorIsNotZero();
        }

        _market.isListed = false;
        emit MarketUnlisted(market);

        return NO_ERROR;
    }

    /**
     * @notice Removes asset from sender's account liquidity calculation
     * @dev Sender must not have an outstanding borrow balance in the asset,
     *  or be providing necessary collateral for an outstanding borrow
     * @param vTokenAddress The address of the asset to be removed
     * @return uint256 Always NO_ERROR
     * @custom:event MarketExited is emitted on success
     * @custom:error ActionPaused error is thrown if exiting the market is paused
     * @custom:error NonzeroBorrowBalance error is thrown if the user has an outstanding borrow in this market
     * @custom:error MarketNotListed error is thrown when the market is not listed
     * @custom:error InsufficientLiquidity error is thrown if exiting the market would lead to user's insolvency
     * @custom:error SnapshotError is thrown if some vToken fails to return the account's supply and borrows
     * @custom:error PriceError is thrown if the oracle returns an incorrect price for some asset
     */
    function exitMarket(address vTokenAddress) external returns (uint256) {
        checkActionPauseState(vTokenAddress, Action.EXIT_MARKET);

        VToken vToken = VToken(vTokenAddress);
        /* Get sender tokensHeld and amountOwed underlying from the vToken */
        (uint256 oErr, uint256 tokensHeld, uint256 amountOwed, ) = vToken.getAccountSnapshot(msg.sender);
        if (oErr != 0) {
            revert SnapshotError();
        }

        /* Fail if the sender has a borrow balance */
        if (amountOwed != 0) {
            revert NonzeroBorrowBalance();
        }

        /* Fail if the sender is not permitted to redeem all of their tokens */
        uint256 allowed = redeemAllowedInternal(vTokenAddress, msg.sender, tokensHeld);
        if (allowed != 0) {
            revert ExitMarketNotAllowed();
        }

        Market storage marketToExit = markets[address(vToken)];

        /* Return true if the sender is not already ‘in’ the market */
        if (!marketToExit.accountMembership[msg.sender]) {
            return NO_ERROR;
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
                userAssetList.pop();
                break;
            }
        }

        // We *must* have found the asset in the list or our redundant data structure is broken
        assert(i < len);

        emit MarketExited(vToken, msg.sender);

        return NO_ERROR;
    }

    /**
     * @notice Alias to _supportMarket to support the Isolated Lending Comptroller Interface
     * @param vToken The address of the market (token) to list
     * @return uint256 Alawys NO_ERROR
     * @custom:error MarketAlreadyListed is thrown if the market is already listed in this pool
     */
    function supportMarket(VToken vToken) external returns (uint256) {
        return __supportMarket(vToken);
    }

    /**
     * @notice Add the market to the markets mapping and set it as listed
     * @dev Allows a privileged role to add and list markets to the Comptroller
     * @param vToken The address of the market (token) to list
     * @return uint256 Always NO_ERROR
     * @custom:error MarketAlreadyListed is thrown if the market is already listed in this pool
     */
    function _supportMarket(VToken vToken) external returns (uint256) {
        return __supportMarket(vToken);
    }

    /**
     * @notice Grants or revokes the borrowing or redeeming delegate rights to / from an account
     *  If allowed, the delegate will be able to borrow funds on behalf of the sender
     *  Upon a delegated borrow, the delegate will receive the funds, and the borrower
     *  will see the debt on their account
     *  Upon a delegated redeem, the delegate will receive the redeemed amount and the approver
     *  will see a deduction in his vToken balance
     * @param delegate The address to update the rights for
     * @param approved Whether to grant (true) or revoke (false) the borrowing or redeeming rights
     * @custom:event DelegateUpdated emits on success
     * @custom:error ZeroAddressNotAllowed is thrown when delegate address is zero
     * @custom:error DelegationStatusUnchanged is thrown if approval status is already set to the requested value
     */
    function updateDelegate(address delegate, bool approved) external {
        ensureNonzeroAddress(delegate);
        if (approvedDelegates[msg.sender][delegate] == approved) {
            revert DelegationStatusUnchanged();
        }

        _updateDelegate(msg.sender, delegate, approved);
    }

    function _updateDelegate(address approver, address delegate, bool approved) internal {
        approvedDelegates[approver][delegate] = approved;
        emit DelegateUpdated(approver, delegate, approved);
    }

    function _addMarketInternal(VToken vToken) internal {
        uint256 allMarketsLength = allMarkets.length;
        for (uint256 i; i < allMarketsLength; ++i) {
            if (allMarkets[i] == vToken) {
                revert MarketAlreadyListed(address(vToken));
            }
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

    function __supportMarket(VToken vToken) internal returns (uint256) {
        ensureAllowed("_supportMarket(address)");

        if (markets[address(vToken)].isListed) {
            revert MarketAlreadyListed(address(vToken));
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

        return NO_ERROR;
    }
}
