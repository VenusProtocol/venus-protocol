# XVS Vault & Governance — Findings Report

**Date:** 2026-07-09
**Scope:** deployed bscmainnet XVSVault (proxy `0x051100480289e704d20e9DB4804837068f3f9204`, impl `0x74c8a97BE672db3e9a224648bE566AdA5F43B378`, solc 0.5.16), XVSStore, XVSVaultProxy, GovernorBravoDelegate, Timelock, OmnichainGovernanceExecutor, ACM.
**Method:** 2 manual audits, invariant + legacy-path fuzzing (600k calls/invariant), hack PoCs (local + live-fork bytecode), and 5 agent audits (core logic, integration, governance lifecycle, economics, cross-chain periphery).

## Summary

| ID  | Severity | Title                                                       | Attacker-reachable                            |
| --- | -------- | ----------------------------------------------------------- | --------------------------------------------- |
| L1  | Low      | Prime hook can freeze deposits / withdrawal-requests        | No — governance misconfig / bad Prime upgrade |
| L2  | Low      | `emergencyRewardWithdraw` bypasses allowlist & cap          | No — requires Timelock `setNewOwner`          |
| L3  | Low      | Vote snapshot taken at `startBlock` (post-delay)            | No — still bounded by 1.5M quorum             |
| L4  | Low      | `castVoteBySig` ballot has no nonce/expiry                  | No — bounded by `hasVoted`                    |
| L5  | Low      | Cross-chain dedup guard vacuous for proposal id 0           | No — trusted-remote + 3-timelock gated        |
| I1  | Info     | Donation to vault dilutes rewards (no theft)                | n/a                                           |
| I2  | Info     | `requestWithdrawal` calls `_transferReward` unconditionally | n/a                                           |

**No Critical / High / Medium findings.** No unprivileged attacker path to steal, drain, inflate, or freeze-with-loss.

### Proof-of-concept index

Every finding has a PoC. Vault-scope PoCs are runnable in this repo; governance-contracts-scope PoCs (L4, L5) are documented in the Appendix (they require the Governor/executor + LayerZero harness that lives in the `governance-contracts` repo).

| ID  | PoC                                                                 | Where                                                          |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| L1  | `test_L1_revertingPrimeFreezesDepositAndRequest_notExecuteOrClaim`  | `test-fuzz/audits/pocs/AuditFindingsPoC.t.sol` (local)         |
| L2  | `test_L2_emergencyWithdrawDrainsAnyTokenNoAllowlistNoCap`           | `test-fuzz/audits/pocs/AuditFindingsPoC.t.sol` (local)         |
| L3  | `test_L3_priorVotesCountsDelegationMadeAfterCreationBeforeSnapshot` | `test-fuzz/audits/pocs/AuditFindingsForkPoC.t.sol` (live fork) |
| L4  | documented PoC                                                      | Appendix A                                                     |
| L5  | documented PoC                                                      | Appendix B                                                     |
| I1  | `test_I1_donationDilutesRewardsNoTheft`                             | `test-fuzz/audits/pocs/AuditFindingsPoC.t.sol` (local)         |
| I2  | `test_I2_requestWithdrawalWithZeroPendingIsSafe`                    | `test-fuzz/audits/pocs/AuditFindingsPoC.t.sol` (local)         |

Run: `forge test --offline --match-path "test-fuzz/audits/pocs/*"` (the fork PoC skips unless `ARCHIVE_NODE_bscmainnet` is set).

---

## L1 — Prime `xvsUpdated` hook is a hard, revert-propagating dependency of deposit & requestWithdrawal

- **Severity:** Low (Likelihood Low, Impact High-but-recoverable)
- **Location:** `contracts/XVSVault/XVSVault.sol:314-316` (deposit), `:517-519` (requestWithdrawal). Chain: `PrimeLeaderboard.sol:167` → `PrimeV2.sol:526/1157` → `accrueInterest` → `PrimeLiquidityProvider.accrueTokens` (`:317`).

**Description.** Pool 0 is the Prime pool, so `deposit` and `requestWithdrawal` call `primeToken.xvsUpdated(msg.sender)` as their final step, with no try/catch. If that call reverts, the whole vault operation reverts — including `requestWithdrawal`, meaning users cannot _begin_ unstaking. Revert triggers: (1) a Prime market whose underlying was never PLP-initialized (`_ensureTokenInitialized` reverts); (2) Prime market count exceeding `PrimeV2.maxLoopsLimit`; (3) Prime/PrimeLeaderboard upgraded to a reverting impl, or `primeToken` repointed to a hostile contract.

**Impact.** Temporary freeze of pool-0 `deposit` and `requestWithdrawal`. **No fund loss** — `claim()` and `executeWithdrawal()` do not call the hook, so already-requested withdrawals still execute; principal is never lost, only new unstake requests are blocked until governance fixes Prime.

**PoC.** `test_L1_revertingPrimeFreezesDepositAndRequest_notExecuteOrClaim` (`test-fuzz/audits/pocs/AuditFindingsPoC.t.sol`). Wires pool 0 to a `MockRevertingPrime` (stands in for a broken/paused/mis-upgraded Prime), then asserts `deposit` and `requestWithdrawal` both revert `"prime down"`, while an in-flight `executeWithdrawal` and a `claim` still succeed — pinning both the freeze and the no-loss boundary.

**Reachability.** Not attacker-triggerable. `addMarket` self-bounds market count to `maxLoopsLimit`; both live Prime markets (vUSDT, vBTCB) are PLP-initialized. Trigger (1) requires a governance ordering mistake (add market before PLP init); (2)/(3) require ACM/Timelock/proxy-admin action.

**Recommendation.** Call the hook defensively so Prime problems can never brick vault liveness (the hook is a best-effort score update, not vault-critical):

```solidity
// instead of: primeToken.xvsUpdated(msg.sender);
(bool ok, ) = address(primeToken).call(
    abi.encodeWithSelector(IPrimeV5.xvsUpdated.selector, msg.sender)
);
// optionally emit on !ok; do not revert
```

Add a fork test that lists a Prime market with an uninitialized PLP token, then calls `requestWithdrawal`, to demonstrate and regress the coupling. As a minimum non-code control, add "PLP-init before addMarket" to the market-listing VIP checklist.

---

## L2 — `XVSStore.emergencyRewardWithdraw` bypasses the reward-token allowlist and balance cap

- **Severity:** Low (centralization)
- **Location:** `contracts/XVSVault/XVSStore.sol:124-126`

**Description.** `emergencyRewardWithdraw(token, amount)` is `onlyOwner` and does an unconditional `safeTransfer` with no `rewardTokens[token]` allowlist check and no balance clamp — unlike `safeRewardTransfer` (`:57-68`). It can sweep any token, any amount, from the store.

**Impact / reachability.** Store owner is the vault (`0x0511…9204`), and the vault exposes no function that calls `emergencyRewardWithdraw`, so it is currently unreachable. Reaching it requires the Timelock to call `setNewOwner` (`:102`, `onlyAdmin`) and repoint the owner to a malicious address — pure centralization, same trust root that could swap the implementation.

**PoC.** `test_L2_emergencyWithdrawDrainsAnyTokenNoAllowlistNoCap` (`test-fuzz/audits/pocs/AuditFindingsPoC.t.sol`). Repoints the store owner to an attacker (the centralization step), then drains both a **non-allowlisted** token (which `safeRewardTransfer` would reject) and the entire XVS reserve with no cap — demonstrating the missing allowlist and cap checks.

**Recommendation.** No action required given current wiring. If tightening: restrict to a dedicated recovery role separate from `owner`, or route through the vault. Documented as the highest-value privileged sink touching the reward store.

---

## L3 — Governance vote weight snapshotted at `startBlock` (after `votingDelay`)

- **Severity:** Low (defense-in-depth)
- **Location:** `GovernorBravoDelegate.sol:509` (`getPriorVotes(voter, proposal.startBlock)`), `:264` (`startBlock = block.number + votingDelay`)

**Description.** Vote weight is read at `startBlock` = creation + `votingDelay`, a known future block, not at creation. Standard Compound Bravo behavior; a party can acquire/delegate voting power to be reflected at `startBlock` and vote.

**Impact / reachability.** Cannot pass a proposal — still needs `forVotes >= 1,500,000` (immutable) and `> againstVotes`. A 327k actor gains nothing beyond honest weight; "borrowing" to swing would need >1.17M delegated XVS (economic, not code) and is visible during the voting period where opposition can vote against. No code gate bypassed.

**PoC.** `test_L3_priorVotesCountsDelegationMadeAfterCreationBeforeSnapshot` (`test-fuzz/audits/pocs/AuditFindingsForkPoC.t.sol`, runs against **live** bscmainnet bytecode). Demonstrates at the exact primitive the Governor reads: a delegation made _after_ a proposal's creation block but _before_ its `startBlock` is counted by `getPriorVotes(actor, snapshot)`, whereas a creation-block snapshot would return 0. Confirms the front-run window; the 1.5M quorum still bounds impact.

**Recommendation.** None required. For tighter front-run resistance, snapshot at `block.number - 1` (as the proposer-threshold check already does at `:238`).

---

## L4 — `castVoteBySig` ballot has no nonce or expiry

- **Severity:** Low (defense-in-depth)
- **Location:** `GovernorBravoDelegate.sol:485-494`

**Description.** The EIP-712 ballot is `Ballot(uint256 proposalId, uint8 support)` — no nonce, no expiry. A signature is valid forever for that `proposalId`.

**Impact / reachability.** Harmless in practice: `receipt.hasVoted` (`:508`) blocks double-counting, `proposalId` binds the ballot, and IDs are never reused (monotonic). A relayer can only submit the exact `(proposalId, support)` the signer already chose — cannot change support, double-count, or replay to another proposal. Worst case is timing of when an already-decided vote lands. Signature malleability is a non-issue for the same `hasVoted` reason.

**PoC.** Documented in **Appendix A** (Foundry test for the `governance-contracts` repo — needs a deployed GovernorBravo + XVSVault vote source, so it does not run in this repo's vault rig).

**Recommendation.** Defense-in-depth: add `expiry` to the ballot and enforce canonical low-s / `v∈{27,28}`. Note `XVSVault.delegateBySig` already uses nonce+expiry; the governor ballot omits them (matching upstream Bravo).

---

## L5 — OmnichainGovernanceExecutor dedup guard is vacuous for proposal id 0

- **Severity:** Low (defense-in-depth / code robustness)
- **Location:** `governance-contracts/contracts/Cross-chain/OmnichainGovernanceExecutor.sol` — `_nonblockingLzReceive`, `:364` (`require(proposals[pId].id == 0)`), with `id: pId` (`:378`) and `proposals[pId] = newProposal` (`:389`).

**Description.** The replay guard infers "never received" from `proposals[pId].id == 0`. Because a stored proposal sets `id = pId`, for `pId == 0` the guard stays true forever — a second `pId == 0` message would overwrite the prior proposal, resetting `executed`/`canceled` and re-queueing it.

**Impact / reachability.** Not attacker-triggerable. The message must arrive over an authenticated LayerZero channel from the trusted `OmnichainProposalSender` (execute rights held only by the 3 timelocks), and Compound-style governance proposal IDs are 1-indexed, so `pId == 0` is never naturally produced. Exploitation would require a source already holding governance execute rights — i.e., the attacker already owns governance.

**PoC.** Documented in **Appendix B** (Foundry test for the `governance-contracts` repo — needs the executor + a mock LayerZero endpoint, so it does not run in this repo's vault rig).

**Recommendation.** Track receipt with a dedicated `bool received` flag or `mapping(uint256 => bool)` rather than inferring from `.id`, or reject `pId == 0` explicitly.

---

## I1 — Donation of XVS to the vault dilutes rewards (no theft)

- **Location:** `XVSVault.sol:628-639` (`_updatePool`), `:589-597` (`pendingReward`)

Pool 0 stakes and rewards XVS, so anyone can `transfer` XVS directly to the vault, inflating `supply = balanceOf - totalPendingWithdrawals`. Because both `pendingReward` and `_updatePool` read the live `balanceOf`, a donation dilutes the **uncommitted** accrual window — a staker's pending reward drops the instant a donation lands (until the next `_updatePool` commit, which also reads the inflated balance). Rewards come from the separate store, so donated tokens are never distributed and undistributed emissions stay in the store. The donor is credited no stake and gets nothing back; at most this is a griefing nudge (attacker pays to shave others' pending), never theft.

**PoC.** `test_I1_donationDilutesRewardsNoTheft` (`test-fuzz/audits/pocs/AuditFindingsPoC.t.sol`). Accrues a window, donates 100k XVS, and asserts (a) the donor's `user.amount` is unchanged and the donor is debited, and (b) the staker's `pendingReward` strictly decreases after the donation.

## I2 — `requestWithdrawal` calls `_transferReward` unconditionally

- **Location:** `XVSVault.sol:499-500` vs. guarded pattern in `deposit` (`:300`) and `claim` (`:337`)

`requestWithdrawal` always calls `_transferReward(..., pending)` even when `pending == 0`. Beneficial (opportunistically settles outstanding `pendingRewardTransfers` debt), idempotent, no double-pay. Code-quality inconsistency only.

**PoC.** `test_I2_requestWithdrawalWithZeroPendingIsSafe` (`test-fuzz/audits/pocs/AuditFindingsPoC.t.sol`). Requests a withdrawal in the same block as the deposit (zero pending) and asserts it neither reverts nor pays any phantom reward.

---

## Load-bearing invariants — do not regress

- `pendingWithdrawalsBeforeUpgrade == 0` guard on deposit/claim/requestWithdrawal (`:296`, `:332`, `:496`) — prevents a mixed legacy/new request state that would permanently freeze a position.
- `setXvsStore` one-time init (`:877`) — the reward store cannot be repointed, even by admin.
- Immutable `quorumVotes = 1500000e18` constant (`GovernorBravoDelegate.sol:84`) — single value shared across all proposal routes; no reduced-quorum path.

## Follow-up verification (out-of-bundle)

- Confirm `AccessControlledV8._authorizeUpgrade` enforces owner/ACM for `OmnichainExecutorOwner` UUPS upgrades. (XVSVault storage layout already verified clean — append-only `__gap[46]`, deprecated slots preserved.)

---

## Appendix A — L4 PoC (`castVoteBySig` replayability)

Belongs in the `governance-contracts` repo (needs a deployed GovernorBravo + an XVSVault vote source). It demonstrates that a signed ballot has no nonce/expiry: the same `(v,r,s)` a signer produced can be relayed by anyone, at any time within the voting window, and — because there is no expiry — it never goes stale. The `hasVoted` guard is what bounds the impact (no double-count, no support change), so the assertion set proves both the missing protections and the containment.

```solidity
// GovernorBravo already deployed + configured; `signer` holds voting power at startBlock.
function test_L4_ballotHasNoNonceOrExpiry() public {
  uint256 pid = _createActiveProposal(); // reach Active state
  bytes32 domain = keccak256(
    abi.encode(governor.DOMAIN_TYPEHASH(), keccak256(bytes("Venus Governor Bravo")), block.chainid, address(governor))
  );
  // NOTE: Ballot has ONLY (proposalId, support) — no nonce, no expiry field exists.
  bytes32 structHash = keccak256(abi.encode(governor.BALLOT_TYPEHASH(), pid, uint8(1)));
  bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
  (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);

  // Anyone can relay it; there is no expiry to enforce and no nonce to consume.
  vm.warp(block.timestamp + 365 days); // arbitrarily late — still valid
  governor.castVoteBySig(pid, 1, v, r, s);
  assertTrue(_hasVoted(pid, signer), "L4: signed ballot accepted with no nonce/expiry");

  // Containment: a replay of the SAME signature is rejected by hasVoted (not by a nonce).
  vm.expectRevert(bytes("GovernorBravo::castVoteInternal: voter already voted"));
  governor.castVoteBySig(pid, 1, v, r, s);
}
```

**Fix regressed by:** adding `expiry` to the `Ballot` struct + typehash and asserting a past-expiry signature reverts.

## Appendix B — L5 PoC (`pId == 0` dedup bypass on OmnichainGovernanceExecutor)

Belongs in the `governance-contracts` repo (needs the executor + a mock LayerZero endpoint). It shows that two trusted-remote messages carrying `pId == 0` both pass the `require(proposals[pId].id == 0)` guard — the second overwrites the first, resetting `executed`/`canceled` and re-queueing. Not reachable in production (proposal IDs are 1-indexed and the channel is trusted-remote from the 3 timelocks), so this is a robustness/hardening PoC.

```solidity
// Executor deployed with a MockLZEndpoint set as the trusted remote/source.
function test_L5_pIdZeroDedupIsVacuous() public {
  bytes memory payload0 = _encodeProposal(/*pId=*/ 0, targets, values, sigs, calldatas, /*route=*/ 0);

  // First delivery of pId==0: stored, guard was proposals[0].id == 0 (true).
  _deliverLzMessage(payload0);
  (, , bool executed0, bool canceled0) = executor.proposals(0);

  // Cancel it (guardian) so state is terminal.
  vm.prank(guardian);
  executor.cancel(0);
  (, , , bool canceledAfter) = executor.proposals(0);
  assertTrue(canceledAfter, "L5: setup — proposal 0 canceled");

  // FINDING: because proposals[0].id was set to 0 (== pId), the guard is STILL
  // true, so a second pId==0 message is accepted and OVERWRITES the canceled one,
  // resetting canceled=false and re-queueing.
  _deliverLzMessage(payload0);
  (, , , bool canceledReplayed) = executor.proposals(0);
  assertFalse(canceledReplayed, "L5: pId==0 message overwrote a terminal proposal");
}
```

**Fix regressed by:** switching the guard to a dedicated `mapping(uint256 => bool) received` (or rejecting `pId == 0`), then asserting the second delivery reverts.
