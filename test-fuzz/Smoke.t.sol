// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "./XVSVaultTestBase.sol";

/// @notice Validates deploy/wiring and the core deposit → delegate → request →
/// execute lifecycle before the heavier invariant/scenario suites run.
contract SmokeTest is XVSVaultTestBase {
    function setUp() public {
        _deployAndWire();
    }

    function test_wiring() public view {
        assertEq(vault.poolLength(address(xvs)), 1, "pool 0 not created");
        assertEq(vault.isTimeBased(), false, "should be block-based");
    }

    function test_deposit_delegate_votes() public {
        address a = actors[0];

        vm.prank(a);
        vault.deposit(address(xvs), 0, 1000e18);
        assertEq(_amountOf(a), 1000e18, "deposit not credited");
        // No votes before delegation (Compound semantics).
        assertEq(vault.getCurrentVotes(a), 0, "votes before delegate");

        vm.prank(a);
        vault.delegate(a);
        assertEq(uint256(vault.getCurrentVotes(a)), 1000e18, "votes != stake after delegate");
    }

    function test_request_burns_votes_then_execute() public {
        address a = actors[0];

        vm.prank(a);
        vault.deposit(address(xvs), 0, 1000e18);
        vm.prank(a);
        vault.delegate(a);

        vm.prank(a);
        vault.requestWithdrawal(address(xvs), 0, 400e18);
        // Request immediately removes voting power for the requested amount.
        assertEq(uint256(vault.getCurrentVotes(a)), 600e18, "votes not burned on request");
        assertEq(_pendingOf(a), 400e18, "pending not tracked");

        // Cannot execute before the lock elapses (reverts, nothing eligible).
        vm.prank(a);
        vm.expectRevert(bytes("nothing to withdraw"));
        vault.executeWithdrawal(address(xvs), 0);
        assertEq(_amountOf(a), 1000e18, "withdrew before lock");

        // After the lock, the 400 is withdrawable.
        vm.warp(block.timestamp + LOCK_PERIOD + 1);
        uint256 balBefore = xvs.balanceOf(a);
        vm.prank(a);
        vault.executeWithdrawal(address(xvs), 0);
        assertEq(_amountOf(a), 600e18, "amount not reduced after execute");
        assertEq(xvs.balanceOf(a) - balBefore, 400e18, "tokens not returned");
    }
}
