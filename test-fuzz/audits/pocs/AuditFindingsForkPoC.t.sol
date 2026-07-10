// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { Test } from "forge-std/Test.sol";
import { IXVSVault } from "../../interfaces/IXVSVault.sol";

interface IERC20Like {
    function approve(address, uint256) external returns (bool);
}

/// @notice Fork PoC for finding L3 (governance vote-snapshot timing), shown at
/// the deployed-vault primitive that GovernorBravo relies on: getPriorVotes.
///
/// GovernorBravo snapshots vote weight at proposal.startBlock = creationBlock +
/// votingDelay (GovernorBravoDelegate.sol:509,264), NOT at creation. So voting
/// power delegated AFTER a proposal is created but BEFORE its startBlock is
/// counted. This PoC proves, against the live bscmainnet XVSVault bytecode, that
/// getPriorVotes(actor, snapshot) includes a delegation made after "creation"
/// but before "snapshot", while a snapshot taken at creation would exclude it.
///
/// This is a Low: it does not bypass the immutable 1.5M quorum — it only widens
/// the window in which weight can be assembled. Gated on ARCHIVE_NODE_bscmainnet.
contract AuditFindingsForkPoC is Test {
    IXVSVault internal constant VAULT = IXVSVault(0x051100480289e704d20e9DB4804837068f3f9204);
    address internal constant XVS_ADDR = 0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63;

    function setUp() public {
        string memory rpc = vm.envOr("ARCHIVE_NODE_bscmainnet", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        if (VAULT.vaultPaused()) {
            vm.skip(true);
            return;
        }
        // Isolate the vault primitive from the live Prime hook (see L1).
        vm.mockCall(VAULT.primeToken(), abi.encodeWithSignature("xvsUpdated(address)"), bytes(""));
    }

    function test_L3_priorVotesCountsDelegationMadeAfterCreationBeforeSnapshot() public {
        address actor = makeAddr("late-delegator");
        deal(XVS_ADDR, actor, 50_000e18);
        vm.prank(actor);
        IERC20Like(XVS_ADDR).approve(address(VAULT), type(uint256).max);

        // t0 = the block a proposal is "created". At this point the actor has no votes.
        uint256 creationBlock = block.number;

        // The actor stakes + delegates AFTER creation (simulating assembling weight
        // in response to a pending proposal), one block later.
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 3);
        vm.prank(actor);
        VAULT.deposit(XVS_ADDR, 0, 50_000e18);
        vm.prank(actor);
        VAULT.delegate(actor);
        uint256 delegationBlock = block.number;

        // "snapshot" = creation + votingDelay; roll past it so it's queryable.
        vm.roll(block.number + 10);
        vm.warp(block.timestamp + 30);
        uint256 snapshotBlock = delegationBlock + 1; // any block >= delegationBlock

        // FINDING: weight delegated after creation is counted at the snapshot.
        uint256 atSnapshot = uint256(VAULT.getPriorVotes(actor, snapshotBlock));
        assertEq(atSnapshot, 50_000e18, "L3: late delegation not counted at snapshot");

        // CONTRAST: had the snapshot been taken at creation, it would be excluded.
        uint256 atCreation = uint256(VAULT.getPriorVotes(actor, creationBlock));
        assertEq(atCreation, 0, "L3: creation-time snapshot would (wrongly) include it");
    }
}
