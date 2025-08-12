// SPDX-License-Identifier: BSD-3-Clause

pragma solidity 0.8.25;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IWBNB is IERC20Upgradeable {
    function deposit() external payable;
}
