/**
 * Hop-1 liquidity-source REGISTRY (bStock -> USDT).
 *
 * Each source (Native RFQ, Liquid Mesh, and any future aggregator) implements the small `QuoteSource`
 * interface below and is listed in `SOURCES`. The selection logic in atomic-liquidate.ts is generic over
 * this array — it prices every selected+available source and takes the higher out — so ADDING A SOURCE is
 * a localized change: write one adapter (the source's own auth/quote/calldata shape can't be config-only)
 * and push it here. No change to the comparison logic, and NO on-chain change or redeploy — on-chain the
 * contract is already source-agnostic (allowlist the router with `setRouter` + `setRouterSpender`).
 *
 * `SOURCE` env selects which are active: "auto" (default) = every available source; or a comma-separated
 * subset by `name` (e.g. "native,liquidmesh"). A source whose required creds are absent reports
 * `available() = false` and is skipped.
 */
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { buildSwap as lmBuildSwap, getQuote as lmGetQuote } from "./liquidmesh";
import { getFirmQuote, quoteDeadline } from "./native";

/** Inputs shared by every source's hop-1 quote (bStock -> USDT). */
export interface QuoteArgs {
  taker: string; // the liquidator contract (msg.sender at execution; proceeds recipient)
  tokenIn: string; // bStock
  usdtOut: string; // USDT (hop-1 output)
  humanAmount: string; // seize amount, human units (Native takes human)
  weiAmount: BigNumber; // seize amount, base units (Liquid Mesh takes wei)
  slippage: number; // percent, e.g. 0.5
}

/** The executable route a source resolves to once it wins the comparison. */
export interface BuiltRoute {
  router: string; // swap call target (allowlist this on the contract)
  calldata: string; // opaque blob forwarded by `_swap`
  deadline: BigNumber; // unix seconds — the quote's on-chain expiry
  builtFloor: BigNumber; // the built order's own worst-case out — what the fill is actually bound by
}

/**
 * A priced quote. `out` drives the winner comparison; `build()` produces the executable calldata and is
 * only called for the winner — so a source that needs a second round-trip to build (e.g. Liquid Mesh's
 * `/swap`) does not pay it when it loses. Native already holds the calldata from its quote, so its
 * `build()` just returns it (no extra network call).
 *
 * `firm` says whether `out` is BINDING for the executed fill (Native firm-quote: yes) or merely
 * indicative (Liquid Mesh `/quote`: the separately built `/swap` order may fill lower, down to the
 * built order's own floor). The winner selection compares `out`s, so an indicative winner is
 * re-checked after build against the best firm loser (see pickHop1Source) — otherwise an optimistic
 * indicative quote could beat a firm one and then fill worse than the firm one guaranteed.
 */
export interface SourceQuote {
  out: BigNumber;
  firm: boolean;
  build: () => Promise<BuiltRoute>;
}

export interface QuoteSource {
  name: string;
  /** True when the source's required env/creds are present; false ones are skipped in "auto". */
  available: () => boolean;
  /** Fetch a price + a lazy builder for the executable route. */
  getQuote: (a: QuoteArgs) => Promise<SourceQuote>;
}

// --------------------------------------------------------------------------- //
//                               Native RFQ                                    //
// --------------------------------------------------------------------------- //

const nativeSource: QuoteSource = {
  name: "native",
  available: () => !!process.env.NATIVE_API_KEY,
  async getQuote(a) {
    const q = await getFirmQuote({
      fromAddress: a.taker,
      tokenIn: a.tokenIn,
      tokenOut: a.usdtOut,
      amount: a.humanAmount,
      slippage: a.slippage,
    });
    const out = BigNumber.from(q.amountOut);
    return {
      out,
      firm: true, // MM-signed firm quote: `amountOut` is the executed fill, not an estimate
      // Firm-quote already carries the executable txRequest — build is immediate, no re-fetch.
      build: async () => ({
        router: q.txRequest.target,
        calldata: q.txRequest.calldata,
        deadline: BigNumber.from(quoteDeadline(q)),
        builtFloor: out, // firm: the quote IS the floor
      }),
    };
  },
};

// --------------------------------------------------------------------------- //
//                               Liquid Mesh                                   //
// --------------------------------------------------------------------------- //

const liquidMeshSource: QuoteSource = {
  name: "liquidmesh",
  available: () => !!process.env.LM_API_KEY && !!process.env.LM_PRIVATE_KEY_SEED,
  async getQuote(a) {
    const quote = await lmGetQuote({
      userAddress: a.taker,
      tokenIn: a.tokenIn,
      tokenOut: a.usdtOut,
      amountWei: a.weiAmount.toString(),
    });
    const out = BigNumber.from(quote.outputAmount);
    return {
      out,
      firm: false, // `/quote` is indicative; the built `/swap` order may fill lower, down to `builtFloor`
      // `/swap` (disableSimulate:true) is only fetched if Liquid Mesh wins — avoids a wasted order build.
      build: async () => {
        // The order's own floor (`outputAmount`); LM also applies `slippageBps`, so the effective on-chain
        // floor may be slightly looser than this. That is fine — the CONTRACT's `minOut` is the real guard;
        // this floor only bounds how far LM itself will let the fill slip.
        const minFloor = out.mul(Math.round((100 - a.slippage) * 100)).div(10000);
        const swap = await lmBuildSwap({
          userAddress: a.taker,
          tokenIn: a.tokenIn,
          tokenOut: a.usdtOut,
          amountWei: a.weiAmount.toString(),
          minOutWei: minFloor.toString(),
          routePlans: quote.routePlans,
          slippageBps: Math.round(a.slippage * 100),
        });
        return {
          // Use the router LM actually wants called (`callMsg.to`); it is `LM_ROUTER` today, but relying on
          // the response keeps us correct if LM rotates it. The on-chain `isRouter` allowlist still gates it.
          router: ethers.utils.getAddress(swap.callMsg.to),
          calldata: swap.callMsg.data,
          deadline: BigNumber.from(swap.expiryTimestamp),
          builtFloor: minFloor, // the built order fills no lower than the floor we asked of it
        };
      },
    };
  },
};

// --------------------------------------------------------------------------- //
//                                Registry                                     //
// --------------------------------------------------------------------------- //

/** All known hop-1 sources. Add a new aggregator by pushing its adapter here — nothing else changes. */
export const SOURCES: QuoteSource[] = [nativeSource, liquidMeshSource];

/** Resolve the `SOURCE` env to the active source list: "auto" = every available source, else a subset. */
export function selectedSources(): QuoteSource[] {
  const raw = (process.env.SOURCE || "auto").toLowerCase().trim();
  if (raw === "auto") return SOURCES.filter(s => s.available());
  const names = raw.split(",").map(s => s.trim());
  const picked = SOURCES.filter(s => names.includes(s.name));
  const unknown = names.filter(n => !SOURCES.some(s => s.name === n));
  if (unknown.length)
    throw new Error(`unknown SOURCE(s): ${unknown.join(", ")}. Known: ${SOURCES.map(s => s.name).join(", ")}`);
  const unavailable = picked.filter(s => !s.available());
  if (unavailable.length) {
    throw new Error(`SOURCE(s) missing required creds: ${unavailable.map(s => s.name).join(", ")}`);
  }
  return picked;
}
