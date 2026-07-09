# XVSVault Fuzz / Invariant Suite (Foundry)

Adversarial invariant + fuzz testing for the BSC `XVSVault`, focused on the
manipulation surfaces flagged in the security review — above all **minting
voting power** (turning 300k staked XVS into >300k votes), plus solvency,
withdrawal-lock, and pending-withdrawal accounting.

This is a **Foundry layer bolted onto the Hardhat repo**. It does not touch the
Hardhat setup: sources are scoped to `test-fuzz/`, and build output goes to
`out-forge/` / `cache-forge/` (both gitignored).

## Layout

```
foundry.toml                 # scoped config; out-forge/cache-forge; remappings
lib/forge-std/               # vendored (gitignored)
test-fuzz/
  anchors/Anchor.sol         # 0.5.16 anchor: compiles XVSVaultScenario+XVSStore into artifacts
  mocks/MockBEP20.sol        # stake+reward token (voting power is amount-based)
  mocks/MockACM.sol          # always-allow ACM (only isAllowedToCall is used)
  interfaces/IXVSVault.sol    # 0.8 view of the 0.5.16 vault
  XVSVaultTestBase.sol       # deploy+wire (BSC pool 0: XVS/XVS, 7d lock, block-based) + aggregates
  handlers/VaultHandler.sol  # invariant driver (bounded random actions + adversarial ones)
  invariants/XVSVaultInvariants.t.sol
  invariants/CrossUserIntegrity.t.sol   # X1/X2: victim untouched, no principal inflation
  scenarios/VoteInflation.t.sol
  scenarios/DelegateBySig.t.sol         # X4/X5: sig replay / expiry / chainId / malleability
  scenarios/RewardIntegrity.t.sol       # X3/X6/X9: claim + vault-debt integrity
  scenarios/VoteOverflow.t.sol          # X7: uint96 vote-cap guards
  Smoke.t.sol
```

Why `deployCode`: forge-std requires solc ≥0.6, so test files are 0.8 while the
vault is 0.5.16. The 0.8 tests instantiate the 0.5.16 contracts via
`deployCode(...)` and interact through `IXVSVault`. The anchor forces the
0.5.16 graph to compile into named artifacts.

## Running

Use `--offline` (all solc versions are already installed; no network):

```bash
cd venus-protocol
forge test --offline -vv                              # everything
forge test --offline --match-path "test-fuzz/invariants/*"
forge test --offline --match-path "test-fuzz/scenarios/*"
FOUNDRY_PROFILE=deep forge test --offline --match-path "test-fuzz/invariants/*"  # 3000×200
```

## What it checks

Invariants (stateful, `XVSVaultInvariants.t.sol`) — hold after every handler call:

| Id  | Property                                                                    |
| --- | --------------------------------------------------------------------------- |
| I1  | solvency: `balanceOf(vault) >= Σ user.amount`                               |
| I2  | `totalPendingWithdrawals == Σ user.pendingWithdrawals`                      |
| I3  | `user.pendingWithdrawals <= user.amount`                                    |
| V1  | vote conservation: `Σ currentVotes == Σ (amount − pending)` over delegators |
| V4  | vote solvency: `Σ currentVotes <= balanceOf(vault) − totalPending`          |

Vote-inflation scenarios (`VoteInflation.t.sol`) — the delta/absolute seam:

| Id  | Attack                                                                          |
| --- | ------------------------------------------------------------------------------- |
| S1  | re-delegate after a partial withdrawal request (delta vs absolute)              |
| S2  | re-delegate to the same delegatee (must net zero)                               |
| S3  | deposits while undelegated grant 0 votes; one delegate == stake                 |
| S4  | same-block op storm (checkpoint overwrite must not sum)                         |
| S5  | historical `getPriorVotes` snapshot ≤ stake at that block (governance-relevant) |
| S6  | `executeWithdrawal` is vote-neutral (no re-burn / no re-add)                    |

The handler also includes adversarial actions: `donate` (raw transfer bypassing
`deposit`, probing the balance-based reward-supply path) and `warpRoll`
(advances blocks+time in lockstep, mirroring BSC ~3s blocks, and clears the
7-day lock so `executeWithdrawal` is reachable).

Adversarial-holder suite (threat model: 2-3 colluding accounts that already own
XVS, trying to steal others' funds or manipulate the system through the public
API only — admin/governance surfaces are out of scope):

Cross-user integrity (stateful, `invariants/CrossUserIntegrity.t.sol`) — a passive
victim stakes+self-delegates, then an attackers-only handler drives the vault:

| Id  | Property                                                                                          |
| --- | ------------------------------------------------------------------------------------------------- |
| X1  | victim's `amount` / `pendingWithdrawals` / `currentVotes` are frozen against all attacker actions |
| X2  | `Σ attacker withdrawn principal <= Σ attacker deposited principal`                                |

delegateBySig attacks (`scenarios/DelegateBySig.t.sol`) — a holder cannot move
another account's votes with a forged/stale signature:

| Id  | Attack                                                                       |
| --- | ---------------------------------------------------------------------------- |
| X4  | a used signature cannot be replayed (nonce consumed)                         |
| X5a | expired signature rejected (`signature expired`)                             |
| X5b | wrong-chainId signature cannot move the signer's votes                       |
| X5c | malleable high-s signature rejected by ECDSA (`invalid signature 's' value`) |

Reward-path attacks (`scenarios/RewardIntegrity.t.sol`) — rewards paid from the
separate store; a holder cannot mint, redirect, or double-collect:

| Id  | Attack                                                                            |
| --- | --------------------------------------------------------------------------------- |
| X3a | a second claim in the same block yields nothing (no double-collect)               |
| X3b | `claim(account)` credits that account, not the caller                             |
| X6  | underfunded-store debt (`pendingRewardTransfers`) repays exactly once, never more |
| X9  | a requested (pending) slice stops earning reward                                  |

Vote-cap overflow (`scenarios/VoteOverflow.t.sol`) — attackers minted XVS and may
hold balances near the uint96 vote cap:

| Id  | Attack                                                             |
| --- | ------------------------------------------------------------------ |
| X7a | a deposit `>= 2^96` reverts on the vote-move overflow guard        |
| X7b | accumulating sub-cap deposits to `>= 2^96` then delegating reverts |

## Status

All 28 tests pass (15 core + 13 adversarial-holder). No insolvency, vote
inflation, lock bypass, cross-user theft, reward mint/double-collect, signature
replay, or accounting drift found. Consistent with the manual audits: the
current 0.5.16 vault has no exploitable path for an XVS holder to manipulate XVS
or steal another user's funds.

## Extending

- **Multi-pool isolation (I7/V5):** add a second reward token + pool and assert
  reward accounting and votes stay pool-scoped (non-XVS pool grants 0 votes).
- **donate reward-share dilution (X8):** assert a raw donation only dilutes the
  reward rate and is never claimable as principal.
- **Planned withdraw-to-target upgrade:** when that impl exists, add a scenario
  asserting I1/I2/V1 still hold post-seizure (a blanket `transfer(target, balanceOf)`
  will break I1), and that only the Timelock can call it.
- **Fork mode:** an optional test using `vm.createSelectFork(vm.envString("ARCHIVE_NODE_bscmainnet"))`
  against the live impl `0x74c8…B378` for exact-bytecode fidelity.

```

```
