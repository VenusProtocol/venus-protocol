import { expect } from "chai";
import { Contract } from "ethers";
import { ethers, upgrades } from "hardhat";

import { atomicLiquidate } from "../../scripts/bstock/atomic-liquidate";

// Exercises scripts/bstock/atomic-liquidate.ts atomicLiquidate() end-to-end against the real
// BStockLiquidator proxy + the BStock mocks. No fork, no funds, no live Native API: the swap leg is
// driven through MOCK_NATIVE ("<router>:<calldata>") so the script's off-chain half (shortfall check,
// seize precompute, treasury-fee adjustment, router-allowlist guard, minOut, mode dispatch) runs for
// real while the on-chain settle hits the same contract the dedicated contract suite covers.

const U = (n: string) => ethers.utils.parseUnits(n, 18);
const INCENTIVE = U("1.1"); // mock seizes repay * 1.1

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
  "MOCK_NATIVE",
  "MOCK_OUT",
  "MODE",
  "DRY_RUN",
  "SLIPPAGE",
  "MIN_OUT_BUFFER",
] as const;

describe("bStock atomic liquidation script", () => {
  let owner: any, borrower: any;
  let usdt: Contract, bStock: Contract;
  let comptroller: Contract, vBStock: Contract, vDebt: Contract, router: Contract, liq: Contract;

  async function deployLiquidator(comptrollerAddr: string) {
    const Factory = await ethers.getContractFactory("BStockLiquidator");
    return upgrades.deployProxy(Factory, [owner.address], {
      constructorArgs: [comptrollerAddr],
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

    // Core's pool-wide liquidator gate is always configured; every liquidation routes through it.
    const venusLiq = await (await ethers.getContractFactory("MockVenusLiquidator")).deploy();
    await comptroller.setLiquidatorContract(venusLiq.address);

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

  it("refuses a router that is not allowlisted on the contract", async () => {
    await usdt.mint(liq.address, REPAY);
    // Deploy a second router that was never allowlisted, and point the (mock) quote at it.
    const stray = await (await ethers.getContractFactory("MockNativeRouter")).deploy();
    const strayCalldata = stray.interface.encodeFunctionData("swapAll", [bStock.address, usdt.address, liq.address]);
    setEnv({ MOCK_NATIVE: `${stray.address}:${strayCalldata}` });

    await expect(atomicLiquidate(owner)).to.be.rejectedWith("not allowlisted");
    expect(await usdt.balanceOf(liq.address)).to.equal(REPAY); // untouched
  });
});
