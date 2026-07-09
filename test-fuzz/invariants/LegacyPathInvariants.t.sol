// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";
import { LegacyVaultHandler } from "../handlers/LegacyVaultHandler.sol";

/// @notice Stateful invariants over the LEGACY withdrawal path — the
/// pre-upgrade (afterUpgrade=0) requests created via `requestOldWithdrawal`,
/// interleaved with normal deposits / new requests / delegation / executes.
/// This is the code path (beforeUpgrade branch of executeWithdrawal, plus the
/// legacy request that skips `totalPendingWithdrawals`) that no other suite
/// touches. If any sequence lets an attacker inflate votes past their live
/// stake, drain the store, or make the vault insolvent, the fuzzer surfaces it.
///
///   LG1  solvency:          balanceOf(vault) >= Σ user.amount
///   LG3  per-user bound:     user.pendingWithdrawals <= user.amount
///   LGV1 vote conservation:  Σ currentVotes == Σ (amount − pending) over delegators
///   LGV4 vote solvency:      Σ currentVotes <= Σ (amount − pending) [free stake]
///   LGR  reward emission cap: store payout <= rewardPerBlock * elapsedBlocks
///
/// Note: I2 (totalPendingWithdrawals == Σ user.pendingWithdrawals) is
/// intentionally NOT asserted — the legacy request path increments
/// user.pendingWithdrawals without touching totalPendingWithdrawals by design,
/// so the two legitimately diverge once a legacy request exists.
contract LegacyPathInvariants is XVSVaultTestBase {
    LegacyVaultHandler internal handler;
    uint256 internal startBlock;

    function setUp() public {
        _deployAndWire();
        startBlock = block.number;
        handler = new LegacyVaultHandler(vault, xvs, actors);
        targetContract(address(handler));
    }

    function invariant_LG1_solvency() public view {
        assertGe(xvs.balanceOf(address(vault)), _sumAmount(), "LG1: vault under-collateralized");
    }

    function invariant_LG3_pendingWithinAmount() public view {
        for (uint256 i = 0; i < actors.length; i++) {
            (uint256 amount, , uint256 pending) = vault.getUserInfo(address(xvs), 0, actors[i]);
            assertLe(pending, amount, "LG3: pending exceeds amount");
        }
    }

    function invariant_LGV1_voteConservation() public view {
        assertEq(_sumCurrentVotes(), _sumDelegatedStake(), "LGV1: votes != delegated live stake");
    }

    function invariant_LGV4_voteSolvency() public view {
        uint256 freeStake;
        for (uint256 i = 0; i < actors.length; i++) freeStake += _stakeOf(actors[i]);
        assertLe(_sumCurrentVotes(), freeStake, "LGV4: votes exceed free stake");
    }

    function invariant_LGR_emissionCap() public view {
        uint256 paidOut = STORE_FUNDING - xvs.balanceOf(address(store));
        uint256 maxEmitted = REWARD_PER_BLOCK * (block.number - startBlock);
        assertLe(paidOut, maxEmitted, "LGR: store paid out more than emission schedule");
    }

    function invariant_callSummary() public view {
        assertTrue(
            handler.callDeposit() +
                handler.callRequestNew() +
                handler.callRequestOld() +
                handler.callExecute() +
                handler.callDelegate() >=
                0,
            "unreachable"
        );
    }
}
