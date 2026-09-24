/**
 * Market-state pre-flight shared by the two bStock operator scripts.
 *
 * Both scripts drive the same liquidation through different executors — atomic-liquidate.ts sends it from
 * the BStockLiquidator contract, safe-fallback.ts emits a Safe batch that does it by hand — so both are
 * bound by the same comptroller hooks. Those hooks only fire AFTER the repay is staged, which is the worst
 * possible time to learn about them: on the atomic path it costs a firm RFQ quote and the gas of a doomed
 * settle, on the Safe path it costs a whole signing round. Reading them up front costs a handful of eth_calls.
 *
 * THESE GATES ARE POOL-AGNOSTIC. `actionPaused` and `checkMembership` exist on Core and on the isolated
 * pools with the same signature and the same meaning, and the `Action` enum is byte-identical in both repos'
 * ComptrollerInterface, so one implementation serves both. The genuinely pool-specific gates stay out:
 * `protocolPaused` is Core-only, the liquidation allowlist and `minLiquidatableCollateral` are isolated-only.
 */
import { BigNumber, Contract, Signer, providers, utils } from "ethers";

import { ISOLATED_VTOKEN_SNAPSHOT_ABI, ORACLE_ABI } from "./abis";

/**
 * `Action` ordinals: MINT, REDEEM, BORROW, REPAY, SEIZE, LIQUIDATE, TRANSFER, ENTER_MARKET, EXIT_MARKET.
 * Identical in venus-protocol's and isolated-pools' ComptrollerInterface, and both pools expose the same
 * `actionPaused(address,uint8)` getter, so these serve either side. Note the uint8: the ABI encodes the enum
 * as uint8, and `actionPaused(address,uint256)` is a DIFFERENT selector that exists on neither pool.
 */
export const ACTION_REDEEM = 1;
export const ACTION_SEIZE = 4;
export const ACTION_LIQUIDATE = 5;

const ONE18 = BigNumber.from(10).pow(18);

export interface MarketGateArgs {
  /** Bound to CORE_COMPTROLLER_ABI or ISOLATED_COMPTROLLER_ABI to match `isCore`. */
  comptroller: Contract;
  isCore: boolean;
  /** The borrowed market. On Core this may be the VAIController, which is a valid `actionPaused` key. */
  vDebt: string;
  /** The collateral market. */
  vBStock: string;
  borrower: string;
  /**
   * The address that RECEIVES the seized collateral — the BStockLiquidator contract on the atomic path, the
   * executing Safe on the fallback. That is the account the allowlist is checked against, never the operator
   * EOA that submits the transaction.
   */
  liquidator: string;
  /** How to name `liquidator` in the abort message, e.g. "liquidator CONTRACT" or "executing Safe". */
  liquidatorLabel: string;
}

/**
 * Gates that are a CERTAINTY at build time: a pause is on or off, a borrower is a member or is not, and
 * neither moves with the market. Anything oracle-priced (shortfall, `minLiquidatableCollateral`) belongs in
 * a warning instead, because it can flip between this read and execution.
 */
export async function assertMarketGates({
  comptroller,
  isCore,
  vDebt,
  vBStock,
  borrower,
  liquidator,
  liquidatorLabel,
}: MarketGateArgs): Promise<void> {
  // Core keeps a protocol-wide kill switch on top of the per-action pauses, and every hook in the chain
  // opens with it (`checkProtocolPauseState` in liquidateBorrowAllowed, seizeAllowed and redeemAllowed).
  // The isolated pools have no analogue: they express everything through per-action pauses.
  if (isCore && (await comptroller.protocolPaused())) {
    throw new Error("Core protocol is PAUSED (Comptroller.protocolPaused) — every liquidation reverts");
  }

  // Three pauses, across TWO markets, gate one liquidation, and both pools enforce all three. REDEEM is the
  // easy miss: it is not part of the liquidation hook chain at all. It fires on the liquidator's OWN redeem,
  // after the repay and seize have already succeeded.
  const [liqPaused, seizePaused, redeemPaused]: boolean[] = await Promise.all([
    comptroller.actionPaused(vDebt, ACTION_LIQUIDATE),
    comptroller.actionPaused(vBStock, ACTION_SEIZE),
    comptroller.actionPaused(vBStock, ACTION_REDEEM),
  ]);
  if (liqPaused) throw new Error(`LIQUIDATE is paused on the debt market ${vDebt}`);
  if (seizePaused) throw new Error(`SEIZE is paused on the collateral market ${vBStock}`);
  if (redeemPaused) {
    throw new Error(
      `REDEEM is paused on the collateral market ${vBStock} — the repay and seize would succeed and the ` +
        `redeem would then revert, taking the whole liquidation with it`,
    );
  }

  // The BORROWER must have entered the collateral market. Supplying alone does not enter it: membership is
  // only ever written by enterMarkets or the borrow hook. Both pools require it on the SEIZE leg — Core's
  // `seizeAllowed` returns MARKET_NOT_COLLATERAL, the isolated `preSeizeHook` reverts MarketNotCollateral.
  // (The liquidator is deliberately never a member, which is what keeps its own redeem off the liquidity
  // check and off the deviation-bounded oracle.)
  if (!(await comptroller.checkMembership(borrower, vBStock))) {
    throw new Error(`${borrower} has not entered ${vBStock} as collateral — the seize reverts MarketNotCollateral`);
  }

  // Isolated only: a governance allowlist on who may receive seized collateral. Core has no equivalent.
  if (!isCore) {
    const [enabled, allowed]: boolean[] = await Promise.all([
      comptroller.isLiquidationAllowlistEnabled(),
      comptroller.isAllowedLiquidator(liquidator),
    ]);
    if (enabled && !allowed) {
      throw new Error(
        `pool liquidation allowlist is ON and the ${liquidatorLabel} ${liquidator} is not on it. Needs a ` +
          `governance setAllowedLiquidator(${liquidator}, true) first. The allowlist is checked against ` +
          `whoever RECEIVES the collateral, so allowlisting the operator EOA does nothing.`,
      );
    }
  }
}

export interface MinCollateralArgs {
  /** Isolated pools only — Core has no `minLiquidatableCollateral`. */
  comptroller: Contract;
  borrower: string;
  runner: Signer | providers.Provider;
  /** Read from `isForcedLiquidationEnabled`; a forced liquidation returns before this gate. */
  forced: boolean;
  /** "abort" where the liquidation is sent now, "warn" where a batch is signed later. See below. */
  severity: "abort" | "warn";
}

/**
 * The isolated single-market collateral floor. At or below `minLiquidatableCollateral` the position is
 * refused outright and only `liquidateAccount` / `healAccount` can serve it — both comptroller-level,
 * multi-market, all-borrows-at-once entry points that neither of these one-market tools can drive.
 *
 * Unlike the gates above this one is NOT a build-time certainty: the comparison is against an ORACLE-PRICED
 * total, so it moves with the market exactly as the shortfall does. Each script therefore treats it the way
 * it already treats the shortfall — atomic-liquidate sends within seconds of reading and aborts, while
 * safe-fallback emits a batch signed hours later and only warns.
 */
export async function checkMinLiquidatableCollateral({
  comptroller,
  borrower,
  runner,
  forced,
  severity,
}: MinCollateralArgs): Promise<void> {
  // Forced liquidation returns from `preLiquidateHook` BEFORE the collateral, shortfall and close-factor
  // checks, bounded only by the outstanding balance. Running the gauntlet then would produce FALSE aborts on
  // liquidations that would have succeeded.
  if (forced) return;

  const [minColl, oracleAddr]: [BigNumber, string] = await Promise.all([
    comptroller.minLiquidatableCollateral(),
    comptroller.oracle(),
  ]);
  const totalCollateral = await isolatedTotalCollateral(comptroller, oracleAddr, borrower, runner);
  if (totalCollateral.gt(minColl)) {
    console.log(`isolated collateral ${utils.formatEther(totalCollateral)} > min ${utils.formatEther(minColl)}`);
    return;
  }

  const msg =
    `${borrower} total collateral ${utils.formatEther(totalCollateral)} <= minLiquidatableCollateral ` +
    `${utils.formatEther(minColl)} (USD-scaled) — MinimalCollateralViolated. This position can only be ` +
    `cleared by the pool's liquidateAccount/healAccount, which this tool cannot drive.`;
  if (severity === "abort") throw new Error(msg);
  console.warn(`WARN: ${msg}`);
}

/**
 * Reproduce an isolated comptroller's `snapshot.totalCollateral` for an account, in USD-scaled 1e18 units.
 *
 * `preLiquidateHook` compares `minLiquidatableCollateral` against this figure, and nothing exposes it:
 * `getAccountLiquidity` returns only liquidity and shortfall. Mirrors `_accumulateMarket`, keeping the order
 * of the two truncating divisions:
 *
 *   vTokenPrice     = exchangeRateMantissa * price / 1e18
 *   totalCollateral += vTokenPrice * vTokenBalance / 1e18
 *
 * Reproducible off-chain because that weighting values both legs at plain spot, never the deviation-bounded
 * oracle.
 */
async function isolatedTotalCollateral(
  comptroller: Contract,
  oracleAddr: string,
  account: string,
  runner: Signer | providers.Provider,
): Promise<BigNumber> {
  const assets: string[] = await comptroller.getAssetsIn(account);
  const oracle = new Contract(oracleAddr, ORACLE_ABI, runner);
  let total = BigNumber.from(0);
  for (const asset of assets) {
    const market = new Contract(asset, ISOLATED_VTOKEN_SNAPSHOT_ABI, runner);
    const [, vTokenBalance, , exchangeRateMantissa]: BigNumber[] = await market.getAccountSnapshot(account);
    // A borrower is a member of every market it borrows from, including ones it holds no collateral in.
    if (vTokenBalance.isZero()) continue;
    const price: BigNumber = await oracle.getUnderlyingPrice(asset);
    const vTokenPrice = exchangeRateMantissa.mul(price).div(ONE18);
    total = total.add(vTokenPrice.mul(vTokenBalance).div(ONE18));
  }
  return total;
}
