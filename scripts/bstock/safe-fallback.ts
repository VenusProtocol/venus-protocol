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
 * Two logical actions, four transactions in one atomic batch:
 *   Action 1 — fund + repay + seize:
 *     1. debtUnderlying.approve(vDebt, repay)              // let liquidateBorrow pull Safe funds
 *     2. vDebt.liquidateBorrow(borrower, repay, vBStock)   // seize vBStock to the Safe
 *     3. vBStock.redeem(seizeTokens)                       // vBStock -> raw bStock
 *   Action 2 — hand off:
 *     4. bStock.transfer(TARGET, seizedRaw)                // raw bStock -> Binance top-up
 *
 * Seize amount is the on-chain truth from `Comptroller.liquidateCalculateSeizeTokens`, snapshotted at
 * the current block. If the borrower's position changes before the Safe executes, REGENERATE — a
 * stale `redeem(seizeTokens)` that exceeds the seized balance reverts the batch.
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
];

const ZERO = "0x0000000000000000000000000000000000000000";

function env(name: string, required = true): string {
  const v = process.env[name];
  if (required && !v) throw new Error(`Missing env ${name}`);
  return v || "";
}

async function main() {
  const provider = new providers.JsonRpcProvider(process.env.RPC_URL || DEFAULT_RPC);
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

  // Direct liquidateBorrow is rejected (UNAUTHORIZED) when a liquidatorContract is set and the caller
  // isn't it. The Safe must be that contract, or it must be unset.
  const liquidatorContract: string = await comptroller.liquidatorContract();
  if (liquidatorContract !== ZERO && utils.getAddress(liquidatorContract) !== safe) {
    console.warn(
      `WARN: Comptroller.liquidatorContract = ${liquidatorContract} (!= Safe). ` +
        `Direct liquidateBorrow from the Safe will revert UNAUTHORIZED — route through that contract instead.`,
    );
  }

  const safeDebtBal: BigNumber = await debt.balanceOf(safe);
  if (safeDebtBal.lt(repay)) {
    console.warn(
      `WARN: Safe ${safe} holds ${utils.formatUnits(safeDebtBal, debtDec)} ${debtSym} < repay ` +
        `${env("REPAY_AMOUNT")} — fund the Safe before executing.`,
    );
  }

  // --- seize math from on-chain truth ---
  const [seizeErr, seizeTokens]: BigNumber[] = await comptroller.liquidateCalculateSeizeTokens(
    vDebt.address,
    vBStock.address,
    repay,
  );
  if (!seizeErr.eq(0)) throw new Error(`liquidateCalculateSeizeTokens error code ${seizeErr}`);

  // Raw bStock from redeeming seizeTokens, FLOORED at the current exchange rate (rate only grows, so
  // transferring this floor never exceeds what we hold).
  const exchangeRate: BigNumber = await vBStock.exchangeRateStored();
  const seizedRaw = seizeTokens.mul(exchangeRate).div(BigNumber.from(10).pow(18));
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
  const txs = [
    call(debt.address, "approve(address,uint256)", [vDebt.address, repay]),
    call(vDebt.address, "liquidateBorrow(address,uint256,address)", [borrower, repay, vBStock.address]),
    call(vBStock.address, "redeem(uint256)", [seizeTokens]),
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

  const out = process.env.OUT || path.join("out", "bstock-safe-fallback.json");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(batch, null, 2));
  console.log(`\nwrote Safe batch (${txs.length} txs) -> ${out}`);
  console.log("Import in Safe -> Apps -> Transaction Builder -> Load.");
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
