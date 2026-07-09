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
  scenarios/VoteInflation.t.sol
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

## Status

All 15 tests pass. No insolvency, vote inflation, lock bypass, or accounting
drift found. Consistent with the two manual audits: the current 0.5.16 vault
has no exploitable path to manipulate XVS.

## Extending

- **delegateBySig replay (I11):** add an ECDSA-signing scenario (nonce/expiry/chainId).
- **Reward-drain (I8):** add a ghost `accrued` tally and assert `Σ claimed <= accrued`.
- **Planned withdraw-to-target upgrade:** when that impl exists, add a scenario
  asserting I1/I2/V1 still hold post-seizure (a blanket `transfer(target, balanceOf)`
  will break I1), and that only the Timelock can call it.
- **Fork mode:** an optional test using `vm.createSelectFork(vm.envString("ARCHIVE_NODE_bscmainnet"))`
  against the live impl `0x74c8…B378` for exact-bytecode fidelity.

```

```
