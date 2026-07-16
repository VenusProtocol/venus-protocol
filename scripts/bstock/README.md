# bStock Liquidation Scripts

Operator runbook for liquidating bStock (tokenized-stock) collateral in Venus Core. Three entrypoints,
one shared goal: repay a borrower's debt, seize their bStock, and offload it.

| Script            | Path                  | What it does                                                                                                                                                                                                                                        | Chain writes?    |
| ----------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Atomic**        | `atomic-liquidate.ts` | Primary path. Drives the on-chain `BStockLiquidator` — repay, seize, redeem, and sell bStock in ONE tx via a Native or Liquid Mesh RFQ quote (+ optional AMM hop).                                                                                  | Yes              |
| **Safe fallback** | `safe-fallback.ts`    | Backstop when the quote path is unavailable — every hop-1 RFQ source (Native and Liquid Mesh) down, or for VAI the hop-2 PSM paused / cap-exhausted. Emits a Safe{Wallet} batch JSON; signers repay from Safe funds and ship raw bStock to Binance. | No — writes JSON |
| **Native smoke**  | `native-smoke.ts`     | Pre-flight check. Prints the Native orderbook + a live firm-quote (price, spread, TTL). No chain interaction.                                                                                                                                       | No               |

Pick **Atomic** first. Fall back to **Safe** only if the whole quote path fails — all RFQ sources down, or (for VAI) the PSM hop paused/capped.

## Which script? — start here

![bStock liquidation decision flowchart: native-smoke checks the quote path, then atomic-liquidate.ts (DRY_RUN) runs pre-flight gates (debt-type detection, shortfall/ALLOW_NO_SHORTFALL, VAI-forces-inventory) and routes hop-2 by debt type — single-hop USDT, AMM for other ERC20, WBNB unwrap for native BNB, or the PSM swapStableForVAI for VAI — sending atomically when the dry-run passes, and falling back to the Safe multisig batch (which ships bStock to the CEX, PSM-independent) when the RFQ path is dead, the VAI PSM is paused or cap-exhausted, or the dry-run fails](liquidation-flowchart.svg)

Rules of thumb:

- **Always start with the smoke test** — it is read-only and tells you which branch you are on.
- **Never send without a passing dry-run** (`DRY_RUN=1` `callStatic`s the exact settle).
- **Atomic beats Safe whenever any RFQ source answers**: atomic is one tx at a firm price now; the
  Safe path needs signer quorum and holds raw bStock (price risk) until finance offloads it on the CEX.
- **Don't debug mid-incident.** If the atomic dry-run keeps reverting and the cause isn't obvious in
  minutes, switch to the Safe fallback instead of burning the liquidation window.
- `verify-lm-fork.ts` is a **dev-time** fork check (proves LM calldata executes) — never part of an incident.

---

## Prerequisites

- **Native API key** (`NATIVE_API_KEY`) for anything that fetches a Native quote. Never commit it.
- **Liquid Mesh credentials** (only if `SOURCE=liquidmesh` or `SOURCE=auto`): `LM_API_KEY` and the
  Ed25519 private-key seed `LM_PRIVATE_KEY_SEED` (base64url). Never commit them.
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
NATIVE_API_KEY=... TOKEN=TSLAB AMOUNT=5 npx hardhat run scripts/bstock/native-smoke.ts
```

Run this first during an incident to confirm Native is live and see the current price/spread/TTL.
`TOKEN` = any bStock in the orderbook (default `TSLAB`), `AMOUNT` = bStock to sell (default `1`).

---

## 2. Atomic liquidation — primary path

```bash
NATIVE_API_KEY=... LIQUIDATOR=0x.. BORROWER=0x.. VBSTOCK=0x.. VDEBT=0x.. REPAY_AMOUNT=5000 \
  npx hardhat run scripts/bstock/atomic-liquidate.ts --network bscmainnet
```

Flow: precompute the exact seize → fetch the hop-1 quote (bStock→USDT) from the best of Native / Liquid
Mesh with the taker = the contract → for non-USDT debt, append an AMM hop (USDT→debt) →
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
| `MODE`                |     | `inventory` | `inventory` (own funds) or `flash` (Venus flash-loan)                                                                                                                                                        |
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

Use when Native is unavailable. Reads chain state and writes a Safe Transaction Builder batch JSON —
**it sends nothing.**

```bash
BORROWER=0x.. VBSTOCK=0x.. VDEBT=0x.. REPAY_AMOUNT=5000 TARGET=0x.. \
  npx ts-node scripts/bstock/safe-fallback.ts
```

Then: **Safe → Apps → Transaction Builder → Load** the JSON, review, sign, execute.

The batch is 3–4 txs (approve → liquidateBorrow → redeem → transfer; the approve is dropped for a
native BNB debt, so 3): the Safe repays from its own funds, seizes the bStock, and ships raw bStock to
`TARGET` (Binance top-up / custody) for finance to offload on the CEX.

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
