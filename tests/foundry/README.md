# Foundry

Foundry runs alongside Hardhat here, it does not replace it. `contracts/` is shared; the
TypeScript suite in `tests/hardhat` is untouched.

`yarn test`, `yarn compile` and `yarn clean` each run Hardhat first and then Foundry, so the
normal commands cover both toolchains. `yarn build` is Hardhat-only: it produces the published
package, and the Foundry output is not part of it.

Call `forge` directly to work on one suite:

```
forge test                      run the Foundry suite alone, 256 fuzz runs
FOUNDRY_PROFILE=ci   forge test the thorough budget CI uses, 5000 fuzz runs
forge build --sizes             contract sizes
forge inspect <C> storageLayout ad-hoc layout dump
```

The first run compiles the whole of `contracts/` and takes about half a minute; later runs are
incremental.

## Layout

Tests are grouped by the contract under test, matching venus-liquidity-hub:

```
tests/foundry/
  ProtocolBase.t.sol       the deployment every suite starts from
  mocks/                   shared doubles, usable from any suite
  Comptroller/
    Diamond.t.sol          routing through the facets
    Markets.t.sol          listing and risk parameters
  VToken/
    VTokenBase.t.sol       VToken-only helpers, plus the invariant handler
    MintRedeem.t.sol       supply and withdraw
    Invariants.t.sol       properties that survive any call sequence
```

Anything two directories both need lives at the root, in `ProtocolBase.t.sol` or `mocks/`. A suite
under `Comptroller/` never imports from `VToken/` and the reverse, so neither directory can be
broken by a fixture change made for the other. A directory that grows its own shared setup adds a
`<Subject>Base.t.sol` beside its suites, the way `VToken/` does.

`ProtocolBase` is `abstract` and does two things: `_deployComptroller()` assembles the diamond, and
`_deployMarket()` lists one real VBep20Immutable on it. Suites call whichever they need from
`setUp`.

`ProtocolBase` reads each facet's selectors from its interface artifact in `out/`, the same way
`tests/hardhat/Comptroller/Diamond/scripts/deploy.ts` reads them from the ABI, so the two fixtures
cannot drift apart and a function added to a facet interface needs no change here. This is why
`fs_permissions` grants read access to `./out`.

## What belongs where

Hardhat keeps the TypeScript suite, deployments (`deploy/`, `deployments/`, which the other Venus
repos consume as a published API), the zkSync build, docgen, coverage and the storage-layout gate.
None of that is worth moving, and some of it cannot move: `smock`, which most of the existing
tests are built on, is Hardhat-only.

Write a Foundry test when Hardhat cannot express it:

- **Stateful invariants.** No Hardhat equivalent exists.
- **In-EVM fuzzing.** Thousands of runs per property, versus `fast-check` driving transactions
  from Node.
- **Cheatcode-driven fork tests.** `vm.createFork`, `vm.store`, `vm.prank`, `vm.mockCall` against
  real mainnet state, in seconds rather than minutes.
- **Gas work.** `forge snapshot`, `--gas-report`, `--sizes`.

Everything else already has a home. A plain unit test that Hardhat handles fine should stay in
`tests/hardhat` next to its siblings. Existing tests are not being ported.

## The 0.5.16 boundary

`contracts/` spans two compiler eras, which is why `auto_detect_solc` is on. `forge build` covers
both, but a `^0.8` test file cannot import a `0.5.16` contract, so the Solidity-side reach of
Foundry stops at the 0.8.25 surface: Prime, the Comptroller diamond and its facets, PegStability,
VAI, VTokens (non-legacy), Swap, Liquidator, Lens, BStock, DelegateBorrowers.

Out of reach from a Foundry test, permanently: XVSVault, VAIVault, VRTVault, VRT, XVS/XVSVesting,
VTokens/legacy, the 0.5.16 InterestRateModels and most of `contracts/Utils`. Those stay with
Hardhat. A fork test can still _call_ them through an interface — it just cannot import the
source.

## Two traps worth knowing

The Comptroller follows the Compound convention of **returning an error code** instead of
reverting. `vm.expectRevert` will not catch a rejected `setCollateralFactor`; assert on the
returned `uint256` against `ComptrollerErrorReporter.Error` instead. Access-control failures do
revert.

`vm.prank` applies to **the next call made**, not the next line. `vToken.redeem(vToken.balanceOf(alice))`
spends the prank on `balanceOf` and runs `redeem` as the test contract. Read values into locals
first.

A third, milder one: a failing invariant is **persisted** under `cache-foundry/invariant/failures`
and replayed ahead of new runs. After relaxing or rewriting an assertion, delete that directory,
or the old counterexample keeps failing against the new code.

## Storage layout

`yarn check:storage-layout` stays the gate. It compares against the `storageLayout` that
hardhat-deploy records in `deployments/<network>/<Name>_Implementation.json`, which is a better
reference than anything Foundry can produce here — `forge inspect` only knows about today's
source. Use `forge inspect` to look at a layout, not to decide whether an upgrade is safe.

## Dependencies

Solidity dependencies come from npm. Foundry derives its remappings from `node_modules`, so
`@openzeppelin/`, `@venusprotocol/` and the rest resolve with no `remappings.txt` and stay pinned
to the versions in `package.json`. Run `yarn` before `forge`.

`forge-std` is the one exception, vendored as a git submodule at `lib/forge-std` because its npm
package is an abandoned third-party fork. Only the pinned commit is committed here, never its
files. Clone with `--recurse-submodules`, or run `git submodule update --init --recursive` in an
existing checkout.

`remappings.txt` holds a single line for `forge-std`. Foundry does not need it — it finds
forge-std through `libs` — but Solidity language servers do not read `foundry.toml`, and without
it they flag every `forge-std/` import as unresolved. Declaring one remapping does not switch
auto-detection off: the node_modules remappings are still merged on top, so nothing else belongs
in that file.

## Formatting

Solidity formatting is prettier's job, repo-wide, including `tests/foundry`. `forge fmt` is not
configured and should not be — two formatters over the same files will fight.
