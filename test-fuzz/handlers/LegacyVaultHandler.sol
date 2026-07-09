// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { CommonBase } from "forge-std/Base.sol";
import { StdUtils } from "forge-std/StdUtils.sol";
import { IXVSVault } from "../interfaces/IXVSVault.sol";
import { MockBEP20 } from "../mocks/MockBEP20.sol";

/// @notice Invariant driver that mixes LEGACY (pre-upgrade, afterUpgrade=0)
/// withdrawal requests with the normal action set. The legacy path is
/// structurally different and untested elsewhere:
///   - `requestOldWithdrawal` burns votes but does NOT touch
///     `totalPendingWithdrawals` (so the I2 accounting invariant deliberately
///     does not apply to this handler),
///   - the `executeWithdrawal` beforeUpgrade branch pays reward on the FULL
///     `user.amount` and does NOT call `_moveDelegates`.
/// The goal is to find any sequence that breaks solvency or vote conservation
/// by interleaving legacy + new requests, delegation, and partial executes.
contract LegacyVaultHandler is CommonBase, StdUtils {
    IXVSVault internal immutable vault;
    MockBEP20 internal immutable xvs;
    address[] internal actors;

    uint256 public gDeposited;
    uint256 public gWithdrawn;
    uint256 public callDeposit;
    uint256 public callRequestNew;
    uint256 public callRequestOld;
    uint256 public callExecute;
    uint256 public callDelegate;

    constructor(IXVSVault _vault, MockBEP20 _xvs, address[] memory _actors) {
        vault = _vault;
        xvs = _xvs;
        actors = _actors;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[bound(seed, 0, actors.length - 1)];
    }

    function _available(address a) internal view returns (uint256) {
        (uint256 amount, , uint256 pending) = vault.getUserInfo(address(xvs), 0, a);
        return amount - pending;
    }

    function deposit(uint256 actorSeed, uint256 amt) external {
        address a = _actor(actorSeed);
        uint256 bal = xvs.balanceOf(a);
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        vm.prank(a);
        // Reverts if the actor has a pending beforeUpgrade request; that's a
        // valid guard, so skip rather than force it.
        try vault.deposit(address(xvs), 0, amt) {
            gDeposited += amt;
            callDeposit++;
        } catch {}
    }

    function delegate(uint256 actorSeed, uint256 dSeed) external {
        address a = _actor(actorSeed);
        uint256 pick = bound(dSeed, 0, actors.length);
        address target = pick == actors.length ? address(0) : actors[pick];
        vm.prank(a);
        vault.delegate(target);
        callDelegate++;
    }

    function requestNew(uint256 actorSeed, uint256 amt) external {
        address a = _actor(actorSeed);
        uint256 avail = _available(a);
        if (avail == 0) return;
        amt = bound(amt, 1, avail);
        vm.prank(a);
        try vault.requestWithdrawal(address(xvs), 0, amt) {
            callRequestNew++;
        } catch {}
    }

    function requestOld(uint256 actorSeed, uint256 amt) external {
        address a = _actor(actorSeed);
        uint256 avail = _available(a);
        if (avail == 0) return;
        amt = bound(amt, 1, avail);
        vm.prank(a);
        try vault.requestOldWithdrawal(address(xvs), 0, amt) {
            callRequestOld++;
        } catch {}
    }

    function executeWithdrawal(uint256 actorSeed) external {
        address a = _actor(actorSeed);
        uint256 before = xvs.balanceOf(a);
        vm.prank(a);
        try vault.executeWithdrawal(address(xvs), 0) {
            gWithdrawn += xvs.balanceOf(a) - before;
            callExecute++;
        } catch {}
    }

    function claim(uint256 actorSeed) external {
        address a = _actor(actorSeed);
        vm.prank(a);
        try vault.claim(a, address(xvs), 0) {} catch {}
    }

    function warpRoll(uint256 secondsSeed) external {
        uint256 dt = bound(secondsSeed, 1, 10 days);
        vm.warp(block.timestamp + dt);
        vm.roll(block.number + (dt / 3) + 1);
    }
}
