// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

/// @notice 0.8-side view of the 0.5.16 XVSVault (XVSVaultScenario). Only the
/// selectors used by the rig are declared. The concrete contract is deployed
/// via `deployCode` and cast to this interface.
interface IXVSVault {
    // --- admin / wiring ---
    function initializeTimeManager(bool timeBased_, uint256 blocksPerYear_) external;
    function setAccessControl(address newAccessControlAddress) external;
    function setXvsStore(address _xvs, address _xvsStore) external;
    function add(
        address _rewardToken,
        uint256 _allocPoint,
        address _token,
        uint256 _rewardPerBlockOrSecond,
        uint256 _lockPeriod
    ) external;
    function setWithdrawalLockingPeriod(address _rewardToken, uint256 _pid, uint256 _newPeriod) external;
    function pause() external;
    function resume() external;

    // --- user actions ---
    function deposit(address _rewardToken, uint256 _pid, uint256 _amount) external;
    function requestWithdrawal(address _rewardToken, uint256 _pid, uint256 _amount) external;
    function executeWithdrawal(address _rewardToken, uint256 _pid) external;
    function claim(address _account, address _rewardToken, uint256 _pid) external;
    function delegate(address delegatee) external;

    // --- views ---
    function getUserInfo(
        address _rewardToken,
        uint256 _pid,
        address _user
    ) external view returns (uint256 amount, uint256 rewardDebt, uint256 pendingWithdrawals);
    function getCurrentVotes(address account) external view returns (uint96);
    function getPriorVotes(address account, uint256 blockNumberOrSecond) external view returns (uint96);
    function pendingReward(address _rewardToken, uint256 _pid, address _user) external view returns (uint256);
    function totalPendingWithdrawals(address _rewardToken, uint256 _pid) external view returns (uint256);
    function delegates(address account) external view returns (address);
    function poolLength(address rewardToken) external view returns (uint256);
    function isTimeBased() external view returns (bool);
}

interface IXVSStore {
    function setNewOwner(address _owner) external;
    function setRewardToken(address _tokenAddress, bool status) external;
}
