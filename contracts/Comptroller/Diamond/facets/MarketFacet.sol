// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { VToken } from "../../../Tokens/VTokens/VToken.sol";
import { Action } from "../../ComptrollerInterface.sol";
import { IMarketFacet } from "../interfaces/IMarketFacet.sol";
import { FacetBase } from "./FacetBase.sol";
import { PoolMarketId } from "../../../Comptroller/Types/PoolMarketId.sol";
import { WeightFunction } from "../interfaces/IFacetBase.sol";

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

    /// @notice Emitted when a market is initialized in a pool
    event PoolMarketInitialized(uint96 indexed poolId, address indexed market);

    /// @notice Emitted when a user enters or exits a pool (poolId = 0 means exit)
    event PoolSelected(address indexed account, uint96 previousPoolId, uint96 indexed newPoolId);

    /// @notice Emitted when a vToken market is removed from a pool
    event PoolMarketRemoved(uint96 indexed poolId, address indexed vToken);

    /// @notice Emitted when a new pool is created
    event PoolCreated(uint96 indexed poolId, string label);

    /// @notice Indicator that this is a Comptroller contract (for inspection)
    function isComptroller() public pure returns (bool) {
        return true;
    }

    /**
     * @notice Returns the vToken markets an account has entered in the Core Pool
     * @dev Reads membership from the Core Pool (`poolId = 0`). Although the account may have entered other pools,
     *      all entered market state is recorded in the Core Pool indexes, making this function applicable to all poolIds
     * @param account The address of the account to query
     * @return assets A dynamic array of vToken markets the account has entered
     */
    function getAssetsIn(address account) external view returns (VToken[] memory) {
        uint256 len;
        VToken[] memory _accountAssets = accountAssets[account];
        uint256 _accountAssetsLength = _accountAssets.length;

        VToken[] memory assetsIn = new VToken[](_accountAssetsLength);

        for (uint256 i; i < _accountAssetsLength; ++i) {
            Market storage market = getCorePoolMarket(address(_accountAssets[i]));
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
     * @param borrower Address of borrower whose collateral is being seized
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
     * @notice Returns whether the given account has entered the specified vToken market in the Core Pool
     * @dev Reads membership from the Core Pool (`poolId = 0`). Although the account may have entered other pools,
     *      all entered market state is recorded in the Core Pool indexes, making this function applicable to all poolIds
     * @param account The address of the account to check
     * @param vToken The vToken to check
     * @return True if the account is in the asset, otherwise false
     */
    function checkMembership(address account, VToken vToken) external view returns (bool) {
        return _poolMarkets[getCorePoolMarketIndex(address(vToken))].accountMembership[account];
    }

    /**
     * @notice Checks whether the given vToken market is listed in the Core Pool (`poolId = 0`)
     * @param vToken The vToken Address of the market to check
     * @return listed True if the (Core Pool, vToken) market is listed, otherwise false
     */
    function isMarketListed(VToken vToken) external view returns (bool) {
        return _poolMarkets[getCorePoolMarketIndex(address(vToken))].isListed;
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
     * @notice Unlists the given vToken market from the Core Pool (`poolId = 0`) by setting `isListed` to false
     * @dev Checks if market actions are paused and borrowCap/supplyCap/CF are set to 0
     * @param market The address of the market (vToken) to unlist
     * @return uint256 0=success, otherwise a failure (See enum Error for details)
     */
    function unlistMarket(address market) external returns (uint256) {
        ensureAllowed("unlistMarket(address)");

        Market storage _market = _poolMarkets[getCorePoolMarketIndex(market)];

        if (!_market.isListed) {
            return fail(Error.MARKET_NOT_LISTED, FailureInfo.UNLIST_MARKET_NOT_LISTED);
        }

        require(actionPaused(market, Action.BORROW), "borrow action is not paused");
        require(actionPaused(market, Action.MINT), "mint action is not paused");
        require(actionPaused(market, Action.REDEEM), "redeem action is not paused");
        require(actionPaused(market, Action.REPAY), "repay action is not paused");
        require(actionPaused(market, Action.ENTER_MARKET), "enter market action is not paused");
        require(actionPaused(market, Action.LIQUIDATE), "liquidate action is not paused");
        require(actionPaused(market, Action.SEIZE), "seize action is not paused");
        require(actionPaused(market, Action.TRANSFER), "transfer action is not paused");
        require(actionPaused(market, Action.EXIT_MARKET), "exit market action is not paused");

        require(borrowCaps[market] == 0, "borrow cap is not 0");
        require(supplyCaps[market] == 0, "supply cap is not 0");

        require(_market.collateralFactorMantissa == 0, "collateral factor is not 0");

        _market.isListed = false;
        emit MarketUnlisted(market);

        return uint256(Error.NO_ERROR);
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

        Market storage marketToExit = _poolMarkets[getCorePoolMarketIndex(address(vToken))];

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
                userAssetList.pop();
                break;
            }
        }

        // We *must* have found the asset in the list or our redundant data structure is broken
        assert(i < len);

        emit MarketExited(vToken, msg.sender);

        return uint256(Error.NO_ERROR);
    }

    /**
     * @notice Alias to _supportMarket to support the Isolated Lending Comptroller Interface
     * @param vToken The address of the market (token) to list
     * @return uint256 0=success, otherwise a failure. (See enum Error for details)
     */
    function supportMarket(VToken vToken) external returns (uint256) {
        return __supportMarket(vToken);
    }

    /**
     * @notice Adds the given vToken market to the Core Pool (`poolId = 0`) and marks it as listed
     * @dev Allows a privileged role to add and list markets to the Comptroller
     * @param vToken The address of the vToken market to list in the Core Pool
     * @return uint256 0=success, otherwise a failure. (See enum Error for details)
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
     */
    function updateDelegate(address delegate, bool approved) external {
        ensureNonzeroAddress(delegate);
        require(approvedDelegates[msg.sender][delegate] != approved, "Delegation status unchanged");

        _updateDelegate(msg.sender, delegate, approved);
    }

    /**
     * @notice Allows a user to switch to a new pool (e.g., e-mode ).
     * @param poolId The ID of the pool the user wants to enter.
     * @custom:error PoolDoesNotExist The specified pool ID does not exist.
     * @custom:error AlreadyInSelectedPool The user is already in the target pool.
     * @custom:error IncompatibleBorrowedAssets The user's current borrows are incompatible with the new pool.
     * @custom:error LiquidityCheckFailed The user's liquidity is insufficient after switching pools.
     * @custom:event PoolSelected Emitted after a successful pool switch.
     */
    function enterPool(uint96 poolId) external {
        if (poolId > lastPoolId) revert PoolDoesNotExist(poolId);

        if (poolId == userPoolId[msg.sender]) {
            revert AlreadyInSelectedPool();
        }

        if (!hasValidPoolBorrows(msg.sender, poolId)) {
            revert IncompatibleBorrowedAssets();
        }

        (uint256 error, , uint256 shortfall) = _getAccountLiquidity(
            msg.sender,
            WeightFunction.USE_LIQUIDATION_THRESHOLD
        );

        if (error != 0 || shortfall > 0) {
            revert LiquidityCheckFailed(error, shortfall);
        }

        emit PoolSelected(msg.sender, userPoolId[msg.sender], poolId);

        userPoolId[msg.sender] = poolId;

        (error, , shortfall) = _getAccountLiquidity(msg.sender, WeightFunction.USE_COLLATERAL_FACTOR);

        if (error != 0 || shortfall > 0) {
            revert LiquidityCheckFailed(error, shortfall);
        }
    }

    /**
     * @notice Creates a new pool with the given label.
     * @param label name for the pool (must be non-empty).
     * @return poolId The incremental unique identifier of the newly created pool.
     * @custom:error EmptyPoolLabel Reverts if the provided label is an empty string.
     * @custom:event PoolCreated Emitted after successfully creating a new pool.
     */
    function createPool(string memory label) external returns (uint96) {
        ensureAllowed("createPool(string)");

        if (bytes(label).length == 0) {
            revert EmptyPoolLabel();
        }

        uint96 poolId = ++lastPoolId;
        pools[poolId].label = label;

        emit PoolCreated(poolId, label);
        return poolId;
    }

    /**
     * @notice Batch initializes market entries with basic config.
     * @param poolIds Array of pool IDs.
     * @param vTokens Array of market (vToken) addresses.
     * @custom:error ArrayLengthMismatch Reverts if `poolIds` and `vTokens` arrays have different lengths.
     * @custom:error InvalidOperationForCorePool Reverts when attempting to call pool-specific methods on the Core Pool.
     * @custom:error PoolDoesNotExist Reverts if the target pool ID does not exist.
     * @custom:error MarketNotListedInCorePool Reverts if the market is not listed in the core pool.
     * @custom:error MarketAlreadyListed Reverts if the given market is already listed in the specified pool.
     * @custom:event PoolMarketInitialized Emitted after successfully initializing a market in a pool.
     */
    function addPoolMarkets(uint96[] calldata poolIds, address[] calldata vTokens) external {
        uint256 len = poolIds.length;
        if (vTokens.length != len) {
            revert ArrayLengthMismatch();
        }

        for (uint256 i; i < len; i++) {
            _addPoolMarket(poolIds[i], vTokens[i]);
        }
    }

    /**
     * @notice Removes a market (vToken) from the specified pool.
     * @param poolId The ID of the pool from which the market should be removed.
     * @param vToken The address of the market token to remove.
     * @custom:error InvalidOperationForCorePool Reverts if called on the Core Pool.
     * @custom:error PoolMarketNotFound Reverts if the market is not listed in the pool.
     * @custom:event PoolMarketRemoved Emitted after a market is successfully removed from a pool.
     */
    function removePoolMarket(uint96 poolId, address vToken) external {
        ensureAllowed("removePoolMarket(uint96,address)");

        if (poolId == corePoolId) revert InvalidOperationForCorePool();
        PoolMarketId index = getPoolMarketIndex(poolId, vToken);
        if (!_poolMarkets[index].isListed) {
            revert PoolMarketNotFound(poolId, vToken);
        }

        address[] storage assets = pools[poolId].vTokens;

        uint256 length = assets.length;
        for (uint256 i; i < length; i++) {
            if (assets[i] == vToken) {
                assets[i] = assets[length - 1];
                assets.pop();
                break;
            }
        }

        delete _poolMarkets[index];

        emit PoolMarketRemoved(poolId, vToken);
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
     * @notice Get the core pool liquidation Incentive for a vToken
     * @param vToken The address of the vToken to get the liquidation Incentive for
     * @return liquidationIncentive The liquidation incentive for the vToken, scaled by 1e18
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
     * @param weightingStrategy The weighting strategy to use:
     *                          - `WeightFunction.USE_COLLATERAL_FACTOR` to use collateral factor
     *                          - `WeightFunction.USE_LIQUIDATION_THRESHOLD` to use liquidation threshold
     * @return factor The effective loan-to-value factor, scaled by 1e18.
     */
    function getEffectiveLtvFactor(
        address account,
        address vToken,
        WeightFunction weightingStrategy
    ) external view returns (uint256) {
        (uint256 cf, uint256 lt, ) = getLiquidationParams(userPoolId[account], vToken);
        if (weightingStrategy == WeightFunction.USE_COLLATERAL_FACTOR) return cf;
        else if (weightingStrategy == WeightFunction.USE_LIQUIDATION_THRESHOLD) return lt;
        else revert InvalidWeightingStrategy(weightingStrategy);
    }

    /**
     * @notice Get the Effective liquidation Incentive for or a given account and market
     * @dev The incentive is determined by the pool that the account has entered (`userPoolId[account]`)
     *      together with the specified vToken. If the vToken is not part of the user’s pool,
     *      the Core Pool (`poolId = 0`) is used as a fallback
     * @param account The account whose pool is used to determine the market's risk parameters
     * @param vToken The address of the vToken market
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
     * @custom:error PoolDoesNotExist Reverts if the given pool ID do not exist.
     * @custom:error InvalidOperationForCorePool Reverts if called on the Core Pool.
     */
    function getPoolVTokens(uint96 poolId) external view returns (address[] memory) {
        if (poolId > lastPoolId) revert PoolDoesNotExist(poolId);
        if (poolId == corePoolId) revert InvalidOperationForCorePool();
        return pools[poolId].vTokens;
    }

    /**
     * @notice Returns the market configuration for a vToken in the core pool (poolId = 0).
     * @dev Fetches the Market struct associated with the core pool and returns all relevant parameters.
     * @param vToken The address of the vToken whose market configuration is to be fetched.
     * @return isListed Whether the market is listed and enabled.
     * @return collateralFactorMantissa The maximum borrowable percentage of collateral, in mantissa.
     * @return isVenus Whether this market is eligible for VENUS rewards.
     * @return liquidationThresholdMantissa The threshold at which liquidation is triggered, in mantissa.
     * @return liquidationIncentiveMantissa The max liquidation incentive allowed for this market, in mantissa.
     * @return marketPoolId The pool ID this market belongs to.
     * @return isBorrowAllowed Whether borrowing is allowed in this market.
     */
    function markets(
        address vToken
    )
        external
        view
        returns (
            bool isListed,
            uint256 collateralFactorMantissa,
            bool isVenus,
            uint256 liquidationThresholdMantissa,
            uint256 liquidationIncentiveMantissa,
            uint96 marketPoolId,
            bool isBorrowAllowed
        )
    {
        return poolMarkets(corePoolId, vToken);
    }

    /**
     * @notice Returns the market configuration for a vToken from _poolMarkets.
     * @dev Fetches the Market struct associated with the poolId and returns all relevant parameters.
     * @param poolId The ID of the pool whose market configuration is being queried.
     * @param vToken The address of the vToken whose market configuration is to be fetched.
     * @return isListed Whether the market is listed and enabled.
     * @return collateralFactorMantissa The maximum borrowable percentage of collateral, in mantissa.
     * @return isVenus Whether this market is eligible for XVS rewards.
     * @return liquidationThresholdMantissa The threshold at which liquidation is triggered, in mantissa.
     * @return maxLiquidationIncentiveMantissa The max liquidation incentive allowed for this market, in mantissa.
     * @return marketPoolId The pool ID this market belongs to.
     * @return isBorrowAllowed Whether borrowing is allowed in this market.
     * @custom:error PoolDoesNotExist Reverts if the given pool ID do not exist.
     */
    function poolMarkets(
        uint96 poolId,
        address vToken
    )
        public
        view
        returns (
            bool isListed,
            uint256 collateralFactorMantissa,
            bool isVenus,
            uint256 liquidationThresholdMantissa,
            uint256 maxLiquidationIncentiveMantissa,
            uint96 marketPoolId,
            bool isBorrowAllowed
        )
    {
        if (poolId > lastPoolId) revert PoolDoesNotExist(poolId);
        PoolMarketId key = getPoolMarketIndex(poolId, vToken);
        Market storage m = _poolMarkets[key];

        return (
            m.isListed,
            m.collateralFactorMantissa,
            m.isVenus,
            m.liquidationThresholdMantissa,
            m.liquidationIncentiveMantissa,
            m.poolId,
            m.isBorrowAllowed
        );
    }

    /**
     * @notice Returns true if the user can switch to the given target pool, i.e.,
     * all markets they have borrowed from are also borrowable in the target pool.
     * @param account The address of the user attempting to switch pools.
     * @param targetPoolId The pool ID the user wants to switch into.
     * @return bool True if the switch is allowed, otherwise False.
     */
    function hasValidPoolBorrows(address account, uint96 targetPoolId) public view returns (bool) {
        VToken[] memory assets = accountAssets[account];
        if (targetPoolId != corePoolId && mintedVAIs[account] > 0) {
            return false;
        }

        for (uint256 i; i < assets.length; i++) {
            VToken vToken = assets[i];
            PoolMarketId index = getPoolMarketIndex(targetPoolId, address(vToken));

            if (!_poolMarkets[index].isBorrowAllowed) {
                if (vToken.borrowBalanceStored(account) > 0) {
                    return false;
                }
            }
        }
        return true;
    }

    function _updateDelegate(address approver, address delegate, bool approved) internal {
        approvedDelegates[approver][delegate] = approved;
        emit DelegateUpdated(approver, delegate, approved);
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

    function __supportMarket(VToken vToken) internal returns (uint256) {
        ensureAllowed("_supportMarket(address)");

        if (getCorePoolMarket(address(vToken)).isListed) {
            return fail(Error.MARKET_ALREADY_LISTED, FailureInfo.SUPPORT_MARKET_EXISTS);
        }

        vToken.isVToken(); // Sanity check to make sure its really a VToken

        // Note that isVenus is not in active use anymore
        Market storage newMarket = _poolMarkets[getCorePoolMarketIndex(address(vToken))];
        newMarket.isListed = true;
        newMarket.isVenus = false;
        newMarket.collateralFactorMantissa = 0;

        _addMarketInternal(vToken);
        _initializeMarket(address(vToken));

        emit MarketListed(vToken);

        return uint256(Error.NO_ERROR);
    }

    function _addPoolMarket(uint96 poolId, address vToken) internal {
        ensureAllowed("addPoolMarket(uint96,address)");

        if (poolId == corePoolId) revert InvalidOperationForCorePool();
        if (poolId > lastPoolId) revert PoolDoesNotExist(poolId);

        // Core Pool Index
        PoolMarketId index = getPoolMarketIndex(corePoolId, vToken);
        if (!_poolMarkets[index].isListed) revert MarketNotListedInCorePool();

        // Pool Index
        index = getPoolMarketIndex(poolId, vToken);
        if (_poolMarkets[index].isListed) revert MarketAlreadyListed(poolId, vToken);

        Market storage m = _poolMarkets[index];
        m.poolId = poolId;
        m.isListed = true;

        pools[poolId].vTokens.push(vToken);

        emit PoolMarketInitialized(poolId, vToken);
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
        PoolMarketId coreKey = getPoolMarketIndex(corePoolId, vToken);
        PoolMarketId poolKey = getPoolMarketIndex(poolId, vToken);

        Market storage market;

        if (poolId == corePoolId) {
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
