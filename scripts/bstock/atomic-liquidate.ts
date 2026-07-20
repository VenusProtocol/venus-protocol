/**
 * bStock ATOMIC liquidation — drives the on-chain `BStockLiquidator` contract.
 *
 * One tx: the contract repays the borrow, seizes + redeems the bStock, and sells it to the debt
 * asset in one or two hops. Hop 1 is a pre-fetched best-of quote (bStock -> USDT) from the source
 * registry (Native RFQ / Liquid Mesh / future sources — see lib/sources.ts). For a USDT debt market that
 * single hop is the debt asset; for a non-USDT debt market a second hop (USDT -> debt) is appended — via
 * an allowlisted AMM/aggregator (lib/amm.ts) for an ERC20 debt, or via the Peg Stability Module
 * (`swapStableForVAI`, lib/psm.ts) for a VAI debt. VAI is inventory-only (no vVAI to flash from) and its
 * seize keys off `liquidateVAICalculateSeizeTokens`. Native BNB debt (vBNB) is handled too (see below).
 * This script does the OFF-CHAIN half (precompute the seize, fetch the quotes with the taker = the
 * contract) and then calls `liquidate` (inventory mode) or `flashLiquidate` (Venus flash-loan mode).
 *
 *   1. Comptroller.liquidateCalculateSeizeTokens(borrower, vDebt, vBStock, repay) -> seize vTokens
 *   2. seizeTokens * vBStock.exchangeRateStored() / 1e18                  -> raw bStock (floor)
 *   3. hop-1 quote (bStock -> USDT) from Native and/or Liquid Mesh, best -> router + calldata + out
 *      [+ AMM quote USDT -> debt for non-USDT debt]                       -> hop-2 router + calldata
 *   4. BStockLiquidator.liquidate / flashLiquidate(params)               -> atomic settle
 *
 * Hop-1 sources come from a registry (lib/sources.ts); `SOURCE` selects them (auto = every available
 * source, or a comma-separated subset). auto prices all and takes the higher out. Liquid Mesh returns ONE
 * router calldata blob (multi-source split baked in) and requires `disableSimulate:true` at build time
 * (the contract holds no bStock until mid-tx) plus a one-time `setRouterSpender(LM_ROUTER, LM_SPENDER)` on
 * the liquidator (LM pulls via a separate spender). Adding a source = one adapter in lib/sources.ts.
 *
 * IMPORTANT: for a two-hop run the settle tx MUST be submitted through Venus's PRIVATE RPC, never a
 * public one — hop 2 is a public-mempool AMM swap and `minOut` only bounds loss, not sandwich-induced
 * reverts. Prefer MODE=flash for two-hop so a revert only burns gas, not locked inventory.
 *
 * Usage:
 *   NATIVE_API_KEY=... LIQUIDATOR=0x.. BORROWER=0x.. VBSTOCK=0x.. VDEBT=0x.. REPAY_AMOUNT=5000 \
 *     npx hardhat run scripts/bstock/atomic-liquidate.ts --network bscmainnet
 *
 * Env:
 *   LIQUIDATOR      (req) deployed BStockLiquidator address
 *   BORROWER        (req) account to liquidate
 *   VBSTOCK         (req) bStock collateral market (e.g. vTSLAB)
 *   VDEBT           (req) borrowed market to repay (e.g. vUSDT)
 *   REPAY_AMOUNT    (req) repay in DEBT underlying, human units
 *   MODE            "inventory" (default) | "flash"
 *   SOURCE          hop-1 liquidity source(s) from the registry (lib/sources.ts): "auto" (default, price
 *                   every AVAILABLE source and take the higher out) or a comma-separated subset by name
 *                   (e.g. "native", "liquidmesh", "native,liquidmesh"). Liquid Mesh needs LM_API_KEY +
 *                   LM_PRIVATE_KEY_SEED, and the liquidator must have `setRouterSpender(LM_ROUTER,
 *                   LM_SPENDER)` set (separate puller). New sources = one adapter in lib/sources.ts.
 *   LM_MIN_TTL      min seconds left on a built Liquid Mesh order, else abort pre-submit (default 15);
 *                   LM RFQ orders are short-lived and an already-tight order would revert on-chain
 *   SLIPPAGE        Native/LM slippage %, default 0.5 (validated to [0,100))
 *   MIN_OUT_BUFFER  extra haircut on minOut beyond slippage, default 0.5 (%) (validated to [0,100))
 *   SETTLE_TTL_MARGIN  min seconds of Native/LM quote TTL required immediately before submit, else
 *                   abort + refetch instead of burning gas on an on-chain DeadlineExpired (default 10)
 *   ALLOW_NO_SHORTFALL  "1" -> proceed even when the borrower has no shortfall (FORCED liquidation of a
 *                   healthy account); default aborts as a fat-finger guard
 *   SEIZE_BUFFER    haircut on the QUOTED seize so a small oracle uptick can't make the router pull more
 *                   bStock than was seized (which reverts). Default 0.1 (%); unsold remainder is sweepable.
 *                   Keep it small: in MODE=flash the quoted proceeds must still cover principal + premium,
 *                   so an oversized buffer trips the on-chain InsufficientOut (run DRY_RUN first).
 *   AMM_PROVIDER    hop-2 route source for non-USDT debt: kyberswap (default) | openocean | pcsv2
 *   PSM_ADDR        Peg Stability Module used as hop 2 for a VAI debt (default: BSC mainnet
 *                   PegStability_USDT). Must be allowlisted via setRouter; calldata is encoded
 *                   locally (lib/psm.ts). MODE=flash is rejected for VAI (no vVAI to flash from).
 *   DRY_RUN         "1" -> callStatic only, send nothing
 *
 *   Test / fork overrides (normally unset):
 *   MOCK_NATIVE     hop-1 "router:calldata" that bypasses the source registry (name is historical — it
 *                   mocks whichever hop-1 source, not only Native); MOCK_OUT = the out it should report
 *   MOCK_AMM        hop-2 "router:calldata" for the two-hop path; MOCK_OUT = final debt out
 *   IMPERSONATE     address to impersonate as the caller on a fork (hardhat_impersonateAccount)
 *   USDT_ADDR       override the hop-1 output / intermediate token (default BSC USDT)
 *   WBNB_ADDR       override WBNB for the native-BNB accounting (default canonical BSC WBNB)
 *
 * Native BNB debt (vBNB) is auto-detected — vBNB has no underlying() — and accounted in WBNB at its
 * canonical BSC address; the contract unwraps the repay, so pre-fund inventory in WBNB (MODE=inventory).
 */
import { BigNumber, Contract, Signer } from "ethers";
import { ethers } from "hardhat";

import { BSC_WBNB, getAmmSwap } from "./lib/amm";
import { BSC_USDT } from "./lib/native";
import { getPsmSwap } from "./lib/psm";
import { QuoteArgs, selectedSources } from "./lib/sources";
import { assertVaiGateClear } from "./lib/vai-gate";

const PARAMS_TUPLE =
  "(address borrower,address vDebt,address vBStock,uint256 repayAmount,address router,bytes swapCalldata,uint256 minOut,address router2,bytes swapCalldata2,address intermediateToken,uint256 deadline)";
const LIQUIDATOR_ABI = [
  `function liquidate(${PARAMS_TUPLE}) returns (uint256)`,
  `function flashLiquidate(${PARAMS_TUPLE})`,
  "function isRouter(address) view returns (bool)",
];
const VTOKEN_ABI = [
  "function underlying() view returns (address)",
  "function comptroller() view returns (address)",
  "function exchangeRateStored() view returns (uint256)",
];
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
];
const COMPTROLLER_ABI = [
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  "function liquidateCalculateSeizeTokens(address,address,address,uint256) view returns (uint256,uint256)",
  // VAI's seize math is a separate function: VAI is priced at $1 and the incentive is the
  // borrower-agnostic getLiquidationIncentive (see ComptrollerLens.liquidateVAICalculateSeizeTokens).
  "function liquidateVAICalculateSeizeTokens(address,uint256) view returns (uint256,uint256)",
  "function treasuryPercent() view returns (uint256)",
  "function liquidatorContract() view returns (address)",
  "function vaiController() view returns (address)",
  "function getEffectiveLiquidationIncentive(address,address) view returns (uint256)",
  "function getLiquidationIncentive(address) view returns (uint256)",
];
const VAI_CONTROLLER_ABI = ["function getVAIAddress() view returns (address)"];
const VENUS_LIQUIDATOR_ABI = ["function treasuryPercentMantissa() view returns (uint256)"];

function env(name: string, required = true): string {
  const v = process.env[name];
  if (required && !v) throw new Error(`Missing env ${name}`);
  return v || "";
}

interface Hop1 {
  source: string;
  router: string;
  calldata: string;
  out: BigNumber; // USDT out of hop 1 (base units) — INDICATIVE for a non-firm source; display only
  floor: BigNumber; // the built order's GUARANTEED worst-case USDT out — what downstream legs must assume
  deadline: BigNumber; // unix seconds — the quote's on-chain expiry
}

/**
 * Fetch the hop-1 (bStock -> USDT) swap from the configured source(s) and return the executable route.
 * Generic over the `SOURCES` registry (lib/sources.ts): `SOURCE=auto` (default) prices EVERY available
 * source and takes the higher out; `SOURCE=native,liquidmesh,…` restricts to a subset. A source that
 * errors at quote time drops out; only the WINNER's `build()` runs, so a losing source that needs a
 * second round-trip to build (e.g. Liquid Mesh `/swap`) never pays it. Adding a source = one adapter in
 * lib/sources.ts; this function is unchanged.
 */
async function pickHop1Source(args: QuoteArgs): Promise<Hop1> {
  const sources = selectedSources();
  if (sources.length === 0) {
    throw new Error(
      "no hop-1 source available — provide NATIVE_API_KEY and/or LM_API_KEY+LM_PRIVATE_KEY_SEED, or set SOURCE",
    );
  }

  // Price every selected source in parallel; a source that errors (API down / no route) drops out.
  const settled = await Promise.allSettled(sources.map(async s => ({ name: s.name, quote: await s.getQuote(args) })));
  const ok = settled.flatMap(r => (r.status === "fulfilled" ? [r.value] : []));
  const failed = settled.flatMap((r, i) => (r.status === "rejected" ? [`${sources[i].name}=[${r.reason}]`] : []));
  if (ok.length === 0) throw new Error(`all hop-1 sources failed: ${failed.join(" ")}`);
  if (sources.length > 1) {
    const line = ok.map(o => `${o.name}=${ethers.utils.formatUnits(o.quote.out, 18)}`).join(" ");
    console.log(`hop-1 compare: ${line} USDT${failed.length ? ` (failed: ${failed.join(" ")})` : ""}`);
  }

  // Winner = highest USDT out. Only its build() runs.
  let winner = ok.reduce((best, cur) => (cur.quote.out.gt(best.quote.out) ? cur : best));
  let built = await winner.quote.build();

  // Reconcile an INDICATIVE winner against the best FIRM loser. An indicative `out` (LM `/quote`) is
  // not binding — the built order only guarantees `builtFloor` — while a firm quote (Native) executes
  // at exactly its `out`. If the winner's real floor undercuts what the firm loser guaranteed, the
  // comparison was won on optimism: execute the firm quote instead.
  if (!winner.quote.firm) {
    const firmLosers = ok.filter(o => o !== winner && o.quote.firm);
    if (firmLosers.length > 0) {
      const bestFirm = firmLosers.reduce((best, cur) => (cur.quote.out.gt(best.quote.out) ? cur : best));
      if (built.builtFloor.lt(bestFirm.quote.out)) {
        console.log(
          `hop-1 reconcile: ${winner.name} built floor ${ethers.utils.formatUnits(built.builtFloor, 18)} < ` +
            `${bestFirm.name} firm ${ethers.utils.formatUnits(bestFirm.quote.out, 18)} USDT — using ${bestFirm.name}`,
        );
        winner = bestFirm;
        built = await bestFirm.quote.build();
      }
    }
  }

  return {
    source: winner.name,
    router: built.router,
    calldata: built.calldata,
    out: winner.quote.out,
    floor: built.builtFloor,
    deadline: built.deadline,
  };
}

export async function atomicLiquidate(signer: Signer) {
  const dryRun = process.env.DRY_RUN === "1";
  const mode = (process.env.MODE || "inventory").toLowerCase();
  const slippage = Number(process.env.SLIPPAGE || "0.5");
  const minOutBufferPct = Number(process.env.MIN_OUT_BUFFER || "0.5");
  const seizeBufferPct = Number(process.env.SEIZE_BUFFER || "0.1");
  // Bound SLIPPAGE / MIN_OUT_BUFFER the same way SEIZE_BUFFER is bounded below: a NaN slippage would
  // reach the Native/LM request (and `out.mul(NaN)`) as garbage, and a negative MIN_OUT_BUFFER would
  // silently push minOut ABOVE the quote — a guaranteed on-chain revert after the quote is already
  // burned. Fail loudly here instead.
  if (!Number.isFinite(slippage) || slippage < 0 || slippage >= 100) {
    throw new Error(`SLIPPAGE must be a percent in [0, 100), got "${process.env.SLIPPAGE}"`);
  }
  if (!Number.isFinite(minOutBufferPct) || minOutBufferPct < 0 || minOutBufferPct >= 100) {
    throw new Error(`MIN_OUT_BUFFER must be a percent in [0, 100), got "${process.env.MIN_OUT_BUFFER}"`);
  }
  // Bound the haircut: a garbage or oversized value would silently under-quote (and in flash mode
  // starve the principal + premium repay). The on-chain InsufficientOut still backstops it, but fail
  // loudly here instead of after burning a hop-1 quote.
  if (!Number.isFinite(seizeBufferPct) || seizeBufferPct < 0 || seizeBufferPct >= 100) {
    throw new Error(`SEIZE_BUFFER must be a percent in [0, 100), got "${process.env.SEIZE_BUFFER}"`);
  }
  // Minimum remaining hop-1 quote TTL (seconds) required just before submitting the settle tx. The
  // two-hop AMM round-trip and on-chain reads after the initial TTL check consume wall-clock, so the
  // quote is re-verified against this margin to abort + refetch rather than burn gas on an on-chain
  // DeadlineExpired revert.
  const settleTtlMarginSec = Number(process.env.SETTLE_TTL_MARGIN || "10");
  if (!Number.isFinite(settleTtlMarginSec) || settleTtlMarginSec < 0) {
    throw new Error(
      `SETTLE_TTL_MARGIN must be a non-negative number of seconds, got "${process.env.SETTLE_TTL_MARGIN}"`,
    );
  }

  const liquidator = new Contract(env("LIQUIDATOR"), LIQUIDATOR_ABI, signer);
  const borrower = ethers.utils.getAddress(env("BORROWER"));
  const vBStock = new Contract(env("VBSTOCK"), VTOKEN_ABI, signer);
  const vDebt = new Contract(env("VDEBT"), VTOKEN_ABI, signer);

  const comptroller = new Contract(await vBStock.comptroller(), COMPTROLLER_ABI, signer);

  // vBNB has no underlying(): a native-BNB debt is accounted in WBNB (1:1 with BNB). The contract
  // unwraps the repay internally, so off-chain the debt asset for the swap chain + minOut is WBNB.
  // WBNB is immutable on BSC, so it is the canonical constant; WBNB_ADDR only overrides it so a
  // non-fork test can point at a freshly-deployed mock (mirrors USDT_ADDR below).
  // VAI is not a vToken: its "market" is the VAIController, which has no underlying() EITHER. It must
  // therefore be detected BEFORE the vBNB fallback below — otherwise the catch would misread a VAI debt
  // as native BNB and account it in WBNB. The VAI token itself is a plain ERC20 (decimals/symbol work).
  const vaiControllerAddr: string = await comptroller.vaiController();
  const isVai = vDebt.address.toLowerCase() === vaiControllerAddr.toLowerCase();

  let debtAddr: string;
  let isBnb = false;
  if (isVai) {
    debtAddr = await new Contract(vaiControllerAddr, VAI_CONTROLLER_ABI, signer).getVAIAddress();
  } else {
    try {
      debtAddr = await vDebt.underlying();
    } catch {
      isBnb = true;
      debtAddr = ethers.utils.getAddress(process.env.WBNB_ADDR || BSC_WBNB);
    }
  }
  const debt = new Contract(debtAddr, ERC20_ABI, signer);
  const bStock = new Contract(await vBStock.underlying(), ERC20_ABI, signer);
  const [bStockDec, bStockSym] = await Promise.all([bStock.decimals(), bStock.symbol()]);
  const [debtDec, debtSym] = isBnb ? [18, "WBNB"] : await Promise.all([debt.decimals(), debt.symbol()]);
  const repay = ethers.utils.parseUnits(env("REPAY_AMOUNT"), debtDec);
  if (isBnb) console.log(`native BNB debt: accounting in WBNB ${debt.address} (contract unwraps the repay)`);

  // Mirrors the contract's FlashNotSupportedForVai: VAI is minted/burned by the VAIController and has
  // no vVAI market to flash from. Fail here, before burning a hop-1 quote on a call that must revert.
  if (isVai && mode === "flash") {
    throw new Error("MODE=flash is not supported for a VAI debt (no vVAI to flash from) — use MODE=inventory");
  }

  // 0. liquidatable? getAccountLiquidity returns (errorCode, liquidity, shortfall). A non-zero error
  // code means the reading itself failed (e.g. an oracle PRICE_ERROR), so the shortfall is unreliable —
  // surface THAT distinctly rather than mislabel it "no shortfall". A zero shortfall means the account
  // is healthy by the normal metric; abort by default (guards against a fat-fingered borrower), but let
  // ALLOW_NO_SHORTFALL=1 through: the contract deliberately does NOT pre-check liquidatability
  // (BStockLiquidator._validateRouters comment) because Core's FORCED liquidations liquidate healthy
  // accounts, and this script must be able to serve that path.
  const [liqErr, , shortfall]: BigNumber[] = await comptroller.getAccountLiquidity(borrower);
  if (!liqErr.eq(0)) {
    throw new Error(`getAccountLiquidity returned error code ${liqErr} for ${borrower} — cannot assess shortfall`);
  }
  if (shortfall.eq(0)) {
    if (process.env.ALLOW_NO_SHORTFALL !== "1") {
      throw new Error(
        `${borrower} has no shortfall — not liquidatable. Set ALLOW_NO_SHORTFALL=1 for a forced liquidation of a healthy account.`,
      );
    }
    console.warn(`WARN: ${borrower} has no shortfall — proceeding under ALLOW_NO_SHORTFALL (forced liquidation).`);
  }
  console.log(`borrower ${borrower} shortfall=${ethers.utils.formatEther(shortfall)} (USD-scaled)`);

  // 1 + 2. precompute the exact seize so the quote amount matches what redeem() yields. Mirror the
  // function the on-chain path actually calls for this debt:
  //   - VAI  -> VAIController.liquidateVAIFresh calls liquidateVAICalculateSeizeTokens(vCollateral,
  //             repay): VAI is priced at $1 and the incentive is the borrower-agnostic
  //             getLiquidationIncentive, so the 4-arg overload does NOT apply.
  //   - else -> vToken.liquidateBorrowFresh calls the borrower-aware 4-arg overload (reads the pool the
  //             borrower is actually in). The 3-arg overload always reads Core Pool params and diverges
  //             if the borrower has switched pools.
  const seizeFn = isVai ? "liquidateVAICalculateSeizeTokens" : "liquidateCalculateSeizeTokens";
  const [seizeErr, seizeTokens]: BigNumber[] = isVai
    ? await comptroller.liquidateVAICalculateSeizeTokens(vBStock.address, repay)
    : await comptroller.liquidateCalculateSeizeTokens(borrower, vDebt.address, vBStock.address, repay);
  if (!seizeErr.eq(0)) throw new Error(`${seizeFn} error ${seizeErr}`);
  // A zero seize means the incentive resolved to 0 (e.g. bStock unlisted in the borrower's pool):
  // surface it here rather than building a degenerate quote that reverts on-chain.
  if (seizeTokens.eq(0)) throw new Error(`${seizeFn} returned 0 seize for ${borrower}`);
  const exchangeRate: BigNumber = await vBStock.exchangeRateStored();
  const ONE = BigNumber.from(10).pow(18);

  // The contract routes EVERY repay through the pool-wide Venus Liquidator gate and reverts
  // (ensureNonzeroAddress) when it is unset, so abort here rather than build a call that would revert.
  const gate: string = await comptroller.liquidatorContract();
  if (gate === ethers.constants.AddressZero) {
    throw new Error(
      "Venus Liquidator gate (comptroller.liquidatorContract) is unset — the contract routes every repay through it and reverts when unset",
    );
  }

  // The gate refuses to liquidate an unrelated market while the borrower's VAI debt is above the
  // threshold (Liquidator._checkForceVAILiquidate). Surface that here — naming the VAI-first remedy —
  // rather than burning a settle tx on an on-chain VAIDebtTooHigh revert.
  await assertVaiGateClear({
    provider: ethers.provider,
    gate,
    comptroller: comptroller.address,
    vaiController: vaiControllerAddr,
    vDebt: vDebt.address,
    borrower,
  });

  // The gate keeps a treasury cut of the liquidation BONUS (see Liquidator._splitLiquidationIncentive),
  // so this contract receives fewer vTokens than `seizeTokens`. Deduct that cut, else the precomputed
  // amount overstates our holdings and the fixed-amountIn router pull reverts. On BSC mainnet today this
  // cut is 50% of the bonus (treasuryPercentMantissa = 0.5e18) — not 0 — and is governance-settable.
  let vReceived = seizeTokens;
  const venusLiquidator = new Contract(gate, VENUS_LIQUIDATOR_ABI, signer);
  const liqTreasuryPct: BigNumber = await venusLiquidator.treasuryPercentMantissa();
  if (!liqTreasuryPct.eq(0)) {
    // Mirror the gate EXACTLY: `_splitLiquidationIncentive` sizes the bonus with
    // `getEffectiveLiquidationIncentive(borrower, vCollateral)` for EVERY debt type, VAI included — so
    // use it here regardless of `isVai`. The borrower-agnostic getLiquidationIncentive is only correct
    // for VAI's SEIZE math above (what liquidateVAICalculateSeizeTokens reads); the CUT is always the
    // effective, pool-resolved incentive.
    //   - Non-VAI: the borrower can be in a non-core pool whose vBStock incentive differs from core, so
    //     effective != core is REACHABLE — core here would missize the cut and the fixed router pull.
    //   - VAI: effective == core ALWAYS (a VAI borrower is core-pool-locked — VAIController.mintVAI
    //     requires the core pool and hasValidPoolBorrows bars leaving it while mintedVAIs>0 — so
    //     userPoolId==0). Calling effective is a safe no-op there, keeping one path and staying correct
    //     if that invariant is ever relaxed.
    const totalIncentive: BigNumber = await comptroller.getEffectiveLiquidationIncentive(borrower, vBStock.address);
    const bonusAmount = seizeTokens.mul(totalIncentive.sub(ONE)).div(totalIncentive);
    const treasuryCut = bonusAmount.mul(liqTreasuryPct).div(ONE);
    vReceived = seizeTokens.sub(treasuryCut);
    console.log(
      `Venus Liquidator treasury cut ${ethers.utils.formatEther(liqTreasuryPct)} of bonus -> ` +
        `-${ethers.utils.formatUnits(treasuryCut, 8)} v${bStockSym} (credited ${ethers.utils.formatUnits(vReceived, 8)})`,
    );
  }

  // Core redeem then routes `treasuryPercent` of the redeemed underlying to the treasury, so we hold
  // LESS still. The quote must match what we actually hold, else the Native router pull (fixed
  // amountIn) reverts. 0 today, but governance-settable.
  const treasuryPercent: BigNumber = await comptroller.treasuryPercent();
  const seizedRaw = vReceived.mul(exchangeRate).div(ONE).mul(ONE.sub(treasuryPercent)).div(ONE);
  const seizedHuman = ethers.utils.formatUnits(seizedRaw, bStockDec);
  console.log(`seize ${ethers.utils.formatUnits(seizeTokens, 8)} v${bStockSym} -> ~${seizedHuman} ${bStockSym}`);

  // `seizedRaw` is derived from oracle prices at quote time. If the bStock price ticks UP before the
  // settle tx lands, Comptroller seizes FEWER bStock than this — but the Native firm quote bakes in a
  // FIXED amountIn and the contract approves only the actual seized amount to the router, so an amountIn
  // above the real seize makes the router pull more than approved and revert SwapFailed(). Quote for
  // `seizeBufferPct` LESS so amountIn stays at/below the real seize across small upward drift; the tiny
  // unsold remainder just accrues as bStock inventory (recoverable via sweep).
  const seizedForQuote = seizedRaw.mul(Math.round((100 - seizeBufferPct) * 100)).div(10000);
  const seizedHumanQuote = ethers.utils.formatUnits(seizedForQuote, bStockDec);

  // 3. Build the swap, taker = the LIQUIDATOR CONTRACT (so it can submit + receive the debt asset).
  // The contract measures proceeds in the DEBT asset and enforces `minOut` in it. The RFQ sources only
  // quote bStock->USDT on BSC (every bStock pair in the live orderbooks is *<->USDT), so:
  //   - USDT debt  -> single hop: the hop-1 bStock->USDT is already the debt asset.
  //   - other debt -> two hops:   bStock->USDT (hop 1, from the source registry), then USDT->debt via an
  //                               allowlisted AMM/aggregator (hop 2, see lib/amm.ts). `minOut` is in the
  //                               debt asset across the whole chain; `amountOut` below is the FINAL debt out.
  const usdtOut = ethers.utils.getAddress(process.env.USDT_ADDR || BSC_USDT);
  const twoHop = debt.address.toLowerCase() !== usdtOut.toLowerCase();

  let router: string;
  let swapCalldata: string;
  let amountOut: BigNumber; // final debt-asset out — display / expected proceeds
  // The number minOut is derived from. It must be the GUARANTEED worst-case debt-asset out, not the
  // indicative one: for a single-hop firm quote these coincide, but for a single-hop INDICATIVE winner
  // (Liquid Mesh) the built order can fill anywhere down to its own floor, so deriving minOut off the
  // indicative `out` would set minOut above what the fill guarantees and revert InsufficientOut on a
  // perfectly in-slippage fill. Two-hop already sizes off the floor via `amm.expectedOut`.
  let minOutBasis: BigNumber;
  let router2 = ethers.constants.AddressZero;
  let swapCalldata2 = "0x";
  let intermediateToken = ethers.constants.AddressZero;
  // On-chain deadline mirrors the RFQ quote's own expiry; the mock/fork path never expires.
  let deadline: BigNumber = ethers.constants.MaxUint256;

  if (process.env.MOCK_NATIVE) {
    // Fork/local-test path: MOCK_NATIVE = "<router>:<calldata>" (hop 1), optional MOCK_AMM = same for
    // hop 2, both pre-encoded against a MockNativeRouter. MOCK_OUT is the FINAL debt out.
    const [r, data] = process.env.MOCK_NATIVE.split(":");
    router = ethers.utils.getAddress(r);
    swapCalldata = data;
    amountOut = BigNumber.from(process.env.MOCK_OUT || "0");
    minOutBasis = amountOut; // mock path has no floor/indicative distinction
    if (process.env.MOCK_AMM) {
      const [r2, data2] = process.env.MOCK_AMM.split(":");
      router2 = ethers.utils.getAddress(r2);
      swapCalldata2 = data2;
      intermediateToken = usdtOut;
    }
  } else {
    // Hop 1: bStock -> USDT (bStock pairs only with USDT on BSC). Sources come from the registry
    // (lib/sources.ts); `SOURCE` selects them — "auto" (default) prices every available source and takes
    // the higher out, or a comma-separated subset (e.g. "native,liquidmesh"). Liquid Mesh re-serves the
    // same `rfq_native` book plus extra makers, matching or marginally beating Native and going deeper on
    // some tails.
    const hop1 = await pickHop1Source({
      taker: liquidator.address,
      tokenIn: bStock.address,
      usdtOut,
      humanAmount: seizedHumanQuote,
      weiAmount: seizedForQuote,
      slippage,
    });
    const ttl = hop1.deadline.toNumber() - Math.floor(Date.now() / 1000);
    if (ttl <= 0) throw new Error(`${hop1.source} quote already expired — refetch`);
    deadline = hop1.deadline; // settle tx reverts on-chain past the quote's expiry
    router = hop1.router;
    swapCalldata = hop1.calldata;
    const midOut = hop1.out; // USDT out of hop 1 — indicative for a non-firm source (LM); display only
    // What hop 1 is GUARANTEED to deliver. For a firm source (Native) this equals `out`; for an indicative
    // one (Liquid Mesh `/quote`) it is the built order's own floor, which is all the fill is bound by.
    const midFloor = hop1.floor;
    console.log(
      `hop-1 source: ${hop1.source} (out=${ethers.utils.formatUnits(midOut, 18)} USDT, ` +
        `floor=${ethers.utils.formatUnits(midFloor, 18)} USDT)`,
    );

    if (twoHop) {
      // Hop 2: convert the hop-1 USDT to the (non-USDT) debt asset. For VAI the leg is the Peg Stability
      // Module (`swapStableForVAI` mints VAI from USDT at the oracle rate; calldata encoded locally in
      // lib/psm.ts — no aggregator involved); every other debt goes through an allowlisted AMM/aggregator.
      // Size this leg off the hop-1 FLOOR, not the indicative `out`: on-chain the contract approves router2
      // for the ACTUAL hop-1 delta (`midDelta`), while this calldata bakes in a fixed `amountIn`. Quote it
      // at `out` and an indicative source that fills even slightly under would leave the router pulling
      // more than the approval — hop 2 reverts on allowance. `floor <= midDelta` always holds, so the pull
      // always fits. Any surplus (`midDelta - floor`, bounded by slippage) stays as USDT inventory and the
      // contract emits `PartialSwapLeftover` for it — sweepable, not lost.
      const amm = isVai
        ? await getPsmSwap({ amountIn: midFloor, recipient: liquidator.address }, ethers.provider)
        : await getAmmSwap(
            {
              tokenIn: usdtOut,
              tokenOut: debt.address,
              amountIn: midFloor.toString(),
              recipient: liquidator.address,
              slippage,
            },
            ethers.provider,
          );
      router2 = ethers.utils.getAddress(amm.router);
      swapCalldata2 = amm.calldata;
      intermediateToken = usdtOut;
      amountOut = BigNumber.from(amm.expectedOut);
      minOutBasis = amountOut; // hop-2 expectedOut is already computed off the hop-1 floor
      console.log(
        `${hop1.source}: ${seizedHumanQuote} ${bStockSym} -> ${ethers.utils.formatUnits(midOut, 18)} USDT (TTL ${ttl}s, ${router}); ` +
          `AMM: -> ${ethers.utils.formatUnits(amountOut, debtDec)} ${debtSym} (${router2})`,
      );
    } else {
      // USDT debt: the single hop IS the debt asset. Display the indicative out, but derive minOut from
      // the built order's GUARANTEED floor (== out for a firm Native quote; the built worst-case for an
      // indicative Liquid Mesh order), so an in-slippage LM fill below the indicative quote still clears.
      amountOut = midOut;
      minOutBasis = midFloor;
      console.log(
        `${hop1.source} quote: ${seizedHumanQuote} ${bStockSym} -> ${ethers.utils.formatUnits(amountOut, debtDec)} ${debtSym} ` +
          `(floor ${ethers.utils.formatUnits(midFloor, debtDec)}, TTL ${ttl}s, router ${router})`,
      );
    }
  }

  // Both hop routers must be allowlisted on the liquidator (the low-level call is defended by isRouter).
  const routers = router2 !== ethers.constants.AddressZero ? [router, router2] : [router];
  for (const r of routers) {
    if (!(await liquidator.isRouter(r))) {
      throw new Error(`router ${r} is not allowlisted on the liquidator — call setRouter first`);
    }
  }

  // minOut = the GUARANTEED basis minus an extra safety buffer on top of the quote slippage.
  const minOut = minOutBasis.mul(Math.round((100 - minOutBufferPct) * 100)).div(10000);

  const params = {
    borrower,
    vDebt: vDebt.address,
    vBStock: vBStock.address,
    repayAmount: repay,
    router,
    swapCalldata,
    minOut,
    router2,
    swapCalldata2,
    intermediateToken,
    deadline,
  };

  // Inventory mode spends the contract's own debt-asset balance; warn early if it can't cover the
  // repay so the failure is legible off-chain instead of a bare on-chain revert. (Flash mode borrows.)
  if (mode !== "flash") {
    const inventory: BigNumber = await debt.balanceOf(liquidator.address);
    if (inventory.lt(repay)) {
      console.warn(
        `WARN: liquidator holds ${ethers.utils.formatUnits(inventory, debtDec)} ${debtSym} < repay ` +
          `${env("REPAY_AMOUNT")} ${debtSym} — fund it or use MODE=flash, else liquidate() will revert.`,
      );
    }
  }

  // Re-verify the hop-1 quote's remaining TTL immediately before submission. Everything since the
  // initial TTL check — the two-hop AMM round-trip, the isRouter reads, the inventory check — consumes
  // real wall-clock, so the quote may have drifted close to (or past) expiry. Abort + refetch here
  // rather than relying solely on the on-chain DeadlineExpired backstop and wasting gas. Skipped when
  // `deadline` is the sentinel (mock/fork path, which never expires).
  if (!deadline.eq(ethers.constants.MaxUint256)) {
    const remainingTtl = deadline.toNumber() - Math.floor(Date.now() / 1000);
    if (remainingTtl < settleTtlMarginSec) {
      throw new Error(
        `hop-1 quote TTL ${remainingTtl}s is below the ${settleTtlMarginSec}s safety margin before submit — refetch`,
      );
    }
  }

  // 4. settle.
  const fn = mode === "flash" ? "flashLiquidate" : "liquidate";
  console.log(`mode=${mode} -> ${fn}(...) minOut=${ethers.utils.formatUnits(minOut, debtDec)} ${debtSym}`);
  if (dryRun) {
    await liquidator.callStatic[fn](params);
    console.log("  [dry-run] would succeed");
    return;
  }
  const tx = await liquidator[fn](params);
  const rcpt = await tx.wait();
  console.log(`  ${fn} mined: ${rcpt.transactionHash} (gas ${rcpt.gasUsed.toString()})`);
}

async function main() {
  let signer: Signer;
  if (process.env.IMPERSONATE) {
    const { impersonateAccount, setBalance } = await import("@nomicfoundation/hardhat-network-helpers");
    await impersonateAccount(process.env.IMPERSONATE);
    await setBalance(process.env.IMPERSONATE, ethers.utils.parseEther("10"));
    signer = await ethers.getSigner(process.env.IMPERSONATE);
  } else {
    [signer] = await ethers.getSigners();
  }
  console.log(`caller: ${await signer.getAddress()} (dryRun=${process.env.DRY_RUN === "1"})`);
  await atomicLiquidate(signer);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
