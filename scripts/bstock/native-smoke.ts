/**
 * Smoke test for the Native Swap API integration (no chain interaction).
 *
 * The Native counterpart of lm-smoke.ts: fetches a live firm-quote (bStock -> USDT) so we can eyeball
 * price, TTL and the executable router before an incident. Prints the shared shape (amountIn/amountOut,
 * px/token) plus a `firm-only` block (deadline/TTL, txRequest router, order count) that a firm MM-signed
 * RFQ carries but an indicative Liquid Mesh quote does not. The token address is resolved from the live
 * Native orderbook by symbol (`TOKEN`); the orderbook itself is not printed.
 *
 * Usage:
 *   NATIVE_API_KEY=... npx hardhat run scripts/bstock/native-smoke.ts
 *
 * Options (env):
 *   NATIVE_API_KEY=... TOKEN=NVDAB AMOUNT=5 npx hardhat run scripts/bstock/native-smoke.ts
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

  // Resolve the token address from the live orderbook (the source of truth) rather than a hardcoded map,
  // so this stays correct as Native lists more bStock tokens. tokenIn is the sell-side base (quote = USDT).
  const ob = await getOrderbook("bsc");
  const tokenIn = ob.find(r => r.base_symbol === symbol && r.quote_symbol === "USDT")?.base_address;
  if (!tokenIn) throw new Error(`No ${symbol}<->USDT pair in the Native bsc orderbook`);

  // Shared shape with lm-smoke.ts (amountIn / amountOut / px/token), then the Native-firm-only extras.
  console.log(`\nNative quote: ${amount} ${symbol} (${tokenIn}) -> USDT`);
  const q = await getFirmQuote({ fromAddress: from, tokenIn, tokenOut: BSC_USDT, amount, slippage: 0.5 });
  const amtIn = Number(q.amountIn) / 1e18;
  const amtOut = Number(q.amountOut) / 1e18; // USDT is 18 decimals on BSC
  console.log(`  amountIn : ${amtIn} ${symbol}`);
  console.log(`  amountOut: ${amtOut} USDT`);
  console.log(`  px/token : ${amtIn ? (amtOut / amtIn).toFixed(4) : "?"} USDT`);
  // firm-only: a Native RFQ is an MM-signed, single-fill order — so it carries an executable txRequest,
  // a signed deadline, and the order objects (no route split / price-impact, unlike an indicative LM quote).
  console.log(`  -- firm-only --`);
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
