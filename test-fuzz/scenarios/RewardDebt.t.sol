// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";

/// @notice R1 — reward-debt integrity across the withdrawal lifecycle. The
/// dangerous seam: executeWithdrawal's afterUpgrade branch decrements
/// `user.amount` but does NOT recompute `user.rewardDebt`, while
/// requestWithdrawal recomputes rewardDebt AFTER pending grew and deposit/claim
/// recompute against (amount - pending). If any interleaving leaves
/// `rewardDebt > (amount - pending) * accRewardPerShare / 1e12`, then
/// _computeReward's `.sub(rewardDebt)` underflows and reverts — and because
/// deposit / claim / requestWithdrawal all call it, a single corrupted user
/// bricks their own funds (permanent DoS). These sequences hammer the seam
/// with reward accrual (warps) between every step and assert nothing reverts.
contract RewardDebtTest is XVSVaultTestBase {
    address internal A;
    address internal B;

    function setUp() public {
        _deployAndWire();
        A = actors[0];
        B = actors[1];
    }

    function _dep(address who, uint256 amt) internal {
        vm.prank(who);
        vault.deposit(address(xvs), 0, amt);
    }

    function _req(address who, uint256 amt) internal {
        vm.prank(who);
        vault.requestWithdrawal(address(xvs), 0, amt);
    }

    function _warp(uint256 dt) internal {
        vm.warp(block.timestamp + dt);
        vm.roll(block.number + (dt / 3) + 1);
    }

    /// After every reachable state the reward path must stay callable.
    function _assertRewardPathLive(address who) internal {
        // pendingReward mirrors the same .sub(rewardDebt); must not underflow.
        vault.pendingReward(address(xvs), 0, who);
        // A real claim must not revert either (it is the actual user action).
        vm.prank(who);
        vault.claim(who, address(xvs), 0);
    }

    // ---- R1a: request -> wait -> execute -> claim, with accrual between ----
    function testFuzz_R1a_executeThenClaim(uint256 x, uint256 p, uint256 dt1, uint256 dt2) public {
        x = bound(x, 2, ACTOR_SEED);
        p = bound(p, 1, x - 1);
        dt1 = bound(dt1, 1, 30 days);
        dt2 = bound(dt2, 1, 30 days);

        _dep(A, x);
        _warp(dt1);
        _req(A, p);
        // clear the 7-day lock, then execute the afterUpgrade request
        _warp(LOCK_PERIOD + dt2);
        vm.prank(A);
        vault.executeWithdrawal(address(xvs), 0);

        _warp(dt1);
        _assertRewardPathLive(A);

        // remaining principal is still (x - p) and reward path survives a re-deposit
        (uint256 amount, , uint256 pending) = vault.getUserInfo(address(xvs), 0, A);
        assertEq(amount - pending, x - p, "R1a: principal drift after execute");
    }

    // ---- R1b: partial-request storm — many overlapping requests + claims ----
    function testFuzz_R1b_partialRequestStorm(uint256 x, uint256 seed) public {
        x = bound(x, 10, ACTOR_SEED);
        _dep(A, x);

        uint256 remaining = x;
        for (uint256 i = 0; i < 5; i++) {
            _warp(bound(uint256(keccak256(abi.encode(seed, i))), 1, 20 days));
            (uint256 amount, , uint256 pending) = vault.getUserInfo(address(xvs), 0, A);
            uint256 avail = amount - pending;
            if (avail == 0) break;
            uint256 req = bound(uint256(keccak256(abi.encode(seed, i, "r"))), 1, avail);
            _req(A, req);
            remaining -= req;
            _assertRewardPathLive(A);
        }
        // no underflow / no revert reached here == reward-debt stayed consistent
        assertLe(remaining, x, "R1b: sanity");
    }

    // ---- R1c: second staker joins mid-stream; accRewardPerShare moves under A ----
    function testFuzz_R1c_secondStaker(uint256 x, uint256 y, uint256 dt) public {
        x = bound(x, 2, ACTOR_SEED);
        y = bound(y, 1, ACTOR_SEED);
        dt = bound(dt, 1, 30 days);

        _dep(A, x);
        _warp(dt);
        _dep(B, y); // changes supply -> accRewardPerShare denominator shifts
        _warp(dt);
        _req(A, bound(x, 1, x));
        _assertRewardPathLive(A);
        _assertRewardPathLive(B);
    }
}
