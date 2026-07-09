// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";

/// @notice Targeted attacks on the vote-accounting seams — the ways 300k XVS
/// could become >300k voting power. The vault moves votes two ways: deposit /
/// requestWithdrawal use an incremental DELTA (_moveDelegates(·,·,amount)),
/// while delegate() moves the ABSOLUTE getStakeAmount() between reps.
/// Interleaving the two is the classic Compound-style inflation source.
/// Each test asserts the conservation law: Σ currentVotes == Σ (stake) over
/// delegators, and — for the governance-relevant case — that a historical
/// snapshot can never exceed the stake that existed at that block.
contract VoteInflationTest is XVSVaultTestBase {
    address internal A;
    address internal B; // delegatee
    address internal C; // delegatee

    function setUp() public {
        _deployAndWire();
        A = actors[0];
        B = actors[1];
        C = actors[2];
    }

    function _dep(address who, uint256 amt) internal {
        vm.prank(who);
        vault.deposit(address(xvs), 0, amt);
    }

    function _del(address who, address to) internal {
        vm.prank(who);
        vault.delegate(to);
    }

    function _req(address who, uint256 amt) internal {
        vm.prank(who);
        vault.requestWithdrawal(address(xvs), 0, amt);
    }

    // ---- S1: delta/absolute seam — re-delegate after a partial withdrawal ----
    // delegate(A→B); deposit X; request p; delegate(A→C).
    // Expect: votes(B)==0, votes(C)==X−p, and the global conservation holds.
    function testFuzz_S1_reDelegateAfterRequest(uint256 x, uint256 p) public {
        x = bound(x, 2, ACTOR_SEED);
        p = bound(p, 1, x - 1);

        _del(A, B);
        _dep(A, x);
        assertEq(uint256(vault.getCurrentVotes(B)), x, "S1: B != X after deposit");

        _req(A, p);
        assertEq(uint256(vault.getCurrentVotes(B)), x - p, "S1: B != X-p after request");

        _del(A, C);
        assertEq(uint256(vault.getCurrentVotes(B)), 0, "S1: B not drained on re-delegate");
        assertEq(uint256(vault.getCurrentVotes(C)), x - p, "S1: C != X-p");
        assertEq(_sumCurrentVotes(), _sumDelegatedStake(), "S1: conservation broken");
    }

    // ---- S2: re-delegate to the SAME delegatee must net zero ----
    function testFuzz_S2_reDelegateSameTarget(uint256 x, uint8 k) public {
        x = bound(x, 1, ACTOR_SEED);
        _del(A, B);
        _dep(A, x);
        uint256 kk = bound(k, 1, 10);
        for (uint256 i = 0; i < kk; i++) _del(A, B);
        assertEq(uint256(vault.getCurrentVotes(B)), x, "S2: same-target re-delegate inflated");
        assertEq(_sumCurrentVotes(), _sumDelegatedStake(), "S2: conservation broken");
    }

    // ---- S3: deposits while undelegated grant 0 votes; one delegate == stake ----
    function testFuzz_S3_depositThenDelegateOnce(uint256 x1, uint256 x2) public {
        x1 = bound(x1, 1, ACTOR_SEED / 2);
        x2 = bound(x2, 1, ACTOR_SEED / 2);
        _dep(A, x1); // undelegated -> no votes
        _dep(A, x2);
        assertEq(uint256(vault.getCurrentVotes(A)), 0, "S3: votes before delegate");
        _del(A, A);
        assertEq(uint256(vault.getCurrentVotes(A)), x1 + x2, "S3: not exactly stake (double-count?)");
    }

    // ---- S4: same-block op storm; checkpoint overwrite must not sum ----
    function testFuzz_S4_sameBlockStorm(uint256 x, uint256 y, uint256 p) public {
        x = bound(x, 2, ACTOR_SEED / 2);
        y = bound(y, 2, ACTOR_SEED / 2);
        p = bound(p, 1, x - 1);
        // No warp/roll between any call: all land in the same block.
        _dep(A, x);
        _del(A, B);
        _dep(A, y);
        _del(A, C);
        _req(A, p);
        _del(A, B);
        assertEq(_sumCurrentVotes(), _sumDelegatedStake(), "S4: conservation broken same-block");
        // B should hold A's whole current stake (last delegate target).
        assertEq(uint256(vault.getCurrentVotes(B)), _stakeOf(A), "S4: B != A stake");
        assertEq(uint256(vault.getCurrentVotes(C)), 0, "S4: stale votes on C");
    }

    // ---- S5: historical snapshot can never exceed stake at that block ----
    // The governance-relevant property: getPriorVotes summed over all accounts
    // at any past block b <= total staked at b. Attempts cross-wallet reuse of
    // the same economic XVS around the snapshot block.
    function testFuzz_S5_snapshotNeverExceedsStake(uint256 x, uint256 moveAmt) public {
        x = bound(x, 2, ACTOR_SEED);
        moveAmt = bound(moveAmt, 1, x - 1);

        // A stakes and delegates; record the snapshot block.
        _dep(A, x);
        _del(A, A);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 3);
        uint256 snap = block.number - 1; // a settled past block
        uint256 stakeAtSnap = _sumAmount() - _sumPending();

        // Attempt to "reuse" the XVS: request withdrawal, wait out the lock,
        // execute, move tokens to B, B stakes+delegates. The snapshot at `snap`
        // must not retroactively gain B's later votes.
        _req(A, moveAmt);
        vm.warp(block.timestamp + LOCK_PERIOD + 1);
        vm.roll(block.number + 1);
        vm.prank(A);
        vault.executeWithdrawal(address(xvs), 0);
        vm.prank(A);
        xvs.transfer(B, moveAmt);
        _dep(B, moveAmt);
        _del(B, B);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 3);

        uint256 priorSum;
        for (uint256 i = 0; i < actors.length; i++) {
            priorSum += vault.getPriorVotes(actors[i], snap);
        }
        assertLe(priorSum, stakeAtSnap, "S5: historical votes exceed stake at snapshot");
    }

    // ---- S6: execute must not re-burn or re-add votes ----
    function testFuzz_S6_executeVoteNeutral(uint256 x, uint256 p, uint256 y) public {
        x = bound(x, 2, ACTOR_SEED / 2);
        p = bound(p, 1, x);
        y = bound(y, 1, ACTOR_SEED / 2);

        _del(A, A);
        _dep(A, x);
        _req(A, p);
        uint256 votesAfterReq = vault.getCurrentVotes(A);
        assertEq(votesAfterReq, x - p, "S6: request burn wrong");

        vm.warp(block.timestamp + LOCK_PERIOD + 1);
        vm.roll(block.number + 1);
        vm.prank(A);
        vault.executeWithdrawal(address(xvs), 0);
        // Execute changes principal but must NOT touch votes.
        assertEq(uint256(vault.getCurrentVotes(A)), x - p, "S6: execute altered votes");

        // A later deposit adds exactly y, not more (no re-add of burned votes).
        _dep(A, y);
        assertEq(uint256(vault.getCurrentVotes(A)), x - p + y, "S6: deposit re-added stale votes");
        assertEq(_sumCurrentVotes(), _sumDelegatedStake(), "S6: conservation broken");
    }
}
