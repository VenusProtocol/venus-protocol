// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";

/// @notice P1 — the reward-store shortfall path (_transferReward lines 964-968).
/// When the store cannot cover a payout, the vault transfers whatever the store
/// holds and records the remainder in pendingRewardTransfers[token][user];
/// the debt is repaid (once, in full, no double-pay) on the next payout after
/// the store is refilled. The standard rig over-funds the store so this branch
/// is never reached. Here the store is deliberately starved.
///
/// Properties:
///   - a claim against an empty-enough store drains exactly the store balance
///     and books debt == owed - paid (never more);
///   - after refill, the next reward-bearing action clears the debt exactly and
///     the user's total XVS received equals the reward it legitimately earned
///     (store is the only reward source; A never withdraws principal here).
contract StoreShortfallTest is XVSVaultTestBase {
    address internal A;
    uint256 internal constant SMALL_STORE = 3e18; // < a few blocks of reward

    function _storeFunding() internal pure override returns (uint256) {
        return SMALL_STORE;
    }

    function setUp() public {
        _deployAndWire();
        A = actors[0];
    }

    function _dep(address who, uint256 amt) internal {
        vm.prank(who);
        vault.deposit(address(xvs), 0, amt);
    }

    function _warp(uint256 dt) internal {
        vm.warp(block.timestamp + dt);
        vm.roll(block.number + (dt / 3) + 1);
    }

    function testFuzz_P1_debtBookedThenRepaid(uint256 x, uint256 dt1, uint256 dt2) public {
        x = bound(x, 1e18, ACTOR_SEED);
        dt1 = bound(dt1, LOCK_PERIOD, 60 days); // long enough that earned > SMALL_STORE
        dt2 = bound(dt2, 100, 10 days);

        _dep(A, x);
        _warp(dt1);

        uint256 owed = vault.pendingReward(address(xvs), 0, A);
        vm.assume(owed > SMALL_STORE); // ensure we actually hit the shortfall branch

        // --- claim into a starved store ---
        uint256 balBefore = xvs.balanceOf(A);
        vm.prank(A);
        vault.claim(A, address(xvs), 0);

        uint256 paid1 = xvs.balanceOf(A) - balBefore;
        uint256 debt = vault.pendingRewardTransfers(address(xvs), A);

        assertEq(paid1, SMALL_STORE, "P1: did not drain the whole store");
        assertEq(xvs.balanceOf(address(store)), 0, "P1: store not emptied");
        assertEq(debt, owed - SMALL_STORE, "P1: debt != owed - paid");

        // --- refill (comfortably above the booked debt + any fresh accrual),
        // accrue a little more, then claim to repay the debt in full ---
        xvs.mint(address(store), debt + 1e30);
        _warp(dt2);

        uint256 newPending = vault.pendingReward(address(xvs), 0, A);
        uint256 balMid = xvs.balanceOf(A);
        vm.prank(A);
        vault.claim(A, address(xvs), 0);

        uint256 paid2 = xvs.balanceOf(A) - balMid;
        assertEq(vault.pendingRewardTransfers(address(xvs), A), 0, "P1: debt not cleared");
        // repayment == old debt + freshly earned reward, no double-pay
        assertEq(paid2, debt + newPending, "P1: repayment mismatch (double-pay or short-pay)");
        // total received == total legitimately earned across both windows
        assertEq(paid1 + paid2, owed + newPending, "P1: lifetime reward accounting drift");
    }
}
