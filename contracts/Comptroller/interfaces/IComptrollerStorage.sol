// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { IVToken } from "../../Tokens/VTokens/interfaces/IVToken.sol";
import { IVAIController } from "../../Tokens/VAI/interfaces/IVAIController.sol";
import { IPrime } from "../../Tokens/Prime/IPrime.sol";
import { IComptrollerLens } from "../../Lens/interfaces/IComptrollerLens.sol";

import { IUnitrollerAdminStorage } from "./IUnitrollerAdminStorage.sol";

interface IComptrollerStorage is IUnitrollerAdminStorage {
    /**
     * @notice Oracle which gives the price of any given asset
     */
    function oracle() external view returns (ResilientOracleInterface);

    /**
     * @notice Multiplier used to calculate the maximum repayAmount when liquidating a borrow
     */
    function closeFactorMantissa() external view returns (uint256);

    /**
     * @notice Multiplier representing the discount on collateral that a liquidator receives
     */
    function liquidationIncentiveMantissa() external view returns (uint256);

    /**
     * @notice Max number of assets a single account can participate in (borrow or use as collateral)
     */
    function maxAssets() external view returns (uint256);

    /**
     * @notice Per-account mapping of "assets you are in", capped by maxAssets
     */
    function accountAssets(address, uint256) external view returns (IVToken);

    /**
     * @notice Official mapping of vTokens -> Market metadata
     * @dev Used e.g. to determine if a market is supported
     */
    function markets(address) external view returns (bool isListed, uint256 collateralFactorMantissa, bool _unused);

    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     */
    function pauseGuardian() external view returns (address);

    /// @notice A list of all markets
    function allMarkets(uint256) external view returns (IVToken);

    /// @notice The Venus market supply state for each market
    function venusSupplyState(address) external view returns (uint224, uint32);

    /// @notice The Venus market borrow state for each market
    function venusBorrowState(address) external view returns (uint224, uint32);

    /// @notice The Venus supply index for each market for each supplier as of the last time they accrued XVS
    function venusSupplierIndex(address, address) external view returns (uint256);

    /// @notice The Venus borrow index for each market for each borrower as of the last time they accrued XVS
    function venusBorrowerIndex(address, address) external view returns (uint256);

    /// @notice The XVS accrued but not yet transferred to each user
    function venusAccrued(address) external view returns (uint256);

    /// @notice The Address of VAIController
    function vaiController() external view returns (IVAIController);

    /// @notice The minted VAI amount to each user
    function mintedVAIs(address) external view returns (uint256);

    /// @notice VAI Mint Rate as a percentage
    function vaiMintRate() external view returns (uint256);

    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     */
    function mintVAIGuardianPaused() external view returns (bool);
    function repayVAIGuardianPaused() external view returns (bool);

    /**
     * @notice Pause/Unpause whole protocol actions
     */
    function protocolPaused() external view returns (bool);

    /// @notice The rate at which the flywheel distributes XVS to VAI Vault, per block
    function venusVAIVaultRate() external view returns (uint256);

    // @notice address of VAI Vault
    function vaiVaultAddress() external view returns (address);

    // @notice start block of release to VAI Vault
    function releaseStartBlock() external view returns (uint256);

    // minimum release amount to VAI Vault
    function minReleaseAmount() external view returns (uint256);

    /// @notice The borrowCapGuardian can set borrowCaps to any number for any market. Lowering the borrow cap could disable borrowing on the given market.
    function borrowCapGuardian() external view returns (address);

    /// @notice Borrow caps enforced by borrowAllowed for each vToken address.
    function borrowCaps(address) external view returns (uint256);

    /// @notice Treasury Guardian address
    function treasuryGuardian() external view returns (address);

    /// @notice Treasury address
    function treasuryAddress() external view returns (address);

    /// @notice Fee percent of accrued interest with decimal 18
    function treasuryPercent() external view returns (uint256);

    function liquidatorContract() external view returns (address);

    function comptrollerLens() external view returns (IComptrollerLens);

    /// @notice Supply caps enforced by mintAllowed for each vToken address. Defaults to zero which corresponds to minting notAllowed
    function supplyCaps(address) external view returns (uint256);

    /// @notice The rate at which venus is distributed to the corresponding borrow market (per block)
    function venusBorrowSpeeds(address) external view returns (uint256);

    /// @notice The rate at which venus is distributed to the corresponding supply market (per block)
    function venusSupplySpeeds(address) external view returns (uint256);

    /// @notice Whether the delegate is allowed to borrow or redeem on behalf of the user
    function approvedDelegates(address user, address delegate) external view returns (bool);

    /// @notice Whether forced liquidation is enabled for all users borrowing in a certain market
    function isForcedLiquidationEnabled(address vTokenBorrowed) external view returns (bool);

    /// @notice Prime token address
    function prime() external view returns (IPrime);

    /// @notice Whether forced liquidation is enabled for the borrows of a user in a market
    function isForcedLiquidationEnabledForUser(address user, address vTokenBorrowed) external view returns (bool);
}
