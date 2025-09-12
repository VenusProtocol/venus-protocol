// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

import { VToken } from "../../Tokens/VTokens/VToken.sol";
import { VAIControllerInterface } from "../../Tokens/VAI/VAIControllerInterface.sol";
import { ComptrollerLensInterfaceR1 } from "./ComptrollerLensInterfaceR1.sol";
import { IPrime } from "../../Tokens/Prime/IPrime.sol";

contract UnitrollerAdminStorageR1 {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     * @notice Pending administrator for this contract
     */
    address public pendingAdmin;

    /**
     * @notice Active brains of Unitroller
     */
    address public comptrollerImplementation;

    /**
     * @notice Pending brains of Unitroller
     */
    address public pendingComptrollerImplementation;
}

contract ComptrollerV1StorageR1 is UnitrollerAdminStorageR1 {
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
    mapping(address => VToken[]) public accountAssets;

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

    struct VenusMarketState {
        /// @notice The market's last updated venusBorrowIndex or venusSupplyIndex
        uint224 index;
        /// @notice The block number the index was last updated at
        uint32 block;
    }

    /// @notice A list of all markets
    VToken[] public allMarkets;

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
    VAIControllerInterface public vaiController;

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
}

contract ComptrollerV2StorageR1 is ComptrollerV1StorageR1 {
    /// @notice The rate at which the flywheel distributes XVS to VAI Vault, per block
    uint256 public venusVAIVaultRate;

    // address of VAI Vault
    address public vaiVaultAddress;

    // start block of release to VAI Vault
    uint256 public releaseStartBlock;

    // minimum release amount to VAI Vault
    uint256 public minReleaseAmount;
}

contract ComptrollerV3StorageR1 is ComptrollerV2StorageR1 {
    /// @notice The borrowCapGuardian can set borrowCaps to any number for any market. Lowering the borrow cap could disable borrowing on the given market.
    address public borrowCapGuardian;

    /// @notice Borrow caps enforced by borrowAllowed for each vToken address.
    mapping(address => uint256) public borrowCaps;
}

contract ComptrollerV4StorageR1 is ComptrollerV3StorageR1 {
    /// @notice Treasury Guardian address
    address public treasuryGuardian;

    /// @notice Treasury address
    address public treasuryAddress;

    /// @notice Fee percent of accrued interest with decimal 18
    uint256 public treasuryPercent;
}

contract ComptrollerV5StorageR1 is ComptrollerV4StorageR1 {
    /// @notice The portion of XVS that each contributor receives per block (deprecated)
    mapping(address => uint256) private venusContributorSpeeds;

    /// @notice Last block at which a contributor's XVS rewards have been allocated (deprecated)
    mapping(address => uint256) private lastContributorBlock;
}

contract ComptrollerV6StorageR1 is ComptrollerV5StorageR1 {
    address public liquidatorContract;
}

contract ComptrollerV7StorageR1 is ComptrollerV6StorageR1 {
    ComptrollerLensInterfaceR1 public comptrollerLens;
}

contract ComptrollerV8StorageR1 is ComptrollerV7StorageR1 {
    /// @notice Supply caps enforced by mintAllowed for each vToken address. Defaults to zero which corresponds to minting notAllowed
    mapping(address => uint256) public supplyCaps;
}

contract ComptrollerV9StorageR1 is ComptrollerV8StorageR1 {
    /// @notice AccessControlManager address
    address internal accessControl;

    /// @notice True if a certain action is paused on a certain market
    mapping(address => mapping(uint256 => bool)) internal _actionPaused;
}

contract ComptrollerV10StorageR1 is ComptrollerV9StorageR1 {
    /// @notice The rate at which venus is distributed to the corresponding borrow market (per block)
    mapping(address => uint256) public venusBorrowSpeeds;

    /// @notice The rate at which venus is distributed to the corresponding supply market (per block)
    mapping(address => uint256) public venusSupplySpeeds;
}

contract ComptrollerV11StorageR1 is ComptrollerV10StorageR1 {
    /// @notice Whether the delegate is allowed to borrow or redeem on behalf of the user
    //mapping(address user => mapping (address delegate => bool approved)) public approvedDelegates;
    mapping(address => mapping(address => bool)) public approvedDelegates;
}

contract ComptrollerV12StorageR1 is ComptrollerV11StorageR1 {
    /// @notice Whether forced liquidation is enabled for all users borrowing in a certain market
    mapping(address => bool) public isForcedLiquidationEnabled;
}

contract ComptrollerV13StorageR1 is ComptrollerV12StorageR1 {
    struct FacetAddressAndPosition {
        address facetAddress;
        uint96 functionSelectorPosition; // position in _facetFunctionSelectors.functionSelectors array
    }

    struct FacetFunctionSelectors {
        bytes4[] functionSelectors;
        uint256 facetAddressPosition; // position of facetAddress in _facetAddresses array
    }

    mapping(bytes4 => FacetAddressAndPosition) internal _selectorToFacetAndPosition;
    // maps facet addresses to function selectors
    mapping(address => FacetFunctionSelectors) internal _facetFunctionSelectors;
    // facet addresses
    address[] internal _facetAddresses;
}

contract ComptrollerV14StorageR1 is ComptrollerV13StorageR1 {
    /// @notice Prime token address
    IPrime public prime;
}

contract ComptrollerV15StorageR1 is ComptrollerV14StorageR1 {
    /// @notice Whether forced liquidation is enabled for the borrows of a user in a market
    mapping(address user => mapping(address market => bool)) public isForcedLiquidationEnabledForUser;
}

contract ComptrollerV16StorageR1 is ComptrollerV15StorageR1 {
    /// @notice The XVS token contract address
    address internal xvs;

    /// @notice The XVS vToken contract address
    address internal xvsVToken;
}
