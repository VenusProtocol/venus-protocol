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
 *   TOKEN            bStock symbol to quote: TSLAB | NVDAB   (default TSLAB)
 *   AMOUNT           amount of bStock to sell, human units   (default 1)
 *   FROM             taker address                           (default 0x..dEaD)
 */
import { BSC_USDT, BSTOCK_TOKENS, getFirmQuote, getOrderbook, quoteDeadline } from "./lib/native";

async function main() {
  const symbol = (process.env.TOKEN || "TSLAB") as keyof typeof BSTOCK_TOKENS;
  const tokenIn = BSTOCK_TOKENS[symbol];
  if (!tokenIn) throw new Error(`Unknown TOKEN ${symbol}; use TSLAB or NVDAB`);
  const amount = process.env.AMOUNT || "1";
  const from = process.env.FROM || "0x000000000000000000000000000000000000dEaD";

  console.log(`\nOrderbook (bsc) entries for ${symbol}:`);
  const ob = await getOrderbook("bsc");
  for (const r of ob) {
    if (`${r.base_symbol}${r.quote_symbol}`.includes(symbol)) {
      console.log(`  ${r.base_symbol} <-> ${r.quote_symbol}`);
    }
  }

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
