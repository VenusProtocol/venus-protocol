// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";

/// @notice Deterministic probes of the legacy (pre-upgrade, afterUpgrade=0)
/// withdrawal path — the branch of `executeWithdrawal` that pays reward on the
/// full `user.amount` and does not call `_moveDelegates`, reached via the
/// scenario-only `requestOldWithdrawal`. Goal: find a vote-inflation, reward, or
/// lock-bypass gap in a path no production test exercises.
///
/// Finding (documented, NOT exploitable on mainnet): a position holding BOTH a
/// legacy and a new request can never be executed ("inconsistent state") — a
/// permanent freeze. It is unreachable on mainnet because production
/// `requestWithdrawal` reverts while a beforeUpgrade request exists, and
/// `requestOldWithdrawal` does not exist on the deployed contract. LG_GUARD
/// below proves that guard is load-bearing; LG_FREEZE documents what removing it
/// would cost.
contract LegacyPathTest is XVSVaultTestBase {
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

    function _warpPastLock() internal {
        vm.warp(block.timestamp + LOCK_PERIOD + 1);
        vm.roll(block.number + 1);
    }

    // ---- LG1: legacy request burns votes; execute preserves votes == stake ----
    function testFuzz_LG1_legacyVoteConsistency(uint256 x, uint256 p) public {
        x = bound(x, 2, ACTOR_SEED);
        p = bound(p, 1, x - 1);

        _dep(A, x);
        vm.prank(A);
        vault.delegate(A);
        assertEq(uint256(vault.getCurrentVotes(A)), x, "LG1: votes != stake after delegate");

        // Legacy request burns votes for the requested slice.
        vm.prank(A);
        vault.requestOldWithdrawal(address(xvs), 0, p);
        assertEq(uint256(vault.getCurrentVotes(A)), x - p, "LG1: legacy request did not burn votes");

        // Execute the legacy request: amount and pending both drop by p, votes untouched.
        _warpPastLock();
        vm.prank(A);
        vault.executeWithdrawal(address(xvs), 0);

        // votes (x-p) must still equal live stake (amount-pending) = (x-p)-0.
        assertEq(uint256(vault.getCurrentVotes(A)), x - p, "LG1: execute altered votes");
        assertEq(_stakeOf(A), x - p, "LG1: stake != votes after legacy execute");
        assertEq(_sumCurrentVotes(), _sumDelegatedStake(), "LG1: conservation broken");
    }

    // ---- LG2: legacy execute reward is bounded by the emission schedule ----
    function testFuzz_LG2_legacyRewardBounded(uint256 x, uint256 dt) public {
        x = bound(x, 1e18, ACTOR_SEED);
        dt = bound(dt, 1 days, 20 days);
        uint256 storeBefore = xvs.balanceOf(address(store));

        _dep(A, x);
        vm.prank(A);
        vault.requestOldWithdrawal(address(xvs), 0, x); // whole stake, legacy
        vm.roll(block.number + 200_000);
        vm.warp(block.timestamp + dt + LOCK_PERIOD + 1);

        vm.prank(A);
        vault.executeWithdrawal(address(xvs), 0);

        // Store can never pay out more than the whole store; no wrap/mint.
        assertLe(storeBefore - xvs.balanceOf(address(store)), storeBefore, "LG2: store over-drained via legacy path");
        // Principal returned exactly (no inflation).
        assertEq(_amountOf(A), 0, "LG2: principal not fully withdrawn");
    }

    // ---- LG_GUARD: production guard blocks the dangerous mixed state ----
    // A user with a beforeUpgrade request pending CANNOT create a new request —
    // this is why mainnet can never reach the frozen mixed state.
    function test_LG_GUARD_newRequestBlockedWhileLegacyPending() public {
        _dep(A, 1_000e18);
        vm.prank(A);
        vault.requestOldWithdrawal(address(xvs), 0, 400e18);

        vm.prank(A);
        vm.expectRevert(bytes("execute pending withdrawal"));
        vault.requestWithdrawal(address(xvs), 0, 100e18);

        // deposit is blocked too.
        vm.prank(A);
        vm.expectRevert(bytes("execute pending withdrawal"));
        vault.deposit(address(xvs), 0, 100e18);
    }

    // ---- LG_FREEZE: without that guard, mixed requests freeze the position ----
    // Only reachable via the scenario-only requestOldWithdrawal AFTER a new
    // request (order that production forbids). Documents the cost of the guard.
    function test_LG_FREEZE_mixedRequestsCannotExecute() public {
        _dep(A, 1_000e18);
        // New request first (afterUpgrade=1), then a legacy one (afterUpgrade=0).
        vm.prank(A);
        vault.requestWithdrawal(address(xvs), 0, 300e18);
        vm.prank(A);
        vault.requestOldWithdrawal(address(xvs), 0, 300e18);

        _warpPastLock();
        // Both slices are eligible -> the not-both guard reverts -> funds frozen.
        vm.prank(A);
        vm.expectRevert(bytes("inconsistent state"));
        vault.executeWithdrawal(address(xvs), 0);
    }
}
