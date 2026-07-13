import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers, upgrades } from "hardhat";

// Proves the Liquid-Mesh integration semantics for BStockLiquidator.
//
// Liquid Mesh differs from Native in ONE way that matters here: it pulls the input token through a
// SEPARATE spender contract (approve `0x8157…`) while you call the router (`0x3d90…`). This suite uses
// MockSplitRouter (call target) + MockSpender (does the transferFrom) to reproduce that split and prove:
//
//   1. WITHOUT the spender mapping the swap reverts — approving the router (old behaviour) leaves the
//      spender with no allowance, so its transferFrom fails. This is why the contract change is needed.
//   2. WITH `setRouterSpender`, the seize -> redeem -> sell runs ATOMICALLY in one tx: the contract never
//      pre-holds the bStock; it acquires it mid-tx, approves the spender, calls the router, and clears
//      minOut. No standing allowance is left on the spender.
//   3. The Liquid-Mesh build-time simulation: simulating the same swap from an address that does NOT yet
//      hold + approve the input reverts (the on-chain analog of Liquid Mesh's `41320 SafeTransferFromFailed`
//      pre-trade simulation). It also proves the returned calldata is balance-AGNOSTIC to execute — the
//      identical call succeeds once the balance is present. So the calldata itself is fine for our atomic
//      seize-then-sell (it holds the token mid-tx, test 2); only Liquid Mesh's OFF-CHAIN build-time
//      simulation would block fetching it pre-seize.
//
// RESOLVED off-chain (2026-07): `POST /swap` accepts `disableSimulate:true`, which skips that build-time
// `transferFrom` simulation and returns executable calldata for a zero-balance caller. Verified live. So
// the atomic path works end-to-end: build the blob pre-seize with `disableSimulate:true`, and the contract
// (this suite) executes it mid-tx. On-chain safety is unchanged — the order carries an `expiryTimestamp`
// deadline and the contract still enforces `minOut`. See scripts/bstock/lib/liquidmesh.ts.

const U = (n: string) => ethers.utils.parseUnits(n, 18);
const ZERO = ethers.constants.AddressZero;
const INCENTIVE = U("1.1");
const VBNB = ethers.utils.getAddress("0x0000000000000000000000000000000000000b0b");

describe("BStockLiquidator + Liquid Mesh (separate spender)", () => {
  let owner: any, borrower: any, stranger: any;
  let usdt: Contract, bStock: Contract;
  let comptroller: Contract, vBStock: Contract, vDebt: Contract, venusLiq: Contract;
  let wbnb: Contract, vWBNB: Contract;
  let spender: Contract, lmRouter: Contract;
  let liq: Contract;

  const REPAY = U("5000");
  const SEIZED = REPAY.mul(INCENTIVE).div(U("1")); // 5500 bStock at 1:1 redeem
  const OUT = SEIZED; // router rate 1:1 -> 5500 USDT
  const MIN_OUT = U("5400");

  async function deployLiquidator(comptrollerAddr: string) {
    const Factory = await ethers.getContractFactory("BStockLiquidator");
    return upgrades.deployProxy(Factory, [owner.address], {
      constructorArgs: [comptrollerAddr, VBNB, vWBNB.address, wbnb.address],
      unsafeAllow: ["constructor", "state-variable-immutable"],
    });
  }

  async function deploy() {
    [owner, , borrower, stranger] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockMintableERC20");
    usdt = await ERC20.deploy("Tether", "USDT", 18);
    bStock = await ERC20.deploy("Tesla bStock", "TSLAB", 18);

    comptroller = await (await ethers.getContractFactory("MockComptrollerLite")).deploy();
    vBStock = await (
      await ethers.getContractFactory("MockVTokenCollateral")
    ).deploy(bStock.address, comptroller.address);
    vDebt = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(usdt.address, comptroller.address);

    // Liquid-Mesh-style split: the router is the CALL TARGET, the spender does the transferFrom.
    spender = await (await ethers.getContractFactory("MockSpender")).deploy();
    lmRouter = await (await ethers.getContractFactory("MockSplitRouter")).deploy(spender.address);

    wbnb = await (await ethers.getContractFactory("WBNB")).deploy();
    vWBNB = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(wbnb.address, comptroller.address);

    venusLiq = await (await ethers.getContractFactory("MockVenusLiquidator")).deploy();
    await comptroller.setLiquidatorContract(venusLiq.address);
    await venusLiq.setVBnb(VBNB);

    liq = await deployLiquidator(comptroller.address);
    await liq.connect(owner).setRouter(lmRouter.address, true);

    // Liquidity: collateral market holds bStock to pay redeem; the LM router holds USDT to pay the swap.
    await bStock.mint(vBStock.address, SEIZED);
    await usdt.mint(lmRouter.address, OUT);

    await comptroller.setShortfall(U("800"));
    // Fund the liquidator's own inventory to cover the repay (inventory mode).
    await usdt.mint(liq.address, REPAY);
  }

  // swap(tokenIn, amountIn, tokenOut, to) against the LM-style router.
  function swapCalldata(amountIn: BigNumber, to: string) {
    return lmRouter.interface.encodeFunctionData("swap", [bStock.address, amountIn, usdt.address, to]);
  }

  function params(over: Partial<any> = {}) {
    return {
      borrower: borrower.address,
      vDebt: vDebt.address,
      vBStock: vBStock.address,
      repayAmount: REPAY,
      router: lmRouter.address,
      swapCalldata: swapCalldata(SEIZED, liq.address),
      minOut: MIN_OUT,
      router2: ZERO,
      swapCalldata2: "0x",
      intermediateToken: ZERO,
      deadline: ethers.constants.MaxUint256,
      ...over,
    };
  }

  let pristine: SnapshotRestorer;
  before(async () => {
    pristine = await takeSnapshot();
  });
  after(async () => {
    await pristine.restore();
  });
  beforeEach(deploy);

  it("REVERTS without a configured spender — approving the call target leaves the puller unapproved", async () => {
    // No setRouterSpender: `_swap` approves the router itself, but MockSpender.pull does the transferFrom
    // and has no allowance -> "spender pull failed" -> the low-level call fails -> SwapFailed.
    expect(await liq.routerSpender(lmRouter.address)).to.equal(ZERO);
    await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(liq, "SwapFailed");
  });

  it("SUCCEEDS atomically once the spender is set — seizes, redeems, and sells a token it never pre-held", async () => {
    await expect(liq.connect(owner).setRouterSpender(lmRouter.address, spender.address))
      .to.emit(liq, "RouterSpenderSet")
      .withArgs(lmRouter.address, spender.address);

    // The contract holds ZERO bStock before the call — it is acquired mid-tx.
    expect(await bStock.balanceOf(liq.address)).to.equal(0);

    await expect(liq.connect(owner).liquidate(params())).to.emit(liq, "Liquidated");

    // Proceeds landed (USDT out >= minOut), and no standing allowance is left on the spender.
    expect(await usdt.balanceOf(liq.address)).to.be.gte(MIN_OUT);
    expect(await bStock.allowance(liq.address, spender.address)).to.equal(0);
    expect(await bStock.allowance(liq.address, lmRouter.address)).to.equal(0);
    // The router pulled the input via the spender.
    expect(await bStock.balanceOf(lmRouter.address)).to.equal(SEIZED);
  });

  it("build-time simulation of the swap reverts before the token is held (the Liquid Mesh `SafeTransferFromFailed` gate)", async () => {
    // Liquid Mesh SIMULATES the swap when building calldata: by default it does transferFrom(userAddress, …)
    // against CURRENT state and refuses to return calldata unless the taker already holds + approved the input.
    // Reproduce that here: `stranger` (like the liquidator before it seizes) holds no bStock. Even with the
    // spender configured, simulating the router swap from that state reverts. In production this is bypassed
    // off-chain with `disableSimulate:true` on `POST /swap`; the block below proves the returned calldata is
    // balance-agnostic to EXECUTE, so once the token is in hand (mid-tx, test above) the same call succeeds.
    await liq.connect(owner).setRouterSpender(lmRouter.address, spender.address);

    expect(await bStock.balanceOf(stranger.address)).to.equal(0);
    await bStock.connect(stranger).approve(spender.address, SEIZED); // approval alone is not enough
    // Reverts at the spender's transferFrom for lack of balance — the on-chain analog of Liquid Mesh's
    // build-time `SafeTransferFromFailed`.
    await expect(
      lmRouter.connect(stranger).callStatic.swap(bStock.address, SEIZED, usdt.address, stranger.address),
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

    // Give `stranger` the balance (what the liquidator only has MID-TX) and the identical call now succeeds
    // — proving the returned calldata is balance-agnostic to EXECUTE; only the off-chain build gate blocks.
    await bStock.mint(stranger.address, SEIZED);
    await expect(lmRouter.connect(stranger).callStatic.swap(bStock.address, SEIZED, usdt.address, stranger.address)).to
      .not.be.reverted;
  });

  it("clears the spender entry when reset to address(0) — reverting to approve-the-router behaviour", async () => {
    await liq.connect(owner).setRouterSpender(lmRouter.address, spender.address);
    await liq.connect(owner).setRouterSpender(lmRouter.address, ZERO);
    expect(await liq.routerSpender(lmRouter.address)).to.equal(ZERO);
    // Back to old behaviour -> the split router reverts again.
    await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(liq, "SwapFailed");
  });

  it("setRouterSpender is owner-only", async () => {
    await expect(liq.connect(stranger).setRouterSpender(lmRouter.address, spender.address)).to.be.reverted;
  });

  it("setRouterSpender reverts for a router that is not allowlisted", async () => {
    // `spender.address` is a deployed contract but was never `setRouter`'d — the spender lifecycle is
    // coupled to the allowlist, so pointing it at a non-allowlisted router is rejected up front.
    await expect(liq.connect(owner).setRouterSpender(spender.address, spender.address))
      .to.be.revertedWithCustomError(liq, "RouterNotAllowed")
      .withArgs(spender.address);
  });

  it("setRouterSpender reverts when the spender is an EOA", async () => {
    // The spender receives a live token approval during `_swap`; an address with no code can never be
    // the settlement contract, so it is rejected as a misconfiguration.
    await expect(liq.connect(owner).setRouterSpender(lmRouter.address, stranger.address))
      .to.be.revertedWithCustomError(liq, "SpenderNotContract")
      .withArgs(stranger.address);
  });

  it("de-allowlisting a router clears its spender entry so it cannot silently reactivate", async () => {
    await liq.connect(owner).setRouterSpender(lmRouter.address, spender.address);

    await expect(liq.connect(owner).setRouter(lmRouter.address, false))
      .to.emit(liq, "RouterSpenderSet")
      .withArgs(lmRouter.address, ZERO);
    expect(await liq.routerSpender(lmRouter.address)).to.equal(ZERO);

    // Re-allowlisting does NOT bring the old spender back — it must be set again explicitly.
    await liq.connect(owner).setRouter(lmRouter.address, true);
    expect(await liq.routerSpender(lmRouter.address)).to.equal(ZERO);
    await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(liq, "SwapFailed");
  });
});
