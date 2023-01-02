pragma solidity 0.8.17;


import "../../Comptroller/ComptrollerInterface.sol";

contract PrimeStorageV1 {

    enum Tier { 
        ONE,
        TWO,
        THREE,
        FOUR,
        FIVE
    }

    // ID of next token to be minted
    uint256 private _nextTokenId = 0;

    // Mapping from token ID to owner address
    mapping (uint256 => address) private _owners;

    // Mapping owner address to token count
    mapping(address => uint256) private _balances;

    // Mapping to find if token id is irrevocable
    mapping (uint256 => bool) private _isIrrevocable;

    // Mapping to find tier of token id
    mapping (uint256 => Tier) private tier;

    // Tracks total irrevocable tokens minted
    uint256 private _totalIrrevocable;

    // Tracks total revocable tokens minted
    uint256 private _totalRevocable;

    // Indicates maximum revocable tokens that can be minted
    uint256 private _revocableLimit;

    // Indicates maximum irrevocable tokens that can be minted
    uint256 private _irrevocableLimit;
}