/**
 * AMM / aggregator client for the OPTIONAL second swap hop (intermediate -> debt).
 *
 * Hop 1 of an atomic bStock liquidation always sells bStock -> USDT through the Native RFQ router
 * (Native quotes bStock -> USDT only on BSC). For a non-USDT debt market the contract needs a second
 * hop that converts that USDT to the debt asset (BTCB, ETH, CAKE, ...). The on-chain contract forwards
 * an OPAQUE calldata blob to an allowlisted router and enforces its own `minOut` in the debt asset, so
 * it is DEX-agnostic: this module just returns `{ router, calldata, expectedOut }` from whichever
 * provider is configured.
 *
 * Provider is selected by env `AMM_PROVIDER`:
 *   - "kyberswap" (default) — keyless aggregator; routes/route-build return router + calldata + out.
 *   - "openocean"           — keyless (free tier) aggregator; /swap returns to + data + outAmount.
 *   - "pcsv2"               — offline/CI fallback: encode PancakeSwap V2 `swapExactTokensForTokens`
 *                             locally; expected out from the router's `getAmountsOut` view.
 *
 * The returned `router` MUST be allowlisted on the liquidator (`setRouter`), and the swap recipient
 * encoded inside `calldata` is the liquidator contract, so the debt asset lands where the on-chain
 * `minOut` check reads it. The contract's `minOut` is the source of truth; a provider's internal
 * min-out (baked into the calldata from `slippage`) is only a secondary bound.
 */
import { BigNumber, Contract, providers, utils } from "ethers";

// PancakeSwap V2 router on BSC mainnet (used only by the "pcsv2" offline provider / its default path).
export const PCS_V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
export const BSC_WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

export interface AmmSwapParams {
  chain?: string; // default "bsc"
  tokenIn: string; // intermediate (USDT)
  tokenOut: string; // debt asset
  // Wei of tokenIn to sell. Providers bake this into the swap calldata as a FIXED input amount, while
  // the contract approves router2 only the ACTUAL on-chain hop-1 output (`midDelta`). Pass the hop-1
  // FLOOR (the built order's guaranteed worst-case out), NOT its indicative quote: the invariant
  // `floor <= midDelta` then always holds, so the fixed pull fits inside the approval and any surplus
  // (`midDelta - floor`) stays as sweepable intermediate inventory. Sizing this off the indicative
  // `out` instead would let an under-filling hop-1 leave the router pulling more than approved
  // (`SwapFailed()`). See atomic-liquidate.ts (hop-2 sizing) — do NOT change this back to `out`.
  amountIn: string;
  recipient: string; // where the debt asset must land (the liquidator contract)
  slippage: number; // percent, e.g. 0.5
}

export interface AmmSwap {
  router: string; // the `to` to allowlist + forward calldata to
  calldata: string; // opaque swap calldata blob
  expectedOut: string; // wei of tokenOut expected (used to derive the contract minOut)
}

function provider(): string {
  return (process.env.AMM_PROVIDER || "kyberswap").toLowerCase();
}

/** Resolve the hop-2 swap for the configured provider. `rpc` is required only by the "pcsv2" path. */
export async function getAmmSwap(p: AmmSwapParams, rpc?: providers.Provider): Promise<AmmSwap> {
  switch (provider()) {
    case "kyberswap":
      return kyberswap(p);
    case "openocean":
      return openocean(p);
    case "pcsv2":
      return pcsv2(p, rpc);
    default:
      throw new Error(`unknown AMM_PROVIDER "${process.env.AMM_PROVIDER}" (use kyberswap|openocean|pcsv2)`);
  }
}

/** KyberSwap aggregator: GET /routes (best route + amountOut) then POST /route/build (executable tx). */
async function kyberswap(p: AmmSwapParams): Promise<AmmSwap> {
  const chain = p.chain || "bsc";
  const clientId = process.env.KYBER_CLIENT_ID || "venus-bstock-liquidator";
  const base = process.env.KYBER_API_BASE || `https://aggregator-api.kyberswap.com/${chain}/api/v1`;

  const qs = new URLSearchParams({ tokenIn: p.tokenIn, tokenOut: p.tokenOut, amountIn: p.amountIn }).toString();
  const rRes = await fetch(`${base}/routes?${qs}`, { headers: { "x-client-id": clientId } });
  const rBody: any = await rRes.json();
  if (rBody.code !== 0 || !rBody.data?.routeSummary) {
    throw new Error(`KyberSwap /routes failed: ${rBody.message || JSON.stringify(rBody).slice(0, 200)}`);
  }

  const bRes = await fetch(`${base}/route/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-client-id": clientId },
    body: JSON.stringify({
      routeSummary: rBody.data.routeSummary,
      sender: p.recipient,
      recipient: p.recipient,
      slippageTolerance: Math.round(p.slippage * 100), // percent -> bips
      source: clientId,
    }),
  });
  const bBody: any = await bRes.json();
  if (bBody.code !== 0 || !bBody.data?.data) {
    throw new Error(`KyberSwap /route/build failed: ${bBody.message || JSON.stringify(bBody).slice(0, 200)}`);
  }
  return {
    router: utils.getAddress(bBody.data.routerAddress),
    calldata: bBody.data.data,
    expectedOut: String(bBody.data.amountOut ?? rBody.data.routeSummary.amountOut),
  };
}

/** OpenOcean v4: GET /swap returns { to, data, outAmount } directly (account = recipient is required). */
async function openocean(p: AmmSwapParams): Promise<AmmSwap> {
  const chain = p.chain || "bsc";
  const base = process.env.OPENOCEAN_API_BASE || `https://open-api.openocean.finance/v4/${chain}`;
  const gasPriceGwei = process.env.OPENOCEAN_GAS_GWEI || "3";
  const qs = new URLSearchParams({
    inTokenAddress: p.tokenIn,
    outTokenAddress: p.tokenOut,
    amountDecimals: p.amountIn, // raw wei
    gasPrice: gasPriceGwei, // gwei, no decimals
    slippage: String(p.slippage),
    account: p.recipient,
  }).toString();
  const res = await fetch(`${base}/swap?${qs}`);
  const body: any = await res.json();
  if (String(body.code) !== "200" || !body.data?.data) {
    throw new Error(`OpenOcean /swap failed: ${body.message || JSON.stringify(body).slice(0, 200)}`);
  }
  return {
    router: utils.getAddress(body.data.to),
    calldata: body.data.data,
    expectedOut: String(body.data.outAmount),
  };
}

/**
 * Offline / CI fallback: encode PancakeSwap V2 `swapExactTokensForTokens` locally and read the
 * expected out from the router's `getAmountsOut` view. Path from `AMM_PATH` (comma-separated), else
 * a direct [tokenIn, tokenOut] pair; set AMM_PATH to route through WBNB when there is no direct pool.
 *
 * Caveat: `amountIn` is encoded verbatim as the V2 `amountIn`, so the router pulls exactly that many
 * tokens. The contract approves router2 only the actual hop-1 output (`midDelta`), so if `midDelta`
 * is even 1 wei below the `amountIn` passed here the pull exceeds the approval and the hop reverts
 * `SwapFailed()` with no further detail. The caller passes the hop-1 FLOOR, and `floor <= midDelta`
 * always holds, so the pull fits; do not hand this the indicative quote or a stale/rounded value.
 */
async function pcsv2(p: AmmSwapParams, rpc?: providers.Provider): Promise<AmmSwap> {
  if (!rpc) throw new Error("pcsv2 AMM provider needs an RPC provider (pass one to getAmmSwap)");
  const router = utils.getAddress(process.env.AMM_ROUTER || PCS_V2_ROUTER);
  const path = (process.env.AMM_PATH ? process.env.AMM_PATH.split(",") : [p.tokenIn, p.tokenOut]).map(a =>
    utils.getAddress(a.trim()),
  );

  const iface = new utils.Interface([
    "function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[])",
    "function getAmountsOut(uint256 amountIn,address[] path) view returns (uint256[])",
  ]);
  const amounts: BigNumber[] = await new Contract(router, iface, rpc).getAmountsOut(p.amountIn, path);
  const expectedOut = amounts[amounts.length - 1];
  const amountOutMin = expectedOut.mul(Math.round((100 - p.slippage) * 100)).div(10000);
  const deadline = Math.floor(Date.now() / 1000) + Number(process.env.AMM_DEADLINE_SECS || "1200");

  const calldata = iface.encodeFunctionData("swapExactTokensForTokens", [
    p.amountIn,
    amountOutMin,
    path,
    p.recipient,
    deadline,
  ]);
  return { router, calldata, expectedOut: expectedOut.toString() };
}
