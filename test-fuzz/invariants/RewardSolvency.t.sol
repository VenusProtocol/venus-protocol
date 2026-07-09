// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.25;

import { XVSVaultTestBase } from "../XVSVaultTestBase.sol";
import { VaultHandler } from "../handlers/VaultHandler.sol";

/// @notice Reward-side invariants. Reuses the standard (well-funded store)
/// handler rig and adds two properties the vote/principal suite never touched:
///
///   R2  emission cap:      rewards paid out of the store can never exceed the
///                          schedule rewardPerBlock * elapsedBlocks. Since the
///                          store holds ONLY the reward token and only ever pays
///                          via safeRewardTransfer (principal always moves
///                          user<->vault, never through the store), the store's
///                          drop equals cumulative rewards paid. A bug in
///                          accRewardPerShare that over-mints trips this.
///   R1b noRewardUnderflow: pendingReward() must never revert for any actor.
///                          pendingReward mirrors the `.sub(user.rewardDebt)`
///                          used across deposit/claim/requestWithdrawal, so a
///                          reward-debt underflow (which would brick every user
///                          action -> funds locked) surfaces here first.
contract RewardSolvencyInvariants is XVSVaultTestBase {
    VaultHandler internal handler;
    uint256 internal startBlock;

    function setUp() public {
        _deployAndWire();
        startBlock = block.number;
        handler = new VaultHandler(vault, xvs, actors);
        targetContract(address(handler));
    }

    function invariant_R2_emissionCap() public view {
        uint256 paidOut = STORE_FUNDING - xvs.balanceOf(address(store));
        uint256 maxEmitted = REWARD_PER_BLOCK * (block.number - startBlock);
        assertLe(paidOut, maxEmitted, "R2: store paid out more than emission schedule");
    }

    function invariant_R1b_noRewardUnderflow() public view {
        for (uint256 i = 0; i < actors.length; i++) {
            // Reverts here (arithmetic underflow) == reward-debt corruption ==
            // deposit/claim/requestWithdrawal would revert too -> DoS.
            vault.pendingReward(address(xvs), 0, actors[i]);
        }
    }
}
