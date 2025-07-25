// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

interface ISwapHelper {
    function swapInternal(address tokenA, address tokenB, uint256 amount) external payable;
}
