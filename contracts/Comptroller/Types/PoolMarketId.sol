// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

/// @notice Strongly-typed identifier for pool markets mapping keys
/// @dev Underlying storage is bytes32: first 12 bytes (96 bits) = poolId, last 20 bytes = vToken address
type PoolMarketId is bytes32;

 