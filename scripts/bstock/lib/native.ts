/**
 * Native (nativefi) Swap API client — same-chain RFQ ("FirmQuote").
 *
 * Native is the designated market maker for bStock (ERC-8056 tokenized stocks)
 * on BNB Chain. It quotes bStock <-> USDT directly. A `firm-quote` returns a
 * ready-to-send `txRequest` (target/calldata/value) plus the MM's signed
 * order(s) with a `deadlineTimestamp` (TTL). The taker (our liquidator EOA or
 * contract) submits `txRequest` on-chain to settle.
 *
 * Auth: HTTP header `api_key`. Provide via env `NATIVE_API_KEY` — never commit it.
 *
 * Endpoints (base `https://v2.api.native.org/swap-api-v2/v1`):
 *   GET /orderbook?chain=bsc          supported pairs
 *   GET /indicative-quote             price only (no executable tx)
 *   GET /firm-quote                   executable order + txRequest
 *
 * Note: the `/bridge/*` variants are cross-chain and use a different auth scope.
 */

const DEFAULT_BASE = "https://v2.api.native.org/swap-api-v2/v1";

export interface NativeOrder {
  pool: string;
  signer: string;
  recipient: string;
  sellerToken: string;
  buyerToken: string;
  sellerTokenAmount: string;
  buyerTokenAmount: string;
  deadlineTimestamp: number;
  nonce: string;
  quoteId: string;
  signature: string;
  externalSwapCalldata?: string;
}

export interface NativeTxRequest {
  target: string;
  calldata: string;
  value: string;
  function?: string;
}

export interface NativeFirmQuote {
  success: boolean;
  recipient: string;
  amountIn: string; // wei of token_in
  amountOut: string; // wei of token_out
  amountOutBeforeFee?: string;
  orders: NativeOrder[];
  txRequest: NativeTxRequest;
  errorMessage?: string;
  router_version?: string;
}

export interface FirmQuoteParams {
  chain?: string; // default "bsc"
  fromAddress: string; // taker submitting txRequest
  tokenIn: string;
  tokenOut: string;
  amount: string; // human units (e.g. "1.5"), NOT wei
  slippage?: number; // percent, e.g. 0.5
  refundTo?: string; // default fromAddress
  version?: number; // default 4
}

function baseUrl(): string {
  return process.env.NATIVE_API_BASE || DEFAULT_BASE;
}

function apiKey(): string {
  const key = process.env.NATIVE_API_KEY;
  if (!key) {
    throw new Error("NATIVE_API_KEY env var is required (Native Swap API key). Do not hardcode it.");
  }
  return key;
}

async function get(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const url = `${baseUrl()}${path}?${qs}`;
  const res = await fetch(url, { headers: { api_key: apiKey() } });
  const body = await res.json();
  // Native returns 200 with an error envelope on failure; surface both forms.
  if (body && body.code !== undefined && body.message !== undefined && body.success === undefined) {
    throw new Error(`Native API error ${body.code}: ${body.message} (${path})`);
  }
  return body;
}

/** List supported pairs for a chain (default bsc). */
export async function getOrderbook(chain = "bsc"): Promise<any[]> {
  return get("/orderbook", { chain });
}

/** Indicative (non-executable) price for a pair. */
export async function getIndicativeQuote(p: FirmQuoteParams): Promise<any> {
  const chain = p.chain || "bsc";
  return get("/indicative-quote", {
    from_address: p.fromAddress,
    src_chain: chain,
    dst_chain: chain,
    token_in: p.tokenIn,
    token_out: p.tokenOut,
    amount: p.amount,
    version: String(p.version ?? 4),
  });
}

/**
 * Firm (executable) quote. The returned `txRequest` is sent on-chain by the
 * taker; it is only valid until `orders[].deadlineTimestamp`.
 */
export async function getFirmQuote(p: FirmQuoteParams): Promise<NativeFirmQuote> {
  const chain = p.chain || "bsc";
  const q: NativeFirmQuote = await get("/firm-quote", {
    from_address: p.fromAddress,
    src_chain: chain,
    dst_chain: chain,
    token_in: p.tokenIn,
    token_out: p.tokenOut,
    amount: p.amount,
    slippage: String(p.slippage ?? 0.5),
    refund_to: p.refundTo || p.fromAddress,
    version: String(p.version ?? 4),
  });
  if (!q.success) {
    throw new Error(`Native firm-quote failed: ${q.errorMessage || "unknown"}`);
  }
  return q;
}

/** Earliest order deadline (unix seconds) across a firm quote, or 0 if none. */
export function quoteDeadline(q: NativeFirmQuote): number {
  const ds = (q.orders || []).map(o => Number(o.deadlineTimestamp)).filter(n => n > 0);
  return ds.length ? Math.min(...ds) : 0;
}

/** Known bStock token addresses on BNB Chain (18 decimals). */
export const BSTOCK_TOKENS = {
  TSLAB: "0x5b1910eAaD6450E50f816082Aa078C41F10C292f",
  NVDAB: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436",
} as const;

export const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
