// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { Test } from "forge-std/Test.sol";
import { IXVSVault } from "../interfaces/IXVSVault.sol";

interface IERC20Like {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

/// @notice The same canonical pre-0.8 hack PoCs as `scenarios/Solc0516Hacks.t.sol`,
/// but replayed against the LIVE bscmainnet XVSVault — real proxy, real 0.5.16
/// implementation bytecode, real XVS token and reward store — instead of a
/// locally-deployed copy with mocks. This is the realistic check demanded by the
/// active XVS-accumulation threat: prove the deployed contract an attacker would
/// actually hit is not exploitable, not just the repo source.
///
/// Live targets (deployments/bscmainnet_addresses.json):
///   proxy  0x051100480289e704d20e9DB4804837068f3f9204
///   impl   0x74c8a97BE672db3e9a224648bE566AdA5F43B378 (solc 0.5.16, Etherscan-verified)
///   XVS    0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63 (pool 0 stake + reward)
///   store  0x1e25CF968f12850003Db17E0Dba32108509C4359
///
/// Gated on the `ARCHIVE_NODE_bscmainnet` RPC (forge auto-loads it from .env).
/// When it is unset the whole suite skips, mirroring the Hardhat fork convention.
contract ForkLiveHacksTest is Test {
    IXVSVault internal constant VAULT = IXVSVault(0x051100480289e704d20e9DB4804837068f3f9204);
    IERC20Like internal constant XVS = IERC20Like(0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63);
    address internal constant STORE = 0x1e25CF968f12850003Db17E0Dba32108509C4359;
    address internal constant XVS_ADDR = 0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63;

    // secp256k1 curve order n (for the malleable-s counterpart).
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    bytes32 internal constant DELEGATION_TYPEHASH =
        keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)");

    uint256 internal constant PID = 0;
    uint256 internal constant STAKE = 1_000e18;

    address internal attacker;
    address internal w2;

    function setUp() public {
        string memory rpc = vm.envOr("ARCHIVE_NODE_bscmainnet", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);

        // A prepared pause could make every user action revert; skip rather than
        // report a misleading pass.
        if (VAULT.vaultPaused()) {
            vm.skip(true);
            return;
        }

        // Live pool 0 is the Prime pool, so deposit/requestWithdrawal invoke
        // primeToken.xvsUpdated(); on a fork that Prime contract reverts
        // (NotActivated). Neutralize the hook to a no-op so these tests exercise
        // the VAULT's own arithmetic/vote/signature logic in isolation — the
        // surface the hacks target. (Prime's own safety is covered separately.)
        vm.mockCall(VAULT.primeToken(), abi.encodeWithSignature("xvsUpdated(address)"), bytes(""));

        attacker = makeAddr("attacker");
        w2 = makeAddr("w2");
        _fund(attacker, 100_000e18);
    }

    function _fund(address who, uint256 amt) internal {
        deal(XVS_ADDR, who, amt);
        vm.prank(who);
        XVS.approve(address(VAULT), type(uint256).max);
    }

    function _digest(address delegatee, uint256 nonce, uint256 expiry) internal view returns (bytes32) {
        bytes32 ds = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes("XVSVault")), block.chainid, address(VAULT))
        );
        bytes32 sh = keccak256(abi.encode(DELEGATION_TYPEHASH, delegatee, nonce, expiry));
        return keccak256(abi.encodePacked("\x19\x01", ds, sh));
    }

    // Advance both blocks (reward accrual is block-based on BSC) and time (the
    // withdrawal lock is timestamp-based) well past the pool's 7-day lock.
    function _advancePastLock() internal {
        vm.roll(block.number + 1_000_000); // ~35 days of 3s blocks
        vm.warp(block.timestamp + 30 days);
    }

    // ---- H1 (live): withdraw more than staked must revert, not underflow ----
    function test_fork_H1_withdrawOverStakeReverts() public {
        vm.prank(attacker);
        VAULT.deposit(XVS_ADDR, PID, STAKE);

        vm.prank(attacker);
        vm.expectRevert(bytes("requested amount is invalid"));
        VAULT.requestWithdrawal(XVS_ADDR, PID, STAKE + 1);

        (uint256 amount, , ) = VAULT.getUserInfo(XVS_ADDR, PID, attacker);
        assertEq(amount, STAKE, "H1: live stake corrupted");
    }

    // ---- H2 (live): reward accounting cannot underflow into an infinite mint ----
    function test_fork_H2_noRewardUnderflowMint() public {
        uint256 storeBefore = XVS.balanceOf(STORE);

        vm.prank(attacker);
        VAULT.deposit(XVS_ADDR, PID, 500e18);
        vm.roll(block.number + 100_000);
        vm.warp(block.timestamp + 3 days);

        vm.prank(attacker);
        VAULT.requestWithdrawal(XVS_ADDR, PID, 200e18);
        _advancePastLock();
        vm.prank(attacker);
        VAULT.executeWithdrawal(XVS_ADDR, PID);

        uint256 pending = VAULT.pendingReward(XVS_ADDR, PID, attacker);
        assertLt(pending, storeBefore, "H2: pending reward exceeds entire store (wrap?)");

        vm.prank(attacker);
        VAULT.claim(attacker, XVS_ADDR, PID);
        assertLe(storeBefore - XVS.balanceOf(STORE), storeBefore, "H2: store over-drained");
    }

    // ---- H3 (live): signature-malleability replay on delegateBySig ----
    function test_fork_H3_malleabilityReplayBlocked() public {
        uint256 pk = 0xA11CE;
        address signer = vm.addr(pk);
        _fund(signer, 10_000e18);
        vm.prank(signer);
        VAULT.deposit(XVS_ADDR, PID, 10_000e18);

        address B = makeAddr("delegatee");
        uint256 expiry = block.timestamp + 1 hours;
        uint256 nonce = VAULT.nonces(signer);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(B, nonce, expiry));

        // Original relayed delegation moves the signer's staked votes to B.
        VAULT.delegateBySig(B, nonce, expiry, v, r, s);
        assertEq(uint256(VAULT.getCurrentVotes(B)), 10_000e18, "H3: setup");

        // Malleable twin of the SAME signature — rejected by the s-value check.
        bytes32 sMal = bytes32(SECP256K1_N - uint256(s));
        uint8 vMal = v == 27 ? 28 : 27;
        vm.expectRevert(bytes("ECDSA: invalid signature 's' value"));
        VAULT.delegateBySig(B, nonce, expiry, vMal, r, sMal);
    }

    // ---- H4 (live): forged signature grants the chosen target no votes ----
    function test_fork_H4_ecrecoverForgeGrantsNoVotes() public {
        address target = makeAddr("target");
        uint256 expiry = block.timestamp + 1 hours;
        try VAULT.delegateBySig(target, 0, expiry, 27, bytes32(uint256(1)), bytes32(uint256(1))) {} catch {}
        assertEq(uint256(VAULT.getCurrentVotes(target)), 0, "H4: forged sig moved votes to target");
    }

    // ---- H5 (live): historical double-vote via moving the underlying XVS ----
    function test_fork_H5_doubleVoteViaTransferBlocked() public {
        uint256 x = 50_000e18;
        _fund(w2, 0); // just set approval; w2 gets XVS from attacker below

        vm.prank(attacker);
        VAULT.deposit(XVS_ADDR, PID, x);
        vm.prank(attacker);
        VAULT.delegate(attacker);
        assertEq(uint256(VAULT.getCurrentVotes(attacker)), x, "H5: setup");

        vm.prank(attacker);
        VAULT.requestWithdrawal(XVS_ADDR, PID, x);
        assertEq(uint256(VAULT.getCurrentVotes(attacker)), 0, "H5: votes survived request (double-count!)");

        _advancePastLock();
        vm.prank(attacker);
        VAULT.executeWithdrawal(XVS_ADDR, PID);

        vm.prank(attacker);
        XVS.transfer(w2, x);
        vm.prank(w2);
        VAULT.deposit(XVS_ADDR, PID, x);
        vm.prank(w2);
        VAULT.delegate(w2);

        assertEq(uint256(VAULT.getCurrentVotes(w2)), x, "H5: w2 votes wrong");
        assertEq(
            uint256(VAULT.getCurrentVotes(attacker)) + uint256(VAULT.getCurrentVotes(w2)),
            x,
            "H5: total votes exceed staked XVS (double-vote succeeded)"
        );
    }
}
