// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.17;

interface IWBnb {
    function deposit() external payable;
    function withdraw(uint wad) external;
}
