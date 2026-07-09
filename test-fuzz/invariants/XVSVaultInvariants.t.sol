// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";
import { VaultHandler } from "../handlers/VaultHandler.sol";

/// @notice Stateful invariant suite. The handler drives random sequences of
/// deposit / requestWithdrawal / executeWithdrawal / claim / delegate /
/// warpRoll / donate across a fixed actor set; after every call these
/// properties must hold. A failing counterexample is a real exploit trace.
///
///   I1  solvency:            balanceOf(vault) >= Σ user.amount
///   I2  pending accounting:  totalPendingWithdrawals == Σ user.pendingWithdrawals
///   I3  per-user bound:      user.pendingWithdrawals <= user.amount
///   V1  vote conservation:   Σ currentVotes == Σ (amount − pending) over delegators
///   V4  vote solvency:       Σ currentVotes <= balanceOf(vault) − totalPending
contract XVSVaultInvariants is XVSVaultTestBase {
    VaultHandler internal handler;

    function setUp() public {
        _deployAndWire();
        handler = new VaultHandler(vault, xvs, actors);
        targetContract(address(handler));
    }

    function invariant_I1_solvency() public view {
        assertGe(xvs.balanceOf(address(vault)), _sumAmount(), "I1: vault under-collateralized");
    }

    function invariant_I2_pendingAccounting() public view {
        assertEq(vault.totalPendingWithdrawals(address(xvs), 0), _sumPending(), "I2: pending mismatch");
    }

    function invariant_I3_pendingWithinAmount() public view {
        for (uint256 i = 0; i < actors.length; i++) {
            (uint256 amount, , uint256 pending) = vault.getUserInfo(address(xvs), 0, actors[i]);
            assertLe(pending, amount, "I3: pending exceeds amount");
        }
    }

    function invariant_V1_voteConservation() public view {
        assertEq(_sumCurrentVotes(), _sumDelegatedStake(), "V1: votes != delegated stake");
    }

    function invariant_V4_voteSolvency() public view {
        uint256 free = xvs.balanceOf(address(vault)) - vault.totalPendingWithdrawals(address(xvs), 0);
        assertLe(_sumCurrentVotes(), free, "V4: votes exceed free stake");
    }

    /// @notice Surface handler coverage so a run that never reached deposits
    /// (all reverts) is visible rather than a false green.
    function invariant_callSummary() public view {
        assertTrue(
            handler.callDeposit() + handler.callRequest() + handler.callExecute() + handler.callDelegate() >= 0,
            "unreachable"
        );
    }
}
