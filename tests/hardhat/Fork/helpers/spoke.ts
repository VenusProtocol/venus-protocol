// ============================================================================================
// Hub-funded SPOKE pool, stood up inside a bscmainnet fork
// ============================================================================================
//
// The spoke pool is an isolated-pools `SpokeComptroller` fork that is not deployed anywhere yet, so
// this helper deploys the REAL compiled contracts into the fork: `SpokeComptroller` and the shared
// isolated-pools `VToken`, from artifacts vendored under `../vendor/spoke/` (NOT `artifacts/` — the
// repo gitignores every directory of that name), plus the real `DeviationBoundedOracle` from the
// oracle package. Nothing here is a mock — the liquidation path the tests exercise is the pool's
// own code.
//
// Everything it leans on is live bscmainnet infrastructure: the AccessControlManager, the Normal
// Timelock that holds permissions on it, the ResilientOracle, and an isolated-pools interest-rate
// model. Two deliberate deviations, neither on the liquidation path:
//   - `poolRegistry`: `supportMarket` is restricted to it, so the pool is deployed with the test's own EOA
//     in that role instead of standing up a PoolRegistry. That changes who may list a market, not how the
//     pool behaves once one is listed.
//   - `protocolShareReserve` / `shortfall`: the markets point at `MockSpokeProtocolShareReserve` and at the
//     deployer. The PSR must be a contract: `VToken` transfers the withheld seize share to it and then calls
//     `updateAssetsState`, and Solidity's existence check makes that call revert against an EOA. Shortfall is
//     only reached on bad-debt healing, which no test here triggers.
import { BigNumber, Contract } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { initMainnetUser } from "../utils";
import { A, ONE, TOK, ZERO, asTimelockWith } from "./bstock";

/* eslint-disable @typescript-eslint/no-var-requires */
const SPOKE_COMPTROLLER_ARTIFACT = require("../vendor/spoke/SpokeComptroller.json");
const ISOLATED_VTOKEN_ARTIFACT = require("../vendor/spoke/VToken.json");
const BOUNDED_ORACLE_ARTIFACT = require("@venusprotocol/oracle/artifacts/contracts/DeviationBoundedOracle.sol/DeviationBoundedOracle.json");
/* eslint-enable @typescript-eslint/no-var-requires */

// A live isolated-pools JumpRateModelV2. Reused rather than deployed because an isolated `VToken`
// needs the isolated `InterestRateModel` interface (its `getBorrowRate` takes badDebt), which a Core
// interest-rate model does not implement.
export const ISOLATED_IRM = "0x2ba0F45f7368d2A56d0c9e5a29af363987BE1d02";

/// The pool's own ABI, so a test can assert what the pool does and does not expose.
export const SPOKE_COMPTROLLER_ABI = SPOKE_COMPTROLLER_ARTIFACT.abi;

// Mirrors `Action` in the isolated pools' ComptrollerInterface.
export const SpokeAction = {
  MINT: 0,
  REDEEM: 1,
  BORROW: 2,
  REPAY: 3,
  SEIZE: 4,
  LIQUIDATE: 5,
  TRANSFER: 6,
  ENTER_MARKET: 7,
  EXIT_MARKET: 8,
};

// Compound convention for an 8-decimal vToken over an 18-decimal underlying: 0.01 * 10^(18+18-8).
const INITIAL_EXCHANGE_RATE = parseUnits("1", 26);

export interface SpokeMarketCfg {
  underlying: string;
  name: string;
  symbol: string;
  collateralFactor: BigNumber;
  liquidationThreshold: BigNumber;
  /// Per-market liquidation discount; omit to inherit the pool default.
  liquidationIncentive?: BigNumber;
}

export interface SpokePool {
  comptroller: Contract; // SpokeComptroller behind an ERC1967 proxy
  boundedOracle: Contract;
  protocolShareReserve: Contract; // stand-in that receives the markets' withheld seize share
  markets: Record<string, Contract>; // symbol -> isolated VToken
  timelock: any; // signer that holds the ACM permissions granted below
  poolRegistry: any; // the signer allowed to call supportMarket
  supply: (who: any, symbol: string, amount: BigNumber) => Promise<void>;
  borrow: (who: any, symbol: string, amount: BigNumber) => Promise<void>;
  enter: (who: any, symbols: string[]) => Promise<void>;
}

async function deployBehindProxy(impl: Contract, initData: string, abi: any, signer: any): Promise<Contract> {
  const proxy = await (
    await ethers.getContractFactory("@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy")
  ).deploy(impl.address, initData);
  await proxy.deployed();
  return new ethers.Contract(proxy.address, abi, signer);
}

/**
 * Deploy the real `DeviationBoundedOracle` and point it at the live ResilientOracle. Left unconfigured
 * for every asset on purpose: the contract is documented to return spot on both legs for an asset it
 * holds no configuration for, which is the behaviour a market gets before governance bounds it.
 */
async function deployBoundedOracle(deployer: any): Promise<Contract> {
  const Factory = new ethers.ContractFactory(BOUNDED_ORACLE_ARTIFACT.abi, BOUNDED_ORACLE_ARTIFACT.bytecode, deployer);
  const impl = await Factory.deploy(A.RESILIENT_ORACLE, A.VBNB, ZERO);
  await impl.deployed();
  const initData = impl.interface.encodeFunctionData("initialize", [A.ACM]);
  return deployBehindProxy(impl, initData, BOUNDED_ORACLE_ARTIFACT.abi, deployer);
}

/**
 * Stand up a spoke pool with the given markets and return handles for driving it.
 *
 * @param deployer Signer that deploys, owns the pool, and stands in for the PoolRegistry.
 * @param cfgs Markets to list, in order. The first is treated as the pool's debt market.
 */
export async function deploySpokePool(deployer: any, cfgs: SpokeMarketCfg[]): Promise<SpokePool> {
  const boundedOracle = await deployBoundedOracle(deployer);

  // ---- SpokeComptroller ------------------------------------------------------------------
  const ComptrollerFactory = new ethers.ContractFactory(
    SPOKE_COMPTROLLER_ARTIFACT.abi,
    SPOKE_COMPTROLLER_ARTIFACT.bytecode,
    deployer,
  );
  // `supportMarket` is restricted to poolRegistry; the deployer takes that role (see the file header).
  const comptrollerImpl = await ComptrollerFactory.deploy(deployer.address);
  await comptrollerImpl.deployed();
  const comptroller = await deployBehindProxy(
    comptrollerImpl,
    comptrollerImpl.interface.encodeFunctionData("initialize", [100, A.ACM]),
    SPOKE_COMPTROLLER_ARTIFACT.abi,
    deployer,
  );

  // Owner-gated wiring (initialize made the deployer the owner).
  await comptroller.setPriceOracle(A.RESILIENT_ORACLE);
  await comptroller.setDeviationBoundedOracle(boundedOracle.address);

  // ---- markets ---------------------------------------------------------------------------
  const VTokenFactory = new ethers.ContractFactory(
    ISOLATED_VTOKEN_ARTIFACT.abi,
    ISOLATED_VTOKEN_ARTIFACT.bytecode,
    deployer,
  );
  // The real bscmainnet deployment parameters for an isolated VToken (see the isolated-pools
  // deployment config): block-based, 0.45s blocks, and the per-block max borrow rate.
  const vTokenImpl = await VTokenFactory.deploy(false, 70_080_000, BigNumber.from("5000000000000"));
  await vTokenImpl.deployed();

  const protocolShareReserve = await (await ethers.getContractFactory("MockSpokeProtocolShareReserve")).deploy();
  await protocolShareReserve.deployed();

  const markets: Record<string, Contract> = {};
  for (const cfg of cfgs) {
    const initData = vTokenImpl.interface.encodeFunctionData("initialize", [
      cfg.underlying,
      comptroller.address,
      ISOLATED_IRM,
      INITIAL_EXCHANGE_RATE,
      cfg.name,
      cfg.symbol,
      8,
      deployer.address, // admin
      A.ACM,
      { shortfall: deployer.address, protocolShareReserve: protocolShareReserve.address },
      parseUnits("0.1", 18), // reserve factor
    ]);
    markets[cfg.symbol] = await deployBehindProxy(vTokenImpl, initData, ISOLATED_VTOKEN_ARTIFACT.abi, deployer);
  }

  // ---- ACM permissions, held by the Normal Timelock ---------------------------------------
  const grants: [string, string][] = [
    [comptroller.address, "setCloseFactor(uint256)"],
    [comptroller.address, "setCollateralFactor(address,uint256,uint256)"],
    [comptroller.address, "setLiquidationIncentive(uint256)"],
    [comptroller.address, "setMarketLiquidationIncentive(address,uint256)"],
    [comptroller.address, "setMarketSupplyCaps(address[],uint256[])"],
    [comptroller.address, "setMarketBorrowCaps(address[],uint256[])"],
    // NOTE the role string: the pool passes `uint256[]` even though the parameter type is `Action[]`.
    [comptroller.address, "setActionsPaused(address[],uint256[],bool)"],
    [comptroller.address, "setMinLiquidatableCollateral(uint256)"],
    [comptroller.address, "setForcedLiquidation(address,bool)"],
    [comptroller.address, "setLiquidationAllowlistEnabled(bool)"],
    [comptroller.address, "setAllowedLiquidator(address,bool)"],
    [comptroller.address, "setSupplyAllowlistEnabled(address,bool)"],
    [comptroller.address, "setAllowedSupplier(address,address,bool)"],
  ];
  for (const cfg of cfgs) {
    grants.push([markets[cfg.symbol].address, "setProtocolSeizeShare(uint256)"]);
    grants.push([markets[cfg.symbol].address, "setReduceReservesBlockDelta(uint256)"]);
  }
  const timelock = await asTimelockWith(grants);

  // ---- list and configure ------------------------------------------------------------------
  const asTl = comptroller.connect(timelock);
  const all = cfgs.map(c => markets[c.symbol].address);

  for (const cfg of cfgs) {
    await comptroller.supportMarket(markets[cfg.symbol].address); // poolRegistry-only
    // Left at 0 the market sweeps reserves to the PSR on every accrual; bscmainnet isolated markets use
    // a one-day cadence.
    await markets[cfg.symbol].connect(timelock).setReduceReservesBlockDelta(28800 * 3);
  }
  await asTl.setCloseFactor(parseUnits("0.5", 18));
  await asTl.setLiquidationIncentive(parseUnits("1.1", 18));
  await asTl.setMinLiquidatableCollateral(parseUnits("100", 18));
  await asTl.setMarketSupplyCaps(
    all,
    all.map(() => ethers.constants.MaxUint256.div(2)),
  );
  await asTl.setMarketBorrowCaps(
    all,
    all.map(() => ethers.constants.MaxUint256.div(2)),
  );
  await asTl.setActionsPaused(
    all,
    [
      SpokeAction.MINT,
      SpokeAction.REDEEM,
      SpokeAction.BORROW,
      SpokeAction.REPAY,
      SpokeAction.SEIZE,
      SpokeAction.LIQUIDATE,
      SpokeAction.ENTER_MARKET,
    ],
    false,
  );
  for (const cfg of cfgs) {
    await asTl.setCollateralFactor(markets[cfg.symbol].address, cfg.collateralFactor, cfg.liquidationThreshold);
    if (cfg.liquidationIncentive) {
      await asTl.setMarketLiquidationIncentive(markets[cfg.symbol].address, cfg.liquidationIncentive);
    }
  }

  const erc20 = (a: string, s: any) => new ethers.Contract(a, ["function approve(address,uint256) returns (bool)"], s);

  return {
    comptroller,
    boundedOracle,
    protocolShareReserve,
    markets,
    timelock,
    poolRegistry: deployer,
    async supply(who: any, symbol: string, amount: BigNumber) {
      const m = markets[symbol];
      await erc20(await m.underlying(), who).approve(m.address, amount);
      await m.connect(who).mint(amount);
    },
    async borrow(who: any, symbol: string, amount: BigNumber) {
      await markets[symbol].connect(who).borrow(amount);
    },
    async enter(who: any, symbols: string[]) {
      await comptroller.connect(who).enterMarkets(symbols.map(s => markets[s].address));
    },
  };
}

/// Convenience: the live Core USDT market, used as the flash source for a spoke USDT debt.
export const CORE_VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
export const USDT = TOK.USDT;
export const ONE18 = ONE;

export async function fundNative(who: string) {
  await initMainnetUser(who, parseUnits("100", 18));
}
