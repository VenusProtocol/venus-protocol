/**
 * Smoke test for the Native Swap API integration (no chain interaction).
 *
 * Prints the BSC orderbook entries for our bStock tokens and fetches a live
 * firm-quote so we can eyeball price, spread, TTL and the returned txRequest.
 *
 * Usage:
 *   NATIVE_API_KEY=... npx hardhat run scripts/bstock/native-quote.ts
 *
 * Options (env):
 *   NATIVE_API_KEY=... TOKEN=NVDAB AMOUNT=5 npx hardhat run scripts/bstock/native-quote.ts
 *
 * Env:
 *   NATIVE_API_KEY   (required) Native Swap API key
 *   TOKEN            bStock symbol to quote, any listed in the orderbook (default TSLAB)
 *   AMOUNT           amount of bStock to sell, human units   (default 1)
 *   FROM             taker address                           (default 0x..dEaD)
 */
import { BSC_USDT, getFirmQuote, getOrderbook, quoteDeadline } from "./lib/native";

async function main() {
  const symbol = process.env.TOKEN || "TSLAB";
  const amount = process.env.AMOUNT || "1";
  const from = process.env.FROM || "0x000000000000000000000000000000000000dEaD";

  // Resolve the token address from the live orderbook (the source of truth) rather than a hardcoded
  // map, so this stays correct as Native lists more bStock tokens. `tokenIn` is the sell-side base
  // (base = symbol, quote = USDT).
  console.log(`\nOrderbook (bsc) entries for ${symbol}:`);
  const ob = await getOrderbook("bsc");
  let tokenIn: string | undefined;
  for (const r of ob) {
    if (`${r.base_symbol}${r.quote_symbol}`.includes(symbol)) {
      console.log(`  ${r.base_symbol} <-> ${r.quote_symbol}`);
    }
    if (r.base_symbol === symbol && r.quote_symbol === "USDT") tokenIn = r.base_address;
  }
  if (!tokenIn) throw new Error(`No ${symbol}<->USDT pair in the Native bsc orderbook`);

  console.log(`\nFirm quote: ${amount} ${symbol} -> USDT`);
  const q = await getFirmQuote({ fromAddress: from, tokenIn, tokenOut: BSC_USDT, amount, slippage: 0.5 });
  const amtIn = Number(q.amountIn) / 1e18;
  const amtOut = Number(q.amountOut) / 1e18; // USDT is 18 decimals on BSC
  console.log(`  amountIn : ${amtIn} ${symbol}`);
  console.log(`  amountOut: ${amtOut} USDT`);
  console.log(`  px/token : ${(amtOut / amtIn).toFixed(4)} USDT`);
  const dl = quoteDeadline(q);
  console.log(`  deadline : ${dl} (${dl ? Math.max(0, dl - Math.floor(Date.now() / 1000)) : "?"}s TTL)`);
  console.log(`  router   : ${q.txRequest?.target}`);
  console.log(`  orders   : ${q.orders?.length}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
