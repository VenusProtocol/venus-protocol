pragma solidity 0.8.17;

contract PrimeStorageV1 {

    enum Tier { 
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

    // ID of next token to be minted
    uint256 internal _nextTokenId = 1;

    // Mapping from owner address to token id
    mapping (address => uint256) internal _owners;

    // Mapping owner token id to token metadata
    mapping(uint256 => Token) internal _tokens;

    // Tracks total irrevocable tokens minted
    uint256 internal _totalIrrevocable;

    // Tracks total revocable tokens minted
    uint256 internal _totalRevocable;

    // Indicates maximum revocable tokens that can be minted
    uint256 internal _revocableLimit;

    // Indicates maximum irrevocable tokens that can be minted
    uint256 internal _irrevocableLimit;
}