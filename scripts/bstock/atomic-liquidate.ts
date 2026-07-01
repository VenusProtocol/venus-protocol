/**
 * bStock ATOMIC liquidation — drives the on-chain `BStockLiquidator` contract.
 *
 * One tx: the contract repays the borrow, seizes + redeems the bStock, and sells it to
 * USDT via a pre-fetched Native firm-quote. This script does the OFF-CHAIN half (precompute
 * the seize amount, fetch the MM-signed firm-quote with `from_address = the contract`) and
 * then calls `liquidate` (inventory mode) or `flashLiquidate` (Venus flash-loan mode).
 *
 *   1. Comptroller.liquidateCalculateSeizeTokens(vDebt, vBStock, repay)  -> seize vTokens
 *   2. seizeTokens * vBStock.exchangeRateStored() / 1e18                  -> raw bStock (floor)
 *   3. Native firm-quote (from_address = LIQUIDATOR contract)            -> txRequest + amountOut
 *   4. BStockLiquidator.liquidate / flashLiquidate(params)               -> atomic settle
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
 *   DRY_RUN         "1" -> callStatic only, send nothing
 *   MOCK_NATIVE     router addr + calldata source for fork tests (see below)
 */
import { BigNumber, Contract, Signer } from "ethers";
import { ethers } from "hardhat";

import { BSC_USDT, getFirmQuote, quoteDeadline } from "./lib/native";

const LIQUIDATOR_ABI = [
  "function liquidate((address borrower,address vDebt,address vBStock,uint256 repayAmount,address router,bytes swapCalldata,uint256 minOut)) returns (uint256)",
  "function flashLiquidate((address borrower,address vDebt,address vBStock,uint256 repayAmount,address router,bytes swapCalldata,uint256 minOut))",
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
      const ours = bonusAmount.mul(liqTreasuryPct).div(ONE);
      vReceived = seizeTokens.sub(ours);
    }
  }

  // Core redeem then routes `treasuryPercent` of the redeemed underlying to the treasury, so we hold
  // LESS still. The quote must match what we actually hold, else the Native router pull (fixed
  // amountIn) reverts. 0 today, but governance-settable.
  const treasuryPercent: BigNumber = await comptroller.treasuryPercent();
  const seizedRaw = vReceived.mul(exchangeRate).div(ONE).mul(ONE.sub(treasuryPercent)).div(ONE);
  const seizedHuman = ethers.utils.formatUnits(seizedRaw, bStockDec);
  console.log(`seize ${ethers.utils.formatUnits(seizeTokens, 8)} v${bStockSym} -> ~${seizedHuman} ${bStockSym}`);

  // 3. firm-quote, taker = the LIQUIDATOR CONTRACT (so it can submit + receive USDT).
  const usdtAddr = process.env.USDT_ADDR || BSC_USDT;
  let router: string;
  let swapCalldata: string;
  let amountOut: BigNumber;

  if (process.env.MOCK_NATIVE) {
    // Fork-test path: MOCK_NATIVE = "<router>:<calldata>" pre-encoded against a MockNativeRouter.
    const [r, data] = process.env.MOCK_NATIVE.split(":");
    router = ethers.utils.getAddress(r);
    swapCalldata = data;
    amountOut = BigNumber.from(process.env.MOCK_OUT || "0");
  } else {
    const q = await getFirmQuote({
      fromAddress: liquidator.address,
      tokenIn: bStock.address,
      tokenOut: usdtAddr,
      amount: seizedHuman,
      slippage,
    });
    const ttl = quoteDeadline(q) - Math.floor(Date.now() / 1000);
    if (ttl <= 0) throw new Error("quote already expired — refetch");
    router = q.txRequest.target;
    swapCalldata = q.txRequest.calldata;
    amountOut = BigNumber.from(q.amountOut);
    console.log(
      `Native quote: ${seizedHuman} ${bStockSym} -> ${ethers.utils.formatUnits(amountOut, debtDec)} ${debtSym} (TTL ${ttl}s, router ${router})`,
    );
  }

  if (!(await liquidator.isRouter(router))) {
    throw new Error(`router ${router} is not allowlisted on the liquidator — call setRouter first`);
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
