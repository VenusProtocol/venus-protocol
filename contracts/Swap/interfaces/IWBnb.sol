// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWBnb is IERC20 {
    function deposit() external payable;
    function withdraw(uint wad) external;
}
