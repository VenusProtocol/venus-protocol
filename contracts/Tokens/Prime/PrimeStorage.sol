pragma solidity 0.8.13;

contract PrimeStorageV1 {
    struct Token {
        bool exists;
        bool isIrrevocable;
    }

    struct Market {
        uint256 index;
        uint256 lastUpdated;
        uint256 totalScore;
        uint256 supplyMultiplier;
        uint256 borrowMultiplier;
    }

    struct Interest {
        uint256 accrued;
        uint256 index;
        uint totalQVL;
    }

    uint256 public constant MINIMUM_STAKED_XVS = 1000 * 1e18;

    uint256 public constant MAXIMUM_XVS_CAP = 10000 * 1e18;

    /// @notice number of days user need to stake to claim prime token
    uint256 internal constant STAKING_PERIOD = 90 * 24 * 60 * 60;

    /// @notice initial market index
    uint256 internal constant INITIAL_INDEX = 1e18;

    /// @notice maxmimum BPS
    uint256 internal constant MAXIMUM_BPS = 10000;

    /// @notice protocol income distribution BPS.
    uint256 internal constant INCOME_DISTRIBUTION_BPS = 2000;

    /// @notice Mapping to get prime token's metadata
    mapping(address => Token) public tokens;

    /// @notice  Tracks total irrevocable tokens minted
    uint256 public _totalIrrevocable;

    /// @notice  Tracks total revocable tokens minted
    uint256 public _totalRevocable;

    /// @notice  Indicates maximum revocable tokens that can be minted
    uint256 public _revocableLimit;

    /// @notice  Indicates maximum irrevocable tokens that can be minted
    uint256 public _irrevocableLimit;

    /// @notice Tracks when prime token eligible users started staking for claiming prime token
    mapping(address => uint256) public stakedAt;

    /// @notice vToken to market configuration
    mapping(address => Market) public markets;

    /// @notice vToken to user to user index
    mapping(address => mapping(address => Interest)) public _interests;

    /// @notice A list of boosted markets
    address[] public allMarkets;

    mapping(address => bool) public isMarketPaused;
}
