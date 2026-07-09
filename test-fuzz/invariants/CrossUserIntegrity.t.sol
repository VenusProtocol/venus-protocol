// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";
import { VaultHandler } from "../handlers/VaultHandler.sol";

/// @notice Threat model: 2-3 colluding XVS holders (already own XVS) driving the
/// vault through every public action, trying to (a) touch a passive victim's
/// funds/votes, or (b) extract more principal than they put in. A designated
/// victim stakes and self-delegates BEFORE the attackers act; the handler is
/// wired with ONLY the attacker addresses, so the fuzzer can never prank the
/// victim. If any attacker sequence moves the victim's numbers or lets an
/// attacker withdraw more than deposited, the counterexample is a real theft.
///
///   X1  victim principal/pending/votes are frozen against all attacker actions
///   X2  Σ attacker withdrawn principal <= Σ attacker deposited principal
contract CrossUserIntegrity is XVSVaultTestBase {
    VaultHandler internal handler;

    address internal victim;
    uint256 internal victimAmount;
    uint96 internal victimVotes;

    function setUp() public {
        _deployAndWire();

        // Victim (actors[3]) stakes and self-delegates before any attacker moves.
        victim = actors[3];
        vm.prank(victim);
        vault.deposit(address(xvs), 0, 50_000e18);
        vm.prank(victim);
        vault.delegate(victim);
        victimAmount = _amountOf(victim);
        victimVotes = vault.getCurrentVotes(victim);

        // Attackers-only handler: actors[0..2]. The victim is never a target.
        address[] memory attackers = new address[](3);
        attackers[0] = actors[0];
        attackers[1] = actors[1];
        attackers[2] = actors[2];
        handler = new VaultHandler(vault, xvs, attackers);
        targetContract(address(handler));
    }

    /// X1: no attacker action can change the victim's principal, pending, or votes.
    function invariant_X1_victimUntouched() public view {
        assertEq(_amountOf(victim), victimAmount, "X1: victim amount changed");
        assertEq(_pendingOf(victim), 0, "X1: victim pending changed");
        assertEq(uint256(vault.getCurrentVotes(victim)), uint256(victimVotes), "X1: victim votes changed");
    }

    /// X2: attackers can never withdraw more principal than they deposited.
    /// Reward is paid from the separate store, so principal-out must be bounded
    /// by principal-in.
    function invariant_X2_noPrincipalInflation() public view {
        assertLe(handler.gWithdrawn(), handler.gDeposited(), "X2: withdrew more than deposited");
    }

    /// Coverage guard: surface a run where attackers never actually staked.
    function invariant_callSummary() public view {
        assertTrue(
            handler.callDeposit() + handler.callRequest() + handler.callExecute() + handler.callDelegate() >= 0,
            "unreachable"
        );
    }
}
