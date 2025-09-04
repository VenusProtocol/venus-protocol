// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { ExponentialNoError } from "../Utils/ExponentialNoError.sol";
import { VBep20 } from "../Tokens/VTokens/VBep20.sol";
import { VToken } from "../Tokens/VTokens/VToken.sol";
import { ComptrollerInterface, Action } from "../Comptroller/ComptrollerInterface.sol";
import { IXVS } from "../Tokens/XVS/IXVS.sol";

contract VenusLens is ExponentialNoError {
    /// @notice Blocks Per Day
    uint public constant BLOCKS_PER_DAY = 28800;

    /// @notice Total actions available on VToken
    uint public constant VTOKEN_ACTIONS = 8;

    struct VenusMarketState {
        uint224 index;
        uint32 block;
    }

    struct VTokenMetadata {
        address vToken;
        uint exchangeRateCurrent;
        uint supplyRatePerBlock;
        uint borrowRatePerBlock;
        uint reserveFactorMantissa;
        uint totalBorrows;
        uint totalReserves;
        uint totalSupply;
        uint totalCash;
        bool isListed;
        uint collateralFactorMantissa;
        address underlyingAssetAddress;
        uint vTokenDecimals;
        uint underlyingDecimals;
        uint venusSupplySpeed;
        uint venusBorrowSpeed;
        uint dailySupplyXvs;
        uint dailyBorrowXvs;
        uint pausedActions;
    }

    struct VTokenBalances {
        address vToken;
        uint balanceOf;
        uint borrowBalanceCurrent;
        uint balanceOfUnderlying;
        uint tokenBalance;
        uint tokenAllowance;
    }

    struct VTokenUnderlyingPrice {
        address vToken;
        uint underlyingPrice;
    }

    struct AccountLimits {
        VToken[] markets;
        uint liquidity;
        uint shortfall;
    }

    struct XVSBalanceMetadata {
        uint balance;
        uint votes;
        address delegate;
    }

    struct XVSBalanceMetadataExt {
        uint balance;
        uint votes;
        address delegate;
        uint allocated;
    }

    struct VenusVotes {
        uint blockNumber;
        uint votes;
    }

    struct ClaimVenusLocalVariables {
        uint totalRewards;
        uint224 borrowIndex;
        uint32 borrowBlock;
        uint224 supplyIndex;
        uint32 supplyBlock;
    }

    /**
     * @dev Struct for Pending Rewards for per market
     */
    struct PendingReward {
        address vTokenAddress;
        uint256 amount;
    }

    /**
     * @dev Struct for Reward of a single reward token.
     */
    struct RewardSummary {
        address distributorAddress;
        address rewardTokenAddress;
        uint256 totalRewards;
        PendingReward[] pendingRewards;
    }

    /// @notice Holds full market information for a single vToken within a specific pool (excluding the Core Pool)
    struct MarketData {
        uint96 poolId;
        string poolLabel;
        address vToken;
        bool isListed;
        uint256 collateralFactor;
        bool isVenus;
        uint256 liquidationThreshold;
        uint256 liquidationIncentive;
        bool isBorrowAllowed;
    }

    /// @notice Struct representing a pool (excluding the Core Pool) and its associated markets
    struct PoolWithMarkets {
        uint96 poolId;
        string label;
        MarketData[] markets;
    }

    /// @notice Thrown when a given pool ID does not exist
    error PoolDoesNotExist(uint96 poolId);

    /// @notice Thrown when trying to call pool-specific methods on the Core Pool
    error InvalidOperationForCorePool();

    /**
     * @notice Query the metadata of a vToken by its address
     * @param vToken The address of the vToken to fetch VTokenMetadata
     * @return VTokenMetadata struct with vToken supply and borrow information.
     */
    function vTokenMetadata(VToken vToken) public returns (VTokenMetadata memory) {
        uint exchangeRateCurrent = vToken.exchangeRateCurrent();
        address comptrollerAddress = address(vToken.comptroller());
        ComptrollerInterface comptroller = ComptrollerInterface(comptrollerAddress);
        (bool isListed, uint collateralFactorMantissa) = comptroller.markets(address(vToken));
        address underlyingAssetAddress;
        uint underlyingDecimals;

        if (compareStrings(vToken.symbol(), "vBNB")) {
            underlyingAssetAddress = address(0);
            underlyingDecimals = 18;
        } else {
            VBep20 vBep20 = VBep20(address(vToken));
            underlyingAssetAddress = vBep20.underlying();
            underlyingDecimals = IERC20Metadata(vBep20.underlying()).decimals();
        }

        uint venusSupplySpeedPerBlock = comptroller.venusSupplySpeeds(address(vToken));
        uint venusBorrowSpeedPerBlock = comptroller.venusBorrowSpeeds(address(vToken));

        uint256 pausedActions;

        for (uint8 i; i <= VTOKEN_ACTIONS; ++i) {
            uint256 paused = comptroller.actionPaused(address(vToken), Action(i)) ? 1 : 0;
            pausedActions |= paused << i;
        }

        return
            VTokenMetadata({
                vToken: address(vToken),
                exchangeRateCurrent: exchangeRateCurrent,
                supplyRatePerBlock: vToken.supplyRatePerBlock(),
                borrowRatePerBlock: vToken.borrowRatePerBlock(),
                reserveFactorMantissa: vToken.reserveFactorMantissa(),
                totalBorrows: vToken.totalBorrows(),
                totalReserves: vToken.totalReserves(),
                totalSupply: vToken.totalSupply(),
                totalCash: vToken.getCash(),
                isListed: isListed,
                collateralFactorMantissa: collateralFactorMantissa,
                underlyingAssetAddress: underlyingAssetAddress,
                vTokenDecimals: vToken.decimals(),
                underlyingDecimals: underlyingDecimals,
                venusSupplySpeed: venusSupplySpeedPerBlock,
                venusBorrowSpeed: venusBorrowSpeedPerBlock,
                dailySupplyXvs: venusSupplySpeedPerBlock * BLOCKS_PER_DAY,
                dailyBorrowXvs: venusBorrowSpeedPerBlock * BLOCKS_PER_DAY,
                pausedActions: pausedActions
            });
    }

    /**
     * @notice Get VTokenMetadata for an array of vToken addresses
     * @param vTokens Array of vToken addresses to fetch VTokenMetadata
     * @return Array of structs with vToken supply and borrow information.
     */
    function vTokenMetadataAll(VToken[] calldata vTokens) external returns (VTokenMetadata[] memory) {
        uint vTokenCount = vTokens.length;
        VTokenMetadata[] memory res = new VTokenMetadata[](vTokenCount);
        for (uint i = 0; i < vTokenCount; i++) {
            res[i] = vTokenMetadata(vTokens[i]);
        }
        return res;
    }

    /**
     * @notice Get amount of XVS distributed daily to an account
     * @param account Address of account to fetch the daily XVS distribution
     * @param comptrollerAddress Address of the comptroller proxy
     * @return Amount of XVS distributed daily to an account
     */
    function getDailyXVS(address payable account, address comptrollerAddress) external returns (uint) {
        ComptrollerInterface comptrollerInstance = ComptrollerInterface(comptrollerAddress);
        VToken[] memory vTokens = comptrollerInstance.getAllMarkets();
        uint dailyXvsPerAccount = 0;

        for (uint i = 0; i < vTokens.length; i++) {
            VToken vToken = vTokens[i];
            if (!compareStrings(vToken.symbol(), "vUST") && !compareStrings(vToken.symbol(), "vLUNA")) {
                VTokenMetadata memory metaDataItem = vTokenMetadata(vToken);

                //get balanceOfUnderlying and borrowBalanceCurrent from vTokenBalance
                VTokenBalances memory vTokenBalanceInfo = vTokenBalances(vToken, account);

                VTokenUnderlyingPrice memory underlyingPriceResponse = vTokenUnderlyingPrice(vToken);
                uint underlyingPrice = underlyingPriceResponse.underlyingPrice;
                Exp memory underlyingPriceMantissa = Exp({ mantissa: underlyingPrice });

                //get dailyXvsSupplyMarket
                uint dailyXvsSupplyMarket = 0;
                uint supplyInUsd = mul_ScalarTruncate(underlyingPriceMantissa, vTokenBalanceInfo.balanceOfUnderlying);
                uint marketTotalSupply = (metaDataItem.totalSupply * metaDataItem.exchangeRateCurrent) / 1e18;
                uint marketTotalSupplyInUsd = mul_ScalarTruncate(underlyingPriceMantissa, marketTotalSupply);

                if (marketTotalSupplyInUsd > 0) {
                    dailyXvsSupplyMarket = (metaDataItem.dailySupplyXvs * supplyInUsd) / marketTotalSupplyInUsd;
                }

                //get dailyXvsBorrowMarket
                uint dailyXvsBorrowMarket = 0;
                uint borrowsInUsd = mul_ScalarTruncate(underlyingPriceMantissa, vTokenBalanceInfo.borrowBalanceCurrent);
                uint marketTotalBorrowsInUsd = mul_ScalarTruncate(underlyingPriceMantissa, metaDataItem.totalBorrows);

                if (marketTotalBorrowsInUsd > 0) {
                    dailyXvsBorrowMarket = (metaDataItem.dailyBorrowXvs * borrowsInUsd) / marketTotalBorrowsInUsd;
                }

                dailyXvsPerAccount += dailyXvsSupplyMarket + dailyXvsBorrowMarket;
            }
        }

        return dailyXvsPerAccount;
    }

    /**
     * @notice Get the current vToken balance (outstanding borrows) for an account
     * @param vToken Address of the token to check the balance of
     * @param account Account address to fetch the balance of
     * @return VTokenBalances with token balance information
     */
    function vTokenBalances(VToken vToken, address payable account) public returns (VTokenBalances memory) {
        uint balanceOf = vToken.balanceOf(account);
        uint borrowBalanceCurrent = vToken.borrowBalanceCurrent(account);
        uint balanceOfUnderlying = vToken.balanceOfUnderlying(account);
        uint tokenBalance;
        uint tokenAllowance;

        if (compareStrings(vToken.symbol(), "vBNB")) {
            tokenBalance = account.balance;
            tokenAllowance = account.balance;
        } else {
            VBep20 vBep20 = VBep20(address(vToken));
            IERC20Metadata underlying = IERC20Metadata(vBep20.underlying());
            tokenBalance = underlying.balanceOf(account);
            tokenAllowance = underlying.allowance(account, address(vToken));
        }

        return
            VTokenBalances({
                vToken: address(vToken),
                balanceOf: balanceOf,
                borrowBalanceCurrent: borrowBalanceCurrent,
                balanceOfUnderlying: balanceOfUnderlying,
                tokenBalance: tokenBalance,
                tokenAllowance: tokenAllowance
            });
    }

    /**
     * @notice Get the current vToken balances (outstanding borrows) for all vTokens on an account
     * @param vTokens Addresses of the tokens to check the balance of
     * @param account Account address to fetch the balance of
     * @return VTokenBalances Array with token balance information
     */
    function vTokenBalancesAll(
        VToken[] calldata vTokens,
        address payable account
    ) external returns (VTokenBalances[] memory) {
        uint vTokenCount = vTokens.length;
        VTokenBalances[] memory res = new VTokenBalances[](vTokenCount);
        for (uint i = 0; i < vTokenCount; i++) {
            res[i] = vTokenBalances(vTokens[i], account);
        }
        return res;
    }

    /**
     * @notice Get the price for the underlying asset of a vToken
     * @param vToken address of the vToken
     * @return response struct with underlyingPrice info of vToken
     */
    function vTokenUnderlyingPrice(VToken vToken) public view returns (VTokenUnderlyingPrice memory) {
        ComptrollerInterface comptroller = ComptrollerInterface(address(vToken.comptroller()));
        ResilientOracleInterface priceOracle = comptroller.oracle();

        return
            VTokenUnderlyingPrice({
                vToken: address(vToken),
                underlyingPrice: priceOracle.getUnderlyingPrice(address(vToken))
            });
    }

    /**
     * @notice Query the underlyingPrice of an array of vTokens
     * @param vTokens Array of vToken addresses
     * @return array of response structs with underlying price information of vTokens
     */
    function vTokenUnderlyingPriceAll(
        VToken[] calldata vTokens
    ) external view returns (VTokenUnderlyingPrice[] memory) {
        uint vTokenCount = vTokens.length;
        VTokenUnderlyingPrice[] memory res = new VTokenUnderlyingPrice[](vTokenCount);
        for (uint i = 0; i < vTokenCount; i++) {
            res[i] = vTokenUnderlyingPrice(vTokens[i]);
        }
        return res;
    }

    /**
     * @notice Query the account liquidity and shortfall of an account
     * @param comptroller Address of comptroller proxy
     * @param account Address of the account to query
     * @return Struct with markets user has entered, liquidity, and shortfall of the account
     */
    function getAccountLimits(
        ComptrollerInterface comptroller,
        address account
    ) public view returns (AccountLimits memory) {
        (uint errorCode, uint liquidity, uint shortfall) = comptroller.getAccountLiquidity(account);
        require(errorCode == 0, "account liquidity error");

        return AccountLimits({ markets: comptroller.getAssetsIn(account), liquidity: liquidity, shortfall: shortfall });
    }

    /**
     * @notice Query the XVSBalance info of an account
     * @param xvs XVS contract address
     * @param account Account address
     * @return Struct with XVS balance and voter details
     */
    function getXVSBalanceMetadata(IXVS xvs, address account) external view returns (XVSBalanceMetadata memory) {
        return
            XVSBalanceMetadata({
                balance: xvs.balanceOf(account),
                votes: uint256(xvs.getCurrentVotes(account)),
                delegate: xvs.delegates(account)
            });
    }

    /**
     * @notice Query the XVSBalance extended info of an account
     * @param xvs XVS contract address
     * @param comptroller Comptroller proxy contract address
     * @param account Account address
     * @return Struct with XVS balance and voter details and XVS allocation
     */
    function getXVSBalanceMetadataExt(
        IXVS xvs,
        ComptrollerInterface comptroller,
        address account
    ) external returns (XVSBalanceMetadataExt memory) {
        uint balance = xvs.balanceOf(account);
        comptroller.claimVenus(account);
        uint newBalance = xvs.balanceOf(account);
        uint accrued = comptroller.venusAccrued(account);
        uint total = add_(accrued, newBalance, "sum xvs total");
        uint allocated = sub_(total, balance, "sub allocated");

        return
            XVSBalanceMetadataExt({
                balance: balance,
                votes: uint256(xvs.getCurrentVotes(account)),
                delegate: xvs.delegates(account),
                allocated: allocated
            });
    }

    /**
     * @notice Query the voting power for an account at a specific list of block numbers
     * @param xvs XVS contract address
     * @param account Address of the account
     * @param blockNumbers Array of blocks to query
     * @return Array of VenusVotes structs with block number and vote count
     */
    function getVenusVotes(
        IXVS xvs,
        address account,
        uint32[] calldata blockNumbers
    ) external view returns (VenusVotes[] memory) {
        VenusVotes[] memory res = new VenusVotes[](blockNumbers.length);
        for (uint i = 0; i < blockNumbers.length; i++) {
            res[i] = VenusVotes({
                blockNumber: uint256(blockNumbers[i]),
                votes: uint256(xvs.getPriorVotes(account, blockNumbers[i]))
            });
        }
        return res;
    }

    /**
     * @dev Queries the current supply to calculate rewards for an account
     * @param supplyState VenusMarketState struct
     * @param vToken Address of a vToken
     * @param comptroller Address of the comptroller proxy
     */
    function updateVenusSupplyIndex(
        VenusMarketState memory supplyState,
        address vToken,
        ComptrollerInterface comptroller
    ) internal view {
        uint supplySpeed = comptroller.venusSupplySpeeds(vToken);
        uint blockNumber = block.number;
        uint deltaBlocks = sub_(blockNumber, uint(supplyState.block));
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint supplyTokens = VToken(vToken).totalSupply();
            uint venusAccrued = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(venusAccrued, supplyTokens) : Double({ mantissa: 0 });
            Double memory index = add_(Double({ mantissa: supplyState.index }), ratio);
            supplyState.index = safe224(index.mantissa, "new index overflows");
            supplyState.block = safe32(blockNumber, "block number overflows");
        } else if (deltaBlocks > 0) {
            supplyState.block = safe32(blockNumber, "block number overflows");
        }
    }

    /**
     * @dev Queries the current borrow to calculate rewards for an account
     * @param borrowState VenusMarketState struct
     * @param vToken Address of a vToken
     * @param comptroller Address of the comptroller proxy
     */
    function updateVenusBorrowIndex(
        VenusMarketState memory borrowState,
        address vToken,
        Exp memory marketBorrowIndex,
        ComptrollerInterface comptroller
    ) internal view {
        uint borrowSpeed = comptroller.venusBorrowSpeeds(vToken);
        uint blockNumber = block.number;
        uint deltaBlocks = sub_(blockNumber, uint(borrowState.block));
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint borrowAmount = div_(VToken(vToken).totalBorrows(), marketBorrowIndex);
            uint venusAccrued = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(venusAccrued, borrowAmount) : Double({ mantissa: 0 });
            Double memory index = add_(Double({ mantissa: borrowState.index }), ratio);
            borrowState.index = safe224(index.mantissa, "new index overflows");
            borrowState.block = safe32(blockNumber, "block number overflows");
        } else if (deltaBlocks > 0) {
            borrowState.block = safe32(blockNumber, "block number overflows");
        }
    }

    /**
     * @dev Calculate available rewards for an account's supply
     * @param supplyState VenusMarketState struct
     * @param vToken Address of a vToken
     * @param supplier Address of the account supplying
     * @param comptroller Address of the comptroller proxy
     * @return Undistributed earned XVS from supplies
     */
    function distributeSupplierVenus(
        VenusMarketState memory supplyState,
        address vToken,
        address supplier,
        ComptrollerInterface comptroller
    ) internal view returns (uint) {
        Double memory supplyIndex = Double({ mantissa: supplyState.index });
        Double memory supplierIndex = Double({ mantissa: comptroller.venusSupplierIndex(vToken, supplier) });
        if (supplierIndex.mantissa == 0 && supplyIndex.mantissa > 0) {
            supplierIndex.mantissa = comptroller.venusInitialIndex();
        }

        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        uint supplierTokens = VToken(vToken).balanceOf(supplier);
        uint supplierDelta = mul_(supplierTokens, deltaIndex);
        return supplierDelta;
    }

    /**
     * @dev Calculate available rewards for an account's borrows
     * @param borrowState VenusMarketState struct
     * @param vToken Address of a vToken
     * @param borrower Address of the account borrowing
     * @param marketBorrowIndex vToken Borrow index
     * @param comptroller Address of the comptroller proxy
     * @return Undistributed earned XVS from borrows
     */
    function distributeBorrowerVenus(
        VenusMarketState memory borrowState,
        address vToken,
        address borrower,
        Exp memory marketBorrowIndex,
        ComptrollerInterface comptroller
    ) internal view returns (uint) {
        Double memory borrowIndex = Double({ mantissa: borrowState.index });
        Double memory borrowerIndex = Double({ mantissa: comptroller.venusBorrowerIndex(vToken, borrower) });
        if (borrowerIndex.mantissa > 0) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint borrowerAmount = div_(VToken(vToken).borrowBalanceStored(borrower), marketBorrowIndex);
            uint borrowerDelta = mul_(borrowerAmount, deltaIndex);
            return borrowerDelta;
        }
        return 0;
    }

    /**
     * @notice Calculate the total XVS tokens pending and accrued by a user account
     * @param holder Account to query pending XVS
     * @param comptroller Address of the comptroller
     * @return Reward object contraining the totalRewards and pending rewards for each market
     */
    function pendingRewards(
        address holder,
        ComptrollerInterface comptroller
    ) external view returns (RewardSummary memory) {
        VToken[] memory vTokens = comptroller.getAllMarkets();
        ClaimVenusLocalVariables memory vars;
        RewardSummary memory rewardSummary;
        rewardSummary.distributorAddress = address(comptroller);
        rewardSummary.rewardTokenAddress = comptroller.getXVSAddress();
        rewardSummary.totalRewards = comptroller.venusAccrued(holder);
        rewardSummary.pendingRewards = new PendingReward[](vTokens.length);
        for (uint i; i < vTokens.length; ++i) {
            (vars.borrowIndex, vars.borrowBlock) = comptroller.venusBorrowState(address(vTokens[i]));
            VenusMarketState memory borrowState = VenusMarketState({
                index: vars.borrowIndex,
                block: vars.borrowBlock
            });

            (vars.supplyIndex, vars.supplyBlock) = comptroller.venusSupplyState(address(vTokens[i]));
            VenusMarketState memory supplyState = VenusMarketState({
                index: vars.supplyIndex,
                block: vars.supplyBlock
            });

            Exp memory borrowIndex = Exp({ mantissa: vTokens[i].borrowIndex() });

            PendingReward memory marketReward;
            marketReward.vTokenAddress = address(vTokens[i]);

            updateVenusBorrowIndex(borrowState, address(vTokens[i]), borrowIndex, comptroller);
            uint256 borrowReward = distributeBorrowerVenus(
                borrowState,
                address(vTokens[i]),
                holder,
                borrowIndex,
                comptroller
            );

            updateVenusSupplyIndex(supplyState, address(vTokens[i]), comptroller);
            uint256 supplyReward = distributeSupplierVenus(supplyState, address(vTokens[i]), holder, comptroller);

            marketReward.amount = add_(borrowReward, supplyReward);
            rewardSummary.pendingRewards[i] = marketReward;
        }
        return rewardSummary;
    }

    /**
     * @notice Returns all pools (excluding the Core Pool) along with their associated market data
     * @param comptroller The Comptroller contract to query
     * @return poolsData An array of PoolWithMarkets structs, each containing pool info and its markets
     */
    function getAllPoolsData(
        ComptrollerInterface comptroller
    ) external view returns (PoolWithMarkets[] memory poolsData) {
        uint96 lastPoolId = comptroller.lastPoolId();
        poolsData = new PoolWithMarkets[](lastPoolId);

        for (uint96 i = 1; i <= lastPoolId; i++) {
            poolsData[i - 1] = PoolWithMarkets({
                poolId: i,
                label: comptroller.pools(i),
                markets: getMarketsDataByPool(i, comptroller)
            });
        }
    }

    /**
     * @notice Retrieves full market data for all vTokens in a specific pool (excluding the Core Pool)
     * @param comptroller The address of the Comptroller contract
     * @param poolId The pool ID to fetch data for
     * @return result An array of MarketData structs containing detailed market info for the given pool
     * @custom:error PoolDoesNotExist Reverts if the given pool ID does not exist
     * @custom:error InvalidOperationForCorePool Reverts if called on the Core Pool (`poolId = 0`)
     */
    function getMarketsDataByPool(
        uint96 poolId,
        ComptrollerInterface comptroller
    ) public view returns (MarketData[] memory result) {
        if (poolId > comptroller.lastPoolId()) revert PoolDoesNotExist(poolId);
        if (poolId == comptroller.corePoolId()) revert InvalidOperationForCorePool();

        address[] memory vTokens = comptroller.getPoolVTokens(poolId);
        uint256 length = vTokens.length;
        result = new MarketData[](length);

        string memory label = comptroller.pools(poolId);

        for (uint256 i; i < length; i++) {
            (
                bool isListed,
                uint256 collateralFactor,
                bool isVenus,
                uint256 liquidationThreshold,
                uint256 liquidationIncentive,
                uint96 marketPoolId,
                bool isBorrowAllowed
            ) = comptroller.poolMarkets(poolId, vTokens[i]);

            result[i] = MarketData({
                poolId: marketPoolId,
                poolLabel: label,
                vToken: vTokens[i],
                isListed: isListed,
                collateralFactor: collateralFactor,
                isVenus: isVenus,
                liquidationThreshold: liquidationThreshold,
                liquidationIncentive: liquidationIncentive,
                isBorrowAllowed: isBorrowAllowed
            });
        }
    }

    // utilities
    /**
     * @notice Compares if two strings are equal
     * @param a First string to compare
     * @param b Second string to compare
     * @return Boolean depending on if the strings are equal
     */
    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
