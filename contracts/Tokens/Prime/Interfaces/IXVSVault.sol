// SPDX-License-Identifier: BSD-3-Clause
pragma solidity 0.8.13;

interface IXVSVault {
    function getUserInfo(
        address _rewardToken,
        uint256 _pid,
        address _user
    ) external view returns (uint256 amount, uint256 rewardDebt, uint256 pendingWithdrawals);

    function xvsAddress() external view returns (address);
}
