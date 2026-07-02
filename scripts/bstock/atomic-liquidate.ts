/**
 * bStock ATOMIC liquidation — drives the on-chain `BStockLiquidator` contract.
 *
 * One tx: the contract repays the borrow, seizes + redeems the bStock, and sells it to the debt
 * asset in one or two hops. Hop 1 is always a pre-fetched Native firm-quote (bStock -> USDT). For a
 * USDT debt market that single hop is the debt asset; for a non-USDT debt market a second hop
 * (USDT -> debt via an allowlisted AMM/aggregator, see lib/amm.ts) is appended. This script does the
 * OFF-CHAIN half (precompute the seize, fetch the quotes with `from_address = the contract`) and then
 * calls `liquidate` (inventory mode) or `flashLiquidate` (Venus flash-loan mode).
 *
 *   1. Comptroller.liquidateCalculateSeizeTokens(vDebt, vBStock, repay)  -> seize vTokens
 *   2. seizeTokens * vBStock.exchangeRateStored() / 1e18                  -> raw bStock (floor)
 *   3. Native firm-quote (bStock -> USDT) [+ AMM quote USDT -> debt]      -> router(s) + calldata + out
 *   4. BStockLiquidator.liquidate / flashLiquidate(params)               -> atomic settle
 *
 * IMPORTANT: for a two-hop run the settle tx MUST be submitted through Venus's PRIVATE RPC, never a
 * public one — hop 2 is a public-mempool AMM swap and `minOut` only bounds loss, not sandwich-induced
 * reverts. Prefer MODE=flash for two-hop so a revert only burns gas, not locked inventory.
 *
 * Usage:
 *   NATIVE_API_KEY=... LIQUIDATOR=0x.. BORROWER=0x.. VBSTOCK=0x.. VDEBT=0x.. REPAY_AMOUNT=5000 \
 *     npx hardhat run scripts/bstock/atomic-liquidate.ts --network bscmainnet
 *
 * Env:
 *   LIQUIDATOR      (req) deployed BStockLiquidator address
 *   BORROWER        (req) account to liquidate
 *   VBSTOCK         (req) bStock collateral market (e.g. vTSLAB)
 *   VDEBT           (req) borrowed market to repay (e.g. vUSDT)
 *   REPAY_AMOUNT    (req) repay in DEBT underlying, human units
 *   MODE            "inventory" (default) | "flash"
 *   SLIPPAGE        Native slippage %, default 0.5
 *   MIN_OUT_BUFFER  extra haircut on minOut beyond slippage, default 0.5 (%)
 *   AMM_PROVIDER    hop-2 route source for non-USDT debt: kyberswap (default) | openocean | pcsv2
 *   DRY_RUN         "1" -> callStatic only, send nothing
 *   MOCK_NATIVE     hop-1 "router:calldata" for fork/local tests (see below)
 *   MOCK_AMM        hop-2 "router:calldata" for fork/local tests (two-hop); MOCK_OUT = final debt out
 */
import { BigNumber, Contract, Signer } from "ethers";
import { ethers } from "hardhat";

import { getAmmSwap } from "./lib/amm";
import { BSC_USDT, getFirmQuote, quoteDeadline } from "./lib/native";

const PARAMS_TUPLE =
  "(address borrower,address vDebt,address vBStock,uint256 repayAmount,address router,bytes swapCalldata,uint256 minOut,address router2,bytes swapCalldata2,address intermediateToken,uint256 deadline)";
const LIQUIDATOR_ABI = [
  `function liquidate(${PARAMS_TUPLE}) returns (uint256)`,
  `function flashLiquidate(${PARAMS_TUPLE})`,
  "function isRouter(address) view returns (bool)",
];
const VTOKEN_ABI = [
  "function underlying() view returns (address)",
  "function comptroller() view returns (address)",
  "function exchangeRateStored() view returns (uint256)",
];
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
];
const COMPTROLLER_ABI = [
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  "function liquidateCalculateSeizeTokens(address,address,uint256) view returns (uint256,uint256)",
  "function treasuryPercent() view returns (uint256)",
  "function liquidatorContract() view returns (address)",
  "function getEffectiveLiquidationIncentive(address,address) view returns (uint256)",
];
const VENUS_LIQUIDATOR_ABI = ["function treasuryPercentMantissa() view returns (uint256)"];

function env(name: string, required = true): string {
  const v = process.env[name];
  if (required && !v) throw new Error(`Missing env ${name}`);
  return v || "";
}

export async function atomicLiquidate(signer: Signer) {
  const dryRun = process.env.DRY_RUN === "1";
  const mode = (process.env.MODE || "inventory").toLowerCase();
  const slippage = Number(process.env.SLIPPAGE || "0.5");
  const minOutBufferPct = Number(process.env.MIN_OUT_BUFFER || "0.5");

  const liquidator = new Contract(env("LIQUIDATOR"), LIQUIDATOR_ABI, signer);
  const borrower = ethers.utils.getAddress(env("BORROWER"));
  const vBStock = new Contract(env("VBSTOCK"), VTOKEN_ABI, signer);
  const vDebt = new Contract(env("VDEBT"), VTOKEN_ABI, signer);

  const comptroller = new Contract(await vBStock.comptroller(), COMPTROLLER_ABI, signer);
  const debt = new Contract(await vDebt.underlying(), ERC20_ABI, signer);
  const bStock = new Contract(await vBStock.underlying(), ERC20_ABI, signer);
  const [debtDec, debtSym, bStockDec, bStockSym] = await Promise.all([
    debt.decimals(),
    debt.symbol(),
    bStock.decimals(),
    bStock.symbol(),
  ]);
  const repay = ethers.utils.parseUnits(env("REPAY_AMOUNT"), debtDec);

  // 0. liquidatable?
  const [, , shortfall]: BigNumber[] = await comptroller.getAccountLiquidity(borrower);
  if (shortfall.eq(0)) throw new Error(`${borrower} has no shortfall — not liquidatable`);
  console.log(`borrower ${borrower} shortfall=${ethers.utils.formatEther(shortfall)} (USD-scaled)`);

  // 1 + 2. precompute the exact seize so the quote amount matches what redeem() yields.
  const [seizeErr, seizeTokens]: BigNumber[] = await comptroller.liquidateCalculateSeizeTokens(
    vDebt.address,
    vBStock.address,
    repay,
  );
  if (!seizeErr.eq(0)) throw new Error(`liquidateCalculateSeizeTokens error ${seizeErr}`);
  const exchangeRate: BigNumber = await vBStock.exchangeRateStored();
  const ONE = BigNumber.from(10).pow(18);

  // The seize is routed through the pool-wide Venus Liquidator, which keeps a treasury cut of the
  // liquidation BONUS (see Liquidator._splitLiquidationIncentive), so this contract receives fewer
  // vTokens than `seizeTokens`. Deduct that cut, else the precomputed amount overstates our holdings
  // and the fixed-amountIn router pull reverts. 0 today, but governance-settable.
  let vReceived = seizeTokens;
  const gate: string = await comptroller.liquidatorContract();
  if (gate !== ethers.constants.AddressZero) {
    const venusLiquidator = new Contract(gate, VENUS_LIQUIDATOR_ABI, signer);
    const liqTreasuryPct: BigNumber = await venusLiquidator.treasuryPercentMantissa();
    if (!liqTreasuryPct.eq(0)) {
      const totalIncentive: BigNumber = await comptroller.getEffectiveLiquidationIncentive(borrower, vBStock.address);
      const bonusAmount = seizeTokens.mul(totalIncentive.sub(ONE)).div(totalIncentive);
      const treasuryCut = bonusAmount.mul(liqTreasuryPct).div(ONE);
      vReceived = seizeTokens.sub(treasuryCut);
    }
  }

  // Core redeem then routes `treasuryPercent` of the redeemed underlying to the treasury, so we hold
  // LESS still. The quote must match what we actually hold, else the Native router pull (fixed
  // amountIn) reverts. 0 today, but governance-settable.
  const treasuryPercent: BigNumber = await comptroller.treasuryPercent();
  const seizedRaw = vReceived.mul(exchangeRate).div(ONE).mul(ONE.sub(treasuryPercent)).div(ONE);
  const seizedHuman = ethers.utils.formatUnits(seizedRaw, bStockDec);
  console.log(`seize ${ethers.utils.formatUnits(seizeTokens, 8)} v${bStockSym} -> ~${seizedHuman} ${bStockSym}`);

  // 3. Build the swap, taker = the LIQUIDATOR CONTRACT (so it can submit + receive the debt asset).
  // The contract measures proceeds in the DEBT asset and enforces `minOut` in it. Native only quotes
  // bStock->USDT on BSC (every bStock pair in the live orderbook is *<->USDT), so:
  //   - USDT debt  -> single hop: Native bStock->USDT is already the debt asset.
  //   - other debt -> two hops:   Native bStock->USDT (hop 1), then USDT->debt via an allowlisted
  //                               AMM/aggregator (hop 2, see lib/amm.ts). `minOut` is in the debt asset
  //                               across the whole chain; `amountOut` below is the FINAL debt out.
  const nativeOut = ethers.utils.getAddress(process.env.USDT_ADDR || BSC_USDT);
  const twoHop = debt.address.toLowerCase() !== nativeOut.toLowerCase();

  let router: string;
  let swapCalldata: string;
  let amountOut: BigNumber; // final debt-asset out (drives minOut)
  let router2 = ethers.constants.AddressZero;
  let swapCalldata2 = "0x";
  let intermediateToken = ethers.constants.AddressZero;
  // On-chain deadline mirrors the RFQ quote's own expiry; the mock/fork path never expires.
  let deadline: BigNumber = ethers.constants.MaxUint256;

  if (process.env.MOCK_NATIVE) {
    // Fork/local-test path: MOCK_NATIVE = "<router>:<calldata>" (hop 1), optional MOCK_AMM = same for
    // hop 2, both pre-encoded against a MockNativeRouter. MOCK_OUT is the FINAL debt out.
    const [r, data] = process.env.MOCK_NATIVE.split(":");
    router = ethers.utils.getAddress(r);
    swapCalldata = data;
    amountOut = BigNumber.from(process.env.MOCK_OUT || "0");
    if (process.env.MOCK_AMM) {
      const [r2, data2] = process.env.MOCK_AMM.split(":");
      router2 = ethers.utils.getAddress(r2);
      swapCalldata2 = data2;
      intermediateToken = nativeOut;
    }
  } else {
    // Hop 1: Native RFQ always outputs USDT (bStock pairs only with USDT on BSC).
    const q = await getFirmQuote({
      fromAddress: liquidator.address,
      tokenIn: bStock.address,
      tokenOut: nativeOut,
      amount: seizedHuman,
      slippage,
    });
    const ttl = quoteDeadline(q) - Math.floor(Date.now() / 1000);
    if (ttl <= 0) throw new Error("quote already expired — refetch");
    deadline = BigNumber.from(quoteDeadline(q)); // settle tx reverts on-chain past the quote's expiry
    router = q.txRequest.target;
    swapCalldata = q.txRequest.calldata;
    const midOut = BigNumber.from(q.amountOut); // USDT out of hop 1

    if (twoHop) {
      // Hop 2: convert the hop-1 USDT to the (non-USDT) debt asset via an allowlisted AMM/aggregator.
      const amm = await getAmmSwap(
        {
          tokenIn: nativeOut,
          tokenOut: debt.address,
          amountIn: midOut.toString(),
          recipient: liquidator.address,
          slippage,
        },
        ethers.provider,
      );
      router2 = ethers.utils.getAddress(amm.router);
      swapCalldata2 = amm.calldata;
      intermediateToken = nativeOut;
      amountOut = BigNumber.from(amm.expectedOut);
      console.log(
        `Native: ${seizedHuman} ${bStockSym} -> ${ethers.utils.formatUnits(midOut, 18)} USDT (TTL ${ttl}s, ${router}); ` +
          `AMM: -> ${ethers.utils.formatUnits(amountOut, debtDec)} ${debtSym} (${router2})`,
      );
    } else {
      amountOut = midOut;
      console.log(
        `Native quote: ${seizedHuman} ${bStockSym} -> ${ethers.utils.formatUnits(amountOut, debtDec)} ${debtSym} (TTL ${ttl}s, router ${router})`,
      );
    }
  }

  // Both hop routers must be allowlisted on the liquidator (the low-level call is defended by isRouter).
  const routers = router2 !== ethers.constants.AddressZero ? [router, router2] : [router];
  for (const r of routers) {
    if (!(await liquidator.isRouter(r))) {
      throw new Error(`router ${r} is not allowlisted on the liquidator — call setRouter first`);
    }
  }

  // minOut = amountOut minus an extra safety buffer on top of the quote slippage.
  const minOut = amountOut.mul(Math.round((100 - minOutBufferPct) * 100)).div(10000);

  const params = {
    borrower,
    vDebt: vDebt.address,
    vBStock: vBStock.address,
    repayAmount: repay,
    router,
    swapCalldata,
    minOut,
    router2,
    swapCalldata2,
    intermediateToken,
    deadline,
  };

  // Inventory mode spends the contract's own debt-asset balance; warn early if it can't cover the
  // repay so the failure is legible off-chain instead of a bare on-chain revert. (Flash mode borrows.)
  if (mode !== "flash") {
    const inventory: BigNumber = await debt.balanceOf(liquidator.address);
    if (inventory.lt(repay)) {
      console.warn(
        `WARN: liquidator holds ${ethers.utils.formatUnits(inventory, debtDec)} ${debtSym} < repay ` +
          `${env("REPAY_AMOUNT")} ${debtSym} — fund it or use MODE=flash, else liquidate() will revert.`,
      );
    }
  }

  // 4. settle.
  const fn = mode === "flash" ? "flashLiquidate" : "liquidate";
  console.log(`mode=${mode} -> ${fn}(...) minOut=${ethers.utils.formatUnits(minOut, debtDec)} ${debtSym}`);
  if (dryRun) {
    await liquidator.callStatic[fn](params);
    console.log("  [dry-run] would succeed");
    return;
  }
  const tx = await liquidator[fn](params);
  const rcpt = await tx.wait();
  console.log(`  ${fn} mined: ${rcpt.transactionHash} (gas ${rcpt.gasUsed.toString()})`);
}

async function main() {
  let signer: Signer;
  if (process.env.IMPERSONATE) {
    const { impersonateAccount, setBalance } = await import("@nomicfoundation/hardhat-network-helpers");
    await impersonateAccount(process.env.IMPERSONATE);
    await setBalance(process.env.IMPERSONATE, ethers.utils.parseEther("10"));
    signer = await ethers.getSigner(process.env.IMPERSONATE);
  } else {
    [signer] = await ethers.getSigners();
  }
  console.log(`caller: ${await signer.getAddress()} (dryRun=${process.env.DRY_RUN === "1"})`);
  await atomicLiquidate(signer);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}
