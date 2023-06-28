// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.13;

interface InterfaceComptroller {
    function markets(address) external view returns (bool);
}
