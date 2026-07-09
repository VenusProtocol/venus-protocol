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

---

## L1 — Prime `xvsUpdated` hook is a hard, revert-propagating dependency of deposit & requestWithdrawal

- **Severity:** Low (Likelihood Low, Impact High-but-recoverable)
- **Location:** `contracts/XVSVault/XVSVault.sol:314-316` (deposit), `:517-519` (requestWithdrawal). Chain: `PrimeLeaderboard.sol:167` → `PrimeV2.sol:526/1157` → `accrueInterest` → `PrimeLiquidityProvider.accrueTokens` (`:317`).

**Description.** Pool 0 is the Prime pool, so `deposit` and `requestWithdrawal` call `primeToken.xvsUpdated(msg.sender)` as their final step, with no try/catch. If that call reverts, the whole vault operation reverts — including `requestWithdrawal`, meaning users cannot _begin_ unstaking. Revert triggers: (1) a Prime market whose underlying was never PLP-initialized (`_ensureTokenInitialized` reverts); (2) Prime market count exceeding `PrimeV2.maxLoopsLimit`; (3) Prime/PrimeLeaderboard upgraded to a reverting impl, or `primeToken` repointed to a hostile contract.

**Impact.** Temporary freeze of pool-0 `deposit` and `requestWithdrawal`. **No fund loss** — `claim()` and `executeWithdrawal()` do not call the hook, so already-requested withdrawals still execute; principal is never lost, only new unstake requests are blocked until governance fixes Prime.

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

**Recommendation.** No action required given current wiring. If tightening: restrict to a dedicated recovery role separate from `owner`, or route through the vault. Documented as the highest-value privileged sink touching the reward store.

---

## L3 — Governance vote weight snapshotted at `startBlock` (after `votingDelay`)

- **Severity:** Low (defense-in-depth)
- **Location:** `GovernorBravoDelegate.sol:509` (`getPriorVotes(voter, proposal.startBlock)`), `:264` (`startBlock = block.number + votingDelay`)

**Description.** Vote weight is read at `startBlock` = creation + `votingDelay`, a known future block, not at creation. Standard Compound Bravo behavior; a party can acquire/delegate voting power to be reflected at `startBlock` and vote.

**Impact / reachability.** Cannot pass a proposal — still needs `forVotes >= 1,500,000` (immutable) and `> againstVotes`. A 327k actor gains nothing beyond honest weight; "borrowing" to swing would need >1.17M delegated XVS (economic, not code) and is visible during the voting period where opposition can vote against. No code gate bypassed.

**Recommendation.** None required. For tighter front-run resistance, snapshot at `block.number - 1` (as the proposer-threshold check already does at `:238`).

---

## L4 — `castVoteBySig` ballot has no nonce or expiry

- **Severity:** Low (defense-in-depth)
- **Location:** `GovernorBravoDelegate.sol:485-494`

**Description.** The EIP-712 ballot is `Ballot(uint256 proposalId, uint8 support)` — no nonce, no expiry. A signature is valid forever for that `proposalId`.

**Impact / reachability.** Harmless in practice: `receipt.hasVoted` (`:508`) blocks double-counting, `proposalId` binds the ballot, and IDs are never reused (monotonic). A relayer can only submit the exact `(proposalId, support)` the signer already chose — cannot change support, double-count, or replay to another proposal. Worst case is timing of when an already-decided vote lands. Signature malleability is a non-issue for the same `hasVoted` reason.

**Recommendation.** Defense-in-depth: add `expiry` to the ballot and enforce canonical low-s / `v∈{27,28}`. Note `XVSVault.delegateBySig` already uses nonce+expiry; the governor ballot omits them (matching upstream Bravo).

---

## L5 — OmnichainGovernanceExecutor dedup guard is vacuous for proposal id 0

- **Severity:** Low (defense-in-depth / code robustness)
- **Location:** `governance-contracts/contracts/Cross-chain/OmnichainGovernanceExecutor.sol` — `_nonblockingLzReceive`, `:364` (`require(proposals[pId].id == 0)`), with `id: pId` (`:378`) and `proposals[pId] = newProposal` (`:389`).

**Description.** The replay guard infers "never received" from `proposals[pId].id == 0`. Because a stored proposal sets `id = pId`, for `pId == 0` the guard stays true forever — a second `pId == 0` message would overwrite the prior proposal, resetting `executed`/`canceled` and re-queueing it.

**Impact / reachability.** Not attacker-triggerable. The message must arrive over an authenticated LayerZero channel from the trusted `OmnichainProposalSender` (execute rights held only by the 3 timelocks), and Compound-style governance proposal IDs are 1-indexed, so `pId == 0` is never naturally produced. Exploitation would require a source already holding governance execute rights — i.e., the attacker already owns governance.

**Recommendation.** Track receipt with a dedicated `bool received` flag or `mapping(uint256 => bool)` rather than inferring from `.id`, or reject `pId == 0` explicitly.

---

## I1 — Donation of XVS to the vault dilutes rewards (no theft)

- **Location:** `XVSVault.sol:628-639` (`_updatePool`), `:589-597` (`pendingReward`)

Pool 0 stakes and rewards XVS, so anyone can `transfer` XVS directly to the vault, inflating `supply = balanceOf - totalPendingWithdrawals` and permanently slowing `accRewardPerShare` growth. Rewards come from the separate store, so donated tokens are never distributed. The donor gets nothing back and only dilutes everyone (including themselves). No profit path — not a vulnerability.

## I2 — `requestWithdrawal` calls `_transferReward` unconditionally

- **Location:** `XVSVault.sol:499-500` vs. guarded pattern in `deposit` (`:300`) and `claim` (`:337`)

`requestWithdrawal` always calls `_transferReward(..., pending)` even when `pending == 0`. Beneficial (opportunistically settles outstanding `pendingRewardTransfers` debt), idempotent, no double-pay. Code-quality inconsistency only.

---

## Load-bearing invariants — do not regress

- `pendingWithdrawalsBeforeUpgrade == 0` guard on deposit/claim/requestWithdrawal (`:296`, `:332`, `:496`) — prevents a mixed legacy/new request state that would permanently freeze a position.
- `setXvsStore` one-time init (`:877`) — the reward store cannot be repointed, even by admin.
- Immutable `quorumVotes = 1500000e18` constant (`GovernorBravoDelegate.sol:84`) — single value shared across all proposal routes; no reduced-quorum path.

## Follow-up verification (out-of-bundle)

- Confirm `AccessControlledV8._authorizeUpgrade` enforces owner/ACM for `OmnichainExecutorOwner` UUPS upgrades. (XVSVault storage layout already verified clean — append-only `__gap[46]`, deprecated slots preserved.)
