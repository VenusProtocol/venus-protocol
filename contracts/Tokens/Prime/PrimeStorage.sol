pragma solidity 0.8.17;

contract PrimeStorageV1 {

    enum Tier { 
        ZERO,
        ONE,
        TWO,
        THREE,
        FOUR,
        FIVE
    }

    struct Token {
        bool isIrrevocable;
        Tier tier;
    }

    struct Cap {
        uint256 threshold;
        uint256 stableCoinSupplyTVLCap;
        uint256 stableCoinBorrowTVLCap;
        uint256 nonStableCoinSupplyTVLCap;
        uint256 nonStableCoinBorrowTVLCap;
    }

    struct Stake {
        Tier tier;
        uint stakedAt;
    }

    struct Market {
        uint256 rate;
        bool isStableCoin;
        uint256 index;
        uint256 lastUpdated;
    }

    struct Interest {
        uint256 accrued;
        uint256 index;
    }

    /// @notice constant variable to find highest tier
    Tier constant internal MAX_TIER = Tier.FIVE;

    /// @notice number of days user need to stake to claim prime token 
    uint256 constant internal STAKING_PERIOD = 90 * 24 * 60 * 60;

    /// @notice initial market index
    uint256 constant internal INITIAL_INDEX = 1e18;

    /// @notice number of seconds in a year
    uint256 constant internal BLOCKS_PER_YEAR = 365 * 24 * 60 * 60;
    
    /// @notice Mapping owner token id to token metadata
    mapping(address => Token) internal _tokens;

    /// @notice  Tracks total irrevocable tokens minted
    uint256 internal _totalIrrevocable;

    /// @notice  Tracks total revocable tokens minted
    uint256 internal _totalRevocable;

    /// @notice  Indicates maximum revocable tokens that can be minted
    uint256 internal _revocableLimit;

    /// @notice  Indicates maximum irrevocable tokens that can be minted
    uint256 internal _irrevocableLimit;

    /// @notice  Mapping owner tier to metadata
    mapping (Tier => Cap) internal _tiers;

    /// @notice Tracks when prime token eligible users started staking for claiming prime token
    mapping (address => Stake) internal _stakes;

    /// @notice vToken to market configuration
    mapping (address => Market) internal _markets;

    /// @notice vToken to user to user index
    mapping (address => mapping (address => Interest)) interests;
}