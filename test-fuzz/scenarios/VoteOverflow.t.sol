// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";

/// @notice The attackers minted XVS, so they may hold balances near or above the
/// uint96 vote cap (2^96). Votes are packed into uint96 checkpoints; the vault
/// must never let a stake overflow that width — either a single oversized
/// deposit, or an accumulated sub-cap stake that would overflow only when
/// delegated. Both paths must revert rather than wrap.
///
///   X7a a deposit of >= 2^96 reverts on the vote-move overflow guard
///   X7b accumulating stake >= 2^96 (sub-cap deposits) then delegating reverts
contract VoteOverflowTest is XVSVaultTestBase {
    uint256 internal constant TWO_96 = 2 ** 96;

    function setUp() public {
        _deployAndWire();
    }

    // ---- X7a: single deposit at/above the cap reverts ----
    function test_X7_depositAtVoteCapReverts() public {
        address A = actors[0];
        xvs.mint(A, TWO_96); // approval is already max from the base wiring

        vm.prank(A);
        vm.expectRevert(bytes("XVSVault::deposit: votes overflow"));
        vault.deposit(address(xvs), 0, TWO_96);
    }

    // ---- X7b: accumulate >= 2^96 undelegated, then delegate reverts ----
    function test_X7_delegateAboveCapReverts() public {
        address A = actors[0];
        xvs.mint(A, TWO_96 * 2);

        // Sub-cap deposits succeed while undelegated (no checkpoint written).
        vm.prank(A);
        vault.deposit(address(xvs), 0, TWO_96 - 1);
        vm.prank(A);
        vault.deposit(address(xvs), 0, TWO_96 - 1);

        // Total stake ~ 2^97: delegating would push votes past the uint96 cap.
        vm.prank(A);
        vm.expectRevert(bytes("XVSVault::getStakeAmount: votes overflow"));
        vault.delegate(A);
    }
}
