/**
 * bStock backstop liquidation — Safe multisig FALLBACK flow (no on-chain swap).
 *
 * When the atomic path's quote leg is unavailable — EVERY hop-1 RFQ source down (both Native and Liquid
 * Mesh: API halt, weekend, thin depth) or, for a VAI debt, the hop-2 PSM paused / mint-cap exhausted —
 * the liquidation is settled manually: a Safe{Wallet} multisig repays the bad debt with its OWN funds,
 * seizes the bStock, and ships the raw bStock to a custody/Binance top-up address where finance offloads
 * it on the CEX. Because nothing is swapped on-chain here, this flow is independent of the RFQ sources
 * and the PSM — which is exactly why it is the fallback when either is down.
 *
 * This script does NOT send anything. It READS chain state and EMITS a Safe Transaction Builder
 * batch JSON for the signers to review and execute.
 *
 * Two logical actions, three or four transactions in one atomic batch. The repay is routed through the
 * pool-wide Venus Liquidator gate (a direct vDebt.liquidateBorrow would revert UNAUTHORIZED). The on-chain
 * BStockLiquidator routes every repay through this gate and reverts when it is unset, so this script
 * aborts if the gate is unset rather than emit a batch that would revert on execution:
 *   Action 1 — fund + repay + seize:
 *     1. debtUnderlying.approve(gate, repay)                        // let the gate's liquidateBorrow pull Safe funds
 *                                                                   // (ERC20 debt only; skipped for native BNB)
 *     2. gate.liquidateBorrow(vDebt, borrower, repay, vBStock)      // routed through the Venus Liquidator
 *                                                                   // native BNB debt (vBNB): repay is sent as msg.value
 *     3. vBStock.redeem(received)                                   // the vBStock the Safe was credited -> raw bStock
 *   Action 2 — hand off:
 *     4. bStock.transfer(TARGET, seizedRaw)                         // raw bStock -> Binance top-up
 *
 * VAI debt (VAIController): supported. VAI is not a vToken and has no `underlying()`, so the debt token
 * is resolved via `getVAIAddress()`; the batch is the normal ERC20 shape (approve VAI to the gate, then a
 * zero-value liquidateBorrow), which the gate settles through its `_liquidateVAI` branch. Because this
 * script ships the seized bStock to Binance rather than swapping it, no PSM/USDT->VAI leg is involved —
 * making it the manual fallback when the atomic path's PSM hop is paused or capped.
 *
 * Seize amount is the on-chain truth from `Comptroller.liquidateCalculateSeizeTokens` (or
 * `liquidateVAICalculateSeizeTokens` for VAI). The Venus
 * Liquidator keeps a treasury cut of the liquidation bonus, so the Safe is credited fewer vTokens than
 * `seizeTokens`; we redeem only that credited amount, further haircut by `SEIZE_BUFFER` (default 0.1%)
 * so ordinary oracle price drift between generation and signer quorum leaves dust rather than reverting
 * the redeem. Snapshotted at the current block — PRICE DRIFT ALONE (not just a position change) can
 * invalidate the exact amounts, so regenerate immediately before signing for anything but a tiny move.
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
 *   SEIZE_BUFFER     haircut % on the redeem/transfer amounts (default 0.1) absorbing oracle price
 *                    drift before the Safe executes; the unredeemed dust is sweepable
 *   OUT              output path (default out/bstock-safe-fallback.json)
 */
import { BigNumber, Contract, providers, utils } from "ethers";
import { promises as fs } from "fs";
import * as path from "path";

import { buildBatch, call } from "./lib/safe";
import { assertVaiGateClear } from "./lib/vai-gate";

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
  "function liquidateCalculateSeizeTokens(address,address,address,uint256) view returns (uint256,uint256)",
  // VAI's seize math is a separate function: VAI is priced at $1 and the incentive is the
  // borrower-agnostic getLiquidationIncentive (see ComptrollerLens.liquidateVAICalculateSeizeTokens).
  "function liquidateVAICalculateSeizeTokens(address,uint256) view returns (uint256,uint256)",
  "function treasuryPercent() view returns (uint256)",
  "function vaiController() view returns (address)",
  "function getEffectiveLiquidationIncentive(address,address) view returns (uint256)",
  "function getLiquidationIncentive(address) view returns (uint256)",
];
const VAI_CONTROLLER_ABI = ["function getVAIAddress() view returns (address)"];
const LIQUIDATOR_ABI = ["function treasuryPercentMantissa() view returns (uint256)"];

// Isolated-pools `Comptroller` / `SpokeComptroller`. Kept DISJOINT from COMPTROLLER_ABI: none of Core's gate
// reads exist here and the contract has no fallback, so calling one reverts rather than returning a zero.
// `liquidationIncentiveMantissa()` is deliberately absent — there it answers for msg.sender, and an eth_call
// carries no from-address, so it would quietly return the pool-wide default and hide a per-market override.
const ISOLATED_COMPTROLLER_ABI = [
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  "function closeFactorMantissa() view returns (uint256)",
  // 3-arg, no borrower: the only overload an isolated comptroller has, and the one VToken itself calls.
  "function liquidateCalculateSeizeTokens(address,address,uint256) view returns (uint256,uint256)",
  "function effectiveLiquidationIncentive(address) view returns (uint256)",
  "function isLiquidationAllowlistEnabled() view returns (bool)",
  "function isAllowedLiquidator(address) view returns (bool)",
  "function isMarketListed(address) view returns (bool)",
];
const ISOLATED_VTOKEN_ABI = ["function protocolSeizeShareMantissa() view returns (uint256)"];

const GATE_PROBE_ABI = ["function liquidatorContract() view returns (address)"];

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
  // Which pool owns the position, taken from the COLLATERAL market — the same leg the contract anchors on.
  const poolAddr: string = await vBStock.comptroller();

  // Then: does that pool have a POOL-WIDE LIQUIDATOR GATE? That one fact is what decides everything below —
  // whether the repay is approved to the gate or to the debt market, which liquidateBorrow signature the
  // batch uses, and whether a treasury cut applies. So probe for it directly rather than comparing the pool
  // against a hardcoded Core address: unlike atomic-liquidate.ts this script never touches the
  // BStockLiquidator, so it has no Core immutable to compare against, and a hardcoded one would pin the tool
  // to a single chain. Core answers (possibly with the zero address, rejected below); an isolated
  // comptroller has no such function and no fallback, so the call reverts — and that revert IS the signal.
  let isCore = true;
  let gateProbe = ZERO;
  try {
    gateProbe = await new Contract(poolAddr, GATE_PROBE_ABI, provider).liquidatorContract();
  } catch {
    isCore = false;
  }

  const comptroller = new Contract(poolAddr, isCore ? COMPTROLLER_ABI : ISOLATED_COMPTROLLER_ABI, provider);
  console.log(`pool: ${isCore ? "CORE" : "ISOLATED"} (${poolAddr})`);

  // VAI is not a vToken: its "market" is the VAIController, which has no underlying() EITHER. It must be
  // detected BEFORE the vBNB fallback below — otherwise the catch would misread a VAI debt as native BNB
  // and build a `{value: repay}` batch that the gate rejects (its VAI branch requires msg.value == 0).
  // The VAI token itself is a plain ERC20, so it takes the normal approve-then-liquidate batch below.
  // Neither special exists in an isolated pool: they are Core markets, so that branch is ERC20-only.
  let vaiControllerAddr = ZERO;
  let isVai = false;

  // vBNB has no underlying(): a native-BNB debt market is repaid in native BNB, so there is no ERC20
  // debt token to approve or read. Detect it the way the atomic script does — try underlying(), treat
  // a revert as native BNB (18 decimals, "BNB"). `debt` stays undefined on the native path.
  let isBnb = false;
  let debt: Contract | undefined;
  if (isCore) {
    vaiControllerAddr = await comptroller.vaiController();
    isVai = vDebt.address.toLowerCase() === vaiControllerAddr.toLowerCase();
    if (isVai) {
      const vaiAddr: string = await new Contract(vaiControllerAddr, VAI_CONTROLLER_ABI, provider).getVAIAddress();
      debt = new Contract(vaiAddr, ERC20_ABI, provider);
    } else {
      try {
        debt = new Contract(await vDebt.underlying(), ERC20_ABI, provider);
      } catch {
        isBnb = true;
      }
    }
  } else {
    // Both legs must belong to this pool, asked of the POOL rather than of the markets — the same proof
    // `_resolvePool` performs on-chain.
    const [debtListed, collListed]: boolean[] = await Promise.all([
      comptroller.isMarketListed(vDebt.address),
      comptroller.isMarketListed(vBStock.address),
    ]);
    if (!collListed) throw new Error(`VBSTOCK ${vBStock.address} is not listed in pool ${poolAddr}`);
    if (!debtListed) {
      throw new Error(
        `VDEBT ${vDebt.address} is not listed in pool ${poolAddr} — a single liquidation cannot span two pools`,
      );
    }
    // `underlying` is a plain public variable on every listed isolated market, so read it directly. The
    // try/catch above must NOT be reused here: with no native market in the pool, treating a failure as
    // native BNB would silently build a `{value: repay}` batch for an ERC20 debt.
    debt = new Contract(await vDebt.underlying(), ERC20_ABI, provider);
  }
  const bStock = new Contract(await vBStock.underlying(), ERC20_ABI, provider);

  const [bStockDec, bStockSym] = await Promise.all([bStock.decimals(), bStock.symbol()]);
  const [debtDec, debtSym] = isBnb ? [18, "BNB"] : await Promise.all([debt!.decimals(), debt!.symbol()]);
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
  let gate = ZERO;
  // The contract the Safe approves the repay to and calls `liquidateBorrow` on. Core: the pool-wide gate.
  // Isolated: the debt market itself, since there is no gate and `VToken.liquidateBorrow` is unrestricted.
  let repaySpender: string;

  if (isCore) {
    gate = gateProbe;
    if (gate === ZERO) {
      throw new Error(
        "Venus Liquidator gate (comptroller.liquidatorContract) is unset — the liquidation routes every repay through it and reverts when unset",
      );
    }
    repaySpender = utils.getAddress(gate);
    console.log(`routing repay through Venus Liquidator ${gate}`);

    // The gate refuses to liquidate an unrelated market while the borrower's VAI debt is above the
    // threshold (Liquidator._checkForceVAILiquidate). Catch it while BUILDING the batch — a Safe batch
    // that reverts on execution costs signer time and a fresh signing round, not just gas.
    await assertVaiGateClear({
      provider,
      gate,
      comptroller: comptroller.address,
      vaiController: vaiControllerAddr,
      vDebt: vDebt.address,
      borrower,
    });
  } else {
    repaySpender = utils.getAddress(vDebt.address);
    console.log(`no pool-wide gate in this pool — repaying directly to the debt market ${repaySpender}`);

    // Here the SAFE is the liquidator, so the SAFE is the address `preSeizeHook` checks — not the
    // BStockLiquidator contract and not a bot key.
    if ((await comptroller.isLiquidationAllowlistEnabled()) && !(await comptroller.isAllowedLiquidator(safe))) {
      throw new Error(
        `pool liquidation allowlist is ON and the executing Safe ${safe} is not on it — needs a governance ` +
          `setAllowedLiquidator(${safe}, true) before this batch can execute`,
      );
    }
  }

  const safeDebtBal: BigNumber = isBnb ? await provider.getBalance(safe) : await debt!.balanceOf(safe);
  if (safeDebtBal.lt(repay)) {
    console.warn(
      `WARN: Safe ${safe} holds ${utils.formatUnits(safeDebtBal, debtDec)} ${debtSym} < repay ` +
        `${env("REPAY_AMOUNT")} — fund the Safe before executing.`,
    );
  }

  // --- seize math from on-chain truth ---
  const ONE = BigNumber.from(10).pow(18);
  // Mirror the function the on-chain path actually calls for this debt:
  //   - VAI  -> VAIController.liquidateVAIFresh calls liquidateVAICalculateSeizeTokens(vCollateral,
  //             repay): VAI is priced at $1 and the incentive is the borrower-agnostic
  //             getLiquidationIncentive, so the 4-arg overload does NOT apply.
  //   - else -> vToken.liquidateBorrowFresh calls the borrower-aware 4-arg overload (reads the
  //             borrower's actual pool). The 3-arg overload always reads Core Pool params and diverges
  //             if the borrower has switched pools, producing a stale redeem amount in the batch.
  //   - ISOLATED -> only a 3-arg (vBorrowed, vCollateral, repay) overload exists, which is exactly what
  //             `VToken._liquidateBorrowFresh` calls. No borrower argument: there are no per-borrower pools
  //             here, and the incentive is keyed on the COLLATERAL market.
  const seizeFn = isVai ? "liquidateVAICalculateSeizeTokens" : "liquidateCalculateSeizeTokens";
  const [seizeErr, seizeTokens]: BigNumber[] = isVai
    ? await comptroller.liquidateVAICalculateSeizeTokens(vBStock.address, repay)
    : isCore
      ? await comptroller.liquidateCalculateSeizeTokens(borrower, vDebt.address, vBStock.address, repay)
      : await comptroller.liquidateCalculateSeizeTokens(vDebt.address, vBStock.address, repay);
  if (!seizeErr.eq(0)) throw new Error(`${seizeFn} error code ${seizeErr}`);
  // A zero seize means the incentive resolved to 0 (e.g. bStock unlisted in the borrower's pool):
  // surface it here rather than baking a degenerate redeem amount into the batch.
  if (seizeTokens.eq(0)) throw new Error(`${seizeFn} returned 0 seize for ${borrower}`);

  // The Venus Liquidator keeps a treasury cut of the liquidation BONUS (see
  // Liquidator._splitLiquidationIncentive), so the Safe is credited fewer vTokens than seizeTokens.
  // Redeem only the credited amount, else the batch reverts. On BSC mainnet the cut is 50% of the bonus
  // (treasuryPercentMantissa = 0.5e18) today — not 0 — and is governance-settable.
  let vReceived = seizeTokens;
  if (!isCore) {
    // No gate and no redeem fee in an isolated pool. What reduces the credit is the collateral market's own
    // protocol seize share, withheld inside `VToken._seize` and sent to the ProtocolShareReserve:
    //     protocolSeizeTokens = floor(floor(seizeTokens * pss / 1e18) * 1e18 / incentive)
    // Both floors, in that order, mirror ExponentialNoError's mul_ then div_. At the 5e16 default over a
    // 1.1e18 incentive that is ~4.55% of the seize — far more than SEIZE_BUFFER absorbs, so omitting it
    // would bake an over-large redeem into the batch and revert it after a full signing round.
    const [incentive, pss]: BigNumber[] = await Promise.all([
      comptroller.effectiveLiquidationIncentive(vBStock.address),
      new Contract(vBStock.address, ISOLATED_VTOKEN_ABI, provider).protocolSeizeShareMantissa(),
    ]);
    if (incentive.isZero()) {
      throw new Error(
        `effectiveLiquidationIncentive(${vBStock.address}) is 0 — VToken._seize divides by it, so every ` +
          `liquidation in this pool would revert`,
      );
    }
    vReceived = seizeTokens.sub(seizeTokens.mul(pss).div(ONE).mul(ONE).div(incentive));
  }
  const liqTreasuryPct: BigNumber = isCore
    ? await new Contract(gate, LIQUIDATOR_ABI, provider).treasuryPercentMantissa()
    : BigNumber.from(0);
  if (!liqTreasuryPct.eq(0)) {
    // Mirror the gate EXACTLY: `_splitLiquidationIncentive` sizes the bonus with
    // `getEffectiveLiquidationIncentive(borrower, vCollateral)` for EVERY debt type, VAI included — so
    // use it here regardless of `isVai`. Two distinct incentives are in play and must not be conflated:
    // the borrower-agnostic getLiquidationIncentive drives VAI's SEIZE math above (that is what
    // liquidateVAICalculateSeizeTokens reads), while the CUT is always the effective (pool-resolved) one.
    //   - Non-VAI: the borrower may have switched to a non-core pool whose vBStock incentive differs from
    //     core, so effective != core is REACHABLE — using core here would missize the cut and the redeem.
    //   - VAI: effective == core ALWAYS. A VAI borrower is core-pool-locked (VAIController.mintVAI requires
    //     the core pool, and MarketFacet.hasValidPoolBorrows bars leaving it while mintedVAIs>0), so
    //     userPoolId==0 and the two getters return the same value. Calling effective is a safe no-op that
    //     keeps one code path and stays correct if that VAI-core invariant is ever relaxed.
    const totalIncentive: BigNumber = await comptroller.getEffectiveLiquidationIncentive(borrower, vBStock.address);
    const bonusAmount = seizeTokens.mul(totalIncentive.sub(ONE)).div(totalIncentive);
    const treasuryCut = bonusAmount.mul(liqTreasuryPct).div(ONE);
    vReceived = seizeTokens.sub(treasuryCut);
  }

  // The credited vTokens are decided at EXECUTION time, but the batch bakes in fixed amounts computed
  // now. seizeTokens ∝ priceBorrowed / (priceCollateral · exchangeRate), and the bStock oracle price
  // moves continuously — so between generation and signer quorum (often hours) an ordinary upward tick
  // makes the real credit LESS than vReceived and reverts the redeem (tx #3). Haircut vReceived by
  // SEIZE_BUFFER so a modest price move leaves harmless dust vTokens rather than bricking the batch;
  // the dust is sweepable later. Regenerate for a large move. (Mirrors atomic-liquidate.ts SEIZE_BUFFER.)
  const seizeBufferPct = Number(process.env.SEIZE_BUFFER || "0.1");
  if (!Number.isFinite(seizeBufferPct) || seizeBufferPct < 0 || seizeBufferPct >= 100) {
    throw new Error(`SEIZE_BUFFER must be a percent in [0, 100), got "${process.env.SEIZE_BUFFER}"`);
  }
  const vRedeem = vReceived.mul(Math.round((100 - seizeBufferPct) * 100)).div(10000);

  // Raw bStock from redeeming vRedeem, after Core's redeem treasuryPercent fee, FLOORED at the current
  // exchange rate (rate only grows, so transferring this floor never exceeds what we hold).
  const exchangeRate: BigNumber = await vBStock.exchangeRateStored();
  // Core takes `treasuryPercent` of the redeemed underlying on the way out. An isolated redeem has no such
  // fee at all — its protocol cut is the reserve factor, already inside the exchange rate — so do NOT try
  // to read `treasuryPercent()` there and fall back to a value: the call reverts, and any non-zero fallback
  // would understate the shippable amount.
  const treasuryPercent: BigNumber = isCore ? await comptroller.treasuryPercent() : BigNumber.from(0);
  const seizedRaw = vRedeem.mul(exchangeRate).div(ONE).mul(ONE.sub(treasuryPercent)).div(ONE);
  console.log(
    `seize: ${utils.formatUnits(seizeTokens, 8)} v${bStockSym} credited ~${utils.formatUnits(vReceived, 8)} ` +
      `-> redeem ${utils.formatUnits(vRedeem, 8)} (SEIZE_BUFFER ${seizeBufferPct}%) -> ` +
      `~${utils.formatUnits(seizedRaw, bStockDec)} ${bStockSym} (floor, ship)`,
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
  // Native BNB debt (vBNB): the Liquidator forwards msg.value to vBNB.liquidateBorrow and requires
  // msg.value == repay (see Liquidator.liquidateBorrow), so the Safe sends repay as native value and
  // there is no ERC20 to approve. ERC20 debt: approve the gate first, then a zero-value liquidateBorrow.
  // Isolated: no gate, so the Safe calls the DEBT MARKET directly. Note the signature and the argument
  // order both differ from the gate's — 3-arg (borrower, repay, collateral) against the market itself,
  // versus the gate's 4-arg (vDebt, borrower, repay, collateral). Always zero value: an isolated pool has
  // no native market, so this is always the ERC20 approve-then-liquidate shape.
  const liquidateTx = isCore
    ? call(
        gate,
        "liquidateBorrow(address,address,uint256,address)",
        [vDebt.address, borrower, repay, vBStock.address],
        isBnb ? repay : 0,
      )
    : call(vDebt.address, "liquidateBorrow(address,uint256,address)", [borrower, repay, vBStock.address], 0);

  const seizeTxs = [
    call(vBStock.address, "redeem(uint256)", [vRedeem]),
    call(bStock.address, "transfer(address,uint256)", [target, seizedRaw]),
  ];

  const txs = isBnb
    ? [liquidateTx, ...seizeTxs]
    : [call(debt!.address, "approve(address,uint256)", [repaySpender, repay]), liquidateTx, ...seizeTxs];

  const batch = buildBatch({
    chainId: CHAIN_ID,
    safe,
    name: `bStock fallback liquidation - ${bStockSym}`,
    description:
      `Repay ${utils.formatUnits(repay, debtDec)} ${debtSym} of ${borrower}, ` +
      `seize ~${utils.formatUnits(seizedRaw, bStockDec)} ${bStockSym}, ship to ${target}. ` +
      `Snapshot @ block ${await provider.getBlockNumber()}; SEIZE_BUFFER ${seizeBufferPct}% absorbs small ` +
      `oracle drift — regenerate for a large price move or a position change.`,
    createdAt: Date.now(),
    transactions: txs,
  });

  return { batch, txs, gate, repaySpender, isCore, seizeTokens, vReceived, vRedeem, seizedRaw, target };
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
