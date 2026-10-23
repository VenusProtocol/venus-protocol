/**
 * Shared request timeout for hop-1 liquidity-source API calls.
 *
 * A source's HTTP call with no timeout can hang "pending" indefinitely (Node's global fetch has no
 * practical request timeout). Because atomic-liquidate prices every selected source with
 * `Promise.allSettled` — which resolves only when the SLOWEST settles — one hung API would stall a live
 * source's answer and block the whole selection mid-incident. `AbortSignal.timeout` aborts the socket so a
 * hung source rejects and drops out of the race instead. Override the window with `SOURCE_TIMEOUT_MS`
 * (milliseconds, default 8000).
 */

export function requestTimeoutMs(): number {
  const ms = Number(process.env.SOURCE_TIMEOUT_MS || "8000");
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(
      `SOURCE_TIMEOUT_MS must be a positive number of milliseconds, got "${process.env.SOURCE_TIMEOUT_MS}"`,
    );
  }
  return ms;
}

/**
 * `fetch` with the shared abort timeout applied. Rethrows an aborted request as a legible
 * `${label} timed out …` error (undici surfaces the abort as `TimeoutError`/`AbortError`), so an operator
 * sees which source stalled rather than a bare abort stack.
 */
export async function fetchWithTimeout(url: string, init: RequestInit, label: string): Promise<Response> {
  const ms = requestTimeoutMs();
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e: any) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      throw new Error(`${label} timed out after ${ms}ms (raise SOURCE_TIMEOUT_MS if the API is just slow)`);
    }
    throw e;
  }
}
