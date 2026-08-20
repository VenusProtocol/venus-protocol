# bStock Liquidation Scripts

Operator runbook for liquidating bStock (tokenized-stock) collateral. Three entrypoints, one shared goal:
repay a borrower's debt, seize their bStock, and offload it.

Two pools are served: **Venus Core**, and a **hub-funded spoke pool** (an isolated-pools comptroller with a
USDT debt leg and bStock collateral). You do not select the pool — both scripts derive it from `VBSTOCK`, the
same way the contract does, and print it as `pool: CORE` or `pool: ISOLATED` on the first line of output.
Read that line before anything else: it determines which pre-checks ran and which batch shape you get.

| Script            | Path                  | What it does                                                                                                                                                                                                                                        | Chain writes?    |
| ----------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Atomic**        | `atomic-liquidate.ts` | Primary path. Drives the on-chain `BStockLiquidator` — repay, seize, redeem, and sell bStock in ONE tx via a Native or Liquid Mesh RFQ quote (+ optional AMM hop).                                                                                  | Yes              |
| **Safe fallback** | `safe-fallback.ts`    | Backstop when the quote path is unavailable — every hop-1 RFQ source (Native and Liquid Mesh) down, or for VAI the hop-2 PSM paused / cap-exhausted. Emits a Safe{Wallet} batch JSON; signers repay from Safe funds and ship raw bStock to Binance. | No — writes JSON |
| **Native smoke**  | `native-smoke.ts`     | Pre-flight check. Fetches a live Native firm-quote (price, TTL, executable router). No chain interaction.                                                                                                                                           | No               |
| **LM smoke**      | `lm-smoke.ts`         | Pre-flight check. Fetches a live Liquid Mesh `/quote` (price, output, route split). Read-only — no `/swap`; only a best-effort `symbol()` read for the label.                                                                                       | No               |

Pick **Atomic** first. Fall back to **Safe** only if the whole quote path fails — all RFQ sources down, or (for VAI) the PSM hop paused/capped.

## Which script? — start here

![bStock liquidation decision flowchart: native-smoke and lm-smoke check which RFQ sources are live, then atomic-liquidate.ts (DRY_RUN) runs pre-flight gates (debt-type detection, shortfall/ALLOW_NO_SHORTFALL, VAI-forces-inventory) and routes hop-2 by debt type — single-hop USDT, AMM for other ERC20, WBNB unwrap for native BNB, or the PSM swapStableForVAI for VAI — sending atomically when the dry-run passes, and falling back to the Safe multisig batch (which ships bStock to the CEX, PSM-independent) when the RFQ path is dead, the VAI PSM is paused or cap-exhausted, or the dry-run fails](liquidation-flowchart.svg)

Rules of thumb:

- **Always start with the smoke test** — it is read-only and tells you which branch you are on.
- **Never send without a passing dry-run** (`DRY_RUN=1` `callStatic`s the exact settle).
- **Atomic beats Safe whenever any RFQ source answers**: atomic is one tx at a firm price now; the
  Safe path needs signer quorum and holds raw bStock (price risk) until finance offloads it on the CEX.
- **Don't debug mid-incident.** If the atomic dry-run keeps reverting and the cause isn't obvious in
  minutes, switch to the Safe fallback instead of burning the liquidation window.
- `verify-lm-fork.ts` is a **dev-time** fork check (proves LM calldata executes) — never part of an incident.

---

## Which pool am I in?

|                        | Core                                                                      | Isolated / spoke                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| How it is decided      | `vBStock.comptroller()` equals the liquidator's `comptroller()` immutable | it does not, and the pool is on `isAllowedComptroller`                                                                                    |
| Repay path             | through the pool-wide Venus Liquidator gate                               | straight to the debt market (`vDebt.liquidateBorrow`)                                                                                     |
| What shrinks the seize | gate treasury cut on the bonus, then Core's redeem `treasuryPercent`      | the collateral market's `protocolSeizeShareMantissa`, sent to the PSR (~4.55% at the 5e16 default over a 1.1e18 incentive). No redeem fee |
| Debt shapes            | ERC20, native BNB (vBNB), VAI                                             | ERC20 only. No native market, no VAIController                                                                                            |
| `MODE=flash`           | flash-borrows `vDebt` itself (vWBNB for BNB)                              | flash-borrows from **Core** via `coreFlashSource[debtToken]` — isolated pools have no flash lender of their own                           |

**Not served in either pool:** positions at or below the pool's `minLiquidatableCollateral`. Those are
refused by `preLiquidateHook` and can only be cleared by the comptroller's own `liquidateAccount` /
`healAccount`, which are multi-market, all-borrows-at-once entry points this single-market tool cannot drive.
`atomic-liquidate.ts` detects the case and aborts naming it, rather than burning a quote.

## Prerequisites

- **Native API key** (`NATIVE_API_KEY`) for anything that fetches a Native quote. Never commit it.
- **Liquid Mesh credentials** (only if `SOURCE=liquidmesh` or `SOURCE=auto`): `LM_API_KEY` and the
  Ed25519 private-key seed `LM_PRIVATE_KEY_SEED` (base64url). Never commit them.
- These three keys can live in `.env` (git-ignored, loaded automatically by `hardhat.config.ts` when you
  run through `npx hardhat`); see `.env.example`. Everything else below is a per-run flag passed inline.
- **Deployed `BStockLiquidator`** (see `deploy/019-deploy-bstock-liquidator.ts`). Its owner must have run:
  - `setRouter(router, true)` for every router the swap will touch (the Native RFQ router and/or the
    Liquid Mesh router, plus the AMM router for non-USDT debt). The scripts **abort** if a router isn't
    allowlisted.
  - `setRouterSpender(LM_ROUTER, LM_SPENDER)` **if using Liquid Mesh** — it pulls the input token through a
    separate spender contract, distinct from the call target. Without it the swap reverts `SwapFailed`.
    (Native needs no spender entry — its call target is the puller.)
    **Order is enforced on-chain**: the router must already be allowlisted (`setRouter` first) or the call
    reverts `RouterNotAllowed`, and a non-zero spender must be a deployed contract (`SpenderNotContract`).
    Note `setRouter(router, false)` also clears the router's spender — re-allowlisting later means running
    `setRouterSpender` again.
  - `setOperator(caller, true)` for the account that submits `liquidate` / `flashLiquidate`.
- **Funding** for `MODE=inventory`: the liquidator must hold ≥ `REPAY_AMOUNT` of the debt asset.
  `MODE=flash` borrows instead (no pre-funding).

### Extra prerequisites for the spoke pool

These are one-time setup, not per-incident. Check them during readiness, not while a position is underwater.

- `setAllowedComptroller(spokeComptroller, true)` on the liquidator (owner Safe). **Until this is set the
  spoke branch does not exist** — the upgraded contract behaves exactly like the Core-only version, which is
  deliberate: it makes the upgrade safe to ship before the pool is deployed. The script aborts naming the
  missing call.
- `setCoreFlashSource(USDT, <core vUSDT>)` on the liquidator (owner Safe), **only if you want `MODE=flash`**.
  The Core flash loan is not tied to the liquidation target, so a spoke USDT debt is funded from the Core
  USDT market and repaid in the same tx. Unset means `MODE=flash` aborts; `MODE=inventory` is unaffected.
- **If the pool's liquidation allowlist is on**, the address that must be on it is the one that RECEIVES the
  collateral — the **BStockLiquidator contract** for the atomic path, the **Safe** for the fallback path.
  Not the operator EOA; allowlisting that does nothing. It is an ACM-gated governance call
  (`setAllowedLiquidator`), so it cannot be fixed mid-incident. Both scripts pre-check it and name the
  correct address in the error.
- The spoke pool and both of its markets must be registered in the **PoolRegistry** the ProtocolShareReserve
  reads. Isolated `_seize` transfers the protocol share to the PSR and calls `updateAssetsState`, which
  reverts `InvalidAddress()` otherwise — on _every_ liquidation, with nothing in the message naming the
  cause. This is pool-listing work, outside the liquidator entirely.

### Hop-1 source registry (Native, Liquid Mesh, …)

Hop-1 sources live in a registry — `scripts/bstock/lib/sources.ts` — that the script is generic over: it
prices every selected source and takes the higher out. `SOURCE=auto` (default) uses every source whose
creds are present; `SOURCE=native,liquidmesh` (or a single name) restricts to a subset.

Winner selection has one guard: a Liquid Mesh quote is **indicative** (`/quote`), while Native's is
**firm** (MM-signed — executes at exactly the quoted amount). If Liquid Mesh wins the comparison, the
script builds its order and re-checks the order's own worst-case fill (its floor) against the best firm
quote it beat. If the floor is below what the firm quote guaranteed, the script logs
`hop-1 reconcile: ...` and executes the firm quote instead — an expected source switch, not an error.

Both current sources quote bStock→USDT. Liquid Mesh re-serves the same `rfq_native` book plus `rfq_neptune`
(and AMM pools for thin names), so at common sizes it matches or marginally beats Native and reaches deeper
on some tails — but neither is uniformly deeper.

**Adding a source** (no redeploy): implement the small `QuoteSource` interface in `lib/sources.ts`
(`available()` + `getQuote()` returning a price and a lazy `build()`), push it into the `SOURCES` array,
and on-chain run `setRouter(newRouter, true)` (+ `setRouterSpender` if it pulls via a separate contract).
The selection/comparison logic and the contract are unchanged — the contract is already source-agnostic.

Two Liquid-Mesh mechanics, both handled automatically:

- **Separate spender** — approve `LM_SPENDER` (`0x8157…`), call `LM_ROUTER` (`0x3d90…`). Handled on-chain
  by `routerSpender` (run `setRouterSpender` once, above).
- **Build-time simulation** — `POST /swap` normally simulates `transferFrom` and refuses calldata unless
  the caller already holds the input. The liquidator holds zero bStock until mid-tx, so the client passes
  `disableSimulate:true` to get executable calldata pre-seize. On-chain safety is unchanged (the order
  carries an expiry deadline; the contract enforces `minOut`).

---

## 1. Native smoke — verify the quote path

```bash
# NATIVE_API_KEY read from .env
TOKEN=TSLAB AMOUNT=5 npx hardhat run scripts/bstock/native-smoke.ts
```

```text
Native quote: 5 TSLAB (0x5b19…292f) -> USDT
  amountIn : 5 TSLAB
  amountOut: 1924.5 USDT
  px/token : 384.9000 USDT
  -- firm-only --
  deadline : 1752… (58s TTL)
  router   : 0x…            ← executable txRequest.target
  orders   : 1
```

Run this first during an incident to confirm Native is live and see the current price/TTL. `TOKEN` = any
bStock in the orderbook (default `TSLAB`), `AMOUNT` = bStock to sell (default `1`). The shared fields
(amountIn/out, px/token) match `lm-smoke`; the `firm-only` block (deadline, executable router, orders) is
what a **firm** MM-signed RFQ carries that an **indicative** LM `/quote` does not (LM instead shows
price-impact / mid-price / route split — see §1b).

---

## 1b. Liquid Mesh smoke — verify the LM quote path

```bash
# keys read from .env (LM_API_KEY, LM_PRIVATE_KEY_SEED)
AMOUNT=5 npx hardhat run scripts/bstock/lm-smoke.ts
# or price a different bStock (LM has no orderbook, so pass the address):
BSTOCK=0x… AMOUNT=5 npx hardhat run scripts/bstock/lm-smoke.ts
```

```text
Liquid Mesh quote: 5 TSLAB (0x5b19…292f) -> USDT
  amountIn : 5 TSLAB
  amountOut: 1927.13 USDT
  px/token : 385.4300 USDT
  -- indicative --
  priceImp : 0.0000117%
  midPrice : 385.43
  est. gas : 219000
  route    : rfq_neptune:99% uniswap_v4:1%
  deadline : none at quote time (set only on the built /swap order)
```

Same shape as `native-smoke` (header, amountIn/out, px/token), with an `indicative` block instead of
Native's `firm-only` one — the only difference is which fields each API returns (see §1).

The Liquid Mesh counterpart of the Native smoke: fetches a live `/quote` (bStock → USDT) and prints
price, output, price impact, mid-price and the route split (which makers/dexes filled, at what weight).
Use it when `SOURCE=liquidmesh`/`auto` to confirm LM is live and priced, independently of Native.

- **Read-only.** It calls `/quote` only — never `/swap`. The one chain read is a best-effort `symbol()`
  for the label (via `RPC_URL`, else `ARCHIVE_NODE_bscmainnet`, else a public dataseed); it falls back to
  the raw address if no RPC is reachable, so the quote itself never depends on a chain.
- **No orderbook** — the token is given by address (`BSTOCK`, default `TSLAB`); `AMOUNT` = bStock to sell
  (default `1`), treated as 1e18 units.
- **No quote-level TTL** — a `/quote` is indicative; only the built `/swap` order carries a deadline. This
  probe confirms liveness + price, nothing more.

An executable `/swap` blob and its actual on-chain fill are proven separately by `verify-lm-fork.ts`.

---

## 2. Atomic liquidation — primary path

```bash
NATIVE_API_KEY=... LIQUIDATOR=0x.. BORROWER=0x.. VBSTOCK=0x.. VDEBT=0x.. REPAY_AMOUNT=5000 \
  npx hardhat run scripts/bstock/atomic-liquidate.ts --network bscmainnet
```

Flow: precompute the exact seize → fetch the hop-1 quote (bStock→USDT) from the best of Native / Liquid
Mesh with the taker = the contract → for non-USDT debt, append a hop-2 (USDT→debt): an AMM for an ERC20
debt, or the PSM (`swapStableForVAI`) for a VAI debt →
call `liquidate`/`flashLiquidate`.

**Always dry-run first** (`DRY_RUN=1`) — it `callStatic`s the settle with no send.

**Two-hop (non-USDT debt): submit through Venus's PRIVATE RPC.** Hop 2 is a public-mempool AMM swap;
`minOut` bounds loss but not sandwich-induced reverts. Prefer `MODE=flash` so a revert only burns gas.

### Env

| Var                   | Req | Default     | Notes                                                                                                                                                                                                        |
| --------------------- | --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LIQUIDATOR`          | ✓   |             | Deployed `BStockLiquidator` address                                                                                                                                                                          |
| `BORROWER`            | ✓   |             | Account to liquidate (must have shortfall)                                                                                                                                                                   |
| `VBSTOCK`             | ✓   |             | bStock collateral market (e.g. vTSLAB)                                                                                                                                                                       |
| `VDEBT`               | ✓   |             | Borrowed market to repay (e.g. vUSDT)                                                                                                                                                                        |
| `REPAY_AMOUNT`        | ✓   |             | Repay in debt underlying, human units                                                                                                                                                                        |
| `NATIVE_API_KEY`      |     |             | Native Swap API key (required for `native`/`auto`)                                                                                                                                                           |
| `MODE`                |     | `inventory` | `inventory` (own funds) or `flash` (Venus flash-loan). In the spoke pool `flash` needs `setCoreFlashSource` configured; the loan comes from the CORE market for the same token                               |
| `SOURCE`              |     | `auto`      | Hop-1 source: `auto` (price all available, take higher) / `native` / `liquidmesh` / comma-subset (e.g. `native,liquidmesh`)                                                                                  |
| `LM_API_KEY`          |     |             | Liquid Mesh API key (required for `liquidmesh`/`auto`)                                                                                                                                                       |
| `LM_PRIVATE_KEY_SEED` |     |             | Liquid Mesh Ed25519 seed, base64url (required for `liquidmesh`/`auto`)                                                                                                                                       |
| `LM_MIN_TTL`          |     | `15`        | Min seconds left on the LM order at build time, else abort (LM RFQ orders are short-lived; the on-chain deadline still enforces the real expiry)                                                             |
| `SOURCE_TIMEOUT_MS`   |     | `8000`      | Per-request timeout (ms) on each hop-1 source API call, so a hung source aborts and drops out of the `auto` race instead of blocking the live one                                                            |
| `SETTLE_TTL_MARGIN`   |     | `10`        | Min seconds of quote TTL required immediately before submit; below it the script aborts + refetches instead of burning gas on an on-chain `DeadlineExpired`                                                  |
| `ALLOW_NO_SHORTFALL`  |     |             | `1` → proceed even when the borrower has no shortfall (FORCED liquidation of a healthy account); default aborts as a fat-finger guard                                                                        |
| `DRY_RUN`             |     |             | `1` → callStatic only, sends nothing                                                                                                                                                                         |
| `SLIPPAGE`            |     | `0.5`       | Native/LM slippage % (validated to `[0,100)`)                                                                                                                                                                |
| `MIN_OUT_BUFFER`      |     | `0.5`       | Extra haircut on `minOut` beyond slippage (%) (validated to `[0,100)`). For a single-hop indicative (Liquid Mesh) quote, `minOut` is derived from the built order's guaranteed floor, not the indicative out |
| `SEIZE_BUFFER`        |     | `0.1`       | Haircut on the QUOTED seize (%) so an oracle uptick before inclusion can't make the router pull more bStock than was seized (→ `SwapFailed`); the unsold remainder stays as bStock inventory (sweepable)     |
| `AMM_PROVIDER`        |     | `kyberswap` | Hop-2 route for non-USDT debt: `kyberswap` / `openocean` / `pcsv2`                                                                                                                                           |
| `PSM_ADDR`            |     | BSC PSM     | Peg Stability Module used as hop 2 for a VAI debt (`swapStableForVAI` calldata encoded locally, expected out from `previewSwapStableForVAI`); must be allowlisted via `setRouter`. `MODE=flash` rejected     |
| `WBNB_ADDR`           |     | BSC WBNB    | Only for a vBNB debt market (native BNB auto-detected; contract unwraps)                                                                                                                                     |

_Fork/local testing:_ `MOCK_NATIVE="router:calldata"` (hop 1), `MOCK_AMM` (hop 2), `MOCK_OUT` (final
debt out), `IMPERSONATE=0x..` to run as an operator.

_Advanced / override env (defaults are correct for BSC mainnet; only touch these for tests or an
endpoint migration):_ `USDT_ADDR`, `WBNB_ADDR` (asset overrides); `KYBER_CLIENT_ID`, `KYBER_API_BASE`,
`OPENOCEAN_API_BASE`, `OPENOCEAN_GAS_GWEI`, `AMM_ROUTER`, `AMM_PATH`, `AMM_DEADLINE_SECS` (hop-2 AMM
tuning); `NATIVE_API_BASE`, `LM_API_HOST` (RFQ endpoints).

---

## 3. Safe fallback — manual multisig path

Use when the whole quote path is unavailable — every hop-1 RFQ source (Native and Liquid Mesh) down, or
for a VAI debt the hop-2 PSM paused / cap-exhausted. Reads chain state and writes a Safe Transaction
Builder batch JSON —
**it sends nothing.**

```bash
# standalone — builds its own provider (RPC_URL), so it uses ts-node, not `hardhat run`
BORROWER=0x.. VBSTOCK=0x.. VDEBT=0x.. REPAY_AMOUNT=5000 TARGET=0x.. \
  npx ts-node scripts/bstock/safe-fallback.ts
```

Then: **Safe → Apps → Transaction Builder → Load** the JSON, review, sign, execute.

The batch is 3–4 txs (approve → liquidateBorrow → redeem → transfer; the approve is dropped for a
native BNB debt, so 3): the Safe repays from its own funds, seizes the bStock, and ships raw bStock to
`TARGET` (Binance top-up / custody) for finance to offload on the CEX.

**In the spoke pool the batch is always 4 txs and two things change shape.** There is no gate, so the
approval goes to the debt market itself and the call is the market's own 3-arg
`liquidateBorrow(borrower, repay, vBStock)` — note both the different signature and the different argument
order from the gate's 4-arg `liquidateBorrow(vDebt, borrower, repay, vBStock)`. The native-BNB 3-tx variant
and the VAI branch cannot occur there (no native market, no VAIController). The script decides this by
probing the pool for a `liquidatorContract()` gate rather than by address, so it needs no extra env.

| Var            | Req | Default                         | Notes                                                                                                                             |
| -------------- | --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `BORROWER`     | ✓   |                                 | Account to liquidate                                                                                                              |
| `VBSTOCK`      | ✓   |                                 | bStock collateral market                                                                                                          |
| `VDEBT`        | ✓   |                                 | Borrowed market to repay                                                                                                          |
| `REPAY_AMOUNT` | ✓   |                                 | Repay in debt underlying, human units                                                                                             |
| `TARGET`       | ✓   |                                 | Binance top-up / custody address for the bStock (or `ALLOW_PLACEHOLDER=1` for a draft)                                            |
| `SAFE`         |     | `0xdc6E…2029`                   | Executing Safe                                                                                                                    |
| `RPC_URL`      |     | public dataseed                 | BSC RPC                                                                                                                           |
| `SEIZE_BUFFER` |     | `0.1`                           | Haircut % on the redeem/transfer amounts, absorbing oracle price drift before the Safe executes; the unredeemed dust is sweepable |
| `OUT`          |     | `out/bstock-safe-fallback.json` | Output path                                                                                                                       |

> The batch is a **snapshot** at the current block. `SEIZE_BUFFER` absorbs small oracle price drift, but
> **price drift alone** (not just a position change) can still invalidate the exact amounts — a stale
> redeem/transfer that exceeds the seized balance reverts the batch. **Regenerate immediately before
> signing** for anything but a tiny move.

---

## 4. Verify LM fork — dev-time on-chain proof (not for incidents)

Proves a Liquid Mesh `disableSimulate:true` swap blob actually **executes on-chain** — the one thing the
mocked unit suite can't cover. It forks bscmainnet at head, fetches a live `/quote` + `/swap`, then
replicates the contract's `_swap` exactly (approve the LM spender → `router.call(callMsg.data)`) using a
**real, already-allowlisted** bStock holder as the taker, and asserts USDT ≥ `minOut` landed. One-shot
diagnostic — run it when onboarding or debugging the LM integration, never during a live liquidation.

```bash
FORKED_NETWORK=bscmainnet AMOUNT=3 npx hardhat run scripts/bstock/verify-lm-fork.ts
# LM_API_KEY, LM_PRIVATE_KEY_SEED, ARCHIVE_NODE_bscmainnet read from .env
```

**Required config tweak** (temporary, in `hardhat.config.ts` `isFork()`): the RFQ maker orders are
EIP-712 signed with chainId 56 and the head block needs modern opcodes, neither of which the default
fork network provides. Add:

```ts
chainId: 56,
chains: { 56: { hardforkHistory: { berlin: 0, london: 13000000, shanghai: 40000000, cancun: 48000000 } } }
```

Without `chainId: 56` the maker signature fails `InvalidSignature` (the fork otherwise runs as 31337) —
a fork artifact, not a real defect; the script aborts early with this hint if the chainId is wrong.

| Var                       | Req | Default                 | Notes                                                                    |
| ------------------------- | --- | ----------------------- | ------------------------------------------------------------------------ |
| `LM_API_KEY`              | ✓   |                         | Liquid Mesh API key                                                      |
| `LM_PRIVATE_KEY_SEED`     | ✓   |                         | Ed25519 seed, base64url (32 bytes)                                       |
| `ARCHIVE_NODE_bscmainnet` | ✓   |                         | Archive RPC to fork at head (maker state must match head or it reverts)  |
| `FORKED_NETWORK`          | ✓   |                         | Must be `bscmainnet`                                                     |
| `BSTOCK`                  |     | `TSLAB` (`0x5b19…292f`) | bStock token to sell                                                     |
| `AMOUNT`                  |     | `10`                    | bStock to sell, human units                                              |
| `TAKER`                   |     | auto (recent LM holder) | Override the taker; default scans recent Transfer logs for a real holder |

On success it prints the fork block, the LM quote + route, gas, USDT received vs `minOut`, and a
`✅ PASS` — proving the same approve-spender → `router.call` sequence succeeds inside the liquidator's
`_swap`.
