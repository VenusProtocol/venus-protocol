import { SnapshotRestorer, setBalance, takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers, upgrades } from "hardhat";

// Atomic BStockLiquidator — exercised against the BStock mocks. Covers both funding modes
// (inventory + Venus-style flash loan), the seize->redeem->sell pipeline, the pool-gate routing
// (with and without a treasury cut), the admin surface (operator/router/sweep/init), and every
// guard (operator gating, router allowlist, minOut, and the flash-callback checks).
// Position state is "manipulated" through the mock comptroller's shortfall and seize incentive.

const U = (n: string) => ethers.utils.parseUnits(n, 18);
const ZERO = ethers.constants.AddressZero;
const INCENTIVE = U("1.1"); // 10% — mock seizes repay * 1.1
// Sentinel address for the native BNB market (vBNB). It has no code on purpose: the BNB happy-path
// tests thus double as the guard that the contract never calls `underlying()` (or anything) on vBNB —
// any such call would revert against a codeless address.
const VBNB = ethers.utils.getAddress("0x0000000000000000000000000000000000000b0b");

describe("BStockLiquidator (atomic)", () => {
  let owner: any, operator: any, borrower: any, stranger: any;
  let usdt: Contract, bStock: Contract;
  let comptroller: Contract, vBStock: Contract, vDebt: Contract, router: Contract, venusLiq: Contract;
  let wbnb: Contract, vWBNB: Contract;
  let liq: Contract;

  const REPAY = U("5000");
  const SEIZED = REPAY.mul(INCENTIVE).div(U("1")); // 5500 bStock at 1:1 redeem
  const OUT = SEIZED; // router rate 1:1 -> 5500 USDT
  const MIN_OUT = U("5400");

  async function deploy() {
    [owner, operator, borrower, stranger] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockMintableERC20");
    usdt = await ERC20.deploy("Tether", "USDT", 18);
    bStock = await ERC20.deploy("Tesla bStock", "TSLAB", 18);

    comptroller = await (await ethers.getContractFactory("MockComptrollerLite")).deploy();
    vBStock = await (
      await ethers.getContractFactory("MockVTokenCollateral")
    ).deploy(bStock.address, comptroller.address);
    vDebt = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(usdt.address, comptroller.address);
    router = await (await ethers.getContractFactory("MockNativeRouter")).deploy();

    // WBNB + its market: WBNB is the debt-accounting token for BNB debt, and vWBNB is the flash source
    // (vBNB itself cannot be flash-repaid). The gate learns the native market so its repay branch matches.
    wbnb = await (await ethers.getContractFactory("WBNB")).deploy();
    vWBNB = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(wbnb.address, comptroller.address);

    // Core's pool-wide liquidator gate is always configured on the networks this contract targets,
    // so every liquidation routes through the Venus Liquidator. Default treasury cut = 0.
    venusLiq = await (await ethers.getContractFactory("MockVenusLiquidator")).deploy();
    await comptroller.setLiquidatorContract(venusLiq.address);
    await venusLiq.setVBnb(VBNB);

    liq = await deployLiquidator(comptroller.address);
    await liq.connect(owner).setRouter(router.address, true);

    // Liquidity for the pipeline: collateral market holds bStock to pay redeem; router holds USDT to pay swap.
    await bStock.mint(vBStock.address, SEIZED);
    await usdt.mint(router.address, OUT);

    // Borrower is underwater.
    await comptroller.setShortfall(U("800"));
  }

  async function deployLiquidator(comptrollerAddr: string) {
    const Factory = await ethers.getContractFactory("BStockLiquidator");
    return upgrades.deployProxy(Factory, [owner.address], {
      constructorArgs: [comptrollerAddr, VBNB, vWBNB.address, wbnb.address],
      unsafeAllow: ["constructor", "state-variable-immutable"],
    });
  }

  // swap(tokenIn, amountIn, tokenOut, to): fixed-amount calldata forwarded to the allowlisted router.
  function swapCalldata(amountIn: BigNumber, to: string) {
    return router.interface.encodeFunctionData("swap", [bStock.address, amountIn, usdt.address, to]);
  }

  // swapAll(tokenIn, tokenOut, to): pulls the contract's whole bStock balance (used when the exact
  // seized amount isn't known up front, e.g. when a treasury cut shrinks it).
  function swapAllCalldata(to: string) {
    return router.interface.encodeFunctionData("swapAll", [bStock.address, usdt.address, to]);
  }

  // Default builder is SINGLE-HOP (router2 = 0): every test using params() is also the single-hop
  // regression against the new optional fields. Two-hop tests fill router2/swapCalldata2/intermediate.
  function params(over: Partial<any> = {}) {
    return {
      borrower: borrower.address,
      vDebt: vDebt.address,
      vBStock: vBStock.address,
      repayAmount: REPAY,
      router: router.address,
      swapCalldata: swapCalldata(SEIZED, liq.address),
      minOut: MIN_OUT,
      router2: ZERO,
      swapCalldata2: "0x",
      intermediateToken: ZERO,
      deadline: ethers.constants.MaxUint256, // never expires unless a test overrides it
      ...over,
    };
  }

  // Snapshot the pristine chain before the suite and restore it after, so per-test mutations of
  // shared default signers (e.g. setBalance(stranger) in the sweepNative test) don't leak into
  // later test files that reuse the same signer indexes (e.g. Fork/TokenRedeemer's treasury).
  let pristine: SnapshotRestorer;
  before(async () => {
    pristine = await takeSnapshot();
  });
  after(async () => {
    await pristine.restore();
  });

  beforeEach(deploy);

  describe("inventory mode", () => {
    it("repays, seizes, redeems, sells, and keeps the incentive as profit", async () => {
      await usdt.mint(liq.address, REPAY); // pre-funded inventory

      expect(await liq.connect(owner).callStatic.liquidate(params())).to.equal(OUT);

      await expect(liq.connect(owner).liquidate(params()))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, vBStock.address, vDebt.address, REPAY, SEIZED, OUT, false);

      // Started with REPAY, repaid REPAY, received OUT -> ends at OUT (profit = OUT - REPAY = 500).
      expect(await usdt.balanceOf(liq.address)).to.equal(OUT);
      // No standing bStock approval, no leftover bStock.
      expect(await bStock.allowance(liq.address, router.address)).to.equal(0);
      expect(await bStock.balanceOf(liq.address)).to.equal(0);
    });

    it("lets an allowlisted operator (not just owner) trigger it", async () => {
      await usdt.mint(liq.address, REPAY);
      await liq.connect(owner).setOperator(operator.address, true);
      await expect(liq.connect(operator).liquidate(params())).to.emit(liq, "Liquidated");
    });

    it("routes the repay through the Venus Liquidator (the pool gate)", async () => {
      await usdt.mint(liq.address, REPAY);

      await expect(liq.connect(owner).liquidate(params()))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, vBStock.address, vDebt.address, REPAY, SEIZED, OUT, false);

      // The repay went to the gated Venus Liquidator, not to vDebt directly.
      expect(await usdt.balanceOf(venusLiq.address)).to.equal(REPAY);
    });

    it("handles the Venus Liquidator treasury cut via delta accounting (sells only what was credited)", async () => {
      await venusLiq.setTreasuryCut(U("0.1")); // liquidator keeps back 10% of the seized collateral
      await usdt.mint(liq.address, REPAY);

      const seizedAfterCut = SEIZED.mul(9).div(10); // 4950 credited to the contract
      // Use swapAll: the exact seized amount is only known on-chain after the cut.
      await expect(
        liq.connect(owner).liquidate(params({ swapCalldata: swapAllCalldata(liq.address), minOut: U("4900") })),
      )
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, vBStock.address, vDebt.address, REPAY, seizedAfterCut, seizedAfterCut, false);

      // 5000 inventory - 5000 repaid + 4950 proceeds = 4950, nothing stuck.
      expect(await usdt.balanceOf(liq.address)).to.equal(seizedAfterCut);
      expect(await bStock.balanceOf(liq.address)).to.equal(0);
    });

    it("excludes pre-existing bStock from the seize (sells only what it just seized)", async () => {
      await usdt.mint(liq.address, REPAY);
      await bStock.mint(liq.address, U("100")); // stray bStock sitting in the contract
      // seizedBStock in the event is the DELTA (SEIZED), not SEIZED + 100.
      await expect(liq.connect(owner).liquidate(params()))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, vBStock.address, vDebt.address, REPAY, SEIZED, OUT, false);
      expect(await bStock.balanceOf(liq.address)).to.equal(U("100")); // stray untouched
    });

    it("resets the gate approval to zero even when the Venus Liquidator pulls less than approved", async () => {
      await usdt.mint(liq.address, REPAY);
      // Gate pulls only half the approved repay (mimics a close-factor cap); without the post-call
      // reset the unpulled remainder would linger as a standing allowance to the gate.
      await venusLiq.setPullMantissa(U("0.5"));
      await liq.connect(owner).liquidate(params());
      expect(await usdt.allowance(liq.address, venusLiq.address)).to.equal(0);
    });
  });

  // A hop's router pulls the FIXED amountIn baked into the signed calldata, while the contract approves
  // the actual measured seize. The off-chain SEIZE_BUFFER haircut signs for slightly LESS than the seize
  // (so an upward price tick can't make the pull exceed the approval and revert), which means a small
  // residual of the input token routinely stays in the contract. `PartialSwapLeftover` surfaces it.
  describe("partial swap fill (PartialSwapLeftover)", () => {
    const LEFTOVER = U("50"); // seize 5500, sign for 5450 -> 50 bStock left behind

    it("emits PartialSwapLeftover and strands the residual, which is then sweepable", async () => {
      await usdt.mint(liq.address, REPAY);
      // Contract approves the full measured seize (SEIZED); the signed calldata pulls SEIZED - LEFTOVER.
      const pulled = SEIZED.sub(LEFTOVER); // 5450 -> proceeds 5450 USDT, clears the 5400 minOut
      const p = params({ swapCalldata: swapCalldata(pulled, liq.address) });

      await expect(liq.connect(owner).liquidate(p))
        .to.emit(liq, "PartialSwapLeftover")
        .withArgs(bStock.address, LEFTOVER);

      // Residual bStock is retained (not silently lost) and recoverable via sweep.
      expect(await bStock.balanceOf(liq.address)).to.equal(LEFTOVER);
      await expect(liq.connect(owner).sweep(bStock.address, owner.address, LEFTOVER))
        .to.emit(liq, "Swept")
        .withArgs(bStock.address, owner.address, LEFTOVER);
      expect(await bStock.balanceOf(liq.address)).to.equal(0);
    });

    it("does not emit PartialSwapLeftover when the router consumes the full approval", async () => {
      await usdt.mint(liq.address, REPAY);
      await expect(liq.connect(owner).liquidate(params())).to.not.emit(liq, "PartialSwapLeftover");
      expect(await bStock.balanceOf(liq.address)).to.equal(0);
    });
  });

  describe("flash mode", () => {
    it("flash-borrows the repay, settles atomically, repays principal + premium", async () => {
      await usdt.mint(vDebt.address, REPAY); // the vToken lends the principal
      await comptroller.setFlashPremium(U("0.001")); // 0.1% premium
      const premium = REPAY.mul(U("0.001")).div(U("1")); // 5 USDT

      await expect(liq.connect(owner).flashLiquidate(params()))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, vBStock.address, vDebt.address, REPAY, SEIZED, OUT, true);

      // Contract keeps proceeds minus principal minus premium; no inventory was used.
      expect(await usdt.balanceOf(liq.address)).to.equal(OUT.sub(REPAY).sub(premium));
      // The liquidateBorrow repay went to the gated Venus Liquidator.
      expect(await usdt.balanceOf(venusLiq.address)).to.equal(REPAY);
      // vToken received only the flash repayment (principal + premium).
      expect(await usdt.balanceOf(vDebt.address)).to.equal(REPAY.add(premium));
      // Gate approval reset in flash mode too.
      expect(await usdt.allowance(liq.address, venusLiq.address)).to.equal(0);
    });

    it("resets the gate approval on a partial pull in flash mode", async () => {
      await usdt.mint(vDebt.address, REPAY);
      await venusLiq.setPullMantissa(U("0.5")); // gate pulls only half the approved repay
      await liq.connect(owner).flashLiquidate(params());
      expect(await usdt.allowance(liq.address, venusLiq.address)).to.equal(0);
    });

    it("reverts the whole tx (flash unwinds) when the sale underdelivers", async () => {
      await usdt.mint(vDebt.address, REPAY);
      await router.setRate(U("0.5")); // 5500 bStock -> 2750 USDT, below minOut
      await expect(liq.connect(owner).flashLiquidate(params())).to.be.revertedWithCustomError(liq, "InsufficientOut");
      expect(await usdt.balanceOf(liq.address)).to.equal(0); // nothing stuck
    });

    it("will not let USDT inventory mask a swap that fails to cover principal + premium", async () => {
      await usdt.mint(vDebt.address, REPAY); // flash principal
      await usdt.mint(liq.address, U("2000")); // inventory that could silently backfill
      await comptroller.setFlashPremium(U("0.001")); // premium -> obligation 5005
      await router.setRate(U("0.8")); // 5500 -> 4400 USDT: clears a loose minOut but < 5005
      const p = params({ minOut: U("4000") });
      await expect(liq.connect(owner).flashLiquidate(p)).to.be.revertedWithCustomError(liq, "InsufficientOut");
      expect(await usdt.balanceOf(liq.address)).to.equal(U("2000")); // inventory untouched
    });
  });

  // Two-hop: non-USDT debt. Hop 1 (Native mock) sells bStock -> USDT; hop 2 (a second router mock,
  // standing in for the AMM/aggregator) converts USDT -> the debt token. A single final minOut in the
  // debt token covers the whole chain. Both hops at 1:1 -> SEIZED bStock => OUT debt.
  describe("two-hop mode (non-USDT debt)", () => {
    let btcb: Contract, vBtcb: Contract, amm: Contract;

    // hop-2 calldata against the AMM mock: swap(USDT, amountIn, BTCB, to).
    function ammSwapCalldata(amountIn: BigNumber, to: string) {
      return amm.interface.encodeFunctionData("swap", [usdt.address, amountIn, btcb.address, to]);
    }
    function ammSwapAllCalldata(to: string) {
      return amm.interface.encodeFunctionData("swapAll", [usdt.address, btcb.address, to]);
    }
    function twoHopParams(over: Partial<any> = {}) {
      return params({
        vDebt: vBtcb.address, // debt is now BTCB, not USDT
        router2: amm.address,
        swapCalldata2: ammSwapCalldata(SEIZED, liq.address),
        intermediateToken: usdt.address,
        ...over,
      });
    }

    beforeEach(async () => {
      const ERC20 = await ethers.getContractFactory("MockMintableERC20");
      btcb = await ERC20.deploy("Bitcoin BEP20", "BTCB", 18);
      vBtcb = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(btcb.address, comptroller.address);
      amm = await (await ethers.getContractFactory("MockNativeRouter")).deploy();
      await liq.connect(owner).setRouter(amm.address, true);
      // hop-1 router already holds USDT (from deploy()); hop-2 router pays out BTCB.
      await btcb.mint(amm.address, OUT);
    });

    it("inventory: bStock -> USDT -> BTCB, keeps the incentive as profit", async () => {
      await btcb.mint(liq.address, REPAY); // pre-funded debt inventory

      expect(await liq.connect(owner).callStatic.liquidate(twoHopParams())).to.equal(OUT);

      await expect(liq.connect(owner).liquidate(twoHopParams()))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, vBStock.address, vBtcb.address, REPAY, SEIZED, OUT, false);

      expect(await btcb.balanceOf(liq.address)).to.equal(OUT); // 5500 BTCB, profit = OUT - REPAY
      expect(await usdt.balanceOf(liq.address)).to.equal(0); // intermediate fully consumed
      expect(await bStock.balanceOf(liq.address)).to.equal(0);
      // No standing approvals on either hop, nor to the gate (approved in the debt asset, BTCB).
      expect(await bStock.allowance(liq.address, router.address)).to.equal(0);
      expect(await usdt.allowance(liq.address, amm.address)).to.equal(0);
      expect(await btcb.allowance(liq.address, venusLiq.address)).to.equal(0);
    });

    it("flash: flash-borrows BTCB, two-hop settles, repays principal + premium", async () => {
      await btcb.mint(vBtcb.address, REPAY); // the vToken lends the principal
      await comptroller.setFlashPremium(U("0.001"));
      const premium = REPAY.mul(U("0.001")).div(U("1"));

      await expect(liq.connect(owner).flashLiquidate(twoHopParams()))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, vBStock.address, vBtcb.address, REPAY, SEIZED, OUT, true);

      expect(await btcb.balanceOf(liq.address)).to.equal(OUT.sub(REPAY).sub(premium));
      expect(await btcb.balanceOf(vBtcb.address)).to.equal(REPAY.add(premium));
      expect(await usdt.balanceOf(liq.address)).to.equal(0); // intermediate fully consumed
    });

    it("enforces minOut in the debt asset when the hop-2 (AMM) rate underdelivers", async () => {
      await btcb.mint(liq.address, REPAY);
      await amm.setRate(U("0.9")); // 5500 USDT -> 4950 BTCB, below the 5400 minOut
      await expect(liq.connect(owner).liquidate(twoHopParams())).to.be.revertedWithCustomError(liq, "InsufficientOut");
      expect(await btcb.balanceOf(liq.address)).to.equal(REPAY); // reverted, inventory intact
    });

    it("rejects a non-allowlisted hop-2 router (both entrypoints)", async () => {
      await btcb.mint(liq.address, REPAY);
      const p = twoHopParams({ router2: stranger.address });
      await expect(liq.connect(owner).liquidate(p)).to.be.revertedWithCustomError(liq, "RouterNotAllowed");
      await expect(liq.connect(owner).flashLiquidate(p)).to.be.revertedWithCustomError(liq, "RouterNotAllowed");
    });

    it("reverts InvalidIntermediate when the intermediate equals debt, bStock, or zero", async () => {
      await btcb.mint(liq.address, REPAY);
      for (const bad of [btcb.address, bStock.address, ZERO]) {
        await expect(
          liq.connect(owner).liquidate(twoHopParams({ intermediateToken: bad })),
        ).to.be.revertedWithCustomError(liq, "InvalidIntermediate");
      }
    });

    it("sells only the hop-1 proceeds — pre-existing intermediate inventory is excluded", async () => {
      await btcb.mint(liq.address, REPAY);
      await usdt.mint(liq.address, U("2000")); // stray USDT inventory

      await expect(liq.connect(owner).liquidate(twoHopParams()))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, vBStock.address, vBtcb.address, REPAY, SEIZED, OUT, false);

      expect(await usdt.balanceOf(liq.address)).to.equal(U("2000")); // stray USDT untouched
      expect(await btcb.balanceOf(liq.address)).to.equal(OUT);
    });

    it("caps the hop-2 approval at the hop-1 delta (a swapAll cannot drain intermediate inventory)", async () => {
      await btcb.mint(liq.address, REPAY);
      await usdt.mint(liq.address, U("2000")); // inventory a greedy swapAll would try to take
      // swapAll pulls the caller's ENTIRE USDT balance (7500), but the approval is capped at midDelta (5500).
      const p = twoHopParams({ swapCalldata2: ammSwapAllCalldata(liq.address) });
      await expect(liq.connect(owner).liquidate(p)).to.be.revertedWithCustomError(liq, "SwapFailed");
      expect(await usdt.balanceOf(liq.address)).to.equal(U("2000")); // reverted, inventory intact
    });

    it("emits PartialSwapLeftover for the intermediate when hop 2 pulls less than the hop-1 delta", async () => {
      await btcb.mint(liq.address, REPAY);
      const leftover = U("50");
      // Hop 1 fills fully (midDelta = SEIZED USDT); hop 2 pulls SEIZED - leftover, stranding intermediate USDT.
      const p = twoHopParams({ swapCalldata2: ammSwapCalldata(SEIZED.sub(leftover), liq.address) });

      await expect(liq.connect(owner).liquidate(p))
        .to.emit(liq, "PartialSwapLeftover")
        .withArgs(usdt.address, leftover);

      expect(await usdt.balanceOf(liq.address)).to.equal(leftover); // intermediate residual retained
      // Inventory nets to proceeds: start REPAY, repay REPAY, + (SEIZED - leftover) BTCB proceeds.
      expect(await btcb.balanceOf(liq.address)).to.equal(OUT.sub(leftover)); // proceeds landed
    });
  });

  // Native BNB debt. vBNB has no underlying() and its borrow is repaid in native BNB, so WBNB is the
  // debt-accounting token: only the repay amount is unwrapped (WBNB -> BNB) for the gate's payable path,
  // and the two-hop swap lands WBNB (bStock -> USDT -> WBNB). FLASH mode borrows from vWBNB (an ERC20
  // market), not vBNB. The WBNB.withdraw -> proxy -> receive() path here exercises the 2300-gas stipend.
  describe("BNB debt (native, WBNB-accounted)", () => {
    let ammBnb: Contract;

    // hop-2 calldata against the AMM mock: swap(USDT, amountIn, WBNB, to).
    function bnbSwapCalldata(amountIn: BigNumber, to: string) {
      return ammBnb.interface.encodeFunctionData("swap", [usdt.address, amountIn, wbnb.address, to]);
    }
    function bnbParams(over: Partial<any> = {}) {
      return params({
        vDebt: VBNB, // native BNB market
        router2: ammBnb.address,
        swapCalldata2: bnbSwapCalldata(SEIZED, liq.address),
        intermediateToken: usdt.address,
        ...over,
      });
    }

    beforeEach(async () => {
      ammBnb = await (await ethers.getContractFactory("MockNativeRouter")).deploy();
      await liq.connect(owner).setRouter(ammBnb.address, true);
      // hop-1 router (Native mock) already holds USDT (from deploy()); hop-2 AMM pays out WBNB.
      await wbnb.setBalanceOf(ammBnb.address, OUT);
      // Back the WBNB mock with native BNB so `withdraw()`'s `.transfer` can pay out the unwrapped repay.
      await setBalance(wbnb.address, U("1000000"));
    });

    it("inventory: unwraps only the repay, sells bStock -> USDT -> WBNB, keeps the incentive", async () => {
      await wbnb.setBalanceOf(liq.address, REPAY); // pre-funded WBNB float

      expect(await liq.connect(owner).callStatic.liquidate(bnbParams())).to.equal(OUT);

      await expect(liq.connect(owner).liquidate(bnbParams()))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, vBStock.address, VBNB, REPAY, SEIZED, OUT, false);

      expect(await wbnb.balanceOf(liq.address)).to.equal(OUT); // float consumed, proceeds retained as WBNB
      expect(await ethers.provider.getBalance(liq.address)).to.equal(0); // no native BNB retained
      expect(await usdt.balanceOf(liq.address)).to.equal(0); // intermediate fully consumed
      expect(await bStock.balanceOf(liq.address)).to.equal(0);
      // The native repay reached the gate.
      expect(await ethers.provider.getBalance(venusLiq.address)).to.equal(REPAY);
    });

    it("flash: borrows WBNB from vWBNB, unwraps, settles, repays principal + premium", async () => {
      await wbnb.setBalanceOf(vWBNB.address, REPAY); // vWBNB lends the WBNB principal
      await comptroller.setFlashPremium(U("0.001"));
      const premium = REPAY.mul(U("0.001")).div(U("1"));

      await expect(liq.connect(owner).flashLiquidate(bnbParams()))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, vBStock.address, VBNB, REPAY, SEIZED, OUT, true);

      expect(await wbnb.balanceOf(liq.address)).to.equal(OUT.sub(REPAY).sub(premium));
      expect(await wbnb.balanceOf(vWBNB.address)).to.equal(REPAY.add(premium)); // principal + premium back
      expect(await ethers.provider.getBalance(liq.address)).to.equal(0); // no native BNB retained
      expect(await usdt.balanceOf(liq.address)).to.equal(0); // intermediate consumed
    });

    it("enforces minOut in WBNB when the hop-2 rate underdelivers", async () => {
      await wbnb.setBalanceOf(liq.address, REPAY);
      await ammBnb.setRate(U("0.9")); // 5500 USDT -> 4950 WBNB, below the 5400 minOut
      await expect(liq.connect(owner).liquidate(bnbParams())).to.be.revertedWithCustomError(liq, "InsufficientOut");
      expect(await wbnb.balanceOf(liq.address)).to.equal(REPAY); // reverted, float intact
    });

    it("flash: will not let WBNB inventory mask a swap below principal + premium", async () => {
      await wbnb.setBalanceOf(vWBNB.address, REPAY); // flash principal
      await wbnb.setBalanceOf(liq.address, U("2000")); // inventory that could silently backfill
      await comptroller.setFlashPremium(U("0.001")); // obligation 5005
      await ammBnb.setRate(U("0.8")); // 5500 -> 4400 WBNB: clears a loose minOut but < 5005
      const p = bnbParams({ minOut: U("4000") });
      await expect(liq.connect(owner).flashLiquidate(p)).to.be.revertedWithCustomError(liq, "InsufficientOut");
      expect(await wbnb.balanceOf(liq.address)).to.equal(U("2000")); // inventory untouched
    });

    it("rejects a single-hop BNB config (router2 == 0)", async () => {
      await wbnb.setBalanceOf(liq.address, REPAY);
      await expect(
        liq.connect(owner).liquidate(bnbParams({ router2: ZERO, swapCalldata2: "0x", intermediateToken: ZERO })),
      ).to.be.revertedWithCustomError(liq, "InvalidIntermediate");
    });

    it("sweepNative: owner recovers stray native BNB, non-owner and zero recipient revert", async () => {
      await setBalance(stranger.address, U("10"));
      await stranger.sendTransaction({ to: liq.address, value: U("3") });
      expect(await ethers.provider.getBalance(liq.address)).to.equal(U("3"));

      await expect(liq.connect(stranger).sweepNative(stranger.address, U("1"))).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      await expect(liq.connect(owner).sweepNative(ZERO, U("1"))).to.be.revertedWithCustomError(
        liq,
        "ZeroAddressNotAllowed",
      );
      await expect(liq.connect(owner).sweepNative(owner.address, U("3")))
        .to.emit(liq, "SweptNative")
        .withArgs(owner.address, U("3"));
      expect(await ethers.provider.getBalance(liq.address)).to.equal(0);
    });
  });

  describe("flash callback guards (executeOperation)", () => {
    it("rejects a caller other than the Comptroller", async () => {
      await expect(
        liq.connect(stranger).executeOperation([vDebt.address], [REPAY], [0], liq.address, liq.address, "0x"),
      ).to.be.revertedWithCustomError(liq, "OnlyComptroller");
    });

    it("rejects a flash callback that reports a foreign initiator", async () => {
      const evil = await (await ethers.getContractFactory("MockMaliciousFlashComptroller")).deploy();
      await evil.setMode(0); // BadInitiator
      const evilLiq = await deployLiquidator(evil.address);
      await evilLiq.connect(owner).setRouter(router.address, true);
      await expect(evilLiq.connect(owner).flashLiquidate(params())).to.be.revertedWithCustomError(
        evilLiq,
        "BadInitiator",
      );
    });

    it("rejects a flash callback whose flashed asset != params.vDebt", async () => {
      const evil = await (await ethers.getContractFactory("MockMaliciousFlashComptroller")).deploy();
      await evil.setMode(1); // WrongAsset
      const evilLiq = await deployLiquidator(evil.address);
      await evilLiq.connect(owner).setRouter(router.address, true);
      await expect(evilLiq.connect(owner).flashLiquidate(params())).to.be.revertedWithCustomError(
        evilLiq,
        "WrongFlashAsset",
      );
    });
  });

  describe("liquidation guards", () => {
    beforeEach(async () => {
      await usdt.mint(liq.address, REPAY);
    });

    it("rejects a non-operator caller", async () => {
      await expect(liq.connect(stranger).liquidate(params())).to.be.revertedWithCustomError(liq, "NotOperator");
    });

    it("rejects a non-allowlisted router (defends the low-level call)", async () => {
      await expect(liq.connect(owner).liquidate(params({ router: stranger.address }))).to.be.revertedWithCustomError(
        liq,
        "RouterNotAllowed",
      );
    });

    it("no longer pre-blocks a zero-shortfall borrower (supports forced liquidations)", async () => {
      await comptroller.setShortfall(0);
      await expect(liq.connect(owner).liquidate(params())).to.emit(liq, "Liquidated");
    });

    it("enforces minOut", async () => {
      await router.setRate(U("0.9")); // 4950 USDT < 5400 minOut
      await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(liq, "InsufficientOut");
    });

    it("rejects a zero minOut on both entrypoints", async () => {
      await expect(liq.connect(owner).liquidate(params({ minOut: 0 }))).to.be.revertedWithCustomError(
        liq,
        "ZeroMinOut",
      );
      await expect(liq.connect(owner).flashLiquidate(params({ minOut: 0 }))).to.be.revertedWithCustomError(
        liq,
        "ZeroMinOut",
      );
    });

    it("rejects an expired deadline on both entrypoints", async () => {
      // deadline in the past: a stale tx sitting in the mempool must not execute against an old quote.
      await expect(liq.connect(owner).liquidate(params({ deadline: 1 }))).to.be.revertedWithCustomError(
        liq,
        "DeadlineExpired",
      );
      await expect(liq.connect(owner).flashLiquidate(params({ deadline: 1 }))).to.be.revertedWithCustomError(
        liq,
        "DeadlineExpired",
      );
    });

    it("bubbles up a non-zero redeem error code", async () => {
      await vBStock.setRedeemError(7);
      await expect(liq.connect(owner).liquidate(params()))
        .to.be.revertedWithCustomError(liq, "RedeemFailed")
        .withArgs(7);
    });

    it("reverts SwapFailed when the router call reverts", async () => {
      // amountIn exceeds what the contract holds/approves, so the router's transferFrom reverts.
      await expect(
        liq.connect(owner).liquidate(params({ swapCalldata: swapCalldata(SEIZED.mul(2), liq.address) })),
      ).to.be.revertedWithCustomError(liq, "SwapFailed");
    });
  });

  describe("admin", () => {
    it("locks the initializer and rejects a zero owner / zero comptroller", async () => {
      await expect(liq.initialize(owner.address)).to.be.revertedWith("Initializable: contract is already initialized");
      const Factory = await ethers.getContractFactory("BStockLiquidator");
      // zero comptroller -> implementation constructor reverts
      await expect(Factory.deploy(ZERO, VBNB, vWBNB.address, wbnb.address)).to.be.revertedWithCustomError(
        Factory,
        "ZeroAddressNotAllowed",
      );
      // zero owner -> initializer reverts during proxy deploy
      await expect(
        upgrades.deployProxy(Factory, [ZERO], {
          constructorArgs: [comptroller.address, VBNB, vWBNB.address, wbnb.address],
          unsafeAllow: ["constructor", "state-variable-immutable"],
        }),
      ).to.be.revertedWithCustomError(Factory, "ZeroAddressNotAllowed");
    });

    it("setOperator: owner-only, non-zero, emits, and toggles access", async () => {
      await expect(liq.connect(stranger).setOperator(operator.address, true)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      await expect(liq.connect(owner).setOperator(ZERO, true)).to.be.revertedWithCustomError(
        liq,
        "ZeroAddressNotAllowed",
      );
      await expect(liq.connect(owner).setOperator(operator.address, true))
        .to.emit(liq, "OperatorSet")
        .withArgs(operator.address, true);
      expect(await liq.isOperator(operator.address)).to.equal(true);

      // Revoking takes effect: the operator can no longer trigger a liquidation.
      await usdt.mint(liq.address, REPAY);
      await liq.connect(owner).setOperator(operator.address, false);
      await expect(liq.connect(operator).liquidate(params())).to.be.revertedWithCustomError(liq, "NotOperator");
    });

    it("setRouter: owner-only, non-zero, emits", async () => {
      await expect(liq.connect(stranger).setRouter(stranger.address, true)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      await expect(liq.connect(owner).setRouter(ZERO, true)).to.be.revertedWithCustomError(
        liq,
        "ZeroAddressNotAllowed",
      );
      await expect(liq.connect(owner).setRouter(stranger.address, true))
        .to.emit(liq, "RouterSet")
        .withArgs(stranger.address, true);
      expect(await liq.isRouter(stranger.address)).to.equal(true);
    });

    it("sweep: owner withdraws tokens and emits, non-owner reverts", async () => {
      await usdt.mint(liq.address, U("123"));
      await expect(liq.connect(stranger).sweep(usdt.address, stranger.address, U("1"))).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      await expect(liq.connect(owner).sweep(ZERO, owner.address, U("1"))).to.be.revertedWithCustomError(
        liq,
        "ZeroAddressNotAllowed",
      );
      await expect(liq.connect(owner).sweep(usdt.address, ZERO, U("1"))).to.be.revertedWithCustomError(
        liq,
        "ZeroAddressNotAllowed",
      );
      await expect(liq.connect(owner).sweep(usdt.address, owner.address, U("123")))
        .to.emit(liq, "Swept")
        .withArgs(usdt.address, owner.address, U("123"));
      expect(await usdt.balanceOf(owner.address)).to.equal(U("123"));
      expect(await usdt.balanceOf(liq.address)).to.equal(0);
    });
  });

  describe("deadline boundary", () => {
    beforeEach(async () => {
      await usdt.mint(liq.address, REPAY);
    });

    async function nextTs(offset: number) {
      const t = (await ethers.provider.getBlock("latest")).timestamp + offset;
      await ethers.provider.send("evm_setNextBlockTimestamp", [t]);
      return t;
    }

    it("passes when deadline equals the block timestamp (guard is strict >)", async () => {
      const t = await nextTs(100);
      await expect(liq.connect(owner).liquidate(params({ deadline: t }))).to.emit(liq, "Liquidated");
    });

    it("reverts with (deadline, now) when the deadline is one second stale", async () => {
      const t = await nextTs(100);
      await expect(liq.connect(owner).liquidate(params({ deadline: t - 1 })))
        .to.be.revertedWithCustomError(liq, "DeadlineExpired")
        .withArgs(t - 1, t);
    });

    it("moves no funds on an expired deadline (reverts before any external call)", async () => {
      const t = await nextTs(100);
      await expect(liq.connect(owner).liquidate(params({ deadline: t - 1 }))).to.be.revertedWithCustomError(
        liq,
        "DeadlineExpired",
      );
      expect(await usdt.balanceOf(liq.address)).to.equal(REPAY); // inventory untouched
      expect(await usdt.balanceOf(venusLiq.address)).to.equal(0); // no repay pulled through the gate
      expect(await usdt.allowance(liq.address, venusLiq.address)).to.equal(0); // no gate approval granted
    });
  });

  describe("reentrancy", () => {
    let evil: Contract;

    beforeEach(async () => {
      evil = await (await ethers.getContractFactory("MockReentrantRouter")).deploy();
      await usdt.mint(evil.address, OUT); // the evil router pays out the swap like the normal one
      await usdt.mint(liq.address, REPAY); // inventory to fund the outer liquidation
      // Allowlist AND operator-grant the router so the re-entry clears onlyOperator and actually
      // reaches the nonReentrant guard (otherwise it would revert on NotOperator, proving nothing).
      await liq.connect(owner).setRouter(evil.address, true);
      await liq.connect(owner).setOperator(evil.address, true);
    });

    it("blocks re-entry into liquidate while the outer liquidation still settles", async () => {
      const reentry = liq.interface.encodeFunctionData("liquidate", [params()]);
      await evil.configure(liq.address, reentry);
      const p = params({ router: evil.address, swapCalldata: swapCalldata(SEIZED, liq.address) });

      await expect(liq.connect(owner).liquidate(p)).to.emit(liq, "Liquidated");
      expect(await evil.reentryAttempted()).to.equal(true);
      expect(await evil.reentrySucceeded()).to.equal(false); // guard blocked the nested call
    });

    it("blocks cross-function re-entry into flashLiquidate", async () => {
      const reentry = liq.interface.encodeFunctionData("flashLiquidate", [params()]);
      await evil.configure(liq.address, reentry);
      const p = params({ router: evil.address, swapCalldata: swapCalldata(SEIZED, liq.address) });

      await expect(liq.connect(owner).liquidate(p)).to.emit(liq, "Liquidated");
      expect(await evil.reentrySucceeded()).to.equal(false);
    });
  });
});
