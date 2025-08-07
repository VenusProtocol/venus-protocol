// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.25;

interface IVAIVault {
    /**
     * @notice Updates pending rewards for all users
     * @dev This function must be called before any operation that changes user balances or reward parameters
     */
    function updatePendingRewards() external;
}
