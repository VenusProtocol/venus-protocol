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
        uint256 supplyTVLCap;
        uint256 borrowTVLCap;
    }

    // Mapping owner token id to token metadata
    mapping(address => Token) internal _tokens;

    // Tracks total irrevocable tokens minted
    uint256 internal _totalIrrevocable;

    // Tracks total revocable tokens minted
    uint256 internal _totalRevocable;

    // Indicates maximum revocable tokens that can be minted
    uint256 internal _revocableLimit;

    // Indicates maximum irrevocable tokens that can be minted
    uint256 internal _irrevocableLimit;

     // Mapping owner tier to metadata
    mapping (Tier => Cap) internal _tiers;
}