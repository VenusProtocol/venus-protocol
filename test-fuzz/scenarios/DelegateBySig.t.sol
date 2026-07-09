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
///   X4  a used signature cannot be replayed (nonce is consumed)
///   X5a an expired signature is rejected
///   X5b a wrong-chainId signature cannot move the signer's votes
///   X5c a malleable (high-s) signature is rejected by ECDSA
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

    // ---- X4: signature replay must be rejected ----
    function test_X4_sigReplayRejected() public {
        uint256 pk = 0xA11CE;
        address signer = _seedSigner(pk, 50_000e18);
        address B = actors[0];
        uint256 expiry = block.timestamp + 1 days;

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(B, 0, expiry, block.chainid));

        vault.delegateBySig(B, 0, expiry, v, r, s);
        assertEq(uint256(vault.getCurrentVotes(B)), 50_000e18, "X4: first delegate failed");
        assertEq(vault.delegates(signer), B, "X4: delegation not recorded");

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
}
