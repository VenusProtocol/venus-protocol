// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IWBNB {
    function deposit() external payable;

    function transfer(address to, uint value) external returns (bool);

    function withdraw(uint) external;

    function balanceOf(address owner) external view returns (uint256 balance);
}
