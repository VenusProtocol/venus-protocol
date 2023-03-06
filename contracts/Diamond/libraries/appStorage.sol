pragma solidity ^0.8.0;

import "../../Tokens/VTokens/VToken.sol";
import "../../Oracle/PriceOracle.sol";
import "../../Tokens/VAI/VAIControllerInterface.sol";
import "../../Comptroller/ComptrollerLensInterface.sol";
import "../../Tokens/Prime/IPrime.sol";

struct Market {
        /// @notice Whether or not this market is listed
        bool isListed;
        /**
         * @notice Multiplier representing the most one can borrow against their collateral in this market.
         *  For instance, 0.9 to allow borrowing 90% of collateral value.
         *  Must be between 0 and 1, and stored as a mantissa.
         */
        uint collateralFactorMantissa;
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

struct AppStorage {
   
    /**
     * @notice Administrator for this contract
     */
    address admin;

    /**
     * @notice Pending administrator for this contract
     */
    address pendingAdmin;

    /**
     * @notice Active brains of Unitroller
     */
    address comptrollerImplementation;

    /**
     * @notice Pending brains of Unitroller
     */
    address pendingComptrollerImplementation;

    /**
     * @notice Oracle which gives the price of any given asset
     */
    PriceOracle oracle;

    /**
     * @notice Multiplier used to calculate the maximum repayAmount when liquidating a borrow
     */
    uint closeFactorMantissa;

    /**
     * @notice Multiplier representing the discount on collateral that a liquidator receives
     */
    uint liquidationIncentiveMantissa;

    /**
     * @notice Max number of assets a single account can participate in (borrow or use as collateral)
     */
    uint maxAssets;

    /**
     * @notice Per-account mapping of "assets you are in", capped by maxAssets
     */
    mapping(address => VToken[]) accountAssets;


    /**
     * @notice Official mapping of vTokens -> Market metadata
     * @dev Used e.g. to determine if a market is supported
     */
    mapping(address => Market) markets;

    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     */
    address pauseGuardian;

    /// @notice Whether minting is paused (deprecated, superseded by actionPaused)
    bool _mintGuardianPaused;
    /// @notice Whether borrowing is paused (deprecated, superseded by actionPaused)
    bool _borrowGuardianPaused;
    /// @notice Whether borrowing is paused (deprecated, superseded by actionPaused)
    bool transferGuardianPaused;
    /// @notice Whether borrowing is paused (deprecated, superseded by actionPaused)
    bool seizeGuardianPaused;
    /// @notice Whether borrowing is paused (deprecated, superseded by actionPaused)
    mapping(address => bool) mintGuardianPaused;
    /// @notice Whether borrowing is paused (deprecated, superseded by actionPaused)
    mapping(address => bool) borrowGuardianPaused;

    /// @notice A list of all markets
    VToken[] allMarkets;

    /// @notice The rate at which the flywheel distributes XVS, per block
    uint venusRate;

    /// @notice The portion of venusRate that each market currently receives
    mapping(address => uint) venusSpeeds;

    /// @notice The Venus market supply state for each market
    mapping(address => VenusMarketState) venusSupplyState;

    /// @notice The Venus market borrow state for each market
    mapping(address => VenusMarketState) venusBorrowState;

    /// @notice The Venus supply index for each market for each supplier as of the last time they accrued XVS
    mapping(address => mapping(address => uint)) venusSupplierIndex;

    /// @notice The Venus borrow index for each market for each borrower as of the last time they accrued XVS
    mapping(address => mapping(address => uint)) venusBorrowerIndex;

    /// @notice The XVS accrued but not yet transferred to each user
    mapping(address => uint) venusAccrued;

    /// @notice The Address of VAIController
    VAIControllerInterface vaiController;

    /// @notice The minted VAI amount to each user
    mapping(address => uint) mintedVAIs;

    /// @notice VAI Mint Rate as a percentage
    uint vaiMintRate;

    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     */
    bool mintVAIGuardianPaused;
    bool repayVAIGuardianPaused;

    /**
     * @notice Pause/Unpause whole protocol actions
     */
    bool protocolPaused;

    /// @notice The rate at which the flywheel distributes XVS to VAI Minters, per block (deprecated)
    uint venusVAIRate;

     /// @notice The rate at which the flywheel distributes XVS to VAI Vault, per block
    uint venusVAIVaultRate;

    // address of VAI Vault
    address vaiVaultAddress;

    // start block of release to VAI Vault
    uint256 releaseStartBlock;

    // minimum release amount to VAI Vault
    uint256 minReleaseAmount;

    /// @notice The borrowCapGuardian can set borrowCaps to any number for any market. Lowering the borrow cap could disable borrowing on the given market.
    address borrowCapGuardian;

    /// @notice Borrow caps enforced by borrowAllowed for each vToken address. Defaults to zero which corresponds to unlimited borrowing.
    mapping(address => uint) borrowCaps;

    /// @notice Treasury Guardian address
    address treasuryGuardian;

    /// @notice Treasury address
    address treasuryAddress;

    /// @notice Fee percent of accrued interest with decimal 18
    uint256 treasuryPercent;

    /// @notice The portion of XVS that each contributor receives per block (deprecated)
    mapping(address => uint) venusContributorSpeeds;

    /// @notice Last block at which a contributor's XVS rewards have been allocated (deprecated)
    mapping(address => uint) lastContributorBlock;

    address liquidatorContract;

    ComptrollerLensInterface comptrollerLens;

    /// @notice Supply caps enforced by mintAllowed for each vToken address. Defaults to zero which corresponds to minting notAllowed
    mapping(address => uint256) supplyCaps;

    /// @notice AccessControlManager address
    address accessControl;

    /// @notice True if a certain action is paused on a certain market
    mapping(address => mapping(uint => bool)) _actionPaused;

     /// @notice The rate at which venus is distributed to the corresponding borrow market (per block)
    mapping(address => uint) venusBorrowSpeeds;

    /// @notice The rate at which venus is distributed to the corresponding supply market (per block)
    mapping(address => uint) venusSupplySpeeds;

    /// @notice Prime token address
    IPrime prime;

}

library LibAppStorage {
    function diamondStorage() internal pure returns (AppStorage storage ds) {
        assembly {
            ds.slot := 0
        }
    }

    function abs(int256 x) internal pure returns (uint256) {
        return uint256(x >= 0 ? x : -x);
    }
}