// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

import { ResilientOracleInterface } from "@venusprotocol/oracle/contracts/interfaces/OracleInterface.sol";

/**
 * @title PrimeStorageV1
 * @author Venus
 * @notice Storage for Prime Token
 */
contract PrimeStorageV1 {
    struct Token {
        bool exists;
        bool isIrrevocable;
    }

    struct Market {
        uint256 supplyMultiplier;
        uint256 borrowMultiplier;
        uint256 rewardIndex;
        uint256 sumOfMembersScore;
        bool exists;
    }

    struct Interest {
        uint256 accrued;
        uint256 score;
        uint256 rewardIndex;
    }

    struct PendingInterest {
        address market;
        uint256 amount;
    }

    /// @notice Base unit for computations, usually used in scaling (multiplications, divisions)
    uint256 internal constant EXP_SCALE = 1e18;

    /// @notice minimum amount of XVS user needs to stake to become a prime member
    uint256 public constant MINIMUM_STAKED_XVS = 1e3 * EXP_SCALE;

    /// @notice maximum XVS taken in account when calculating user score
    uint256 public constant MAXIMUM_XVS_CAP = 1e5 * EXP_SCALE;

    /// @notice number of days user need to stake to claim prime token
    uint256 public constant STAKING_PERIOD = 90 days;

    /// @notice maximum BPS = 100%
    uint256 internal constant MAXIMUM_BPS = 1e4;

    /// @notice Mapping to get prime token's metadata
    mapping(address => Token) public tokens;

    /// @notice  Tracks total irrevocable tokens minted
    uint256 public totalIrrevocable;

    /// @notice  Tracks total revocable tokens minted
    uint256 public totalRevocable;

    /// @notice  Indicates maximum revocable tokens that can be minted
    uint256 public revocableLimit;

    /// @notice  Indicates maximum irrevocable tokens that can be minted
    uint256 public irrevocableLimit;

    /// @notice Tracks when prime token eligible users started staking for claiming prime token
    mapping(address => uint256) public stakedAt;

    /// @notice vToken to market configuration
    mapping(address => Market) public markets;

    /// @notice vToken to user to user index
    mapping(address => mapping(address => Interest)) public interests;

    /// @notice A list of boosted markets
    address[] internal _allMarkets;

    /// @notice numerator of alpha. Ex: if alpha is 0.5 then this will be 1
    uint128 public alphaNumerator;

    /// @notice denominator of alpha. Ex: if alpha is 0.5 then this will be 2
    uint128 public alphaDenominator;

    /// @notice address of XVS vault
    address internal _xvsVault;

    /// @notice address of XVS vault reward token
    address internal _xvsVaultRewardToken;

    /// @notice address of XVS vault pool id
    uint256 internal _xvsVaultPoolId;

    /// @notice mapping to check if a account's score was updated in the round
    mapping(uint256 => mapping(address => bool)) public isScoreUpdated;

    /// @notice unique id for next round
    uint256 public nextScoreUpdateRoundId;

    /// @notice total number of accounts whose score needs to be updated
    uint256 public totalScoreUpdatesRequired;

    /// @notice total number of accounts whose score is yet to be updated
    uint256 public pendingScoreUpdates;

    /// @notice mapping used to find if an asset is part of prime markets
    mapping(address => address) public vTokenForAsset;

    /// @notice address of protocol share reserve contract
    address public protocolShareReserve;

    /// @notice address of core pool comptroller contract
    address public comptroller;

    /// @notice unreleased income from PSR that's already distributed to prime holders
    /// @dev mapping of asset address => amount
    mapping(address => uint256) public unreleasedPSRIncome;

    /// @notice unreleased income from PLP that's already distributed to prime holders
    /// @dev mapping of asset address => amount
    mapping(address => uint256) public unreleasedPLPIncome;

    /// @notice The address of PLP contract
    address public primeLiquidityProvider;

    /// @notice The address of ResilientOracle contract
    ResilientOracleInterface public oracle;

    /// @dev This empty reserved space is put in place to allow future versions to add new
    /// variables without shifting down storage in the inheritance chain.
    uint256[25] private __gap;
}
