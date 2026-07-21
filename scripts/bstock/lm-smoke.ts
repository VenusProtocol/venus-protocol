/**
 * Smoke test for the Liquid Mesh integration.
 *
 * The Liquid Mesh counterpart of native-smoke.ts: fetches a live `/quote` (bStock -> USDT) so we can
 * eyeball price, output, price impact and the route split before an incident. READ-ONLY — it calls
 * `/quote` only, never `/swap`. (An executable `/swap` blob and its on-chain fill are covered separately
 * by verify-lm-fork.ts.)
 *
 * Unlike Native, Liquid Mesh exposes no orderbook endpoint, so the token is given by ADDRESS. The only
 * chain read is a best-effort `symbol()` for a friendly label (falls back to the address if no RPC is
 * reachable); the quote path itself is fully off-chain. bStock tokens are 18-decimals on BSC, so `AMOUNT`
 * is treated as 1e18 units — no `decimals()` call.
 *
 * There is also no quote-level TTL: a Liquid Mesh `/quote` is indicative and only the built `/swap` order
 * carries an `expiryTimestamp`. This probe just confirms the quote path is alive and priced.
 *
 * Usage:
 *   LM_API_KEY=... LM_PRIVATE_KEY_SEED=... npx hardhat run scripts/bstock/lm-smoke.ts
 *
 * Env:
 *   LM_API_KEY           (required) Liquid Mesh API key
 *   LM_PRIVATE_KEY_SEED  (required) Ed25519 private-key seed, base64url (decodes to 32 bytes)
 *   BSTOCK               bStock token address to sell (default TSLAB 0x5b19…292f)
 *   AMOUNT               amount of bStock to sell, human units (default 1)
 *   FROM                 taker address used for pricing (default 0x..dEaD)
 *   RPC_URL              optional BSC RPC override for the symbol() label; otherwise reuses
 *                        ARCHIVE_NODE_bscmainnet, then falls back to a public dataseed
 */
import { Contract, providers, utils } from "ethers";

import { LM_BSC_USDT, getQuote } from "./lib/liquidmesh";

const DEFAULT_BSTOCK = "0x5b1910eAaD6450E50f816082Aa078C41F10C292f"; // TSLAB
const DEFAULT_RPC = "https://bsc-dataseed.bnbchain.org";

// Best-effort token symbol for a readable label; fall back to the address if no RPC or no symbol().
// Reuse the archive node the rest of the suite already uses; RPC_URL overrides, public dataseed is last.
async function symbolOf(addr: string): Promise<string> {
  try {
    const rpc = process.env.RPC_URL || process.env.ARCHIVE_NODE_bscmainnet || DEFAULT_RPC;
    const provider = new providers.JsonRpcProvider(rpc);
    return await new Contract(addr, ["function symbol() view returns (string)"], provider).symbol();
  } catch {
    return addr;
  }
}

async function main() {
  const tokenIn = utils.getAddress(process.env.BSTOCK || DEFAULT_BSTOCK);
  const amount = process.env.AMOUNT || "1";
  const from = process.env.FROM || "0x000000000000000000000000000000000000dEaD";
  const amountWei = utils.parseUnits(amount, 18).toString(); // bStock is 18-dec on BSC
  const sym = await symbolOf(tokenIn);

  console.log(`\nLiquid Mesh quote: ${amount} ${sym} (${tokenIn}) -> USDT`);
  const q = await getQuote({ userAddress: from, tokenIn, tokenOut: LM_BSC_USDT, amountWei });

  const amtIn = Number(q.inputAmount) / 1e18;
  const amtOut = Number(q.outputAmount) / 1e18; // USDT is 18 decimals on BSC
  console.log(`  amountIn : ${amtIn} ${sym}`);
  console.log(`  amountOut: ${amtOut} USDT`);
  console.log(`  px/token : ${amtIn ? (amtOut / amtIn).toFixed(4) : "?"} USDT`);
  // indicative: an LM /quote is a routed estimate — it carries price-impact / mid-price / route split and
  // an est. gas, but NO deadline (only the built /swap order gets one), unlike a firm Native RFQ.
  console.log(`  -- indicative --`);
  if (q.priceImpactPct !== undefined) console.log(`  priceImp : ${q.priceImpactPct}%`);
  if (q.midPrice !== undefined) console.log(`  midPrice : ${q.midPrice}`);
  if (q.estimatedGas !== undefined) console.log(`  est. gas : ${q.estimatedGas}`);
  // Route split — which makers/dexes filled and at what weight (bps out of 10000).
  const dexes = q.routePlans?.[0]?.subRouters?.[0]?.dexes ?? [];
  const route = dexes.map(d => `${d.dex}:${(d.weight / 100).toFixed(0)}%`).join(" ");
  console.log(`  route    : ${route || "(none reported)"}`);
  console.log(`  deadline : none at quote time (set only on the built /swap order)`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
