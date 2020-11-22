pragma solidity ^0.5.16;

import "./VToken.sol";
import "./PriceOracle.sol";
import "./VAIControllerInterface.sol";

contract UnitrollerAdminStorage {
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

contract ComptrollerStorage is UnitrollerAdminStorage {

    /**
     * @notice Oracle which gives the price of any given asset
     */
    PriceOracle public oracle;

    /**
     * @notice Multiplier used to calculate the maximum repayAmount when liquidating a borrow
     */
    uint public closeFactorMantissa;

    /**
     * @notice Multiplier representing the discount on collateral that a liquidator receives
     */
    uint public liquidationIncentiveMantissa;

    /**
     * @notice Max number of assets a single account can participate in (borrow or use as collateral)
     */
    uint public maxAssets;

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
        uint collateralFactorMantissa;

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
     *  Actions which allow users to remove their own assets cannot be paused.
     *  Liquidation / seizing / transfer can only be paused globally, not by market.
     */
    address public pauseGuardian;
    bool public _mintGuardianPaused;
    bool public _borrowGuardianPaused;
    bool public transferGuardianPaused;
    bool public seizeGuardianPaused;
    mapping(address => bool) public mintGuardianPaused;
    mapping(address => bool) public borrowGuardianPaused;

    struct VenusMarketState {
        /// @notice The market's last updated venusBorrowIndex or venusSupplyIndex
        uint224 index;

        /// @notice The block number the index was last updated at
        uint32 block;
    }

    /// @notice A list of all markets
    VToken[] public allMarkets;

    /// @notice The rate at which the flywheel distributes XVS, per block
    uint public venusRate;

    /// @notice The portion of venusRate that each market currently receives
    mapping(address => uint) public venusSpeeds;

    /// @notice The Venus market supply state for each market
    mapping(address => VenusMarketState) public venusSupplyState;

    /// @notice The Venus market borrow state for each market
    mapping(address => VenusMarketState) public venusBorrowState;

    /// @notice The Venus borrow index for each market for each supplier as of the last time they accrued XVS
    mapping(address => mapping(address => uint)) public venusSupplierIndex;

    /// @notice The Venus borrow index for each market for each borrower as of the last time they accrued XVS
    mapping(address => mapping(address => uint)) public venusBorrowerIndex;

    /// @notice The XVS accrued but not yet transferred to each user
    mapping(address => uint) public venusAccrued;

    /// @notice The Address of VAIController
    VAIControllerInterface public vaiController;

    /// @notice The minted VAI amount to each user
    mapping(address => uint) public mintedVAIs;

    /// @notice VAI Mint Rate as a percentage
    uint public vaiMintRate;

    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     */
    bool public mintVAIGuardianPaused;
    bool public repayVAIGuardianPaused;

    /**
     * @notice Pause/Unpause whole protocol actions
     */
    bool public protocolPaused;
}
