pragma solidity 0.8.13;

import "../libraries/appStorage.sol";
import "../libraries/LibHelper.sol";
import "../libraries/LibAccessCheck.sol";
import "../../Tokens/VTokens/VToken.sol";

contract MarketFacet is ComptrollerErrorReporter, ExponentialNoError {
    AppStorage internal s;

    /// @notice Emitted when an account enters a market
    event MarketEntered(VToken vToken, address account);

    /// @notice Emitted when an account exits a market
    event MarketExited(VToken vToken, address account);

    /**
     * @notice Returns the assets an account has entered
     * @param account The address of the account to pull assets for
     * @return A dynamic list with the assets the account has entered
     */
    function getAssetsIn(address account) external view returns (VToken[] memory) {
        return s.accountAssets[account];
    }

    function oracle() external view returns (PriceOracle) {
        return s.oracle;
    }

    function markets(address vToken) external view returns (bool, uint, bool) {
        return (s.markets[vToken].isListed, s.markets[vToken].collateralFactorMantissa, s.markets[vToken].isVenus);
    }

    function vaiController() external view returns (VAIControllerInterface) {
        return s.vaiController;
    }

    function comptrollerLens() external view returns (ComptrollerLensInterface) {
        return s.comptrollerLens;
    }

    function liquidationIncentiveMantissa() external view returns (uint) {
        return s.liquidationIncentiveMantissa;
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
        uint actualRepayAmount
    ) external view returns (uint, uint) {
        (uint err, uint seizeTokens) = s.comptrollerLens.liquidateCalculateSeizeTokens(
            address(this),
            vTokenBorrowed,
            vTokenCollateral,
            actualRepayAmount
        );
        return (err, seizeTokens);
    }

    /**
     * @notice Returns whether the given account is entered in the given asset
     * @param account The address of the account to check
     * @param vToken The vToken to check
     * @return True if the account is in the asset, otherwise false.
     */
    function checkMembership(address account, VToken vToken) external view returns (bool) {
        return s.markets[address(vToken)].accountMembership[account];
    }

    /**
     * @notice Add assets to be included in account liquidity calculation
     * @param vTokens The list of addresses of the vToken markets to be enabled
     * @return Success indicator for whether each corresponding market was entered
     */
    function enterMarkets(address[] calldata vTokens) external returns (uint[] memory) {
        uint len = vTokens.length;

        uint[] memory results = new uint[](len);
        for (uint i; i < len; ++i) {
            results[i] = uint(LibHelper.addToMarketInternal(VToken(vTokens[i]), msg.sender));
        }

        return results;
    }

    /**
     * @notice Removes asset from sender's account liquidity calculation
     * @dev Sender must not have an outstanding borrow balance in the asset,
     *  or be providing necessary collateral for an outstanding borrow.
     * @param vTokenAddress The address of the asset to be removed
     * @return Whether or not the account successfully exited the market
     */
    function exitMarket(address vTokenAddress) external returns (uint) {
        LibAccessCheck.checkActionPauseState(vTokenAddress, LibAccessCheck.Action.EXIT_MARKET);

        VToken vToken = VToken(vTokenAddress);
        /* Get sender tokensHeld and amountOwed underlying from the vToken */
        (uint oErr, uint tokensHeld, uint amountOwed, ) = vToken.getAccountSnapshot(msg.sender);
        require(oErr == 0, "getAccountSnapshot failed"); // semi-opaque error code

        /* Fail if the sender has a borrow balance */
        if (amountOwed != 0) {
            return fail(Error.NONZERO_BORROW_BALANCE, FailureInfo.EXIT_MARKET_BALANCE_OWED);
        }

        /* Fail if the sender is not permitted to redeem all of their tokens */
        uint allowed = LibHelper.redeemAllowedInternal(vTokenAddress, msg.sender, tokensHeld);
        if (allowed != 0) {
            return failOpaque(Error.REJECTION, FailureInfo.EXIT_MARKET_REJECTION, allowed);
        }

        Market storage marketToExit = s.markets[address(vToken)];

        /* Return true if the sender is not already ‘in’ the market */
        if (!marketToExit.accountMembership[msg.sender]) {
            return uint(Error.NO_ERROR);
        }

        /* Set vToken account membership to false */
        delete marketToExit.accountMembership[msg.sender];

        /* Delete vToken from the account’s list of assets */
        // In order to delete vToken, copy last item in list to location of item to be removed, reduce length by 1
        VToken[] storage userAssetList = s.accountAssets[msg.sender];
        uint len = userAssetList.length;
        uint i;
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

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Add the market to the markets mapping and set it as listed
     * @dev Admin function to set isListed and add support for the market
     * @param vToken The address of the market (token) to list
     * @return uint 0=success, otherwise a failure. (See enum Error for details)
     */
    function _supportMarket(VToken vToken) external returns (uint) {
        LibAccessCheck.ensureAllowed("_supportMarket(address)");

        if (s.markets[address(vToken)].isListed) {
            return fail(Error.MARKET_ALREADY_LISTED, FailureInfo.SUPPORT_MARKET_EXISTS);
        }

        // Note that isVenus is not in active use anymore
        Market storage newMarket = s.markets[address(vToken)];
        newMarket.isListed = true;
        newMarket.isVenus = false;
        newMarket.collateralFactorMantissa = 0;
        _addMarketInternal(vToken);
        _initializeMarket(address(vToken));

        //emit MarketListed(vToken);

        return uint(Error.NO_ERROR);
    }

    function _addMarketInternal(VToken vToken) internal {
        for (uint i; i < s.allMarkets.length; ++i) {
            require(s.allMarkets[i] != vToken, "market already added");
        }
        s.allMarkets.push(vToken);
    }

    function _initializeMarket(address vToken) internal {
        uint blockNumber = block.number;

        VenusMarketState storage supplyState = s.venusSupplyState[vToken];
        VenusMarketState storage borrowState = s.venusBorrowState[vToken];

        /*
         * Update market state indices
         */
        if (supplyState.index == 0) {
            // Initialize supply state index with default value
            supplyState.index = LibHelper.venusInitialIndex;
        }

        if (borrowState.index == 0) {
            // Initialize borrow state index with default value
            borrowState.index = LibHelper.venusInitialIndex;
        }

        /*
         * Update market state block numbers
         */
        supplyState.block = borrowState.block = blockNumber;
    }
}
