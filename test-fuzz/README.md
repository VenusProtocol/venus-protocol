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
  invariants/RewardSolvency.t.sol       # reward emission cap + no reward-debt underflow
  scenarios/VoteInflation.t.sol
  scenarios/DelegateBySig.t.sol         # I11/X4/X5: relayed-once, replay, expiry, chainId, malleability, victim-forge
  scenarios/RewardIntegrity.t.sol       # X3/X6/X9: claim + vault-debt integrity
  scenarios/RewardDebt.t.sol            # reward-debt integrity across withdrawal lifecycle
  scenarios/StoreShortfall.t.sol        # under-funded store -> pendingRewardTransfers debt path
  scenarios/MultiPool.t.sol             # second pool: vote + reward isolation
  scenarios/VoteOverflow.t.sol          # X7: uint96 vote-cap guards
  scenarios/Solc0516Hacks.t.sol         # H1-H5: PoC attempts of the canonical pre-0.8 hack classes (all blocked)
  fork/ForkLiveHacks.t.sol              # H1-H5 replayed against the LIVE bscmainnet vault bytecode
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
forge test --offline --match-contract ForkLiveHacksTest  # fork; needs ARCHIVE_NODE_bscmainnet in .env
```

The fork suite (`fork/ForkLiveHacks.t.sol`) runs the H1-H5 hack PoCs against the
**live** bscmainnet vault (proxy `0x0511…9204`, impl `0x74c8…B378`, real XVS +
store) instead of a local copy. It funds attacker wallets via `deal` and skips
automatically when `ARCHIVE_NODE_bscmainnet` is unset. Note: live pool 0 is the
Prime pool, so `deposit`/`requestWithdrawal` call `primeToken.xvsUpdated()`,
which reverts on a fork — the suite `vm.mockCall`s that hook to a no-op to
isolate the vault's own logic (Prime's safety is out of scope here).

## What it checks

Invariants (stateful, `XVSVaultInvariants.t.sol`) — hold after every handler call:

| Id  | Property                                                                    |
| --- | --------------------------------------------------------------------------- |
| I1  | solvency: `balanceOf(vault) >= Σ user.amount`                               |
| I2  | `totalPendingWithdrawals == Σ user.pendingWithdrawals`                      |
| I3  | `user.pendingWithdrawals <= user.amount`                                    |
| V1  | vote conservation: `Σ currentVotes == Σ (amount − pending)` over delegators |
| V4  | vote solvency: `Σ currentVotes <= balanceOf(vault) − totalPending`          |
| R2  | emission cap: store payout `<= rewardPerBlock * elapsedBlocks`              |
| R1b | `pendingReward` never reverts (no reward-debt underflow -> no user DoS)     |

Vote-inflation scenarios (`VoteInflation.t.sol`) — the delta/absolute seam:

| Id  | Attack                                                                          |
| --- | ------------------------------------------------------------------------------- |
| S1  | re-delegate after a partial withdrawal request (delta vs absolute)              |
| S2  | re-delegate to the same delegatee (must net zero)                               |
| S3  | deposits while undelegated grant 0 votes; one delegate == stake                 |
| S4  | same-block op storm (checkpoint overwrite must not sum)                         |
| S5  | historical `getPriorVotes` snapshot ≤ stake at that block (governance-relevant) |
| S6  | `executeWithdrawal` is vote-neutral (no re-burn / no re-add)                    |

Reward + config scenarios:

| Id    | File                   | Property                                                                      |
| ----- | ---------------------- | ----------------------------------------------------------------------------- |
| R1a–c | `RewardDebt.t.sol`     | reward-debt stays consistent through request/execute/claim (no underflow DoS) |
| P1    | `StoreShortfall.t.sol` | under-funded store books debt == owed−paid, repaid once in full on refill     |
| M1    | `MultiPool.t.sol`      | rewards isolated per pool (no cross-pool drain)                               |
| M2    | `MultiPool.t.sol`      | only the XVS-staked pool grants votes; a second pool is not a vote backdoor   |

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

| Id   | Attack                                                                       |
| ---- | ---------------------------------------------------------------------------- |
| I11a | a valid signature can be relayed by a third party, exactly once              |
| X4   | a used signature cannot be replayed (nonce consumed)                         |
| X5a  | expired signature rejected (`signature expired`)                             |
| X5b  | wrong-chainId signature cannot move the signer's votes                       |
| X5c  | malleable high-s signature rejected by ECDSA (`invalid signature 's' value`) |
| I11d | a forged payload only ever affects the signer, never a victim                |

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

Solidity-0.5.x hack PoCs (`scenarios/Solc0516Hacks.t.sol`) — each _performs_ a
canonical pre-0.8 attack and asserts it is blocked (a failed exploit is the
proof the mitigation holds). All blocked; no valid hack found.

| Id  | Pre-0.8 hack class         | Attack performed                                                 | Guard                                                             |
| --- | -------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| H1  | integer underflow          | withdraw `stake + 1` (pre-0.8 wraps `amount` to ~2^256)          | amount guard reverts; stake intact                                |
| H2  | reward-debt wrap → mint    | churn deposit/request/execute to wrap `.sub` and drain the store | SafeMath reverts; store never over-drained                        |
| H3  | signature malleability     | replay the malleable twin `(v'=28, s'=n−s)` of a used delegation | OZ ECDSA rejects high-s                                           |
| H4  | `ecrecover(0)` forge       | fabricated low-s sig to empower a chosen delegatee               | recovers an uncontrollable stakeless phantom; target gets 0 votes |
| H5  | Compound/Venus double-vote | withdraw + move XVS to a 2nd wallet to vote the same coins twice | votes burned at request; total == staked, not 2×                  |

## Status

All tests pass. No insolvency, vote inflation, lock bypass, cross-user theft,
reward-debt underflow, reward mint/double-collect, store-debt double-pay,
cross-pool leak, signature replay, or accounting drift found. Consistent with
the manual audits: the current 0.5.16 vault has no exploitable path for an XVS
holder to manipulate XVS or steal another user's funds.

## Extending

- **donate reward-share dilution (X8):** assert a raw donation only dilutes the
  reward rate and is never claimable as principal.
- **Reward-drain ghost (I8):** add a running `accrued` tally in the handler and
  assert `Σ claimed <= accrued` (R2 already bounds store payout by the schedule).
- **Planned withdraw-to-target upgrade:** when that impl exists, add a scenario
  asserting I1/I2/V1 still hold post-seizure (a blanket `transfer(target, balanceOf)`
  will break I1), and that only the Timelock can call it.
- **Fork mode:** an optional test using `vm.createSelectFork(vm.envString("ARCHIVE_NODE_bscmainnet"))`
  against the live impl `0x74c8…B378` for exact-bytecode fidelity.

```

```
