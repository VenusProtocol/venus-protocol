# bStock Liquidation Scripts

Operator runbook for liquidating bStock (tokenized-stock) collateral in Venus Core. Three entrypoints,
one shared goal: repay a borrower's debt, seize their bStock, and offload it.

| Script | Path | What it does | Chain writes? |
|---|---|---|---|
| **Atomic** | `atomic-liquidate.ts` | Primary path. Drives the on-chain `BStockLiquidator` — repay, seize, redeem, and sell bStock in ONE tx via a Native RFQ quote (+ optional AMM hop). | Yes |
| **Safe fallback** | `safe-fallback.ts` | Backstop when Native is unavailable (API down / halt / weekend / thin depth). Emits a Safe{Wallet} batch JSON; signers repay from Safe funds and ship raw bStock to Binance. | No — writes JSON |
| **Native smoke** | `native-smoke.ts` | Pre-flight check. Prints the Native orderbook + a live firm-quote (price, spread, TTL). No chain interaction. | No |

Pick **Atomic** first. Fall back to **Safe** only if the Native quote path fails.

---

## Prerequisites

- **Native API key** (`NATIVE_API_KEY`) for anything that fetches a quote. Never commit it.
- **Deployed `BStockLiquidator`** (see `deploy/019-deploy-bstock-liquidator.ts`). Its owner must have run:
  - `setRouter(router, true)` for every router the swap will touch (Native RFQ router, and the AMM
    router for non-USDT debt). The scripts **abort** if a router isn't allowlisted.
  - `setOperator(caller, true)` for the account that submits `liquidate` / `flashLiquidate`.
- **Funding** for `MODE=inventory`: the liquidator must hold ≥ `REPAY_AMOUNT` of the debt asset.
  `MODE=flash` borrows instead (no pre-funding).

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

Flow: precompute the exact seize → fetch a Native firm-quote (bStock→USDT) with `from_address = the
contract` → for non-USDT debt, append an AMM hop (USDT→debt) → call `liquidate`/`flashLiquidate`.

**Always dry-run first** (`DRY_RUN=1`) — it `callStatic`s the settle with no send.

**Two-hop (non-USDT debt): submit through Venus's PRIVATE RPC.** Hop 2 is a public-mempool AMM swap;
`minOut` bounds loss but not sandwich-induced reverts. Prefer `MODE=flash` so a revert only burns gas.

### Env

| Var | Req | Default | Notes |
|---|---|---|---|
| `LIQUIDATOR` | ✓ | | Deployed `BStockLiquidator` address |
| `BORROWER` | ✓ | | Account to liquidate (must have shortfall) |
| `VBSTOCK` | ✓ | | bStock collateral market (e.g. vTSLAB) |
| `VDEBT` | ✓ | | Borrowed market to repay (e.g. vUSDT) |
| `REPAY_AMOUNT` | ✓ | | Repay in debt underlying, human units |
| `MODE` | | `inventory` | `inventory` (own funds) or `flash` (Venus flash-loan) |
| `DRY_RUN` | | | `1` → callStatic only, sends nothing |
| `SLIPPAGE` | | `0.5` | Native slippage % |
| `MIN_OUT_BUFFER` | | `0.5` | Extra haircut on `minOut` beyond slippage (%) |
| `AMM_PROVIDER` | | `kyberswap` | Hop-2 route for non-USDT debt: `kyberswap` / `openocean` / `pcsv2` |
| `WBNB_ADDR` | | BSC WBNB | Only for a vBNB debt market (native BNB auto-detected; contract unwraps) |

_Fork/local testing:_ `MOCK_NATIVE="router:calldata"` (hop 1), `MOCK_AMM` (hop 2), `MOCK_OUT` (final
debt out), `IMPERSONATE=0x..` to run as an operator.

---

## 3. Safe fallback — manual multisig path

Use when Native is unavailable. Reads chain state and writes a Safe Transaction Builder batch JSON —
**it sends nothing.**

```bash
BORROWER=0x.. VBSTOCK=0x.. VDEBT=0x.. REPAY_AMOUNT=5000 TARGET=0x.. \
  npx ts-node scripts/bstock/safe-fallback.ts
```

Then: **Safe → Apps → Transaction Builder → Load** the JSON, review, sign, execute.

The batch is 4 txs (approve → liquidateBorrow → redeem → transfer): the Safe repays from its own
funds, seizes the bStock, and ships raw bStock to `TARGET` (Binance top-up / custody) for finance to
offload on the CEX.

| Var | Req | Default | Notes |
|---|---|---|---|
| `BORROWER` | ✓ | | Account to liquidate |
| `VBSTOCK` | ✓ | | bStock collateral market |
| `VDEBT` | ✓ | | Borrowed market to repay |
| `REPAY_AMOUNT` | ✓ | | Repay in debt underlying, human units |
| `TARGET` | ✓ | | Binance top-up / custody address for the bStock (or `ALLOW_PLACEHOLDER=1` for a draft) |
| `SAFE` | | `0xdc6E…2029` | Executing Safe |
| `RPC_URL` | | public dataseed | BSC RPC |
| `OUT` | | `out/bstock-safe-fallback.json` | Output path |

> The batch is a **snapshot** at the current block. If the borrower's position changes before the Safe
> executes, **regenerate** — a stale redeem/transfer that exceeds the seized balance reverts the batch.
