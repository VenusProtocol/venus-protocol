// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.13;

import "../interfaces/IPancakePair.sol";
import "../interfaces/CustomErrors.sol";

library PancakeLibrary {
    /**
     * @notice Used to handle return values from pairs sorted in this order
     * @param tokenA The address of token A
     * @param tokenB The address of token B
     * @return token0 token1 Sorted token addresses
     **/
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        if (tokenA == tokenB) {
            revert IdenticalAddresses();
        }
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) {
            revert ZeroAddress();
        }
    }

    /**
     * @notice Calculates the CREATE2 address for a pair without making any external calls
     * @param factory Address of the pancake swap factory
     * @param tokenA The address of token A
     * @param tokenB The address of token B
     * @return pair Address for a pair
     **/
    function pairFor(address factory, address tokenA, address tokenB) internal pure returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encodePacked(token0, token1)),
                            hex"00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5" // init code hash
                        )
                    )
                )
            )
        );
    }

    /**
     * @notice Fetches and sorts the reserves for a pair
     * @param factory Address of the pancake swap factory
     * @param tokenA The address of token A
     * @param tokenB The address of token B
     * @return reserveA reserveB Reserves for the token A and token B
     **/
    function getReserves(
        address factory,
        address tokenA,
        address tokenB
    ) internal view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, ) = sortTokens(tokenA, tokenB);
        address pairAddress = pairFor(factory, tokenA, tokenB);
        (uint256 reserve0, uint256 reserve1, ) = IPancakePair(pairAddress).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    /**
     * @notice Given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
     * @param amountA The amount of token A
     * @param reserveA The amount of reserves for token A before swap
     * @param reserveB The amount of reserves for token B before swap
     * @return amountB An equivalent amount of the token B
     **/
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256 amountB) {
        if (amountA == 0) {
            revert InsufficientInputAmount();
        } else if (reserveA == 0 || reserveB == 0) {
            revert InsufficientLiquidity();
        }
        amountB = (amountA * reserveB) / reserveA;
    }

    /**
     * @notice Given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
     * @param amountIn The amount of token A need to swap
     * @param reserveIn The amount of reserves for token A before swap
     * @param reserveOut The amount of reserves for token B after swap
     * @return amountOut The maximum output amount of the token B
     **/
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        if (amountIn == 0) {
            revert InsufficientInputAmount();
        } else if (reserveIn == 0 || reserveOut == 0) {
            revert InsufficientLiquidity();
        }
        uint256 amountInWithFee = amountIn * 9975;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 10000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @notice Given an output amount of an asset and pair reserves, returns a required input amount of the other asset
     * @param amountOut The amount of token B after swap
     * @param reserveIn The amount of reserves for token A before swap
     * @param reserveOut The amount of reserves for token B after swap
     * @return amountIn Required input amount of the token A
     **/
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountIn) {
        if (amountOut == 0) {
            revert InsufficientOutputAmount();
        } else if (reserveIn == 0 || reserveOut == 0) {
            revert InsufficientLiquidity();
        }
        uint256 numerator = reserveIn * amountOut * 10000;
        uint256 denominator = (reserveOut - amountOut) * 9975;
        amountIn = (numerator / denominator) + 1;
    }

    /**
     * @notice Performs chained getAmountOut calculations on any number of pairs
     * @param factory Address of the pancake swap factory
     * @param amountIn The amount of tokens to swap.
     * @param path Array with addresses of the underlying assets to be swapped
     * @return amounts Array of amounts after performing swap for respective pairs in path
     **/
    function getAmountsOut(
        address factory,
        uint256 amountIn,
        address[] memory path
    ) internal view returns (uint256[] memory amounts) {
        if (path.length <= 1) {
            revert InvalidPath();
        }
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; ) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
            unchecked {
                i += 1;
            }
        }
    }

    /**
     * @notice Performs chained getAmountIn calculations on any number of pairs
     * @param factory Address of the pancake swap factory
     * @param amountOut The amount of the tokens needs to be as output token.
     * @param path Array with addresses of the underlying assets to be swapped
     * @return amounts Array of amounts after performing swap for respective pairs in path
     **/
    function getAmountsIn(
        address factory,
        uint256 amountOut,
        address[] memory path
    ) internal view returns (uint256[] memory amounts) {
        if (path.length <= 1) {
            revert InvalidPath();
        }
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; ) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(factory, path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
            unchecked {
                i -= 1;
            }
        }
    }
}
