// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

interface IUnitrollerAdminStorage {
    /**
     * @notice Administrator for this contract
     */
    function admin() external view returns (address);

    /**
     * @notice Pending administrator for this contract
     */
    function pendingAdmin() external view returns (address);

    /**
     * @notice Active brains of Unitroller
     */
    function comptrollerImplementation() external view returns (address);

    /**
     * @notice Pending brains of Unitroller
     */
    function pendingComptrollerImplementation() external view returns (address);
}
