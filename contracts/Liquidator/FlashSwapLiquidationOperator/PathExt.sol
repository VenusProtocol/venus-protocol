// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { BytesLib } from "./pancakeswap-v8/BytesLib.sol";
import { Path } from "./pancakeswap-v8/Path.sol";

/**
 * @title PathExt
 * @author Venus
 * @notice An extension to the Path library that provides additional functionality – decoding
 * the last pool in a path and skipping several tokens in a path. This is useful to validate
 * the path before attempting to execute a multihop swap.
 */
library PathExt {
    using BytesLib for bytes;
    using Path for bytes;

    /// @dev The offset of a single token address (20 bytes) and pool fee (3 bytes)
    uint256 private constant NEXT_OFFSET = 23;

    /// @dev Skips several token + fee elements from the buffer and returns the remainder
    /// @param path The swap path
    /// @param num The number of token + fee elements to skip
    /// @return The remaining token + fee elements in the path
    function skipTokens(bytes memory path, uint256 num) internal pure returns (bytes memory) {
        if (num == 0) {
            return path;
        }
        return path.slice(NEXT_OFFSET * num, path.length - NEXT_OFFSET * num);
    }

    /// @dev Decodes the last pool in the path
    /// @param path The swap path
    /// @return tokenA The first token of the given pool
    /// @return tokenB The second token of the given pool
    /// @return fee The fee level of the pool
    function decodeLastPool(bytes memory path) internal pure returns (address tokenA, address tokenB, uint24 fee) {
        return skipTokens(path, path.numPools() - 1).decodeFirstPool();
    }
}
