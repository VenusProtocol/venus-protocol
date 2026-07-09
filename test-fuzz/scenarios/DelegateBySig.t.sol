// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";

/// @notice Attacks on the off-chain delegation path (`delegateBySig`). An XVS
/// holder must not be able to move ANOTHER account's votes by replaying,
/// re-timing, cross-chaining, or malleating a signature. The vault recovers the
/// signatory from the EIP-712 digest and delegates THAT account's stake, so a
/// forged/stale signature that recovers to the wrong address must never move the
/// victim's votes.
///
///   X4   a relayed signature delegates once; the used signature cannot replay
///        (nonce is consumed)
///   X5a  an expired signature is rejected
///   X5b  a wrong-chainId signature cannot move the signer's votes
///   X5c  a malleable (high-s) signature is rejected by ECDSA
///   I11d a forged payload only ever affects the signer, never a victim
contract DelegateBySigTest is XVSVaultTestBase {
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    bytes32 internal constant DELEGATION_TYPEHASH =
        keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)");
    // secp256k1 curve order n (used to build the malleable counterpart s' = n - s).
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function setUp() public {
        _deployAndWire();
    }

    /// Mints, approves and stakes `amt` for the account controlled by `pk`.
    function _seedSigner(uint256 pk, uint256 amt) internal returns (address who) {
        who = vm.addr(pk);
        xvs.mint(who, amt);
        vm.prank(who);
        xvs.approve(address(vault), type(uint256).max);
        vm.prank(who);
        vault.deposit(address(xvs), 0, amt);
    }

    function _digest(
        address delegatee,
        uint256 nonce,
        uint256 expiry,
        uint256 chainId
    ) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes("XVSVault")), chainId, address(vault))
        );
        bytes32 structHash = keccak256(abi.encode(DELEGATION_TYPEHASH, delegatee, nonce, expiry));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    // ---- X4: a relayed signature delegates once, and replay is rejected ----
    // The call is made by the test contract, not the signer, so this also covers
    // the "valid signature relayed by a third party" case.
    function test_X4_relayedOnceThenReplayRejected() public {
        uint256 pk = 0xA11CE;
        address signer = _seedSigner(pk, 50_000e18);
        address B = actors[0];
        uint256 expiry = block.timestamp + 1 days;

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(B, 0, expiry, block.chainid));

        vault.delegateBySig(B, 0, expiry, v, r, s);
        assertEq(uint256(vault.getCurrentVotes(B)), 50_000e18, "X4: first delegate failed");
        assertEq(vault.delegates(signer), B, "X4: delegation not recorded");
        assertEq(vault.nonces(signer), 1, "X4: nonce not consumed");

        // Same signature again: the nonce is now 1, so it must revert.
        vm.expectRevert(bytes("XVSVault::delegateBySig: invalid nonce"));
        vault.delegateBySig(B, 0, expiry, v, r, s);
    }

    // ---- X5a: expired signature must be rejected ----
    function test_X5_expiredSigRejected() public {
        uint256 pk = 0xB0B;
        _seedSigner(pk, 50_000e18);
        address B = actors[0];
        uint256 expiry = block.timestamp - 1; // already in the past

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(B, 0, expiry, block.chainid));

        vm.expectRevert(bytes("XVSVault::delegateBySig: signature expired"));
        vault.delegateBySig(B, 0, expiry, v, r, s);
    }

    // ---- X5b: wrong-chainId signature cannot move the signer's votes ----
    function test_X5_wrongChainIdCannotMoveVotes() public {
        uint256 pk = 0xCA11;
        address signer = _seedSigner(pk, 50_000e18);
        address B = actors[0];
        uint256 expiry = block.timestamp + 1 days;

        // Sign against a different chainId: recovers some other address (with no
        // stake), so it can neither move the signer's votes nor grant B any.
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(B, 0, expiry, block.chainid + 1));

        vault.delegateBySig(B, 0, expiry, v, r, s);
        assertEq(uint256(vault.getCurrentVotes(B)), 0, "X5b: cross-chain sig moved votes");
        assertEq(vault.delegates(signer), address(0), "X5b: signer delegation altered");
    }

    // ---- X5c: malleable (high-s) signature must be rejected ----
    function test_X5_malleableSigRejected() public {
        uint256 pk = 0xDEAD;
        _seedSigner(pk, 50_000e18);
        address B = actors[0];
        uint256 expiry = block.timestamp + 1 days;

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(B, 0, expiry, block.chainid));

        // Flip to the malleable counterpart: s' = n - s, v' = 27<->28.
        bytes32 sMal = bytes32(SECP256K1_N - uint256(s));
        uint8 vMal = v == 27 ? 28 : 27;

        vm.expectRevert(bytes("ECDSA: invalid signature 's' value"));
        vault.delegateBySig(B, 0, expiry, vMal, r, sMal);
    }

    // ---- I11d: a relayer cannot forge a victim's delegation ----
    function test_I11d_noVictimForge() public {
        // Victim stakes and self-delegates through the normal path.
        address victim = _seedSigner(0x71C7, 50_000e18);
        vm.prank(victim);
        vault.delegate(victim);
        assertEq(uint256(vault.getCurrentVotes(victim)), 50_000e18, "I11d: setup");

        // Attacker signs with ITS OWN key, trying to redirect votes to itself.
        uint256 attackerPk = 0xBADBAD;
        address attacker = vm.addr(attackerPk);
        uint256 expiry = block.timestamp + 1 hours;
        uint256 n = vault.nonces(attacker);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerPk, _digest(attacker, n, expiry, block.chainid));
        vault.delegateBySig(attacker, n, expiry, v, r, s);

        // The signature only affected the attacker (zero stake). Victim untouched.
        assertEq(vault.delegates(victim), victim, "I11d: victim delegate changed");
        assertEq(uint256(vault.getCurrentVotes(victim)), 50_000e18, "I11d: victim votes moved");
        assertEq(uint256(vault.getCurrentVotes(attacker)), 0, "I11d: forged votes for attacker");
    }
}
