import { BigNumber, Contract, providers } from "ethers";

/**
 * Pre-flight for the Venus Liquidator's VAI gate.
 *
 * `Liquidator._checkForceVAILiquidate` runs on EVERY `liquidateBorrow` and reverts `VAIDebtTooHigh`
 * when a borrower's VAI debt is at/above `minLiquidatableVAI` — blocking the liquidation of an
 * UNRELATED debt market until the VAI is cleared below the threshold first. Nothing in
 * BStockLiquidator can see that ahead of time, so a blocked liquidation is only discovered as an
 * on-chain revert (gas burned, retry needed mid-incident).
 *
 * This mirrors that check off-chain so the operator is told to clear VAI FIRST before a tx is sent.
 *
 * CRITICAL — the on-chain guard is a five-term OR that returns EARLY (i.e. permits the liquidation)
 * if ANY term is true. It only reverts when ALL FIVE are false. Checking a subset would produce FALSE
 * POSITIVES: refusing to build a liquidation that would in fact have succeeded, which mid-incident is
 * worse than the wasted tx this guards against. Keep this in lockstep with Liquidator.sol:
 *
 *   if (_isForcedLiquidationEnabled  ||   // forced liquidation enabled on the debt market
 *       _isVAILiquidationPaused      ||   // VAI liquidation action paused
 *       !forceVAILiquidate           ||   // the global switch is off (the mainnet default today)
 *       _vaiDebt < minLiquidatableVAI ||  // borrower is under the threshold
 *       vToken_ == address(vaiController) // liquidating VAI ITSELF is never blocked
 *   ) return;
 *   revert VAIDebtTooHigh(_vaiDebt, minLiquidatableVAI);
 */

const GATE_ABI = [
  "function forceVAILiquidate() view returns (bool)",
  "function minLiquidatableVAI() view returns (uint256)",
];
const COMPTROLLER_ABI = [
  "function isForcedLiquidationEnabled(address) view returns (bool)",
  "function actionPaused(address,uint8) view returns (bool)",
];
const VAI_CONTROLLER_ABI = ["function getVAIRepayAmount(address) view returns (uint256)"];

/// IComptroller.Action.LIQUIDATE — MINT, REDEEM, BORROW, REPAY, SEIZE, LIQUIDATE, ...
const ACTION_LIQUIDATE = 5;

export interface VaiGateArgs {
  provider: providers.Provider;
  gate: string; // the Venus Liquidator (comptroller.liquidatorContract())
  comptroller: string;
  vaiController: string;
  vDebt: string; // the market being repaid
  borrower: string;
}

/**
 * Throws when the VAI gate would reject this liquidation, naming the remedy. No-op otherwise.
 * Terms are evaluated in cheapest-first order and short-circuit, so the common path (the global
 * switch off) costs a single call.
 */
export async function assertVaiGateClear(a: VaiGateArgs): Promise<void> {
  // Term 5: liquidating VAI itself is unconditionally permitted — this is the very step the operator
  // is told to run first, so it must never be blocked by our own pre-flight.
  if (a.vDebt.toLowerCase() === a.vaiController.toLowerCase()) return;

  const gate = new Contract(a.gate, GATE_ABI, a.provider);

  // Term 3: the global switch. False on BSC mainnet today, so this returns for every real call and
  // the gate cannot revert — check it first to keep the common path to one RPC round-trip.
  if (!(await gate.forceVAILiquidate())) return;

  const comptroller = new Contract(a.comptroller, COMPTROLLER_ABI, a.provider);

  // Term 1: forced liquidation on the debt market bypasses the VAI gate entirely.
  if (await comptroller.isForcedLiquidationEnabled(a.vDebt)) return;

  // Term 2: if VAI liquidation is paused, VAI cannot be cleared — so the gate lets everything else through.
  if (await comptroller.actionPaused(a.vaiController, ACTION_LIQUIDATE)) return;

  // Term 4: the borrower's own VAI exposure against the threshold.
  const vaiCtrl = new Contract(a.vaiController, VAI_CONTROLLER_ABI, a.provider);
  const [vaiDebt, minLiquidatableVAI]: BigNumber[] = await Promise.all([
    vaiCtrl.getVAIRepayAmount(a.borrower),
    gate.minLiquidatableVAI(),
  ]);
  if (vaiDebt.lt(minLiquidatableVAI)) return;

  // All five false — the gate WILL revert VAIDebtTooHigh. Fail here instead, with the fix.
  throw new Error(
    `Venus Liquidator VAI gate blocks this liquidation: borrower ${a.borrower} holds ` +
      `${vaiDebt.toString()} VAI debt >= minLiquidatableVAI ${minLiquidatableVAI.toString()} while ` +
      `forceVAILiquidate is enabled. Liquidate the VAI debt FIRST (VDEBT=${a.vaiController}), enough to ` +
      `drop it below the threshold, then re-run this liquidation.`,
  );
}
