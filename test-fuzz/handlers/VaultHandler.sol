// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { CommonBase } from "forge-std/Base.sol";
import { StdUtils } from "forge-std/StdUtils.sol";
import { IXVSVault } from "../interfaces/IXVSVault.sol";
import { MockBEP20 } from "../mocks/MockBEP20.sol";

/// @notice Invariant fuzzing driver. The fuzzer calls these bounded actions in
/// random sequences against a fixed actor set. Inputs are bounded so calls are
/// meaningful; genuinely-invalid calls revert and are skipped
/// (invariant.fail_on_revert = false). Includes adversarial actions (raw
/// donation, same-block bursts, lock-boundary warps).
contract VaultHandler is CommonBase, StdUtils {
    IXVSVault internal immutable vault;
    MockBEP20 internal immutable xvs;
    address[] internal actors;

    // ghosts
    uint256 public gDeposited;
    uint256 public gWithdrawn;
    uint256 public gClaimed;
    uint256 public callDeposit;
    uint256 public callRequest;
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

    function deposit(uint256 actorSeed, uint256 amt) external {
        address a = _actor(actorSeed);
        uint256 bal = xvs.balanceOf(a);
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        vm.prank(a);
        vault.deposit(address(xvs), 0, amt);
        gDeposited += amt;
        callDeposit++;
    }

    function requestWithdrawal(uint256 actorSeed, uint256 amt) external {
        address a = _actor(actorSeed);
        (uint256 amount, , uint256 pending) = vault.getUserInfo(address(xvs), 0, a);
        uint256 avail = amount - pending;
        if (avail == 0) return;
        amt = bound(amt, 1, avail);
        vm.prank(a);
        vault.requestWithdrawal(address(xvs), 0, amt);
        callRequest++;
    }

    function executeWithdrawal(uint256 actorSeed) external {
        address a = _actor(actorSeed);
        uint256 before = xvs.balanceOf(a);
        vm.prank(a);
        // Reverts ("nothing to withdraw") when nothing is eligible; skipped.
        try vault.executeWithdrawal(address(xvs), 0) {
            gWithdrawn += xvs.balanceOf(a) - before;
            callExecute++;
        } catch {}
    }

    function claim(uint256 actorSeed) external {
        address a = _actor(actorSeed);
        uint256 before = xvs.balanceOf(a);
        vm.prank(a);
        try vault.claim(a, address(xvs), 0) {
            gClaimed += xvs.balanceOf(a) - before;
        } catch {}
    }

    function delegate(uint256 actorSeed, uint256 delegateeSeed) external {
        address a = _actor(actorSeed);
        // Include address(0) (undelegate) in the target space.
        address target;
        uint256 pick = bound(delegateeSeed, 0, actors.length);
        target = pick == actors.length ? address(0) : actors[pick];
        vm.prank(a);
        vault.delegate(target);
        callDelegate++;
    }

    /// @notice Advance time and blocks in lockstep (BSC ~3s/block). Occasionally
    /// jumps far enough to clear the 7-day lock so executeWithdrawal is reachable.
    function warpRoll(uint256 secondsSeed) external {
        uint256 dt = bound(secondsSeed, 1, 10 days);
        vm.warp(block.timestamp + dt);
        vm.roll(block.number + (dt / 3) + 1);
    }

    /// @notice Adversarial: raw transfer into the vault (bypassing deposit).
    /// Probes the balance-based reward-supply path; must only dilute, never
    /// break solvency or let anyone claim the donation as principal.
    function donate(uint256 amt) external {
        address a = _actor(amt);
        uint256 bal = xvs.balanceOf(a);
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        vm.prank(a);
        xvs.transfer(address(vault), amt);
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }
}
