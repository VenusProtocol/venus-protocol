// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";

/// @notice Reward-path attacks by an XVS holder. Rewards are paid from the
/// separate XVSStore; the goal is to prove a holder cannot mint reward from
/// nothing, redirect another user's reward to themselves, or double-collect via
/// the deferred-debt (`pendingRewardTransfers`) path when the store is
/// underfunded.
///
///   X3a a second claim in the same block yields nothing (no double-collect)
///   X3b claiming for another account pays THAT account, not the caller
///   X6  the vault-debt path repays exactly the owed amount, never more
///   X9  a pending (requested) slice stops earning reward
contract RewardIntegrityTest is XVSVaultTestBase {
    function setUp() public {
        _deployAndWire();
    }

    // ---- X3a: double claim in one block pays only once ----
    function test_X3_doubleClaimYieldsNothing() public {
        address A = actors[0];
        vm.prank(A);
        vault.deposit(address(xvs), 0, 50_000e18);

        vm.roll(block.number + 1000);
        vm.warp(block.timestamp + 3000);

        uint256 b0 = xvs.balanceOf(A);
        vm.prank(A);
        vault.claim(A, address(xvs), 0);
        uint256 gained = xvs.balanceOf(A) - b0;
        assertGt(gained, 0, "X3a: no reward accrued");

        // Same block, second claim: rewardDebt is settled, so nothing more.
        vm.prank(A);
        vault.claim(A, address(xvs), 0);
        assertEq(xvs.balanceOf(A), b0 + gained, "X3a: double-claim paid twice");
    }

    // ---- X3b: claim(account) credits the account, not the caller ----
    function test_X3_claimForOtherPaysOther() public {
        address A = actors[0];
        address attacker = actors[1];
        vm.prank(A);
        vault.deposit(address(xvs), 0, 50_000e18);

        vm.roll(block.number + 1000);
        vm.warp(block.timestamp + 3000);

        uint256 attackerBefore = xvs.balanceOf(attacker);
        uint256 aBefore = xvs.balanceOf(A);

        // Attacker triggers A's claim; funds must flow to A.
        vm.prank(attacker);
        vault.claim(A, address(xvs), 0);

        assertEq(xvs.balanceOf(attacker), attackerBefore, "X3b: attacker skimmed reward");
        assertGt(xvs.balanceOf(A), aBefore, "X3b: rightful owner not paid");
    }

    // ---- X6: underfunded store records debt and repays it exactly once ----
    function test_X6_vaultDebtNoDoublePay() public {
        address A = actors[0];
        vm.prank(A);
        vault.deposit(address(xvs), 0, 50_000e18);

        // Warp far enough that accrued reward exceeds the store balance.
        vm.roll(block.number + 2_000_000);
        vm.warp(block.timestamp + 6_000_000);

        uint256 storeBal = xvs.balanceOf(address(store));
        uint256 aBefore = xvs.balanceOf(A);

        vm.prank(A);
        vault.claim(A, address(xvs), 0);
        uint256 firstPay = xvs.balanceOf(A) - aBefore;
        uint256 debt = vault.pendingRewardTransfers(address(xvs), A);

        // Store is drained to zero and the shortfall is booked as debt.
        assertEq(firstPay, storeBal, "X6: partial pay != store balance");
        assertGt(debt, 0, "X6: expected recorded debt");
        assertEq(xvs.balanceOf(address(store)), 0, "X6: store not fully drained");

        // Accrue a little more, refund the store enough to cover debt + new
        // pending (with buffer), claim again.
        vm.roll(block.number + 10);
        vm.warp(block.timestamp + 30);
        xvs.mint(address(store), debt + 1_000_000e18);

        uint256 p = vault.pendingReward(address(xvs), 0, A); // fresh reward at this block
        uint256 mid = xvs.balanceOf(A);
        vm.prank(A);
        vault.claim(A, address(xvs), 0);
        uint256 secondPay = xvs.balanceOf(A) - mid;

        // Repay is exactly the new pending plus the booked debt — never more.
        assertEq(secondPay, p + debt, "X6: repay != pending + debt");
        assertEq(vault.pendingRewardTransfers(address(xvs), A), 0, "X6: debt not cleared");
    }

    // ---- X9: a requested (pending) slice earns no further reward ----
    function test_X9_pendingSliceEarnsNoReward() public {
        address A = actors[0];
        address B = actors[1];
        vm.prank(A);
        vault.deposit(address(xvs), 0, 100_000e18);
        vm.prank(B);
        vault.deposit(address(xvs), 0, 100_000e18);

        // A requests withdrawal of half -> that slice stops accruing.
        vm.prank(A);
        vault.requestWithdrawal(address(xvs), 0, 50_000e18);

        vm.roll(block.number + 1000);
        vm.warp(block.timestamp + 3000);

        uint256 ra = vault.pendingReward(address(xvs), 0, A); // earns on 50k
        uint256 rb = vault.pendingReward(address(xvs), 0, B); // earns on 100k

        assertGt(ra, 0, "X9: active slice earned nothing");
        assertGt(rb, ra, "X9: pending slice still earned reward");
    }
}
