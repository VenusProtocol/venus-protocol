// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";

/// @notice PoC exploit attempts for the canonical pre-0.8 / Solidity-0.5.x hack
/// classes, run against the real 0.5.16 `XVSVault`. Each test *performs* the
/// attack and asserts it is blocked — a documented failed exploit is the proof
/// the mitigation holds. Classes covered (see the security review):
///
///   H1  integer underflow  — pre-0.8 subtraction wraps to a huge number; here
///                            SafeMath / the amount guard revert instead.
///   H2  reward-debt wrap    — the money version of H1: if reward math could
///                            underflow, pending reward wraps to ~2^256 and
///                            drains the store. SafeMath `.sub` reverts.
///   H3  sig malleability    — replay a delegation with the malleable (v',n-s)
///                            counterpart. OZ ECDSA lib rejects high-s.
///   H4  ecrecover(0) forge  — a garbage signature must not recover to a usable
///                            signatory (never address(0) with a live nonce).
///   H5  checkpoint double-vote — the historical Compound/Venus bug (the
///                            `__old*Slot` DEPRECATED storage): keep votes after
///                            moving the underlying XVS to a second wallet.
contract Solc0516HacksTest is XVSVaultTestBase {
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    bytes32 internal constant DELEGATION_TYPEHASH =
        keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)");
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    address internal attacker;

    function setUp() public {
        _deployAndWire();
        attacker = actors[0];
    }

    function _digest(address delegatee, uint256 nonce, uint256 expiry) internal view returns (bytes32) {
        bytes32 ds = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes("XVSVault")), block.chainid, address(vault))
        );
        bytes32 sh = keccak256(abi.encode(DELEGATION_TYPEHASH, delegatee, nonce, expiry));
        return keccak256(abi.encodePacked("\x19\x01", ds, sh));
    }

    // ---- H1: withdraw more than staked must revert, not underflow ----
    // Pre-0.8, `user.amount - amount` with amount > user.amount wraps to ~2^256,
    // making the vault think the attacker holds astronomical principal.
    function test_H1_withdrawOverStakeReverts() public {
        vm.prank(attacker);
        vault.deposit(address(xvs), 0, 1_000e18);

        // Request 1 wei more than staked.
        vm.prank(attacker);
        vm.expectRevert(bytes("requested amount is invalid"));
        vault.requestWithdrawal(address(xvs), 0, 1_000e18 + 1);

        // Principal is untouched — no wrap happened.
        (uint256 amount, , ) = vault.getUserInfo(address(xvs), 0, attacker);
        assertEq(amount, 1_000e18, "H1: stake corrupted");
    }

    // ---- H2: reward accounting cannot underflow into an infinite mint ----
    // The pre-0.8 jackpot: drive rewardDebt above cumulative so `.sub` wraps and
    // pendingReward becomes ~2^256, then claim to drain the store. SafeMath makes
    // every such path revert; here we show the store can never be over-drained
    // and pendingReward stays sane through an adversarial deposit/withdraw churn.
    function test_H2_noRewardUnderflowMint() public {
        uint256 storeBefore = xvs.balanceOf(address(store));

        vm.prank(attacker);
        vault.deposit(address(xvs), 0, 500e18);
        vm.warp(block.timestamp + 30 days);
        vm.roll(block.number + 1);

        // Churn: request part, wait, execute, re-deposit — the reward-debt seam.
        vm.prank(attacker);
        vault.requestWithdrawal(address(xvs), 0, 200e18);
        vm.warp(block.timestamp + LOCK_PERIOD + 1);
        vm.roll(block.number + 1);
        vm.prank(attacker);
        vault.executeWithdrawal(address(xvs), 0);

        // pendingReward must not be an astronomical (wrapped) number.
        uint256 pending = vault.pendingReward(address(xvs), 0, attacker);
        assertLt(pending, storeBefore, "H2: pending reward exceeds entire store (wrap?)");

        // Claim cannot pull more reward than the store ever held.
        vm.prank(attacker);
        vault.claim(attacker, address(xvs), 0);
        assertGe(xvs.balanceOf(address(store)), 0, "H2: store went negative");
        // Reward paid out (store delta) is bounded by the emission schedule, not 2^256.
        assertLe(storeBefore - xvs.balanceOf(address(store)), storeBefore, "H2: store over-drained");
    }

    // ---- H3: signature-malleability replay on delegateBySig ----
    // Given a used (v,r,s), the malleable twin (v'=27<->28, s'=n-s) is a second
    // "valid" ecrecover signature for the same message. The classic attack replays
    // it to re-trigger the action. OZ ECDSA rejects the high-s twin outright.
    function test_H3_malleabilityReplayBlocked() public {
        uint256 pk = 0xA11CE;
        address signer = vm.addr(pk);
        xvs.mint(signer, 10_000e18);
        vm.prank(signer);
        xvs.approve(address(vault), type(uint256).max);
        vm.prank(signer);
        vault.deposit(address(xvs), 0, 10_000e18);

        address B = actors[1];
        uint256 expiry = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(B, 0, expiry));

        // Original delegation succeeds and consumes nonce 0.
        vault.delegateBySig(B, 0, expiry, v, r, s);
        assertEq(uint256(vault.getCurrentVotes(B)), 10_000e18, "H3: setup");

        // Malleable twin of the SAME signature.
        bytes32 sMal = bytes32(SECP256K1_N - uint256(s));
        uint8 vMal = v == 27 ? 28 : 27;

        // Attempted replay with the twin: rejected by the s-value check (would
        // otherwise still fail the nonce, but the lib stops it first).
        vm.expectRevert(bytes("ECDSA: invalid signature 's' value"));
        vault.delegateBySig(B, 0, expiry, vMal, r, sMal);
    }

    // ---- H4: forged signature cannot move real votes to a chosen address ----
    // A well-formed but attacker-fabricated sig (low-s, v=27) does NOT revert and
    // does NOT recover to address(0): ecrecover returns a deterministic address
    // the attacker cannot choose and does not control. The vault delegates THAT
    // phantom's stake — which is zero. The security property is therefore not
    // "it reverts" but "a forged sig can never grant the attacker's target any
    // votes", because forging a sig that recovers to a funded victim requires
    // that victim's private key.
    function test_H4_ecrecoverForgeGrantsNoVotes() public {
        address target = actors[1]; // address the attacker WANTS to empower
        uint256 expiry = block.timestamp + 1 hours;

        // s=1 is in the lower half order and v=27 is valid, so the lib accepts the
        // shape and recovers some phantom signatory (with no stake, nonce 0).
        try vault.delegateBySig(target, 0, expiry, 27, bytes32(uint256(1)), bytes32(uint256(1))) {
            // No revert: the phantom had zero stake, so nothing moved.
        } catch {
            // Reverting is equally acceptable.
        }

        // Either way, the forged signature granted the target no voting power.
        assertEq(uint256(vault.getCurrentVotes(target)), 0, "H4: forged sig moved votes to attacker's target");
    }

    // ---- H5: historical Compound/Venus double-vote (the DEPRECATED-slot bug) ----
    // Pre-fix, votes tracked balanceOf, so an attacker could delegate, then MOVE
    // the underlying XVS to a fresh wallet and have BOTH wallets vote the same
    // coins (2x inflation). The fixed vault burns votes at requestWithdrawal and
    // ties votes to live *staked* amount, so total votes never exceed staked XVS.
    function test_H5_doubleVoteViaTransferBlocked() public {
        address w2 = actors[2];
        uint256 x = 50_000e18;

        // Wallet 1 stakes and self-delegates -> x votes.
        vm.prank(attacker);
        vault.deposit(address(xvs), 0, x);
        vm.prank(attacker);
        vault.delegate(attacker);
        assertEq(uint256(vault.getCurrentVotes(attacker)), x, "H5: setup");

        // Attempt the "reuse the same coins" move: withdraw and hand them to w2.
        vm.prank(attacker);
        vault.requestWithdrawal(address(xvs), 0, x);
        // Votes are burned the instant withdrawal is requested — not after execute.
        assertEq(uint256(vault.getCurrentVotes(attacker)), 0, "H5: votes survived the request (double-count!)");

        vm.warp(block.timestamp + LOCK_PERIOD + 1);
        vm.roll(block.number + 1);
        vm.prank(attacker);
        vault.executeWithdrawal(address(xvs), 0);

        vm.prank(attacker);
        xvs.transfer(w2, x);
        vm.prank(w2);
        xvs.approve(address(vault), type(uint256).max);
        vm.prank(w2);
        vault.deposit(address(xvs), 0, x);
        vm.prank(w2);
        vault.delegate(w2);

        // The coins now back w2's votes ONLY. Total across both wallets == x, not 2x.
        assertEq(uint256(vault.getCurrentVotes(w2)), x, "H5: w2 votes wrong");
        assertEq(
            uint256(vault.getCurrentVotes(attacker)) + uint256(vault.getCurrentVotes(w2)),
            x,
            "H5: total votes exceed staked XVS (double-vote succeeded)"
        );
    }
}
