import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumberish, Contract } from "ethers";
import { ethers, upgrades } from "hardhat";

import { atomicLiquidate } from "../../scripts/bstock/atomic-liquidate";

// Exercises scripts/bstock/atomic-liquidate.ts atomicLiquidate() end-to-end against the real
// BStockLiquidator proxy + the BStock mocks. No fork, no funds, no live Native API: the swap leg is
// driven through MOCK_NATIVE ("<router>:<calldata>") so the script's off-chain half (shortfall check,
// seize precompute, treasury-fee adjustment, router-allowlist guard, minOut, mode dispatch) runs for
// real while the on-chain settle hits the same contract the dedicated contract suite covers.

const U = (n: string) => ethers.utils.parseUnits(n, 18);
const INCENTIVE = U("1.1"); // mock seizes repay * 1.1
// Sentinel native BNB market (vBNB); no code — the ERC20 script paths never touch it.
const VBNB = ethers.utils.getAddress("0x0000000000000000000000000000000000000b0b");

const REPAY = U("5000");
const SEIZED = REPAY.mul(INCENTIVE).div(U("1")); // 5500 bStock at 1:1 redeem
const OUT = SEIZED; // router rate 1:1 -> 5500 USDT

// Env keys the script reads; cleared between tests so one case can't leak into the next.
const SCRIPT_ENV = [
  "LIQUIDATOR",
  "BORROWER",
  "VBSTOCK",
  "VDEBT",
  "REPAY_AMOUNT",
  "USDT_ADDR",
  "WBNB_ADDR",
  "MOCK_NATIVE",
  "MOCK_AMM",
  "MOCK_OUT",
  "MODE",
  "DRY_RUN",
  "SLIPPAGE",
  "MIN_OUT_BUFFER",
  "SEIZE_BUFFER",
  "SETTLE_TTL_MARGIN",
  "NATIVE_API_KEY",
  "SOURCE",
  "LM_API_KEY",
  "LM_PRIVATE_KEY_SEED",
] as const;

describe("bStock atomic liquidation script", () => {
  let owner: any, borrower: any;
  let usdt: Contract, bStock: Contract;
  let comptroller: Contract, vBStock: Contract, vDebt: Contract, router: Contract, liq: Contract;
  let wbnb: Contract, vWBNB: Contract;

  async function deployLiquidator(comptrollerAddr: string) {
    const Factory = await ethers.getContractFactory("BStockLiquidator");
    return upgrades.deployProxy(Factory, [owner.address], {
      constructorArgs: [comptrollerAddr, VBNB, vWBNB.address, wbnb.address],
      unsafeAllow: ["constructor", "state-variable-immutable"],
    });
  }

  // swapAll(tokenIn, tokenOut, to): the router pulls the contract's whole bStock balance. Used so the
  // pre-encoded calldata doesn't have to match the exact seized amount the script computes on-chain.
  function swapAllCalldata(to: string) {
    return router.interface.encodeFunctionData("swapAll", [bStock.address, usdt.address, to]);
  }

  function setEnv(over: Record<string, string> = {}) {
    Object.assign(process.env, {
      LIQUIDATOR: liq.address,
      BORROWER: borrower.address,
      VBSTOCK: vBStock.address,
      VDEBT: vDebt.address,
      REPAY_AMOUNT: "5000",
      USDT_ADDR: usdt.address,
      MOCK_NATIVE: `${router.address}:${swapAllCalldata(liq.address)}`,
      MOCK_OUT: OUT.toString(),
      MODE: "inventory",
      DRY_RUN: "",
      SLIPPAGE: "0.5",
      MIN_OUT_BUFFER: "0.5",
      ...over,
    });
  }

  beforeEach(async () => {
    [owner, borrower] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockMintableERC20");
    usdt = await ERC20.deploy("Tether", "USDT", 18);
    bStock = await ERC20.deploy("Tesla bStock", "TSLAB", 18);

    comptroller = await (await ethers.getContractFactory("MockComptrollerLite")).deploy();
    vBStock = await (
      await ethers.getContractFactory("MockVTokenCollateral")
    ).deploy(bStock.address, comptroller.address);
    vDebt = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(usdt.address, comptroller.address);
    router = await (await ethers.getContractFactory("MockNativeRouter")).deploy();

    // WBNB + its market, for the BNB-debt constructor immutables (vWBNB is the flash source).
    wbnb = await (await ethers.getContractFactory("WBNB")).deploy();
    vWBNB = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(wbnb.address, comptroller.address);

    // Core's pool-wide liquidator gate is always configured; every liquidation routes through it.
    const venusLiq = await (await ethers.getContractFactory("MockVenusLiquidator")).deploy();
    await comptroller.setLiquidatorContract(venusLiq.address);
    await venusLiq.setVBnb(VBNB);

    liq = await deployLiquidator(comptroller.address);
    await liq.connect(owner).setRouter(router.address, true);

    // Liquidity for the pipeline: collateral market holds bStock to pay redeem; router holds USDT to pay swap.
    await bStock.mint(vBStock.address, SEIZED);
    await usdt.mint(router.address, OUT);

    // Borrower is underwater.
    await comptroller.setShortfall(U("800"));
  });

  afterEach(() => {
    for (const k of SCRIPT_ENV) delete process.env[k];
  });

  it("inventory mode: precomputes the seize, settles via the contract, keeps the proceeds", async () => {
    await usdt.mint(liq.address, REPAY); // pre-funded inventory
    setEnv();

    await atomicLiquidate(owner);

    // Started with REPAY, repaid REPAY, received OUT -> ends at OUT (profit = OUT - REPAY = 500).
    expect(await usdt.balanceOf(liq.address)).to.equal(OUT);
    expect(await bStock.balanceOf(liq.address)).to.equal(0);
  });

  it("buffers the quoted seize below the on-chain seize (SEIZE_BUFFER)", async () => {
    await usdt.mint(liq.address, REPAY); // inventory float
    // Exercise the REAL Native quote path (no MOCK_NATIVE) by stubbing fetch, so the buffer applied to
    // the quote `amount` is observable. The mock router's swapAll pulls the whole balance regardless of
    // the quoted amountIn, so this asserts the quote is scaled down; it can't reproduce the on-chain
    // over-pull the buffer guards against.
    let quotedAmount: string | null = null;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown) => {
      quotedAmount = new URL(String(url)).searchParams.get("amount");
      return {
        json: async () => ({
          success: true,
          recipient: liq.address,
          amountIn: "0",
          amountOut: OUT.toString(),
          orders: [{ deadlineTimestamp: Math.floor(Date.now() / 1000) + 3600 }],
          txRequest: { target: router.address, calldata: swapAllCalldata(liq.address), value: "0" },
        }),
      };
    }) as unknown as typeof fetch;

    try {
      setEnv({ MOCK_NATIVE: "", MOCK_OUT: "", NATIVE_API_KEY: "test-key", SEIZE_BUFFER: "10" });
      await atomicLiquidate(owner);
    } finally {
      globalThis.fetch = realFetch;
    }

    // Seize is 5500 bStock (1:1 redeem, 0 cut, 0 treasuryPercent); a 10% buffer quotes for 4950.
    expect(quotedAmount).to.equal("4950.0");
  });

  it("rejects an out-of-range SEIZE_BUFFER before quoting", async () => {
    setEnv({ SEIZE_BUFFER: "150" });
    await expect(atomicLiquidate(owner)).to.be.rejectedWith(/SEIZE_BUFFER/);
  });

  it("rejects an out-of-range SETTLE_TTL_MARGIN before quoting", async () => {
    setEnv({ SETTLE_TTL_MARGIN: "-5" });
    await expect(atomicLiquidate(owner)).to.be.rejectedWith(/SETTLE_TTL_MARGIN/);
  });

  it("aborts before submit when the Native quote TTL is below the safety margin", async () => {
    await usdt.mint(liq.address, REPAY); // inventory so the guard, not a funding error, is what trips
    // Real Native quote path (no MOCK_NATIVE): stub fetch to return a quote that expires in ~2s, below
    // the default 10s margin, so the pre-submit TTL re-check aborts instead of relying on the on-chain
    // DeadlineExpired backstop.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      json: async () => ({
        success: true,
        recipient: liq.address,
        amountIn: "0",
        amountOut: OUT.toString(),
        orders: [{ deadlineTimestamp: Math.floor(Date.now() / 1000) + 2 }],
        txRequest: { target: router.address, calldata: swapAllCalldata(liq.address), value: "0" },
      }),
    })) as unknown as typeof fetch;

    try {
      setEnv({ MOCK_NATIVE: "", MOCK_OUT: "", NATIVE_API_KEY: "test-key" });
      await expect(atomicLiquidate(owner)).to.be.rejectedWith(/safety margin/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("flash mode: routes through flashLiquidate, repays principal + premium, keeps the rest", async () => {
    await usdt.mint(vDebt.address, REPAY); // the vToken lends the principal
    await comptroller.setFlashPremium(U("0.001")); // 0.1% premium
    const premium = REPAY.mul(U("0.001")).div(U("1")); // 5 USDT
    setEnv({ MODE: "flash" });

    await atomicLiquidate(owner);

    // No inventory used: contract keeps proceeds minus principal minus premium.
    expect(await usdt.balanceOf(liq.address)).to.equal(OUT.sub(REPAY).sub(premium));
  });

  it("refuses a healthy (no-shortfall) borrower before sending anything", async () => {
    await usdt.mint(liq.address, REPAY);
    await comptroller.setShortfall(0);
    setEnv();

    await expect(atomicLiquidate(owner)).to.be.rejectedWith("no shortfall");
    expect(await usdt.balanceOf(liq.address)).to.equal(REPAY); // untouched
  });

  it("refuses when the Venus Liquidator gate is unset (aligns with the contract)", async () => {
    await usdt.mint(liq.address, REPAY);
    await comptroller.setLiquidatorContract(ethers.constants.AddressZero);
    setEnv();

    await expect(atomicLiquidate(owner)).to.be.rejectedWith(/unset/i);
    expect(await usdt.balanceOf(liq.address)).to.equal(REPAY); // untouched
  });

  it("refuses a router that is not allowlisted on the contract", async () => {
    await usdt.mint(liq.address, REPAY);
    // Deploy a second router that was never allowlisted, and point the (mock) quote at it.
    const stray = await (await ethers.getContractFactory("MockNativeRouter")).deploy();
    const strayCalldata = stray.interface.encodeFunctionData("swapAll", [bStock.address, usdt.address, liq.address]);
    setEnv({ MOCK_NATIVE: `${stray.address}:${strayCalldata}` });

    await expect(atomicLiquidate(owner)).to.be.rejectedWith("not allowlisted");
    expect(await usdt.balanceOf(liq.address)).to.equal(REPAY); // untouched
  });

  // Two-hop (non-USDT debt): the debt is BTCB, so the script appends a hop-2 swap. Both hops are
  // driven through MOCK_NATIVE (bStock->USDT) + MOCK_AMM (USDT->BTCB); MOCK_OUT is the final BTCB out.
  async function deployTwoHop() {
    const ERC20 = await ethers.getContractFactory("MockMintableERC20");
    const btcb = await ERC20.deploy("Bitcoin BEP20", "BTCB", 18);
    const vBtcb = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(btcb.address, comptroller.address);
    const amm = await (await ethers.getContractFactory("MockNativeRouter")).deploy();
    await btcb.mint(amm.address, OUT); // hop-2 router pays BTCB
    const hop1 = router.interface.encodeFunctionData("swapAll", [bStock.address, usdt.address, liq.address]);
    const hop2 = amm.interface.encodeFunctionData("swapAll", [usdt.address, btcb.address, liq.address]);
    return { btcb, vBtcb, amm, hop1, hop2 };
  }

  it("two-hop mode: appends the AMM hop for non-USDT debt and settles via the contract", async () => {
    const { btcb, vBtcb, amm, hop1, hop2 } = await deployTwoHop();
    await liq.connect(owner).setRouter(amm.address, true);
    await btcb.mint(liq.address, REPAY); // debt inventory
    setEnv({
      VDEBT: vBtcb.address,
      MOCK_NATIVE: `${router.address}:${hop1}`,
      MOCK_AMM: `${amm.address}:${hop2}`,
    });

    await atomicLiquidate(owner);

    expect(await btcb.balanceOf(liq.address)).to.equal(OUT); // final debt asset, profit kept
    expect(await usdt.balanceOf(liq.address)).to.equal(0); // intermediate fully consumed
  });

  it("two-hop mode: refuses when the hop-2 router is not allowlisted", async () => {
    const { btcb, vBtcb, amm, hop1, hop2 } = await deployTwoHop();
    // amm intentionally NOT allowlisted.
    await btcb.mint(liq.address, REPAY);
    setEnv({
      VDEBT: vBtcb.address,
      MOCK_NATIVE: `${router.address}:${hop1}`,
      MOCK_AMM: `${amm.address}:${hop2}`,
    });

    await expect(atomicLiquidate(owner)).to.be.rejectedWith("not allowlisted");
    expect(await btcb.balanceOf(liq.address)).to.equal(REPAY); // untouched
  });

  // Native BNB debt: VDEBT is vBNB (no underlying()), so the script auto-detects it, accounts the debt
  // in WBNB, and appends the USDT->WBNB hop. The contract unwraps the repay and settles in native BNB.
  it("bnb debt: auto-detects vBNB, accounts in WBNB, settles via the contract (inventory)", async () => {
    const ammBnb = await (await ethers.getContractFactory("MockNativeRouter")).deploy();
    await liq.connect(owner).setRouter(ammBnb.address, true);
    await wbnb.setBalanceOf(ammBnb.address, OUT); // hop-2 pays WBNB
    await wbnb.setBalanceOf(liq.address, REPAY); // pre-funded WBNB float (inventory)
    await setBalance(wbnb.address, U("1000000")); // back the WBNB mock so withdraw() pays out

    const hop1 = router.interface.encodeFunctionData("swapAll", [bStock.address, usdt.address, liq.address]);
    const hop2 = ammBnb.interface.encodeFunctionData("swapAll", [usdt.address, wbnb.address, liq.address]);
    setEnv({
      VDEBT: VBNB, // sentinel vBNB: underlying() reverts -> script treats debt as native BNB
      WBNB_ADDR: wbnb.address,
      MOCK_NATIVE: `${router.address}:${hop1}`,
      MOCK_AMM: `${ammBnb.address}:${hop2}`,
    });

    await atomicLiquidate(owner);

    expect(await wbnb.balanceOf(liq.address)).to.equal(OUT); // float consumed, proceeds retained as WBNB
    expect(await ethers.provider.getBalance(liq.address)).to.equal(0); // no native BNB retained
    expect(await usdt.balanceOf(liq.address)).to.equal(0); // intermediate consumed
  });

  // ------------------------------------------------------------------------ //
  //   Liquidity-source registry (lib/sources.ts): Native vs Liquid Mesh      //
  // ------------------------------------------------------------------------ //
  // These exercise the REAL hop-1 source path (no MOCK_NATIVE): `fetch` is stubbed to answer the Native
  // firm-quote, the Liquid Mesh `/quote`, and the Liquid Mesh `/swap` (disableSimulate) so the winner
  // selection, the LM JWT/build round-trip, and the split-spender settle all run for real on-chain.
  describe("liquidity-source registry", () => {
    // Any 32-byte Ed25519 seed signs a valid JWT locally (the LM server is never hit — fetch is stubbed).
    const LM_SEED = Buffer.alloc(32, 7).toString("base64url");
    let spender: Contract, lmRouter: Contract;

    // A response object exposing both `.json()` (Native lib) and `.text()` (Liquid Mesh lib).
    const resp = (obj: any) => ({ status: 200, json: async () => obj, text: async () => JSON.stringify(obj) });

    // Stub Native firm-quote + LM /quote + LM /swap. `lmCalldata` is executed on-chain against `lmRouter`;
    // `lmExpiry` overrides the /swap order expiry (default: generous, see below).
    function stubFetch(opts: { nativeOut: BigNumberish; lmOut: BigNumberish; lmCalldata: string; lmExpiry?: number }) {
      const real = globalThis.fetch;
      globalThis.fetch = (async (url: unknown, init?: any) => {
        const u = String(url);
        const method = (init?.method || "GET").toUpperCase();
        if (u.includes("native.org")) {
          return resp({
            success: true,
            recipient: liq.address,
            amountIn: "0",
            amountOut: opts.nativeOut.toString(),
            orders: [{ deadlineTimestamp: Math.floor(Date.now() / 1000) + 3600 }],
            txRequest: { target: router.address, calldata: swapAllCalldata(liq.address), value: "0" },
          });
        }
        if (u.includes("liquidmesh.io") && u.includes("/quote")) {
          return resp({
            code: 0,
            msg: "OK",
            data: {
              inputAmount: "0",
              outputAmount: opts.lmOut.toString(),
              routePlans: [{ subRouters: [{ dexes: [{ dex: "rfq_native", weight: 10000 }] }] }],
            },
          });
        }
        if (u.includes("liquidmesh.io") && method === "POST") {
          // /swap (disableSimulate): calldata blob + expiry, target = the LM split router.
          return resp({
            code: 0,
            msg: "OK",
            data: {
              chainId: "56",
              callMsg: { from: liq.address, to: lmRouter.address, value: "0x0", data: opts.lmCalldata },
              orderId: "1",
              // Generous expiry: the hardhat chain clock can run ahead of wall-clock after prior tests, so a
              // short TTL would trip DeadlineExpired. (Real LM orders are short-lived; the contract enforces it.)
              expiryTimestamp: opts.lmExpiry ?? Math.floor(Date.now() / 1000) + 3600,
            },
          });
        }
        throw new Error(`unexpected fetch: ${method} ${u}`);
      }) as unknown as typeof fetch;
      return real;
    }

    // Deploy the Liquid-Mesh-style split router (call target 0x…/spender 0x… differ), allowlist it, wire
    // the spender, and pre-fund it with USDT so its swap can pay out.
    beforeEach(async () => {
      spender = await (await ethers.getContractFactory("MockSpender")).deploy();
      lmRouter = await (await ethers.getContractFactory("MockSplitRouter")).deploy(spender.address);
      await liq.connect(owner).setRouter(lmRouter.address, true);
      await liq.connect(owner).setRouterSpender(lmRouter.address, spender.address);
      await usdt.mint(lmRouter.address, OUT); // LM router pays USDT
    });

    function lmSwapAll() {
      return lmRouter.interface.encodeFunctionData("swapAll", [bStock.address, usdt.address, liq.address]);
    }

    function lmEnv(over: Record<string, string> = {}) {
      setEnv({
        MOCK_NATIVE: "", // force the real source path
        MOCK_OUT: "",
        NATIVE_API_KEY: "test-native",
        LM_API_KEY: "test-lm",
        LM_PRIVATE_KEY_SEED: LM_SEED,
        ...over,
      });
    }

    it("SOURCE=auto: picks Liquid Mesh when it out-quotes Native, settles via the split spender", async () => {
      await usdt.mint(liq.address, REPAY); // inventory
      const real = stubFetch({ nativeOut: U("5400"), lmOut: OUT, lmCalldata: lmSwapAll() }); // LM (5500) > Native (5400)
      try {
        lmEnv({ SOURCE: "auto" });
        await atomicLiquidate(owner);
      } finally {
        globalThis.fetch = real;
      }

      // Sold through the LM split router (its spender pulled the bStock), proceeds retained.
      expect(await bStock.balanceOf(lmRouter.address)).to.equal(SEIZED);
      expect(await bStock.balanceOf(router.address)).to.equal(0); // Native router untouched
      expect(await usdt.balanceOf(liq.address)).to.equal(OUT);
      expect(await bStock.allowance(liq.address, spender.address)).to.equal(0); // no standing approval
    });

    it("SOURCE=auto: picks Native when it out-quotes Liquid Mesh", async () => {
      await usdt.mint(liq.address, REPAY);
      const real = stubFetch({ nativeOut: OUT, lmOut: U("5400"), lmCalldata: lmSwapAll() }); // Native (5500) > LM (5400)
      try {
        lmEnv({ SOURCE: "auto" });
        await atomicLiquidate(owner);
      } finally {
        globalThis.fetch = real;
      }

      expect(await bStock.balanceOf(router.address)).to.equal(SEIZED); // Native router sold it
      expect(await bStock.balanceOf(lmRouter.address)).to.equal(0);
      expect(await usdt.balanceOf(liq.address)).to.equal(OUT);
    });

    it("SOURCE=auto: falls back to the firm Native quote when the LM built floor undercuts it", async () => {
      await usdt.mint(liq.address, REPAY);
      // LM's INDICATIVE quote (5500) beats Native's FIRM 5490, so LM wins the comparison — but its built
      // order only guarantees out*(1-slippage) = 5472.5 (< 5490 firm). The post-build reconcile must
      // detect the regression and execute the Native quote instead.
      const real = stubFetch({ nativeOut: U("5490"), lmOut: OUT, lmCalldata: lmSwapAll() });
      try {
        lmEnv({ SOURCE: "auto" }); // default SLIPPAGE 0.5%
        await atomicLiquidate(owner);
      } finally {
        globalThis.fetch = real;
      }

      expect(await bStock.balanceOf(router.address)).to.equal(SEIZED); // Native sold it, not LM
      expect(await bStock.balanceOf(lmRouter.address)).to.equal(0);
      expect(await usdt.balanceOf(liq.address)).to.equal(OUT);
    });

    it("SOURCE=liquidmesh: forces Liquid Mesh even when Native quotes higher", async () => {
      await usdt.mint(liq.address, REPAY);
      const real = stubFetch({ nativeOut: U("9000"), lmOut: OUT, lmCalldata: lmSwapAll() }); // Native higher, but forced LM
      try {
        lmEnv({ SOURCE: "liquidmesh" });
        await atomicLiquidate(owner);
      } finally {
        globalThis.fetch = real;
      }

      expect(await bStock.balanceOf(lmRouter.address)).to.equal(SEIZED); // LM used despite lower quote
      expect(await usdt.balanceOf(liq.address)).to.equal(OUT);
    });

    it("tolerates a trailing comma / empty segment in SOURCE", async () => {
      await usdt.mint(liq.address, REPAY);
      const real = stubFetch({ nativeOut: U("5400"), lmOut: OUT, lmCalldata: lmSwapAll() });
      try {
        lmEnv({ SOURCE: "liquidmesh," }); // empty tail segment must be dropped, not read as an unknown source
        await atomicLiquidate(owner);
      } finally {
        globalThis.fetch = real;
      }
      expect(await bStock.balanceOf(lmRouter.address)).to.equal(SEIZED);
    });

    it("rejects a built Liquid Mesh order whose TTL is below LM_MIN_TTL", async () => {
      await usdt.mint(liq.address, REPAY);
      // The built order expires 5s from now — under the 15s default margin. The guard must abort
      // BEFORE the settle tx (an already-tight order would otherwise revert DeadlineExpired on-chain).
      const real = stubFetch({
        nativeOut: U("5400"),
        lmOut: OUT,
        lmCalldata: lmSwapAll(),
        lmExpiry: Math.floor(Date.now() / 1000) + 5,
      });
      try {
        lmEnv({ SOURCE: "liquidmesh" });
        await expect(atomicLiquidate(owner)).to.be.rejectedWith(/TTL .*LM_MIN_TTL/);
      } finally {
        globalThis.fetch = real;
      }
      expect(await bStock.balanceOf(lmRouter.address)).to.equal(0); // nothing settled
    });

    it("rejects an unknown SOURCE name", async () => {
      await usdt.mint(liq.address, REPAY);
      lmEnv({ SOURCE: "nope" });
      await expect(atomicLiquidate(owner)).to.be.rejectedWith(/unknown SOURCE/i);
      expect(await usdt.balanceOf(liq.address)).to.equal(REPAY); // untouched
    });

    it("rejects SOURCE=liquidmesh when the LM creds are absent", async () => {
      await usdt.mint(liq.address, REPAY);
      lmEnv({ SOURCE: "liquidmesh", LM_API_KEY: "", LM_PRIVATE_KEY_SEED: "" });
      await expect(atomicLiquidate(owner)).to.be.rejectedWith(/missing required creds/i);
      expect(await usdt.balanceOf(liq.address)).to.equal(REPAY); // untouched
    });

    // A Liquid Mesh `/quote` is INDICATIVE: the built order may fill below it, down to its own floor. The
    // hop-2 calldata bakes in a fixed `amountIn` off-chain, while on-chain the contract approves router2 for
    // the ACTUAL hop-1 delta. Size hop 2 off the indicative `out` and an underfilling LM leaves the AMM
    // pulling more than the approval — hop 2 reverts on allowance. Sizing it off the GUARANTEED floor keeps
    // the pull within the approval. Here LM quotes 1:1 (5500 USDT) but its order fills at 0.998 (5489),
    // between the floor (5472.5) and the quote — the exact gap the floor exists to absorb.
    it("two-hop: sizes the AMM hop off the LM floor, so an LM order that underfills its quote still settles", async () => {
      const { btcb, vBtcb, amm } = await deployTwoHop();
      await liq.connect(owner).setRouter(amm.address, true);
      await btcb.mint(liq.address, REPAY); // debt inventory for the repay

      await lmRouter.setRate(U("0.998")); // LM fills 0.2% under its own indicative quote
      const lmFilled = SEIZED.mul(U("0.998")).div(U("1")); // 5489 USDT actually delivered by hop 1
      const floor = OUT.mul(9950).div(10000); // quote 5500 haircut by SLIPPAGE=0.5% -> 5472.5

      // Stub LM (/quote + /swap) and the hop-2 KyberSwap round-trip. The AMM calldata is built from the
      // `amountIn` the script ASKS for (captured off the /routes query), so the on-chain pull is exactly
      // what the script sized the leg at — that is what this test is asserting on.
      let ammAmountIn = "";
      const real = globalThis.fetch;
      globalThis.fetch = (async (url: unknown, init?: any) => {
        const u = String(url);
        const method = (init?.method || "GET").toUpperCase();
        if (u.includes("liquidmesh.io") && u.includes("/quote")) {
          return resp({
            code: 0,
            data: {
              inputAmount: "0",
              outputAmount: OUT.toString(), // indicative 1:1 — optimistic vs the 0.998 the order fills at
              routePlans: [{ subRouters: [{ dexes: [{ dex: "rfq_native", weight: 10000 }] }] }],
            },
          });
        }
        if (u.includes("liquidmesh.io") && method === "POST") {
          return resp({
            code: 0,
            data: {
              chainId: "56",
              callMsg: { from: liq.address, to: lmRouter.address, value: "0x0", data: lmSwapAll() },
              orderId: "1",
              expiryTimestamp: Math.floor(Date.now() / 1000) + 3600,
            },
          });
        }
        if (u.includes("kyberswap") && u.includes("/routes")) {
          ammAmountIn = new URL(u).searchParams.get("amountIn") || "";
          return resp({ code: 0, data: { routeSummary: { amountOut: ammAmountIn } } });
        }
        if (u.includes("kyberswap") && u.includes("/route/build")) {
          // Pull EXACTLY what the script sized this leg at.
          return resp({
            code: 0,
            data: {
              routerAddress: amm.address,
              data: amm.interface.encodeFunctionData("swap", [usdt.address, ammAmountIn, btcb.address, liq.address]),
              amountOut: ammAmountIn,
            },
          });
        }
        throw new Error(`unexpected fetch: ${method} ${u}`);
      }) as unknown as typeof fetch;

      try {
        lmEnv({ SOURCE: "liquidmesh", VDEBT: vBtcb.address });
        await atomicLiquidate(owner);
      } finally {
        globalThis.fetch = real;
      }

      // Sized off the floor, not the indicative quote — the whole point.
      expect(ammAmountIn).to.equal(floor.toString());
      // Hop 2 pulled the floor out of the larger real delta, so the surplus stays behind as sweepable
      // USDT inventory rather than reverting the settle.
      expect(await usdt.balanceOf(liq.address)).to.equal(lmFilled.sub(floor));
      expect(await btcb.balanceOf(liq.address)).to.equal(floor); // AMM pays 1:1 on what it pulled
    });
  });
});
