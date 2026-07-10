// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../../XVSVaultTestBase.sol";
import { IXVSStore } from "../../interfaces/IXVSVault.sol";
import { MockBEP20 } from "../../mocks/MockBEP20.sol";

/// @notice A Prime token whose xvsUpdated always reverts — stands in for a
/// broken / paused / mis-upgraded Prime (or a Prime market added before its PLP
/// token was initialized), which is the trigger described in finding L1.
contract MockRevertingPrime {
    function xvsUpdated(address) external pure {
        revert("prime down");
    }
}

/// @notice Runnable proof-of-concepts for the vault-scope findings in
/// test-fuzz/audits/xvs-vault-findings.md. Each test *demonstrates* the finding
/// and asserts its exact impact + boundary. These are the deployed-vault logic
/// (0.5.16 XVSVaultScenario) exercised locally; the governance-scope findings
/// (L3/L4/L5) are in AuditFindingsForkPoC.t.sol and the report's appendix.
contract AuditFindingsPoC is XVSVaultTestBase {
    address internal A;
    address internal attacker;

    function setUp() public {
        _deployAndWire();
        A = actors[0];
        attacker = actors[1];
    }

    function _warpPastLock() internal {
        vm.warp(block.timestamp + LOCK_PERIOD + 1);
        vm.roll(block.number + 1);
    }

    // =====================================================================
    // L1 — Prime xvsUpdated hook is a hard dependency of deposit &
    // requestWithdrawal. A reverting Prime blocks NEW deposits and unstake
    // requests, but in-flight withdrawals and claims still complete (no loss).
    // =====================================================================
    function test_L1_revertingPrimeFreezesDepositAndRequest_notExecuteOrClaim() public {
        // Set up a stake and an in-flight withdrawal request BEFORE Prime is wired.
        vm.prank(A);
        vault.deposit(address(xvs), 0, 1_000e18);
        vm.prank(A);
        vault.delegate(A);
        vm.prank(A);
        vault.requestWithdrawal(address(xvs), 0, 400e18); // in-flight request

        // Wire pool 0 as the Prime pool with a Prime that reverts (the L1 trigger).
        MockRevertingPrime badPrime = new MockRevertingPrime();
        vault.setPrimeToken(address(badPrime), address(xvs), 0);

        // IMPACT: new deposit and new withdrawal-request both revert — users are
        // frozen out of starting an unstake.
        vm.prank(A);
        vm.expectRevert(bytes("prime down"));
        vault.deposit(address(xvs), 0, 100e18);

        vm.prank(A);
        vm.expectRevert(bytes("prime down"));
        vault.requestWithdrawal(address(xvs), 0, 100e18);

        // BOUNDARY (no fund loss): executeWithdrawal and claim do NOT call the
        // hook, so the already-requested 400 still comes out and rewards claim.
        _warpPastLock();
        uint256 balBefore = xvs.balanceOf(A);
        vm.prank(A);
        vault.executeWithdrawal(address(xvs), 0);
        assertEq(
            xvs.balanceOf(A) - balBefore,
            400e18,
            "L1: in-flight withdrawal blocked (would be worse than reported)"
        );

        vm.prank(A);
        vault.claim(A, address(xvs), 0); // must not revert
    }

    // =====================================================================
    // L2 — XVSStore.emergencyRewardWithdraw bypasses the reward-token allowlist
    // and balance cap. Whoever is store `owner` can sweep ANY token, ANY amount.
    // Reachable only if the Timelock repoints the owner (centralization).
    // =====================================================================
    function test_L2_emergencyWithdrawDrainsAnyTokenNoAllowlistNoCap() public {
        IXVSStore s = IXVSStore(address(store));
        // Sanity: the test contract is the store admin (deployer); owner is the vault.
        assertEq(s.admin(), address(this), "L2: precondition");

        // A non-reward token sitting in the store (e.g. an accidental transfer).
        MockBEP20 other = new MockBEP20();
        other.mint(address(store), 5_000e18);
        assertEq(s.rewardTokens(address(other)), false, "L2: other is not an allowlisted reward token");

        // Centralization step: Timelock (here, the admin) repoints owner to attacker.
        s.setNewOwner(attacker);

        // DRAIN 1: the non-allowlisted token — emergencyRewardWithdraw has no
        // rewardTokens[] check (unlike safeRewardTransfer), so it succeeds.
        vm.prank(attacker);
        s.emergencyRewardWithdraw(address(other), 5_000e18);
        assertEq(other.balanceOf(attacker), 5_000e18, "L2: non-reward token not drained");

        // DRAIN 2: the entire XVS reward reserve, no balance cap. (attacker was
        // pre-seeded XVS by the base rig, so assert the DELTA, not the balance.)
        uint256 reserve = xvs.balanceOf(address(store));
        uint256 attackerXvsBefore = xvs.balanceOf(attacker);
        vm.prank(attacker);
        s.emergencyRewardWithdraw(address(xvs), reserve);
        assertEq(xvs.balanceOf(attacker) - attackerXvsBefore, reserve, "L2: reward reserve not drained");
        assertEq(xvs.balanceOf(address(store)), 0, "L2: store not emptied");
    }

    // =====================================================================
    // I1 — Donating the staked token to the vault only DILUTES rewards. The
    // donor is not credited any stake and gains nothing. Because both
    // pendingReward and _updatePool read the live balanceOf, a donation inflates
    // supply = balanceOf - totalPendingWithdrawals and dilutes the (uncommitted)
    // accrual — the staker's pending drops the instant the donation lands.
    // Griefing at most (attacker pays, undistributed reward stays in the store);
    // no theft, no stake credited to the donor.
    // =====================================================================
    function test_I1_donationDilutesRewardsNoTheft() public {
        vm.prank(A);
        vault.deposit(address(xvs), 0, 1_000e18);

        // Accrue a window (uncommitted — no state-changing call runs _updatePool).
        vm.roll(block.number + 1_000);
        vm.warp(block.timestamp + 3_000);
        uint256 pendingBefore = vault.pendingReward(address(xvs), 0, A);
        assertGt(pendingBefore, 0, "I1: no baseline accrual");

        // Attacker donates a large amount of XVS straight to the vault.
        uint256 donorBefore = xvs.balanceOf(attacker);
        (uint256 donorAmtBefore, , ) = vault.getUserInfo(address(xvs), 0, attacker);
        vm.prank(attacker);
        xvs.transfer(address(vault), 100_000e18);

        // The donation credits the donor NO stake (pure loss to the donor).
        (uint256 donorAmtAfter, , ) = vault.getUserInfo(address(xvs), 0, attacker);
        assertEq(donorAmtAfter, donorAmtBefore, "I1: donation wrongly credited donor stake");
        assertEq(xvs.balanceOf(attacker), donorBefore - 100_000e18, "I1: donor not debited");

        // Same block: A's pending is now DILUTED (supply inflated by the donation).
        uint256 pendingAfter = vault.pendingReward(address(xvs), 0, A);
        assertLt(pendingAfter, pendingBefore, "I1: donation did not dilute pending reward");
    }

    // =====================================================================
    // I2 — requestWithdrawal calls _transferReward unconditionally (even when
    // pending == 0). Harmless: no revert, no double-pay; opportunistically
    // settles any prior debt.
    // =====================================================================
    function test_I2_requestWithdrawalWithZeroPendingIsSafe() public {
        vm.prank(A);
        vault.deposit(address(xvs), 0, 1_000e18);

        // Same block as deposit -> no reward accrued yet -> pending == 0.
        assertEq(vault.pendingReward(address(xvs), 0, A), 0, "I2: unexpected accrual");

        uint256 balBefore = xvs.balanceOf(A);
        vm.prank(A);
        vault.requestWithdrawal(address(xvs), 0, 100e18); // must not revert
        // No reward paid (nothing accrued) — no double-pay, no phantom credit.
        assertEq(xvs.balanceOf(A), balBefore, "I2: paid a reward with zero pending");
    }
}
