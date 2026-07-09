// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";
import { MockBEP20 } from "../mocks/MockBEP20.sol";

/// @notice M1/M2 — multi-pool isolation. The live vault runs a single pool, but
/// the code supports many pools under one reward token. Adds pool 1 (reward
/// token = XVS, staked token = a DIFFERENT token xvs2) alongside pool 0
/// (XVS/XVS) and checks the two properties a second pool must not violate:
///
///   M2  votes come ONLY from the XVS-staked pool: getStakeAmount iterates
///       poolInfos[xvsAddress] and returns the pool whose token == xvsAddress
///       (pool 0). Staking xvs2 in pool 1 must grant ZERO voting power even
///       though it shares the XVS reward token — otherwise a second pool would
///       be a vote-inflation backdoor.
///   M1  reward isolation: a pool-1-only staker earns from pool 1 and cannot
///       claim pool 0 (and vice versa); accRewardPerShare is per-pool.
contract MultiPoolTest is XVSVaultTestBase {
    MockBEP20 internal xvs2;
    address internal A; // pool 0 (XVS) staker
    address internal B; // pool 1 (xvs2) staker

    uint256 internal constant PID0 = 0;
    uint256 internal constant PID1 = 1;

    function setUp() public {
        _deployAndWire();
        A = actors[0];
        B = actors[1];

        // Second staked token, same reward token (XVS), equal alloc -> 50/50 split.
        xvs2 = new MockBEP20();
        vault.add(address(xvs), 100, address(xvs2), REWARD_PER_BLOCK, LOCK_PERIOD);

        for (uint256 i = 0; i < actors.length; i++) {
            xvs2.mint(actors[i], ACTOR_SEED);
            vm.prank(actors[i]);
            xvs2.approve(address(vault), type(uint256).max);
        }
    }

    function _warp(uint256 dt) internal {
        vm.warp(block.timestamp + dt);
        vm.roll(block.number + (dt / 3) + 1);
    }

    // ---- M2: xvs2 stake in pool 1 grants no votes; pool 0 unaffected ----
    function testFuzz_M2_secondPoolGrantsNoVotes(uint256 y, uint256 x) public {
        y = bound(y, 1, ACTOR_SEED);
        x = bound(x, 1, ACTOR_SEED);

        // B stakes xvs2 in pool 1 and delegates to itself.
        vm.prank(B);
        vault.deposit(address(xvs), PID1, y);
        vm.prank(B);
        vault.delegate(B);
        assertEq(uint256(vault.getCurrentVotes(B)), 0, "M2: xvs2 pool granted votes");

        // A stakes XVS in pool 0 and delegates: votes == pool-0 stake only.
        vm.prank(A);
        vault.delegate(A);
        vm.prank(A);
        vault.deposit(address(xvs), PID0, x);
        assertEq(uint256(vault.getCurrentVotes(A)), x, "M2: pool-0 votes wrong");

        // A also stakes xvs2 in pool 1: must NOT change A's votes.
        vm.prank(A);
        vault.deposit(address(xvs), PID1, y);
        assertEq(uint256(vault.getCurrentVotes(A)), x, "M2: pool-1 stake leaked into votes");
    }

    // ---- M1: rewards are isolated per pool ----
    function testFuzz_M1_rewardIsolation(uint256 x, uint256 y, uint256 dt) public {
        x = bound(x, 1e18, ACTOR_SEED);
        y = bound(y, 1e18, ACTOR_SEED);
        dt = bound(dt, 1 days, 30 days);

        vm.prank(A);
        vault.deposit(address(xvs), PID0, x); // pool 0 only
        vm.prank(B);
        vault.deposit(address(xvs), PID1, y); // pool 1 only
        _warp(dt);

        // Each earns in its own pool.
        assertGt(vault.pendingReward(address(xvs), PID0, A), 0, "M1: pool-0 staker earned nothing");
        assertGt(vault.pendingReward(address(xvs), PID1, B), 0, "M1: pool-1 staker earned nothing");

        // Neither has any stake (or reward) in the other's pool.
        assertEq(vault.pendingReward(address(xvs), PID1, A), 0, "M1: A leaked into pool 1");
        assertEq(vault.pendingReward(address(xvs), PID0, B), 0, "M1: B leaked into pool 0");

        // Claiming the foreign pool pays nothing (no revert, no cross-drain).
        uint256 balA = xvs.balanceOf(A);
        vm.prank(A);
        vault.claim(A, address(xvs), PID1);
        assertEq(xvs.balanceOf(A), balA, "M1: A drained reward from pool 1");
    }
}
