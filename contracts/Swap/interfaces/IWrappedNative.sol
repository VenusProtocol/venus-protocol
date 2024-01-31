// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.20;

interface IWrappedNative {
    function deposit() external payable;

    function withdraw(uint256) external;

    function approve(address guy, uint256 wad) external returns (bool);

    function transferFrom(address src, address dst, uint256 wad) external returns (bool);

    function transfer(address dst, uint256 wad) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}
