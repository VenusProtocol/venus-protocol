// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

/**
 * @title PrimeLiquidityProviderStorageV1
 * @author Venus
 * @notice Storage for Prime Liquidity Provider
 */
contract PrimeLiquidityProviderStorageV1 {
    /// @notice Address of the Prime contract
    address public prime;

    /// @notice The rate at which token is distributed (per block or second)
    mapping(address => uint256) public tokenDistributionSpeeds;

    /// @notice The max token distribution speed for token
    mapping(address => uint256) public maxTokenDistributionSpeeds;

    /// @notice The block or second till which rewards are distributed for an asset
    mapping(address => uint256) public lastAccruedBlockOrSecond;

    /// @notice The token accrued but not yet transferred to prime contract
    mapping(address => uint256) internal _tokenAmountAccrued;

    /// @dev This empty reserved space is put in place to allow future versions to add new
    /// variables without shifting down storage in the inheritance chain.
    uint256[45] private __gap;
}
