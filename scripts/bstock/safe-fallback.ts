/**
 * bStock backstop liquidation — Safe multisig FALLBACK flow (no Native swap).
 *
 * When the Native RFQ path is unavailable (API down, halt, weekend, thin depth), the liquidation is
 * settled manually: a Safe{Wallet} multisig repays the bad debt with its OWN funds, seizes the
 * bStock, and ships the raw bStock to a custody/Binance top-up address where finance offloads it on
 * the CEX.
 *
 * This script does NOT send anything. It READS chain state and EMITS a Safe Transaction Builder
 * batch JSON for the signers to review and execute.
 *
 * Two logical actions, four transactions in one atomic batch. The repay is routed through the pool-wide
 * Venus Liquidator gate (a direct vDebt.liquidateBorrow would revert UNAUTHORIZED). The on-chain
 * BStockLiquidator routes every repay through this gate and reverts when it is unset, so this script
 * aborts if the gate is unset rather than emit a batch that would revert on execution:
 *   Action 1 — fund + repay + seize:
 *     1. debtUnderlying.approve(gate, repay)                        // let the gate's liquidateBorrow pull Safe funds
 *     2. gate.liquidateBorrow(vDebt, borrower, repay, vBStock)      // routed through the Venus Liquidator
 *     3. vBStock.redeem(received)                                   // the vBStock the Safe was credited -> raw bStock
 *   Action 2 — hand off:
 *     4. bStock.transfer(TARGET, seizedRaw)                         // raw bStock -> Binance top-up
 *
 * Seize amount is the on-chain truth from `Comptroller.liquidateCalculateSeizeTokens`. The Venus
 * Liquidator keeps a treasury cut of the liquidation bonus, so the Safe is credited fewer vTokens than
 * `seizeTokens`; we redeem only that credited amount (`received`). Snapshotted at the current block — if
 * the borrower's position changes before the Safe executes, REGENERATE, else a stale redeem/transfer
 * that exceeds the seized balance reverts the batch.
 *
 * Usage:
 *   RPC_URL=https://bsc-dataseed.bnbchain.org \
 *   BORROWER=0x.. VBSTOCK=0x.. VDEBT=0x.. REPAY_AMOUNT=5000 TARGET=0x.. \
 *   npx ts-node scripts/bstock/safe-fallback.ts
 *
 * Env:
 *   RPC_URL          BSC RPC (default public dataseed)
 *   SAFE             executing Safe (default 0xdc6E…2029)
 *   BORROWER         (req) account to liquidate
 *   VBSTOCK          (req) vToken market of the bStock collateral
 *   VDEBT            (req) vToken market of the borrowed asset to repay
 *   REPAY_AMOUNT     (req) repay amount in DEBT underlying, human units
 *   TARGET           (req) Binance top-up / custody address to receive bStock
 *                    — set ALLOW_PLACEHOLDER=1 to emit with a zero target (DRAFT)
 *   OUT              output path (default out/bstock-safe-fallback.json)
 */
import { BigNumber, Contract, providers, utils } from "ethers";
import { promises as fs } from "fs";
import * as path from "path";

import { buildBatch, call } from "./lib/safe";

const DEFAULT_SAFE = "0xdc6E047f665c3Db94292Bb7fB412B25370db2029";
const DEFAULT_RPC = "https://bsc-dataseed.bnbchain.org";
const CHAIN_ID = 56;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
const VTOKEN_ABI = [
  "function underlying() view returns (address)",
  "function comptroller() view returns (address)",
  "function exchangeRateStored() view returns (uint256)",
];
const COMPTROLLER_ABI = [
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  "function closeFactorMantissa() view returns (uint256)",
  "function liquidationIncentiveMantissa() view returns (uint256)",
  "function liquidatorContract() view returns (address)",
  "function liquidateCalculateSeizeTokens(address,address,uint256) view returns (uint256,uint256)",
  "function treasuryPercent() view returns (uint256)",
  "function getEffectiveLiquidationIncentive(address,address) view returns (uint256)",
];
const LIQUIDATOR_ABI = ["function treasuryPercentMantissa() view returns (uint256)"];

const ZERO = "0x0000000000000000000000000000000000000000";

function env(name: string, required = true): string {
  const v = process.env[name];
  if (required && !v) throw new Error(`Missing env ${name}`);
  return v || "";
}

export async function buildSafeFallbackBatch(provider: providers.Provider) {
  const safe = utils.getAddress(process.env.SAFE || DEFAULT_SAFE);
  const borrower = utils.getAddress(env("BORROWER"));

  const vBStock = new Contract(env("VBSTOCK"), VTOKEN_ABI, provider);
  const vDebt = new Contract(env("VDEBT"), VTOKEN_ABI, provider);
  const comptroller = new Contract(await vBStock.comptroller(), COMPTROLLER_ABI, provider);
  const debt = new Contract(await vDebt.underlying(), ERC20_ABI, provider);
  const bStock = new Contract(await vBStock.underlying(), ERC20_ABI, provider);

  const [debtDec, debtSym, bStockDec, bStockSym] = await Promise.all([
    debt.decimals(),
    debt.symbol(),
    bStock.decimals(),
    bStock.symbol(),
  ]);
  const repay = utils.parseUnits(env("REPAY_AMOUNT"), debtDec);

  // --- read-only sanity checks (warn, do not block) ---
  const [, , shortfall]: BigNumber[] = await comptroller.getAccountLiquidity(borrower);
  if (shortfall.eq(0)) console.warn(`WARN: ${borrower} has NO shortfall right now — not liquidatable yet.`);
  else console.log(`shortfall: ${utils.formatEther(shortfall)} (USD-scaled)`);

  const closeFactor: BigNumber = await comptroller.closeFactorMantissa();
  console.log(`repay: ${env("REPAY_AMOUNT")} ${debtSym}  (closeFactor=${utils.formatEther(closeFactor)})`);

  // Pool-wide Venus Liquidator gate: while it is set, a direct vDebt.liquidateBorrow from the Safe
  // reverts UNAUTHORIZED, so the repay is routed through that contract (its permissionless entry). The
  // on-chain BStockLiquidator routes every repay through this gate and reverts (ensureNonzeroAddress)
  // when unset, so align here and abort rather than emit a batch that would revert on execution.
  const gate: string = await comptroller.liquidatorContract();
  if (gate === ZERO) {
    throw new Error(
      "Venus Liquidator gate (comptroller.liquidatorContract) is unset — the liquidation routes every repay through it and reverts when unset",
    );
  }
  const repaySpender = utils.getAddress(gate);
  console.log(`routing repay through Venus Liquidator ${gate}`);

  const safeDebtBal: BigNumber = await debt.balanceOf(safe);
  if (safeDebtBal.lt(repay)) {
    console.warn(
      `WARN: Safe ${safe} holds ${utils.formatUnits(safeDebtBal, debtDec)} ${debtSym} < repay ` +
        `${env("REPAY_AMOUNT")} — fund the Safe before executing.`,
    );
  }

  // --- seize math from on-chain truth ---
  const ONE = BigNumber.from(10).pow(18);
  const [seizeErr, seizeTokens]: BigNumber[] = await comptroller.liquidateCalculateSeizeTokens(
    vDebt.address,
    vBStock.address,
    repay,
  );
  if (!seizeErr.eq(0)) throw new Error(`liquidateCalculateSeizeTokens error code ${seizeErr}`);

  // The Venus Liquidator keeps a treasury cut of the liquidation BONUS (see
  // Liquidator._splitLiquidationIncentive), so the Safe is credited fewer vTokens than seizeTokens.
  // Redeem only the credited amount, else the batch reverts.
  let vReceived = seizeTokens;
  const liqTreasuryPct: BigNumber = await new Contract(gate, LIQUIDATOR_ABI, provider).treasuryPercentMantissa();
  if (!liqTreasuryPct.eq(0)) {
    const totalIncentive: BigNumber = await comptroller.getEffectiveLiquidationIncentive(borrower, vBStock.address);
    const bonusAmount = seizeTokens.mul(totalIncentive.sub(ONE)).div(totalIncentive);
    const treasuryCut = bonusAmount.mul(liqTreasuryPct).div(ONE);
    vReceived = seizeTokens.sub(treasuryCut);
  }

  // Raw bStock from redeeming vReceived, after Core's redeem treasuryPercent fee, FLOORED at the current
  // exchange rate (rate only grows, so transferring this floor never exceeds what we hold).
  const exchangeRate: BigNumber = await vBStock.exchangeRateStored();
  const treasuryPercent: BigNumber = await comptroller.treasuryPercent();
  const seizedRaw = vReceived.mul(exchangeRate).div(ONE).mul(ONE.sub(treasuryPercent)).div(ONE);
  console.log(
    `seize: ${utils.formatUnits(seizeTokens, 8)} v${bStockSym} -> ~${utils.formatUnits(seizedRaw, bStockDec)} ` +
      `${bStockSym} (floor)`,
  );

  // --- target (Binance top-up) ---
  let target: string;
  if (process.env.TARGET) {
    target = utils.getAddress(process.env.TARGET);
  } else if (process.env.ALLOW_PLACEHOLDER === "1") {
    target = ZERO;
    console.warn("WARN: TARGET unset — emitting DRAFT with zero address. DO NOT EXECUTE; replace tx #4 `to`/arg.");
  } else {
    throw new Error("Missing env TARGET (Binance top-up address). Set it, or ALLOW_PLACEHOLDER=1 for a draft.");
  }

  // --- build batch ---
  const liquidateTx = call(gate, "liquidateBorrow(address,address,uint256,address)", [
    vDebt.address,
    borrower,
    repay,
    vBStock.address,
  ]);

  const txs = [
    call(debt.address, "approve(address,uint256)", [repaySpender, repay]),
    liquidateTx,
    call(vBStock.address, "redeem(uint256)", [vReceived]),
    call(bStock.address, "transfer(address,uint256)", [target, seizedRaw]),
  ];

  const batch = buildBatch({
    chainId: CHAIN_ID,
    safe,
    name: `bStock fallback liquidation - ${bStockSym}`,
    description:
      `Repay ${utils.formatUnits(repay, debtDec)} ${debtSym} of ${borrower}, ` +
      `seize ~${utils.formatUnits(seizedRaw, bStockDec)} ${bStockSym}, ship to ${target}. ` +
      `Snapshot @ block ${await provider.getBlockNumber()}; regenerate if the position changed.`,
    createdAt: Date.now(),
    transactions: txs,
  });

  return { batch, txs, gate, seizeTokens, vReceived, seizedRaw, target };
}

async function main() {
  const provider = new providers.JsonRpcProvider(process.env.RPC_URL || DEFAULT_RPC);
  const { batch, txs } = await buildSafeFallbackBatch(provider);

  const out = process.env.OUT || path.join("out", "bstock-safe-fallback.json");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(batch, null, 2));
  console.log(`\nwrote Safe batch (${txs.length} txs) -> ${out}`);
  console.log("Import in Safe -> Apps -> Transaction Builder -> Load.");
}

// Only run when executed directly (not when imported by a test).
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
