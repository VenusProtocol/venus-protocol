// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

import { IUnitrollerAdminStorage } from "./interfaces/IUnitrollerAdminStorage.sol";

contract UnitrollerAdminStorage is IUnitrollerAdminStorage {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     * @notice Pending administrator for this contract
     */
    address public pendingAdmin;

    /**
     * @notice Active brains of Unitroller
     */
    address public comptrollerImplementation;

    /**
     * @notice Pending brains of Unitroller
     */
    address public pendingComptrollerImplementation;
}
