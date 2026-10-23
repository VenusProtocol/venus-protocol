import { expect } from "chai";

import { fetchWithTimeout, requestTimeoutMs } from "../../scripts/bstock/lib/http";

// Guards the hop-1 source request timeout (scripts/bstock/lib/http.ts). atomic-liquidate prices every
// selected source with Promise.allSettled, which resolves only when the SLOWEST settles — so a source
// whose API hangs "pending" (no fetch timeout) would block a live source's answer mid-incident.
// fetchWithTimeout arms AbortSignal.timeout so a hung source aborts and drops out of the race instead.
// No chain, no live API: global fetch is stubbed to model a hang / a fast response.

describe("bStock hop-1 source request timeout", () => {
  const origFetch = global.fetch;
  const origEnv = process.env.SOURCE_TIMEOUT_MS;

  afterEach(() => {
    global.fetch = origFetch;
    if (origEnv === undefined) delete process.env.SOURCE_TIMEOUT_MS;
    else process.env.SOURCE_TIMEOUT_MS = origEnv;
  });

  it("aborts a hung request and rejects with a legible, labelled timeout error", async () => {
    process.env.SOURCE_TIMEOUT_MS = "30";
    // Model a hung API: never resolve on its own; reject only when the request's abort signal fires,
    // with that signal's reason — exactly how undici surfaces an AbortSignal.timeout (a TimeoutError).
    global.fetch = ((_url: unknown, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        const { signal } = init;
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener("abort", () => reject(signal.reason));
      })) as unknown as typeof fetch;

    await expect(fetchWithTimeout("https://x", {}, "Native /firm-quote")).to.be.rejectedWith(
      /Native \/firm-quote timed out after 30ms/,
    );
  });

  it("passes a fast response through untouched, before the timeout fires", async () => {
    process.env.SOURCE_TIMEOUT_MS = "1000";
    global.fetch = (async () => new Response("ok")) as unknown as typeof fetch;

    const res = await fetchWithTimeout("https://x", {}, "Liquid Mesh /quote");
    expect(await res.text()).to.equal("ok");
  });

  it("does not swallow a non-timeout error (e.g. connection refused) as a timeout", async () => {
    process.env.SOURCE_TIMEOUT_MS = "1000";
    global.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    await expect(fetchWithTimeout("https://x", {}, "Liquid Mesh /quote")).to.be.rejectedWith("fetch failed");
  });

  it("defaults to 8000ms and rejects a non-positive / non-numeric SOURCE_TIMEOUT_MS", () => {
    delete process.env.SOURCE_TIMEOUT_MS;
    expect(requestTimeoutMs()).to.equal(8000);

    process.env.SOURCE_TIMEOUT_MS = "0";
    expect(() => requestTimeoutMs()).to.throw(/SOURCE_TIMEOUT_MS must be a positive number/);

    process.env.SOURCE_TIMEOUT_MS = "abc";
    expect(() => requestTimeoutMs()).to.throw(/SOURCE_TIMEOUT_MS must be a positive number/);
  });
});
