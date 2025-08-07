// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { IVToken } from "../../../Tokens/VTokens/interfaces/IVToken.sol";

/**
 * @title IMarketFacet
 * @author Venus
 * @dev Interface for the MarketFacet which contains all methods related to market management in the pool
 * @notice This interface defines functions for managing markets, including listing, entering/exiting markets,
 *         liquidation calculations, and delegate management
 */
interface IMarketFacet {
    /**
     * @notice Indicator that this is a Comptroller contract (for inspection)
     * @return True indicating this is a Comptroller contract
     */
    function isComptroller() external pure returns (bool);

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in vToken.liquidateBorrowFresh)
     * @param vTokenBorrowed The address of the borrowed vToken
     * @param vTokenCollateral The address of the collateral vToken
     * @param actualRepayAmount The amount of vTokenBorrowed underlying to convert into vTokenCollateral tokens
     * @return errorCode The error code (0 for success)
     * @return seizeTokens Number of vTokenCollateral tokens to be seized in a liquidation
     */
    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256);

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount for VAI liquidation
     * @dev Used in VAI liquidation (called in vToken.liquidateBorrowFresh)
     * @param vTokenCollateral The address of the collateral vToken
     * @param actualRepayAmount The amount of VAI to convert into vTokenCollateral tokens
     * @return errorCode The error code (0 for success)
     * @return seizeTokens Number of vTokenCollateral tokens to be seized in a liquidation
     */
    function liquidateVAICalculateSeizeTokens(
        address vTokenCollateral,
        uint256 actualRepayAmount
    ) external view returns (uint256, uint256);

    /**
     * @notice Returns whether the given account is entered in the given asset
     * @param account The address of the account to check
     * @param vToken The vToken to check
     * @return True if the account is in the asset, otherwise false
     */
    function checkMembership(address account, IVToken vToken) external view returns (bool);

    /**
     * @notice Add assets to be included in account liquidity calculation
     * @param vTokens The list of addresses of the vToken markets to be enabled
     * @return Success indicator for whether each corresponding market was entered
     */
    function enterMarkets(address[] calldata vTokens) external returns (uint256[] memory);

    /**
     * @notice Removes asset from sender's account liquidity calculation
     * @dev Sender must not have an outstanding borrow balance in the asset,
     *  or be providing necessary collateral for an outstanding borrow
     * @param vToken The address of the asset to be removed
     * @return Whether or not the account successfully exited the market (0 for success)
     */
    function exitMarket(address vToken) external returns (uint256);

    /**
     * @notice Add the market to the markets mapping and set it as listed
     * @dev Allows a privileged role to add and list markets to the Comptroller
     * @param vToken The address of the market (token) to list
     * @return uint256 0=success, otherwise a failure. (See enum Error for details)
     */
    function _supportMarket(IVToken vToken) external returns (uint256);

    /**
     * @notice Alias to _supportMarket to support the Isolated Lending Comptroller Interface
     * @param vToken The address of the market (token) to list
     * @return uint256 0=success, otherwise a failure. (See enum Error for details)
     */
    function supportMarket(IVToken vToken) external returns (uint256);

    /**
     * @notice Check if a market is marked as listed (active)
     * @param vToken vToken Address for the market to check
     * @return True if listed otherwise false
     */
    function isMarketListed(IVToken vToken) external view returns (bool);

    /**
     * @notice Returns the assets an account has entered
     * @param account The address of the account to pull assets for
     * @return A dynamic list with the assets the account has entered
     */
    function getAssetsIn(address account) external view returns (IVToken[] memory);

    /**
     * @notice Return all of the markets
     * @dev The automatic getter may be used to access an individual market
     * @return The list of market addresses
     */
    function getAllMarkets() external view returns (IVToken[] memory);

    /**
     * @notice Grants or revokes the borrowing or redeeming delegate rights to / from an account
     * @dev If allowed, the delegate will be able to borrow funds on behalf of the sender.
     * Upon a delegated borrow, the delegate will receive the funds, and the borrower
     * will see the debt on their account.
     * Upon a delegated redeem, the delegate will receive the redeemed amount and the approver
     * will see a deduction in his vToken balance
     * @param delegate The address to update the rights for
     * @param allowBorrows Whether to grant (true) or revoke (false) the borrowing or redeeming rights
     */
    function updateDelegate(address delegate, bool allowBorrows) external;

    /**
     * @notice Unlist a market by setting isListed to false
     * @dev Checks if market actions are paused and borrowCap/supplyCap/CF are set to 0
     * @param market The address of the market (vToken) to unlist
     * @return uint256 0=success, otherwise a failure. (See enum Error for details)
     */
    function unlistMarket(address market) external returns (uint256);
}
