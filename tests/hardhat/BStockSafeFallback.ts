// Drives the off-chain Safe fallback batch generator (scripts/bstock/safe-fallback.ts) against the
// BStock mocks and asserts the emitted Transaction Builder batch. Covers the gate routing (T1), the
// Venus Liquidator bonus-cut deduction, and the redeem treasuryPercent fee (T2).
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

import { buildSafeFallbackBatch } from "../../scripts/bstock/safe-fallback";

const U = (n: string) => ethers.utils.parseUnits(n, 18);
const ONE = U("1");
const REPAY = U("5000");
const INCENTIVE = U("1.1");
const SEIZE = REPAY.mul(INCENTIVE).div(ONE); // 5500 vBStock at the mock's 1.1x incentive

// liquidateBorrow selector: the 4-arg ILiquidator (gate) form the script always routes through.
const SEL_ROUTED = ethers.utils.id("liquidateBorrow(address,address,uint256,address)").slice(0, 10);

// Sentinel native BNB market (vBNB); no code, so underlying() reverts and the script treats the debt
// as native BNB — mirrors the atomic suite.
const VBNB = ethers.utils.getAddress("0x0000000000000000000000000000000000000b0b");

describe("BStock safe-fallback batch generator", () => {
  let owner: any, borrower: any, target: any;
  let usdt: Contract, bStock: Contract;
  let comptroller: Contract, vBStock: Contract, vDebt: Contract, venusLiq: Contract;

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

    await comptroller.setShortfall(U("800"));
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
      ...over,
    });
  }

  beforeEach(async () => {
    await deploy();
    // wipe any env leakage between tests
    for (const k of ["SAFE", "BORROWER", "VBSTOCK", "VDEBT", "REPAY_AMOUNT", "TARGET", "ALLOW_PLACEHOLDER"]) {
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

  // Native BNB debt: VDEBT is vBNB (no underlying()), so the script auto-detects it, drops the approve
  // (nothing to approve), and sends repay as msg.value on the routed liquidateBorrow — the Liquidator
  // forwards it to vBNB and requires msg.value == repay.
  it("bnb debt: auto-detects vBNB, drops the approve, sends repay as msg.value", async () => {
    setEnv({ VDEBT: VBNB });
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
});
