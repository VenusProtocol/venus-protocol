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
export async function findBalanceSlot(token: string): Promise<number | null> {
  const probe = "0x" + "ba1".padStart(40, "0");
  const probeAmount = BigNumber.from("1234567890");
  const erc20 = new ethers.Contract(token, ERC20_ABI, ethers.provider);
  for (let slot = 0; slot <= 12; slot++) {
    const storageSlot = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [probe, slot]),
    );
    const prev = await ethers.provider.getStorageAt(token, storageSlot);
    await setStorageAt(token, storageSlot, ethers.utils.hexZeroPad(probeAmount.toHexString(), 32));
    try {
      const bal = await erc20.balanceOf(probe);
      await setStorageAt(token, storageSlot, prev);
      if (bal.eq(probeAmount)) return slot;
    } catch {
      await setStorageAt(token, storageSlot, prev);
    }
  }
  return null;
}

export async function setTokenBalance(token: string, account: string, amount: BigNumber, slot: number) {
  const storageSlot = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [account, slot]),
  );
  await setStorageAt(token, storageSlot, ethers.utils.hexZeroPad(amount.toHexString(), 32));
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
