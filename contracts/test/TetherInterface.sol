// SPDX-FileCopyrightText: 2020 Compound Labs, Inc.
// SPDX-License-Identifier: BSD-3-Clause

pragma solidity ^0.5.16;

import "../EIP20Interface.sol";

contract TetherInterface is EIP20Interface {
    function setParams(uint newBasisPoints, uint newMaxFee) external;
}