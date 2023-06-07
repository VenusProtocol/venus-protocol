pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../XVSVault/XVSVault.sol";

contract XVSVaultScenario is XVSVault {
    using SafeMath for uint256;

    function pushOldWithdrawalRequest(
        UserInfo storage _user,
        WithdrawalRequest[] storage _requests,
        uint _amount,
        uint _lockedUntil
    ) internal {
        uint i = _requests.length;
        _requests.push(WithdrawalRequest(0, 0, 0));
        // Keep it sorted so that the first to get unlocked request is always at the end
        for (; i > 0 && _requests[i - 1].lockedUntil <= _lockedUntil; --i) {
            _requests[i] = _requests[i - 1];
        }
        _requests[i] = WithdrawalRequest(_amount, uint128(_lockedUntil), 0);
        _user.pendingWithdrawals = _user.pendingWithdrawals.add(_amount);
    }

    function requestOldWithdrawal(address _rewardToken, uint256 _pid, uint256 _amount) external nonReentrant {
        _ensureValidPool(_rewardToken, _pid);
        require(_amount > 0, "requested amount cannot be zero");
        UserInfo storage user = userInfos[_rewardToken][_pid][msg.sender];
        require(user.amount >= user.pendingWithdrawals.add(_amount), "requested amount is invalid");

        PoolInfo storage pool = poolInfos[_rewardToken][_pid];
        WithdrawalRequest[] storage requests = withdrawalRequests[_rewardToken][_pid][msg.sender];
        uint lockedUntil = pool.lockPeriod.add(block.timestamp);

        pushOldWithdrawalRequest(user, requests, _amount, lockedUntil);

        // Update Delegate Amount
        if (_rewardToken == address(xvsAddress)) {
            _moveDelegates(delegates[msg.sender], address(0), uint96(_amount));
        }

        emit RequestedWithdrawal(msg.sender, _rewardToken, _pid, _amount);
    }

    function transferReward(address rewardToken, address user, uint256 amount) external {
        _transferReward(rewardToken, user, amount);
    }
}
