// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { Test } from "forge-std/Test.sol";
import { IXVSVault, IXVSStore } from "./interfaces/IXVSVault.sol";
import { MockBEP20 } from "./mocks/MockBEP20.sol";
import { MockACM } from "./mocks/MockACM.sol";

/// @notice Shared deployment + wiring for the XVSVault fuzz/invariant rig.
/// Deploys a locally-instantiated XVSVaultScenario (the 0.5.16 contract, via
/// deployCode) wired exactly as BSC pool 0: XVS as both stake and reward token,
/// 7-day lock, block-based time (mirrors BSC). Exposes a fixed actor set and
/// aggregate accessors reused by the invariants.
abstract contract XVSVaultTestBase is Test {
    IXVSVault internal vault;
    IXVSStore internal store;
    MockBEP20 internal xvs;
    MockACM internal acm;

    address[] internal actors;

    uint256 internal constant REWARD_PER_BLOCK = 1e18;
    uint256 internal constant LOCK_PERIOD = 7 days; // 604800, matches BSC pool 0
    uint256 internal constant BLOCKS_PER_YEAR = 70080000; // BSC 3s blocks
    uint256 internal constant STORE_FUNDING = 1_000_000e18;
    uint256 internal constant ACTOR_SEED = 100_000e18;
    uint256 internal constant NUM_ACTORS = 5;

    function _deployAndWire() internal {
        xvs = new MockBEP20();
        acm = new MockACM();

        // 0.5.16 contracts via deployCode (see anchors/Anchor.sol).
        vault = IXVSVault(deployCode("XVSVaultScenario.sol:XVSVaultScenario"));
        store = IXVSStore(deployCode("XVSStore.sol:XVSStore"));

        // Block-based to mirror BSC (isTimeBased == false).
        vault.initializeTimeManager(false, BLOCKS_PER_YEAR);
        vault.setAccessControl(address(acm));

        store.setNewOwner(address(vault));
        vault.setXvsStore(address(xvs), address(store));
        store.setRewardToken(address(xvs), true);

        // pool 0: rewardToken = xvs, token = xvs.
        vault.add(address(xvs), 100, address(xvs), REWARD_PER_BLOCK, LOCK_PERIOD);

        // Fund the reward store.
        xvs.mint(address(store), STORE_FUNDING);

        // Seed actors and pre-approve the vault (deposits pull via transferFrom).
        for (uint256 i = 0; i < NUM_ACTORS; i++) {
            address a = address(uint160(0x1000 + i));
            actors.push(a);
            xvs.mint(a, ACTOR_SEED);
            vm.prank(a);
            xvs.approve(address(vault), type(uint256).max);
        }

        // Advance one block so the pool has a non-zero history before actions.
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 3);
    }

    // --- aggregate accessors (used by invariants) ---

    function _stakeOf(address a) internal view returns (uint256) {
        (uint256 amount, , uint256 pending) = vault.getUserInfo(address(xvs), 0, a);
        return amount - pending; // getStakeAmount()
    }

    function _amountOf(address a) internal view returns (uint256 amount) {
        (amount, , ) = vault.getUserInfo(address(xvs), 0, a);
    }

    function _pendingOf(address a) internal view returns (uint256 pending) {
        (, , pending) = vault.getUserInfo(address(xvs), 0, a);
    }

    function _sumAmount() internal view returns (uint256 s) {
        for (uint256 i = 0; i < actors.length; i++) s += _amountOf(actors[i]);
    }

    function _sumPending() internal view returns (uint256 s) {
        for (uint256 i = 0; i < actors.length; i++) s += _pendingOf(actors[i]);
    }

    function _sumCurrentVotes() internal view returns (uint256 s) {
        for (uint256 i = 0; i < actors.length; i++) s += vault.getCurrentVotes(actors[i]);
    }

    /// @notice Σ over delegators of (amount − pending): the stake that *should*
    /// back live votes. Votes only accrue once an account has delegated.
    function _sumDelegatedStake() internal view returns (uint256 s) {
        for (uint256 i = 0; i < actors.length; i++) {
            if (vault.delegates(actors[i]) != address(0)) s += _stakeOf(actors[i]);
        }
    }
}
