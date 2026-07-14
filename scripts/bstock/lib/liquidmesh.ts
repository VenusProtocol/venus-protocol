/**
 * Liquid Mesh Swap API client — BSC DEX + RFQ aggregator, an ALTERNATIVE hop-1 source to Native.
 *
 * Like Native, Liquid Mesh quotes bStock <-> USDT (it re-serves the same `rfq_native` book plus
 * `rfq_neptune` and, for thin names, AMM pools), so it drops into the existing atomic flow as a
 * swap-in replacement for the Native hop-1 quote. The aggregator returns ONE router calldata blob
 * (the multi-source split lives inside it); the liquidator forwards it in `_swap` and all sources
 * settle in the single liquidation tx.
 *
 * TWO differences from Native, both already handled by the contract:
 *   1. Split spender — Liquid Mesh pulls the input token through a SEPARATE settlement contract
 *      (approve the SPENDER `0x8157…`, but CALL the router `0x3d90…`). The contract's `routerSpender`
 *      mapping covers this; the operator must run `setRouterSpender(LM_ROUTER, LM_SPENDER)` once.
 *   2. Build-time simulation — `POST /swap` normally simulates `transferFrom(userAddress, …)` off-chain
 *      and refuses to return calldata unless the caller ALREADY holds the input. Our liquidator holds
 *      zero bStock until mid-tx, so we pass `disableSimulate: true` (a documented request flag) to skip
 *      that off-chain pre-check and get executable calldata pre-seize. On-chain safety is unchanged: the
 *      returned order still carries an `expiryTimestamp` deadline and the contract enforces `minOut`.
 *
 * Auth: every request carries `LM-API-KEY: <key>` and `Authorization: Bearer <JWT>`, where the JWT is
 * Ed25519-signed (`alg EdDSA`) over `sha256(timestamp + METHOD + PATH + BODY)` with a short TTL. Provide
 * the key via `LM_API_KEY` and the Ed25519 private-key SEED (base64url) via `LM_PRIVATE_KEY_SEED`. Never
 * commit either.
 *
 * Endpoints (base `https://api.liquidmesh.io/v1/bsc`):
 *   GET  /quote   price + route split (no calldata; needs no balance)
 *   POST /swap    executable calldata (`data.callMsg {from,to,value,data}`) — pass disableSimulate:true
 */
import { createHash, createPrivateKey, sign as edSign } from "crypto";

import { fetchWithTimeout } from "./http";

// The JWT is signed over the FULL request path, so the network prefix must be part of `path` (not folded
// into the host) — otherwise the signed path omits `/v1/bsc` and the server rejects the token (401).
const DEFAULT_HOST = "https://api.liquidmesh.io";
const NETWORK_PREFIX = "/v1/bsc";
export const LM_BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
/** Liquid Mesh BSC router (the swap call target). */
export const LM_ROUTER = "0x3d90f66B534Dd8482b181e24655A9e8265316BE9";
/** Liquid Mesh BSC spender (the token-approval / transferFrom target) — set via `setRouterSpender`. */
export const LM_SPENDER = "0x8157a9d65807521FBB8db8f37EEEcEfDD247E9B1";

export interface LmDex {
  dex: string; // e.g. "rfq_native", "rfq_neptune"
  weight: number; // bps of the split (out of 10000)
  extraInfo?: string;
}
export interface LmRoutePlan {
  subRouters: Array<{ fromToken?: string; toToken?: string; dexes: LmDex[] }>;
}
export interface LmQuote {
  inputAmount: string; // wei
  outputAmount: string; // wei
  priceImpactPct?: string;
  midPrice?: string;
  estimatedGas?: number;
  routePlans: LmRoutePlan[];
}
export interface LmCallMsg {
  from: string;
  to: string; // the router (LM_ROUTER)
  value: string; // hex
  data: string; // executable calldata blob
}
export interface LmSwap {
  chainId: string;
  callMsg: LmCallMsg;
  orderId: string;
  expiryTimestamp: number; // unix seconds — the on-chain deadline
}

export interface LmQuoteParams {
  userAddress: string; // taker; pass the liquidator CONTRACT so proceeds route back to it
  tokenIn: string;
  tokenOut: string;
  amountWei: string; // base units (wei), NOT human
  chainId?: string; // default "56"
}
export interface LmSwapParams extends LmQuoteParams {
  minOutWei: string; // floor for the built order (outputAmount in the swap body)
  routePlans: LmRoutePlan[]; // pass the quote's routePlans so the blob matches the compared price
  slippageBps?: number; // default 50
  disableSimulate?: boolean; // default true — skip LM's off-chain transferFrom pre-check (see header)
}

/** Common LM response envelope: `{code, msg, data}` with `code === 0` on success. */
interface LmResponse<T> {
  code: number;
  msg?: string;
  data?: T;
}

/** Raw `/swap` payload before normalization (`expiryTimestamp` arrives as number or string). */
interface LmSwapData {
  chainId: string;
  callMsg: LmCallMsg;
  orderId: string;
  expiryTimestamp: number | string;
}

function host(): string {
  return process.env.LM_API_HOST || DEFAULT_HOST;
}

function apiKey(): string {
  const key = process.env.LM_API_KEY;
  if (!key) throw new Error("LM_API_KEY env var is required (Liquid Mesh API key). Do not hardcode it.");
  return key;
}

/** Load the Ed25519 signing key from the base64url seed in `LM_PRIVATE_KEY_SEED`. */
function signingKey() {
  const seedB64url = process.env.LM_PRIVATE_KEY_SEED;
  if (!seedB64url) {
    throw new Error(
      "LM_PRIVATE_KEY_SEED env var is required (Ed25519 private-key seed, base64url). Do not hardcode it.",
    );
  }
  const seed = Buffer.from(seedB64url.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  // Fail with a legible message instead of the cryptic createPrivateKey DER error a wrong-length
  // seed would otherwise produce mid-incident.
  if (seed.length !== 32) {
    throw new Error(`LM_PRIVATE_KEY_SEED must decode to exactly 32 bytes (Ed25519 seed), got ${seed.length}`);
  }
  // PKCS#8 DER prefix for an Ed25519 raw 32-byte seed.
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * Build the Ed25519 JWT for one request. The signed message is `sha256(ts + METHOD + PATH + BODY)`;
 * the token is short-lived (LM enforces a tight TTL), so mint one per request immediately before it.
 */
function jwt(method: string, path: string, body = ""): string {
  const ts = Date.now();
  const message = createHash("sha256").update(`${ts}${method}${path}${body}`).digest("hex");
  const iat = Math.floor(ts / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "EdDSA" })));
  const payload = b64url(Buffer.from(JSON.stringify({ tim: ts, message, iss: apiKey(), iat, exp: iat + 2 })));
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${b64url(edSign(null, Buffer.from(signingInput), signingKey()))}`;
}

function headers(method: string, path: string, body = ""): Record<string, string> {
  return {
    "LM-API-KEY": apiKey(),
    Authorization: `Bearer ${jwt(method, path, body)}`,
    "Content-Type": "application/json",
  };
}

/**
 * Indicative price + route split (no calldata). Needs no balance, so it is safe to call for the
 * winner-selection comparison against Native.
 */
export async function getQuote(p: LmQuoteParams): Promise<LmQuote> {
  const chainId = p.chainId || "56";
  const path =
    `${NETWORK_PREFIX}/quote?chainId=${chainId}&inputToken=${p.tokenIn}&outputToken=${p.tokenOut}` +
    `&amount=${p.amountWei}&userAddress=${p.userAddress}`;
  const res = await fetchWithTimeout(`${host()}${path}`, { headers: headers("GET", path) }, "Liquid Mesh /quote");
  const text = await res.text();
  let body: LmResponse<LmQuote>;
  try {
    body = JSON.parse(text) as LmResponse<LmQuote>;
  } catch {
    throw new Error(`Liquid Mesh /quote non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (body.code !== 0 || !body.data) {
    throw new Error(
      `Liquid Mesh /quote error (HTTP ${res.status}) ${body.code}: ${body.msg} (${p.tokenIn}->${p.tokenOut})`,
    );
  }
  return body.data;
}

/**
 * Executable swap. Passes `disableSimulate: true` so LM skips the off-chain `transferFrom` pre-check and
 * returns calldata even though the caller (the liquidator) does not yet hold the input token — it will
 * hold it mid-tx after the seize. The returned `callMsg.data` is the blob to forward in `_swap`.
 */
export async function buildSwap(p: LmSwapParams): Promise<LmSwap> {
  const chainId = p.chainId || "56";
  const slippageBps = p.slippageBps ?? 50;
  const path = `${NETWORK_PREFIX}/swap`;
  const body = JSON.stringify({
    userAddress: p.userAddress,
    slippageBps,
    disableSimulate: p.disableSimulate ?? true, // liquidator holds zero input until mid-tx; skip LM's off-chain balance sim
    swapInfo: {
      chainId,
      inputToken: p.tokenIn,
      inputAmount: p.amountWei,
      outputToken: p.tokenOut,
      outputAmount: p.minOutWei,
      slippageBps,
      routePlans: p.routePlans,
    },
  });
  const res = await fetchWithTimeout(
    `${host()}${path}`,
    { method: "POST", headers: headers("POST", path, body), body },
    "Liquid Mesh /swap",
  );
  const text = await res.text();
  let j: LmResponse<LmSwapData>;
  try {
    j = JSON.parse(text) as LmResponse<LmSwapData>;
  } catch {
    throw new Error(`Liquid Mesh /swap non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (j.code !== 0 || !j.data || !j.data.callMsg) {
    throw new Error(`Liquid Mesh /swap error (HTTP ${res.status}) ${j.code}: ${j.msg}`);
  }
  const d = j.data;
  return { chainId: d.chainId, callMsg: d.callMsg, orderId: d.orderId, expiryTimestamp: Number(d.expiryTimestamp) };
}
