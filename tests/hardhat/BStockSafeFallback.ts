// Drives the off-chain Safe fallback batch generator (scripts/bstock/safe-fallback.ts) against the
// BStock mocks and asserts the emitted Transaction Builder batch. Covers the gate routing (T1), the
// Venus Liquidator bonus-cut deduction, and the redeem treasuryPercent fee (T2).
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

import { buildSafeFallbackBatch } from "../../scripts/bstock/safe-fallback";

const U = (n: string) => ethers.utils.parseUnits(n, 18);
const ONE = U("1");
const REPAY = U("5000");
const INCENTIVE = U("1.1");
const SEIZE = REPAY.mul(INCENTIVE).div(ONE); // 5500 vBStock at the mock's 1.1x incentive

// liquidateBorrow selector: the 4-arg ILiquidator (gate) form the script always routes through.
const SEL_ROUTED = ethers.utils.id("liquidateBorrow(address,address,uint256,address)").slice(0, 10);

describe("BStock safe-fallback batch generator", () => {
  let owner: any, borrower: any, target: any;
  let usdt: Contract, bStock: Contract;
  let comptroller: Contract, vBStock: Contract, vDebt: Contract, venusLiq: Contract, vBNB: Contract;

  async function deploy() {
    [owner, borrower, target] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory("MockMintableERC20");
    usdt = await ERC20.deploy("Tether", "USDT", 18);
    bStock = await ERC20.deploy("Tesla bStock", "TSLAB", 18);

    comptroller = await (await ethers.getContractFactory("MockComptrollerLite")).deploy();
    vBStock = await (
      await ethers.getContractFactory("MockVTokenCollateral")
    ).deploy(bStock.address, comptroller.address);
    vDebt = await (await ethers.getContractFactory("MockVTokenDebt")).deploy(usdt.address, comptroller.address);
    venusLiq = await (await ethers.getContractFactory("MockVenusLiquidator")).deploy();
    // Stand-in native BNB market: identified by matching VBNB_ADDR rather than by probing underlying(),
    // but it still needs a borrow balance for the close-factor cap. Mirrors the atomic suite.
    vBNB = await (await ethers.getContractFactory("MockVBNBLite")).deploy();

    await comptroller.setShortfall(U("800"));
    // Enough debt on both markets that REPAY (5000) stays under the close-factor cap (0.5 * balance).
    for (const m of [vDebt, vBNB]) await m.setBorrowBalance(borrower.address, REPAY.mul(2));
    await comptroller.setLiquidatorContract(venusLiq.address); // gate set: the mainnet-like default
  }

  function setEnv(over: Record<string, string> = {}) {
    Object.assign(process.env, {
      SAFE: owner.address,
      BORROWER: borrower.address,
      VBSTOCK: vBStock.address,
      VDEBT: vDebt.address,
      REPAY_AMOUNT: "5000",
      TARGET: target.address,
      // The script matches the pool and the native market by ADDRESS against these; point them at the
      // freshly-deployed mocks rather than the canonical BSC defaults.
      CORE_COMPTROLLER: comptroller.address,
      VBNB_ADDR: vBNB.address,
      // Isolate the price-drift buffer from the cut/fee assertions: default it off here so those tests
      // assert exact seize-based amounts. The dedicated buffer tests below override it.
      SEIZE_BUFFER: "0",
      ...over,
    });
  }

  beforeEach(async () => {
    await deploy();
    // wipe any env leakage between tests
    for (const k of [
      "SAFE",
      "BORROWER",
      "VBSTOCK",
      "VDEBT",
      "REPAY_AMOUNT",
      "TARGET",
      "ALLOW_PLACEHOLDER",
      "SEIZE_BUFFER",
      "CORE_COMPTROLLER",
      "VBNB_ADDR",
    ]) {
      delete process.env[k];
    }
  });

  it("routes the repay through the Venus Liquidator gate (T1)", async () => {
    setEnv();
    const { txs, gate, vReceived, seizedRaw } = await buildSafeFallbackBatch(ethers.provider);

    expect(ethers.utils.getAddress(gate)).to.equal(venusLiq.address);
    expect(txs).to.have.length(4);

    // 1. approve → the GATE (not vDebt) is the repay spender
    expect(ethers.utils.getAddress(txs[0].to)).to.equal(usdt.address);
    const approve = ethers.utils.defaultAbiCoder.decode(["address", "uint256"], "0x" + txs[0].data.slice(10));
    expect(approve[0]).to.equal(venusLiq.address);
    expect(approve[1]).to.equal(REPAY);

    // 2. liquidateBorrow → the gate, 4-arg selector
    expect(ethers.utils.getAddress(txs[1].to)).to.equal(venusLiq.address);
    expect(txs[1].data.slice(0, 10)).to.equal(SEL_ROUTED);

    // 3. redeem → the credited amount (cut = 0 here, so == full seize)
    expect(ethers.utils.getAddress(txs[2].to)).to.equal(vBStock.address);
    const redeem = ethers.utils.defaultAbiCoder.decode(["uint256"], txs[2].data.slice(0, 2) + txs[2].data.slice(10));
    expect(redeem[0]).to.equal(SEIZE);
    expect(vReceived).to.equal(SEIZE);

    // 4. transfer raw bStock to the target
    expect(ethers.utils.getAddress(txs[3].to)).to.equal(bStock.address);
    const xfer = ethers.utils.defaultAbiCoder.decode(["address", "uint256"], "0x" + txs[3].data.slice(10));
    expect(xfer[0]).to.equal(target.address);
    expect(xfer[1]).to.equal(seizedRaw);
    expect(seizedRaw).to.equal(SEIZE); // cut 0, treasuryPercent 0 → full seize at 1:1 rate
  });

  it("VAI debt: approves the VAI token and emits a zero-value batch (not misread as native BNB)", async () => {
    // VAI has no underlying(), same as vBNB — the script must detect it explicitly, else the vBNB
    // fallback would build a `{value: repay}` batch the gate rejects. No PSM leg here: this path ships
    // the seized bStock rather than swapping it, so it works even when the atomic path's PSM hop is down.
    const vai = await (await ethers.getContractFactory("MockMintableERC20")).deploy("Venus VAI", "VAI", 18);
    const vaiController = await (await ethers.getContractFactory("MockVAIController")).deploy(vai.address);
    await comptroller.setVaiController(vaiController.address);
    await venusLiq.setVaiController(vaiController.address);
    // A VAI debt sizes the close-factor cap off getVAIRepayAmount, not borrowBalanceStored.
    await vaiController.setVAIRepayAmount(borrower.address, REPAY.mul(2));

    setEnv({ VDEBT: vaiController.address });
    const { txs, vReceived } = await buildSafeFallbackBatch(ethers.provider);

    // ERC20 shape (4 txs incl. the approve) — a BNB misread would drop the approve and use value.
    expect(txs).to.have.length(4);
    expect(ethers.utils.getAddress(txs[0].to)).to.equal(vai.address); // approve the VAI token itself
    const approve = ethers.utils.defaultAbiCoder.decode(["address", "uint256"], "0x" + txs[0].data.slice(10));
    expect(approve[0]).to.equal(venusLiq.address); // the gate is the repay spender
    expect(approve[1]).to.equal(REPAY);

    // liquidateBorrow routes through the gate with ZERO value (the gate's VAI branch requires msg.value == 0).
    expect(ethers.utils.getAddress(txs[1].to)).to.equal(venusLiq.address);
    expect(txs[1].data.slice(0, 10)).to.equal(SEL_ROUTED);
    expect(BigNumber.from(txs[1].value)).to.equal(0);

    expect(vReceived).to.equal(SEIZE); // seize via the VAI 2-arg math, cut 0
  });

  // The gate blocks liquidating an UNRELATED market while the borrower's VAI debt is above the
  // threshold. Catching it at BUILD time matters more here than in the atomic script: a batch that
  // reverts on execution costs a signing round, not just gas.
  describe("VAI gate pre-flight (non-VAI debt)", () => {
    let vaiController: Contract;

    beforeEach(async () => {
      const vai = await (await ethers.getContractFactory("MockMintableERC20")).deploy("Venus VAI", "VAI", 18);
      vaiController = await (await ethers.getContractFactory("MockVAIController")).deploy(vai.address);
      await comptroller.setVaiController(vaiController.address);
      await venusLiq.setVaiController(vaiController.address);
      await vaiController.setVAIRepayAmount(borrower.address, U("10000")); // >= the 1000 gate threshold, and >= 2x REPAY
      // so the remedy-step case below can legally repay REPAY under the 0.5 close factor
    });

    it("refuses to build the batch and names the VAI-first remedy when the gate would block it", async () => {
      await venusLiq.setForceVAILiquidate(true); // all five terms false -> the gate WOULD revert
      setEnv();
      await expect(buildSafeFallbackBatch(ethers.provider)).to.be.rejectedWith(/liquidate the VAI debt first/i);
    });

    it("does not fire while forceVAILiquidate is off (the mainnet default)", async () => {
      setEnv();
      const { txs } = await buildSafeFallbackBatch(ethers.provider);
      expect(txs).to.have.length(4); // built normally
    });

    it("does not fire when forced liquidation is enabled on the debt market (escape hatch)", async () => {
      await venusLiq.setForceVAILiquidate(true);
      await comptroller.setForcedLiquidation(vDebt.address, true);
      setEnv();
      const { txs } = await buildSafeFallbackBatch(ethers.provider);
      expect(txs).to.have.length(4);
    });

    it("does not fire when VAI liquidation is paused (escape hatch)", async () => {
      await venusLiq.setForceVAILiquidate(true);
      await comptroller.setActionPaused(vaiController.address, 5, true); // Action.LIQUIDATE
      setEnv();
      const { txs } = await buildSafeFallbackBatch(ethers.provider);
      expect(txs).to.have.length(4);
    });

    it("never blocks liquidating the VAI debt itself (the remedy step)", async () => {
      await venusLiq.setForceVAILiquidate(true);
      setEnv({ VDEBT: vaiController.address });
      const { txs } = await buildSafeFallbackBatch(ethers.provider);
      expect(txs).to.have.length(4); // the VAI-first step must never be self-blocked
    });
  });

  // TooMuchRepay would revert the batch for every signer, so it blocks here rather than warning: unlike a
  // shortfall that may change by execution time, this one is a certainty at build time.
  describe("close-factor cap", () => {
    it("refuses a repay above closeFactor * borrowBalance", async () => {
      await vDebt.setBorrowBalance(borrower.address, U("9000")); // 0.5 cap -> 4500 < the 5000 repay
      setEnv();
      await expect(buildSafeFallbackBatch(ethers.provider)).to.be.rejectedWith(/TooMuchRepay/);
    });

    it("lets a forced liquidation repay the full balance", async () => {
      await vDebt.setBorrowBalance(borrower.address, REPAY); // 0.5 cap would be 2500
      await comptroller.setForcedLiquidationForUser(borrower.address, vDebt.address, true);
      setEnv();
      const { txs } = await buildSafeFallbackBatch(ethers.provider);
      expect(txs).to.have.length(4);
    });

    it("still refuses a repay above the balance under a forced liquidation", async () => {
      await vDebt.setBorrowBalance(borrower.address, U("4999"));
      await comptroller.setForcedLiquidation(vDebt.address, true);
      setEnv();
      await expect(buildSafeFallbackBatch(ethers.provider)).to.be.rejectedWith(/TooMuchRepay/);
    });
  });

  it("throws when the gate is unset, aligning with the on-chain liquidator", async () => {
    await comptroller.setLiquidatorContract(ethers.constants.AddressZero);
    setEnv();
    await expect(buildSafeFallbackBatch(ethers.provider)).to.be.rejectedWith(/unset/i);
  });

  it("deducts the Liquidator bonus-cut so redeem matches what the Safe is credited", async () => {
    await venusLiq.setTreasuryCut(U("0.1")); // 10% of the bonus
    setEnv();
    const { vReceived, txs } = await buildSafeFallbackBatch(ethers.provider);

    // ours = seize·(incentive-1)/incentive · cut ; theirs = seize - ours
    const bonusAmount = SEIZE.mul(INCENTIVE.sub(ONE)).div(INCENTIVE);
    const ours = bonusAmount.mul(U("0.1")).div(ONE);
    const expected = SEIZE.sub(ours);

    expect(vReceived).to.equal(expected);
    const redeem = ethers.utils.defaultAbiCoder.decode(["uint256"], txs[2].data.slice(0, 2) + txs[2].data.slice(10));
    expect(redeem[0]).to.equal(expected);
  });

  it("applies the redeem treasuryPercent to the transferred amount (T2)", async () => {
    await comptroller.setTreasuryPercent(U("0.2")); // 20% redeem fee to treasury
    setEnv();
    const { seizedRaw } = await buildSafeFallbackBatch(ethers.provider);

    // seizedRaw = seize · rate(1:1) · (1 - treasuryPercent)
    const expected = SEIZE.mul(ONE.sub(U("0.2"))).div(ONE);
    expect(seizedRaw).to.equal(expected);
  });

  // Core-vs-isolated is decided by matching the pool against CORE_COMPTROLLER, NOT by probing a Core-only
  // function and reading its success as proof. This pool answers `liquidatorContract()` exactly like Core
  // does — under the old probe it would have been classified Core and handed a gate-routed batch.
  it("classifies by address, not by whether liquidatorContract() answers", async () => {
    const otherCore = await (await ethers.getContractFactory("MockComptrollerLite")).deploy();
    await otherCore.setLiquidatorContract(venusLiq.address); // answers the probe, yet is not OUR core
    setEnv({ CORE_COMPTROLLER: otherCore.address });

    // Routed to the isolated branch, which asks the pool for `isMarketListed` — a function this Core-shaped
    // mock does not have. The rejection is the point: no Core batch was built for a non-Core pool.
    await expect(buildSafeFallbackBatch(ethers.provider)).to.be.rejected;
  });

  // Native BNB debt: VDEBT is vBNB (no underlying()), so the script auto-detects it, drops the approve
  // (nothing to approve), and sends repay as msg.value on the routed liquidateBorrow — the Liquidator
  // forwards it to vBNB and requires msg.value == repay.
  it("bnb debt: auto-detects vBNB, drops the approve, sends repay as msg.value", async () => {
    setEnv({ VDEBT: vBNB.address });
    const { txs, seizedRaw } = await buildSafeFallbackBatch(ethers.provider);

    // three txs: no ERC20 approve on the native path
    expect(txs).to.have.length(3);

    // 1. liquidateBorrow → the gate, 4-arg selector, repay carried as native value
    expect(ethers.utils.getAddress(txs[0].to)).to.equal(venusLiq.address);
    expect(txs[0].data.slice(0, 10)).to.equal(SEL_ROUTED);
    expect(txs[0].value).to.equal(REPAY.toString());

    // 2. redeem → the credited amount (cut 0 here, so == full seize)
    expect(ethers.utils.getAddress(txs[1].to)).to.equal(vBStock.address);

    // 3. transfer raw bStock to the target
    expect(ethers.utils.getAddress(txs[2].to)).to.equal(bStock.address);
    const xfer = ethers.utils.defaultAbiCoder.decode(["address", "uint256"], "0x" + txs[2].data.slice(10));
    expect(xfer[0]).to.equal(target.address);
    expect(xfer[1]).to.equal(seizedRaw);
  });

  it("haircuts the redeem/transfer by SEIZE_BUFFER so oracle drift leaves dust, not a revert (M4)", async () => {
    setEnv({ SEIZE_BUFFER: "10" }); // 10% haircut for a clean, observable number
    const { vReceived, vRedeem, seizedRaw, txs } = await buildSafeFallbackBatch(ethers.provider);

    // Credited (vReceived) is still the full seize (cut 0); only the REDEEMED amount is haircut, so a
    // small upward price move before quorum leaves the batch redeeming less than credited (dust remains).
    expect(vReceived).to.equal(SEIZE);
    expect(vRedeem).to.equal(SEIZE.mul(9000).div(10000)); // 90% of 5500 = 4950
    expect(seizedRaw).to.equal(SEIZE.mul(9000).div(10000)); // 1:1 rate, treasuryPercent 0

    // The redeem tx uses the haircut amount, not the full credit.
    const redeem = ethers.utils.defaultAbiCoder.decode(["uint256"], txs[2].data.slice(0, 2) + txs[2].data.slice(10));
    expect(redeem[0]).to.equal(vRedeem);
  });

  it("rejects an out-of-range SEIZE_BUFFER", async () => {
    setEnv({ SEIZE_BUFFER: "150" });
    await expect(buildSafeFallbackBatch(ethers.provider)).to.be.rejectedWith(/SEIZE_BUFFER/);
  });

  it("sizes the Liquidator treasury cut off the effective incentive, not core (VAI)", async () => {
    // VAI borrower in a non-core pool: effective vBStock incentive (1.25x) differs from core (1.1x). The
    // gate sizes the bonus cut with the effective incentive for every debt type, so the batch must too —
    // the borrower-agnostic core incentive is only correct for VAI's SEIZE math, not the cut.
    const vai = await (await ethers.getContractFactory("MockMintableERC20")).deploy("Venus VAI", "VAI", 18);
    const vaiController = await (await ethers.getContractFactory("MockVAIController")).deploy(vai.address);
    await comptroller.setVaiController(vaiController.address);
    await venusLiq.setVaiController(vaiController.address);
    await comptroller.setEffectiveIncentive(U("1.25"));
    await venusLiq.setTreasuryCut(U("0.5")); // 50% of the bonus
    await vaiController.setVAIRepayAmount(borrower.address, REPAY.mul(2)); // keeps REPAY under the cap

    setEnv({ VDEBT: vaiController.address });
    const { vReceived } = await buildSafeFallbackBatch(ethers.provider);

    // seize = repay*core = 5500; bonus = 5500*(0.25/1.25) = 1100; cut = 550 -> credited 4950.
    // Core-based sizing (the pre-fix path) would give bonus 500, cut 250, credited 5250.
    const bonusAmount = SEIZE.mul(U("1.25").sub(ONE)).div(U("1.25"));
    const cut = bonusAmount.mul(U("0.5")).div(ONE);
    expect(vReceived).to.equal(SEIZE.sub(cut)); // 4950, not 5250
  });
});
