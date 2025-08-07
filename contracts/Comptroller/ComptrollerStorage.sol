// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { IVToken } from "../Tokens/VTokens/interfaces/IVToken.sol";
import { IVAIController } from "../Tokens/VAI/interfaces/IVAIController.sol";
import { IComptrollerLens } from "../Lens/interfaces/IComptrollerLens.sol";
import { IPrime } from "../Tokens/Prime/IPrime.sol";

import { IComptrollerStorage } from "./interfaces/IComptrollerStorage.sol";
import { UnitrollerAdminStorage } from "./UnitrollerAdminStorage.sol";

contract ComptrollerStorage is IComptrollerStorage, UnitrollerAdminStorage {
    struct Market {
        /// @notice Whether or not this market is listed
        bool isListed;
        /**
         * @notice Multiplier representing the most one can borrow against their collateral in this market.
         *  For instance, 0.9 to allow borrowing 90% of collateral value.
         *  Must be between 0 and 1, and stored as a mantissa.
         */
        uint256 collateralFactorMantissa;
        /// @notice Per-market mapping of "accounts in this asset"
        mapping(address => bool) accountMembership;
        /// @notice Whether or not this market receives XVS
        bool isVenus;
    }

    struct VenusMarketState {
        /// @notice The market's last updated venusBorrowIndex or venusSupplyIndex
        uint224 index;
        /// @notice The block number the index was last updated at
        uint32 block;
    }

    struct FacetAddressAndPosition {
        address facetAddress;
        uint96 functionSelectorPosition; // position in _facetFunctionSelectors.functionSelectors array
    }

    struct FacetFunctionSelectors {
        bytes4[] functionSelectors;
        uint256 facetAddressPosition; // position of facetAddress in _facetAddresses array
    }

    /**
     * @notice Oracle which gives the price of any given asset
     */
    ResilientOracleInterface public oracle;

    /**
     * @notice Multiplier used to calculate the maximum repayAmount when liquidating a borrow
     */
    uint256 public closeFactorMantissa;

    /**
     * @notice Multiplier representing the discount on collateral that a liquidator receives
     */
    uint256 public liquidationIncentiveMantissa;

    /**
     * @notice Max number of assets a single account can participate in (borrow or use as collateral)
     */
    uint256 public maxAssets;

    /**
     * @notice Per-account mapping of "assets you are in", capped by maxAssets
     */
    mapping(address => IVToken[]) public accountAssets;

    /**
     * @notice Official mapping of vTokens -> Market metadata
     * @dev Used e.g. to determine if a market is supported
     */
    mapping(address => Market) public markets;

    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     */
    address public pauseGuardian;

    /// @notice Whether minting is paused (deprecated, superseded by actionPaused)
    bool private _mintGuardianPaused;
    /// @notice Whether borrowing is paused (deprecated, superseded by actionPaused)
    bool private _borrowGuardianPaused;
    /// @notice Whether borrowing is paused (deprecated, superseded by actionPaused)
    bool internal transferGuardianPaused;
    /// @notice Whether borrowing is paused (deprecated, superseded by actionPaused)
    bool internal seizeGuardianPaused;
    /// @notice Whether borrowing is paused (deprecated, superseded by actionPaused)
    mapping(address => bool) internal mintGuardianPaused;
    /// @notice Whether borrowing is paused (deprecated, superseded by actionPaused)
    mapping(address => bool) internal borrowGuardianPaused;

    /// @notice A list of all markets
    IVToken[] public allMarkets;

    /// @notice The rate at which the flywheel distributes XVS, per block
    uint256 internal venusRate;

    /// @notice The portion of venusRate that each market currently receives
    mapping(address => uint256) internal venusSpeeds;

    /// @notice The Venus market supply state for each market
    mapping(address => VenusMarketState) public venusSupplyState;

    /// @notice The Venus market borrow state for each market
    mapping(address => VenusMarketState) public venusBorrowState;

    /// @notice The Venus supply index for each market for each supplier as of the last time they accrued XVS
    mapping(address => mapping(address => uint256)) public venusSupplierIndex;

    /// @notice The Venus borrow index for each market for each borrower as of the last time they accrued XVS
    mapping(address => mapping(address => uint256)) public venusBorrowerIndex;

    /// @notice The XVS accrued but not yet transferred to each user
    mapping(address => uint256) public venusAccrued;

    /// @notice The Address of VAIController
    IVAIController public vaiController;

    /// @notice The minted VAI amount to each user
    mapping(address => uint256) public mintedVAIs;

    /// @notice VAI Mint Rate as a percentage
    uint256 public vaiMintRate;

    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     */
    bool public mintVAIGuardianPaused;
    bool public repayVAIGuardianPaused;

    /**
     * @notice Pause/Unpause whole protocol actions
     */
    bool public protocolPaused;

    /// @notice The rate at which the flywheel distributes XVS to VAI Minters, per block (deprecated)
    uint256 private venusVAIRate;

    /// @notice The rate at which the flywheel distributes XVS to VAI Vault, per block
    uint256 public venusVAIVaultRate;

    // address of VAI Vault
    address public vaiVaultAddress;

    // start block of release to VAI Vault
    uint256 public releaseStartBlock;

    // minimum release amount to VAI Vault
    uint256 public minReleaseAmount;

    /// @notice The borrowCapGuardian can set borrowCaps to any number for any market. Lowering the borrow cap could disable borrowing on the given market.
    address public borrowCapGuardian;

    /// @notice Borrow caps enforced by borrowAllowed for each vToken address.
    mapping(address => uint256) public borrowCaps;

    /// @notice Treasury Guardian address
    address public treasuryGuardian;

    /// @notice Treasury address
    address public treasuryAddress;

    /// @notice Fee percent of accrued interest with decimal 18
    uint256 public treasuryPercent;

    /// @notice The portion of XVS that each contributor receives per block (deprecated)
    mapping(address => uint256) private venusContributorSpeeds;

    /// @notice Last block at which a contributor's XVS rewards have been allocated (deprecated)
    mapping(address => uint256) private lastContributorBlock;

    address public liquidatorContract;

    IComptrollerLens public comptrollerLens;

    /// @notice Supply caps enforced by mintAllowed for each vToken address. Defaults to zero which corresponds to minting notAllowed
    mapping(address => uint256) public supplyCaps;

    /// @notice AccessControlManager address
    address internal accessControl;

    /// @notice True if a certain action is paused on a certain market
    mapping(address => mapping(uint256 => bool)) internal _actionPaused;

    /// @notice The rate at which venus is distributed to the corresponding borrow market (per block)
    mapping(address => uint256) public venusBorrowSpeeds;

    /// @notice The rate at which venus is distributed to the corresponding supply market (per block)
    mapping(address => uint256) public venusSupplySpeeds;

    /// @notice Whether the delegate is allowed to borrow or redeem on behalf of the user
    //mapping(address user => mapping (address delegate => bool approved)) public approvedDelegates;
    mapping(address => mapping(address => bool)) public approvedDelegates;

    /// @notice Whether forced liquidation is enabled for all users borrowing in a certain market
    mapping(address => bool) public isForcedLiquidationEnabled;

    mapping(bytes4 => FacetAddressAndPosition) internal _selectorToFacetAndPosition;
    // maps facet addresses to function selectors
    mapping(address => FacetFunctionSelectors) internal _facetFunctionSelectors;
    // facet addresses
    address[] internal _facetAddresses;

    /// @notice Prime token address
    IPrime public prime;

    /// @notice Whether forced liquidation is enabled for the borrows of a user in a market
    mapping(address user => mapping(address market => bool)) public isForcedLiquidationEnabledForUser;

    /// @notice The XVS token contract address
    address internal xvs;

    /// @notice The XVS vToken contract address
    address internal xvsVToken;
}
