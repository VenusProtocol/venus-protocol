// Helpers for the bStock backstop-liquidator fork suite.
//
// The centerpiece is `listBStockMarket`: on a bscmainnet fork it deploys a fresh bStock ERC20 + a REAL
// Venus vToken, lists that vToken on the LIVE Core Pool diamond (via timelock/ACM impersonation), wires
// a price into the real ResilientOracle, and configures collateral factor / supply cap / action pausing —
// i.e. it stands up a genuine bStock collateral market the same way governance would. Everything else in
// the suite (borrower positions, liquidations) then runs against that real market and the real gate.
//
// bStock (ERC-8056 tokenized stock) has NO on-chain AMM liquidity, so a freshly listed market cannot be
// offloaded on PancakeSwap. In production the bStock->USDT leg is an off-chain Native RFQ (MM-signed firm
// quote); on a fork we cannot reproduce that, so hop-1 is a MockNativeRouter pre-funded with USDT that
// models the firm quote, while hop-2 (USDT->debt) uses REAL PancakeSwap where liquidity actually exists.
import { setStorageAt } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { initMainnetUser } from "../utils";

/* ------------------------------------------------------------------ */
/*                        bscmainnet addresses                        */
/* ------------------------------------------------------------------ */

export const A = {
  COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
  TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
  ACM: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  PCS_ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  VBNB: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
  VWBNB: "0x6bCa74586218dB34cdB402295796b79663d816e9",
  // A real listed market used only to read a live interest-rate model.
  VBTC: "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B",
  // Oracles are addressed directly (the diamond's oracle() getter is not reliably routed at the fork).
  RESILIENT_ORACLE: "0x6592b5DE802159F3E74B2486b091D11a8256ab8A",
  CHAINLINK_ORACLE: "0x1B2103441A0A108daD8848D8F5d790e4D402921F",
};

export const TOK = {
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  CAKE: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
  BTCB: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
};

export const ONE = parseUnits("1", 18);
export const ZERO = ethers.constants.AddressZero;

// Core Pool Comptroller "Action" enum (see IComptroller.Action).
export const Action = { MINT: 0, REDEEM: 1, BORROW: 2, REPAY: 3, SEIZE: 4, LIQUIDATE: 5, ENTER_MARKET: 7 };

/* ------------------------------------------------------------------ */
/*                           minimal ABIs                             */
/* ------------------------------------------------------------------ */

const ACM_ABI = ["function giveCallPermission(address contractAddress, string functionSig, address account)"];
const COMPTROLLER_ABI = [
  "function oracle() view returns (address)",
  "function getAllMarkets() view returns (address[])",
  "function markets(address) view returns (bool isListed, uint256 collateralFactorMantissa, bool isVenus)",
  "function actionPaused(address,uint8) view returns (bool)",
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  "function liquidatorContract() view returns (address)",
  "function closeFactorMantissa() view returns (uint256)",
  "function liquidateCalculateSeizeTokens(address,address,uint256) view returns (uint256,uint256)",
  "function _supportMarket(address) returns (uint256)",
  "function setCollateralFactor(address,uint256,uint256) returns (uint256)",
  "function _setMarketSupplyCaps(address[],uint256[])",
  "function _setActionsPaused(address[],uint8[],bool)",
  "function _setForcedLiquidation(address,bool)",
  "function setLiquidationIncentive(address,uint256) returns (uint256)",
  "function enterMarkets(address[]) returns (uint256[])",
];
const RESILIENT_ORACLE_ABI = [
  "function getUnderlyingPrice(address) view returns (uint256)",
  "function getTokenConfig(address) view returns (tuple(address asset, address[3] oracles, bool[3] enableFlagsForOracles, bool cachingEnabled))",
  "function setTokenConfig(tuple(address asset, address[3] oracles, bool[3] enableFlagsForOracles, bool cachingEnabled))",
];
const CHAINLINK_ORACLE_ABI = ["function setDirectPrice(address asset, uint256 price)"];
export const VTOKEN_ABI = [
  "function underlying() view returns (address)",
  "function mint(uint256) returns (uint256)",
  "function borrow(uint256) returns (uint256)",
  "function borrowBalanceStored(address) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function interestRateModel() view returns (address)",
  "function isFlashLoanEnabled() view returns (bool)",
];
export const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];
const PCS_ABI = [
  "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
  "function getAmountsOut(uint256,address[]) view returns (uint256[])",
];
const RESILIENT_READ_ABI = ["function getUnderlyingPrice(address) view returns (uint256)"];

/* ------------------------------------------------------------------ */
/*                    deterministic PRNG (mulberry32)                 */
/* ------------------------------------------------------------------ */

// Tiny seeded PRNG so fuzz runs replay exactly from a seed (no runtime dependency). Returns a
// function yielding a float in [0, 1). Log the seed in the test so a failing run is reproducible.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick a random BigNumber in [min, max] using the PRNG (bounded-range, uniform enough for fuzzing).
export function randBn(rnd: () => number, min: BigNumber, max: BigNumber): BigNumber {
  const span = max.sub(min);
  if (span.lte(0)) return min;
  const bps = Math.floor(rnd() * 10001); // 0..10000
  return min.add(span.mul(bps).div(10000));
}

/* ------------------------------------------------------------------ */
/*                       storage-balance seeding                      */
/* ------------------------------------------------------------------ */

// Brute-force the ERC20 balances mapping slot, then write a balance directly — used to fund the mock
// Native router with USDT and to top up thin debt markets without needing a whale.
//
// The balances mapping location varies: the base slot index differs per token (proxies/OZ gaps push it
// higher), and the mapping-key hashing order differs between Solidity `keccak(key,slot)` and Vyper-style
// `keccak(slot,key)`. Probe a wide range in BOTH orders and return whichever reproduces balanceOf; some
// tokens (unusual/ERC-7201-namespaced layouts) still won't be found and must be seeded via a whale.
export interface BalanceSlot {
  slot: number;
  slotFirst: boolean; // true => key hashed as keccak(slot, key) (Vyper), false => keccak(key, slot)
}

function mappingSlot(account: string, loc: BalanceSlot): string {
  const types = loc.slotFirst ? ["uint256", "address"] : ["address", "uint256"];
  const values = loc.slotFirst ? [loc.slot, account] : [account, loc.slot];
  return ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(types, values));
}

export async function findBalanceSlot(token: string): Promise<BalanceSlot | null> {
  const probe = "0x" + "ba1".padStart(40, "0");
  const probeAmount = BigNumber.from("1234567890");
  const erc20 = new ethers.Contract(token, ERC20_ABI, ethers.provider);
  for (let slot = 0; slot <= 60; slot++) {
    for (const slotFirst of [false, true]) {
      const loc = { slot, slotFirst };
      const storageSlot = mappingSlot(probe, loc);
      const prev = await ethers.provider.getStorageAt(token, storageSlot);
      await setStorageAt(token, storageSlot, ethers.utils.hexZeroPad(probeAmount.toHexString(), 32));
      try {
        const bal = await erc20.balanceOf(probe);
        await setStorageAt(token, storageSlot, prev);
        if (bal.eq(probeAmount)) return loc;
      } catch {
        await setStorageAt(token, storageSlot, prev);
      }
    }
  }
  return null;
}

export async function setTokenBalance(token: string, account: string, amount: BigNumber, loc: BalanceSlot) {
  await setStorageAt(token, mappingSlot(account, loc), ethers.utils.hexZeroPad(amount.toHexString(), 32));
}

/* ------------------------------------------------------------------ */
/*                       ACM-gated call helper                        */
/* ------------------------------------------------------------------ */

// Grant `sig` on `target` to the timelock, returning a timelock signer that can then make the call.
export async function asTimelockWith(sigs: [string, string][]): Promise<any> {
  const timelock = await initMainnetUser(A.TIMELOCK, parseUnits("100", 18));
  const acm = new ethers.Contract(A.ACM, ACM_ABI, timelock);
  for (const [target, sig] of sigs) {
    await acm.giveCallPermission(target, sig, A.TIMELOCK);
  }
  return timelock;
}

/* ------------------------------------------------------------------ */
/*                    deploy the BStockLiquidator                     */
/* ------------------------------------------------------------------ */

export async function deployLiq(owner: any): Promise<Contract> {
  const { upgrades } = await import("hardhat");
  const Factory = await ethers.getContractFactory("BStockLiquidator");
  const liq = await upgrades.deployProxy(Factory, [owner.address], {
    constructorArgs: [A.COMPTROLLER, A.VBNB, A.VWBNB, TOK.WBNB],
    unsafeAllow: ["constructor", "state-variable-immutable"],
  });
  return liq as unknown as Contract;
}

/* ------------------------------------------------------------------ */
/*                      list a real bStock market                     */
/* ------------------------------------------------------------------ */

export interface BStockMarket {
  bStock: Contract; // raw ERC20 (18-dec)
  vBStock: Contract; // the listed Venus vToken (8-dec)
  price: BigNumber; // USD price mantissa (1e18) currently set on the oracle
  setPrice: (p: BigNumber) => Promise<void>; // crash/raise the bStock oracle price
  setCollateralFactor: (cf: BigNumber) => Promise<void>; // drop CF to force shortfall
}

// Deploy + list a genuine bStock collateral market on the live Core Pool diamond and price it in the
// real ResilientOracle. Order matters: oracle price must exist BEFORE setCollateralFactor (Compound
// blocks a CF on an unpriced asset); _supportMarket itself needs no price.
export async function listBStockMarket(owner: any, initialPriceUsd = parseUnits("250", 18)): Promise<BStockMarket> {
  const resilientAddr = A.RESILIENT_ORACLE;
  const chainlinkAddr = A.CHAINLINK_ORACLE;

  // 1. Raw bStock token (mintable 18-dec ERC20 stands in for the ERC-8056 stock token on the fork).
  const bStock = await (await ethers.getContractFactory("MockMintableERC20")).deploy("Tesla bStock", "TSLAB", 18);

  // 2. A real Venus vToken for it, reusing the live interest-rate model from an existing market.
  const irm: string = await new ethers.Contract(A.VBTC, VTOKEN_ABI, owner).interestRateModel();
  const delegate = await (await ethers.getContractFactory("VBep20Delegate")).deploy();
  const initialExchangeRate = parseUnits("2", 26); // 0.02 * 10^(18+18-8), Compound standard for 8-dec vToken
  const vBStock = await (
    await ethers.getContractFactory("VBep20Delegator")
  ).deploy(
    bStock.address,
    A.COMPTROLLER,
    irm,
    initialExchangeRate,
    "Venus bStock",
    "vBSTOCK",
    8,
    owner.address, // admin
    delegate.address,
    "0x",
  );
  const vBStockAsVToken = new ethers.Contract(vBStock.address, VTOKEN_ABI, owner);

  // 3. Oracle: MAIN -> live ChainlinkOracle, pivot/fallback disabled; then a direct price (no feed needed).
  const tl = await asTimelockWith([
    [resilientAddr, "setTokenConfig(TokenConfig)"],
    [chainlinkAddr, "setDirectPrice(address,uint256)"],
    [A.COMPTROLLER, "_supportMarket(address)"],
    [A.COMPTROLLER, "setCollateralFactor(address,uint256,uint256)"],
    [A.COMPTROLLER, "_setMarketSupplyCaps(address[],uint256[])"],
    [A.COMPTROLLER, "_setActionsPaused(address[],uint8[],bool)"],
    [A.COMPTROLLER, "setLiquidationIncentive(address,uint256)"],
  ]);
  await new ethers.Contract(resilientAddr, RESILIENT_ORACLE_ABI, tl).setTokenConfig({
    asset: bStock.address,
    oracles: [chainlinkAddr, ZERO, ZERO],
    enableFlagsForOracles: [true, false, false],
    cachingEnabled: false,
  });
  const chainlink = new ethers.Contract(chainlinkAddr, CHAINLINK_ORACLE_ABI, tl);
  await chainlink.setDirectPrice(bStock.address, initialPriceUsd);

  // 4. List the market, set a healthy collateral factor, lift the supply cap, unpause the actions.
  const cAsTl = new ethers.Contract(A.COMPTROLLER, COMPTROLLER_ABI, tl);
  await cAsTl._supportMarket(vBStock.address);
  await cAsTl._setMarketSupplyCaps([vBStock.address], [ethers.constants.MaxUint256.div(2)]);
  await cAsTl._setActionsPaused(
    [vBStock.address],
    [Action.MINT, Action.BORROW, Action.SEIZE, Action.LIQUIDATE, Action.ENTER_MARKET],
    false,
  );
  await cAsTl.setCollateralFactor(vBStock.address, parseUnits("0.6", 18), parseUnits("0.6", 18));
  // Per-market liquidation incentive (diamond default is 0 for a fresh market, which zeroes the seize).
  await cAsTl.setLiquidationIncentive(vBStock.address, parseUnits("1.1", 18));

  return {
    bStock,
    vBStock: vBStockAsVToken,
    price: initialPriceUsd,
    setPrice: async (p: BigNumber) => {
      await chainlink.setDirectPrice(bStock.address, p);
    },
    setCollateralFactor: async (cf: BigNumber) => {
      await cAsTl.setCollateralFactor(vBStock.address, cf, cf);
    },
  };
}

/* ------------------------------------------------------------------ */
/*                      mock Native RFQ router                        */
/* ------------------------------------------------------------------ */

// Deploy the MockNativeRouter used for the illiquid bStock->USDT hop and pre-fund it with USDT so it
// can pay out the "firm quote". `rate` (1e18) is USDT-per-bStock, i.e. the MM's quoted bStock price.
export async function deployFundedMockNative(owner: any, rate: BigNumber, usdtFloat = parseUnits("5000000", 18)) {
  const mock = await (await ethers.getContractFactory("MockNativeRouter")).deploy();
  await mock.setRate(rate);
  const slot = await findBalanceSlot(TOK.USDT);
  if (slot === null) throw new Error("could not locate USDT balance slot");
  await setTokenBalance(TOK.USDT, mock.address, usdtFloat, slot);
  return { mock, usdtSlot: slot };
}

/* ------------------------------------------------------------------ */
/*                     underwater borrower factory                    */
/* ------------------------------------------------------------------ */

export interface UnderwaterCfg {
  mkt: BStockMarket;
  vDebt: string; // debt market to borrow from
  borrower: string; // a CODELESS EOA (required for the native disbursement path)
  collateralBStock: BigNumber; // raw bStock supplied as collateral (18-dec)
  borrowAmount: BigNumber; // debt underlying to borrow (debt decimals)
  crashPriceTo?: BigNumber; // if set, bStock oracle price is dropped here to force shortfall
}

// Build a real underwater position: supply bStock, enter the market, borrow the debt asset, then push
// the account into shortfall by crashing the bStock oracle price (the realistic trigger for a bStock
// backstop liquidation — the stock gapped down). Returns the impersonated borrower signer.
export async function makeUnderwaterBorrower(cfg: UnderwaterCfg): Promise<any> {
  const borrower = await initMainnetUser(cfg.borrower, parseUnits("10", 18));
  if ((await ethers.provider.getCode(cfg.borrower)) !== "0x") {
    throw new Error(`borrower ${cfg.borrower} must be a codeless EOA (native path relies on it)`);
  }
  await cfg.mkt.bStock.mint(cfg.borrower, cfg.collateralBStock);
  await cfg.mkt.bStock.connect(borrower).approve(cfg.mkt.vBStock.address, cfg.collateralBStock);
  await new ethers.Contract(cfg.mkt.vBStock.address, VTOKEN_ABI, borrower).mint(cfg.collateralBStock);
  await new ethers.Contract(A.COMPTROLLER, COMPTROLLER_ABI, borrower).enterMarkets([cfg.mkt.vBStock.address]);
  // Legacy vTokens return an error CODE from borrow() instead of reverting, so a capped/paused/illiquid
  // market silently leaves zero debt — which would later surface as an opaque "LiquidationFailed(3)".
  // Probe the code first and fail loudly, then execute and assert the debt actually materialized.
  const vd = new ethers.Contract(cfg.vDebt, VTOKEN_ABI, borrower);
  const code: BigNumber = await vd.callStatic.borrow(cfg.borrowAmount);
  if (!code.eq(0)) throw new Error(`borrow(${cfg.vDebt}) returned code ${code.toString()} (cap/paused/liquidity)`);
  await vd.borrow(cfg.borrowAmount);
  if ((await vd.borrowBalanceStored(cfg.borrower)).eq(0)) throw new Error(`borrow(${cfg.vDebt}) produced no debt`);
  if (cfg.crashPriceTo) await cfg.mkt.setPrice(cfg.crashPriceTo);
  return borrower;
}

/* ------------------------------------------------------------------ */
/*                          swap-hop builders                         */
/* ------------------------------------------------------------------ */

// Single hop (USDT debt): sell the whole seized bStock balance to USDT through the mock RFQ router.
export function buildSingleHopMock(mkt: BStockMarket, mock: Contract, liqAddr: string): string {
  return mock.interface.encodeFunctionData("swapAll", [mkt.bStock.address, TOK.USDT, liqAddr]);
}

// Two hops (non-USDT debt): hop-1 mock bStock->USDT (swapAll), hop-2 REAL PancakeSwap USDT->debt.
// The hop-2 amountIn is under-shot so the fixed-amount PCS calldata always fits under the on-chain
// approval (the actual USDT from hop-1 varies with the treasury cut). minOut tracks the live quote.
export async function buildTwoHopMockThenPcs(
  owner: any,
  mkt: BStockMarket,
  mock: Contract,
  vDebt: string,
  repay: BigNumber,
  pathUsdtToDebt: string[],
  liqAddr: string,
  rate: BigNumber,
): Promise<{ swapCalldata: string; swapCalldata2: string; expectedOut: BigNumber }> {
  const comptroller = new ethers.Contract(A.COMPTROLLER, COMPTROLLER_ABI, owner);
  const [, seizeTokens] = await comptroller.liquidateCalculateSeizeTokens(vDebt, mkt.vBStock.address, repay);
  const xr: BigNumber = await mkt.vBStock.exchangeRateStored();
  const grossBStock = seizeTokens.mul(xr).div(ONE); // bStock the seized vTokens redeem to (pre treasury cut)
  const usdtFromHop1 = grossBStock.mul(rate).div(ONE); // mock output at the quoted rate
  const x2 = usdtFromHop1.mul(90).div(100); // under-shoot 10% to stay under the real approval after the cut
  const pcs = new ethers.Contract(A.PCS_ROUTER, PCS_ABI, owner);
  const expectedOut: BigNumber = (await pcs.getAmountsOut(x2, pathUsdtToDebt))[pathUsdtToDebt.length - 1];
  const deadline = ethers.constants.MaxUint256;
  return {
    swapCalldata: mock.interface.encodeFunctionData("swapAll", [mkt.bStock.address, TOK.USDT, liqAddr]),
    swapCalldata2: pcs.interface.encodeFunctionData("swapExactTokensForTokens", [
      x2,
      0,
      pathUsdtToDebt,
      liqAddr,
      deadline,
    ]),
    expectedOut,
  };
}

/* ------------------------------------------------------------------ */
/*                        invariant assertions                        */
/* ------------------------------------------------------------------ */

// Post-liquidation invariants that must hold on EVERY successful settle: the liquidator never keeps the
// RFQ-only bStock, never strands native BNB, and the borrower's debt strictly shrank. Proceeds land as
// the debt asset (callers check the returned debtOut against minOut).
export async function assertSettledFor(
  liq: Contract,
  mkt: BStockMarket,
  vDebt: string,
  borrower: string,
  borrowBefore: BigNumber,
) {
  expect(await mkt.bStock.balanceOf(liq.address)).to.equal(0);
  expect(await ethers.provider.getBalance(liq.address)).to.equal(0);
  const borrowAfter: BigNumber = await new ethers.Contract(vDebt, VTOKEN_ABI, ethers.provider).borrowBalanceStored(
    borrower,
  );
  expect(borrowAfter).to.be.lt(borrowBefore);
}

// Rollback invariants: on any revert the borrow is untouched and the liquidator's inventory is intact.
export async function assertRolledBack(
  liq: Contract,
  mkt: BStockMarket,
  vDebt: string,
  borrower: string,
  borrowBefore: BigNumber,
  debtToken: string,
  inventoryBefore: BigNumber,
) {
  const borrowAfter: BigNumber = await new ethers.Contract(vDebt, VTOKEN_ABI, ethers.provider).borrowBalanceStored(
    borrower,
  );
  expect(borrowAfter).to.be.gte(borrowBefore); // borrow not reduced (may accrue up)
  expect(await new ethers.Contract(debtToken, ERC20_ABI, ethers.provider).balanceOf(liq.address)).to.equal(
    inventoryBefore,
  );
  expect(await mkt.bStock.balanceOf(liq.address)).to.equal(0);
  expect(await ethers.provider.getBalance(liq.address)).to.equal(0);
}
