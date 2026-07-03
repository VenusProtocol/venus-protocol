// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

// Force Hardhat to compile DeviationBoundedOracle from node_modules so that
// @openzeppelin/hardhat-upgrades can run storage-layout validation.
import { DeviationBoundedOracle } from "@venusprotocol/oracle/contracts/DeviationBoundedOracle.sol";
