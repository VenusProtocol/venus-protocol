/**
 * FORK VERIFICATION — proves a Liquid Mesh `disableSimulate:true` swap blob actually EXECUTES on-chain.
 *
 * Liquid Mesh returns calldata WITHOUT simulating it (that is the whole point of `disableSimulate`), so
 * the one thing untested by the mocked unit suite is: does that blob really fill against the real router?
 * This script answers it end-to-end against a bscmainnet fork at (near) head:
 *
 *   1. hardhat_reset the fork to LATEST — the RFQ maker signatures reference live on-chain inventory/nonces,
 *      so the fork block must match head or settlement reverts.
 *   2. Live `GET /quote` + `POST /swap` (disableSimulate:true) for a small bStock -> USDT (lib/liquidmesh.ts).
 *   3. Replicate the contract's `_swap` EXACTLY: give a taker the real bStock, approve the LM SPENDER (not
 *      the router), then `router.call(callMsg.data)`. Assert USDT actually landed.
 *
 * This is a one-shot, on-demand check (needs live LM creds + an archive RPC + a recent block), NOT a CI
 * fixture. Run:
 *   source ~/.liquidmesh/keys.env
 *   LM_API_KEY=$API_KEY LM_PRIVATE_KEY_SEED=$PRIVATE_KEY_BASE64_SEED FORKED_NETWORK=bscmainnet \
 *     AMOUNT=3 npx hardhat run scripts/bstock/verify-lm-fork.ts
 *
 * REQUIRED hardhat config for this diagnostic (the RFQ orders are EIP-712 signed with chainId 56 and the
 * head block needs modern opcodes, neither of which the default fork network provides). Temporarily set,
 * in `hardhat.config.ts` `isFork()`, on the returned hardhat-network object:
 *     chainId: 56,
 *     chains: { 56: { hardforkHistory: { berlin: 0, london: 13000000, shanghai: 40000000, cancun: 48000000 } } }
 * WITHOUT `chainId: 56` the maker signature fails `InvalidSignature` (fork runs as 31337) — a fork artifact,
 * not a real defect. The guard below aborts early if chainId != 56 so the failure is legible.
 *
 * Env:
 *   BSTOCK    bStock token to sell (default TSLAB 0x5b19…292f)
 *   AMOUNT    human units to sell (default "10")
 *   TAKER     address that executes the swap (default: a real holder found via Transfer logs)
 */
import { BigNumber } from "ethers";
import { ethers, network } from "hardhat";

import { LM_BSC_USDT, LM_SPENDER, buildSwap, getQuote } from "./lib/liquidmesh";

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

const DEFAULT_BSTOCK = "0x5b1910eAaD6450E50f816082Aa078C41F10C292f"; // TSLAB

// Find a real, currently-holding address by scanning recent Transfer logs for recipients whose LIVE
// balance covers `amount`. A legitimate holder is (for a transfer-restricted bStock) already allowlisted,
// so it can move the token to the LM settlement — exactly what the liquidator does with seized bStock.
async function findHolder(token: string, amount: BigNumber, headBlock: number): Promise<string> {
  const erc20 = new ethers.Contract(token, ERC20_ABI, ethers.provider);
  const transferTopic = ethers.utils.id("Transfer(address,address,uint256)");
  const SPAN = 2000;
  for (let from = headBlock - SPAN; from > headBlock - SPAN * 8; from -= SPAN) {
    const logs = await ethers.provider.getLogs({
      address: token,
      topics: [transferTopic],
      fromBlock: from,
      toBlock: from + SPAN - 1,
    });
    // Candidate recipients (topic[2]), newest first.
    const cands: string[] = [];
    for (let i = logs.length - 1; i >= 0; i--) {
      const to = ethers.utils.getAddress("0x" + logs[i].topics[2].slice(26));
      if (to !== ethers.constants.AddressZero && !cands.includes(to)) cands.push(to);
    }
    for (const c of cands) {
      try {
        if ((await erc20.balanceOf(c)).gte(amount)) return c;
      } catch {
        /* skip */
      }
    }
  }
  throw new Error(`no ${token} holder with balance >= ${amount} found in recent Transfer logs`);
}

async function main() {
  const rpc = process.env.ARCHIVE_NODE_bscmainnet;
  if (!rpc) throw new Error("ARCHIVE_NODE_bscmainnet must be set (fork RPC)");

  // 1. Fork at LATEST so the RFQ maker state matches head.
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: rpc } }] });
  const block = await ethers.provider.getBlock("latest");
  console.log(
    `forked bscmainnet @ block ${block.number} (ts ${block.timestamp}, ${new Date(block.timestamp * 1000).toISOString()})`,
  );

  // The RFQ maker orders are EIP-712 signed with chainId 56; the default fork network runs as 31337, which
  // makes `ecrecover` compute a different digest and revert `InvalidSignature`. Fail loudly, not cryptically.
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 56) {
    throw new Error(
      `fork chainId is ${chainId}, must be 56 — set chainId:56 in hardhat.config isFork() (see header). ` +
        `Otherwise the RFQ signature fails InvalidSignature as a fork artifact.`,
    );
  }

  const bStockAddr = ethers.utils.getAddress(process.env.BSTOCK || DEFAULT_BSTOCK);
  const bStock = new ethers.Contract(bStockAddr, ERC20_ABI, ethers.provider);
  const usdt = new ethers.Contract(LM_BSC_USDT, ERC20_ABI, ethers.provider);
  const [dec, sym] = await Promise.all([bStock.decimals(), bStock.symbol()]);
  const amount = ethers.utils.parseUnits(process.env.AMOUNT || "10", dec);

  // bStock (ERC-8056) uses non-standard storage and is likely transfer-restricted (allowlist), so we
  // can't mint to an arbitrary taker. Instead use a REAL, already-allowlisted holder as the taker: scan
  // recent Transfer logs, pick a recipient whose live balance covers `amount`. This also faithfully
  // models the liquidator, which only ever sells bStock it legitimately holds (seized + redeemed).
  const taker = process.env.TAKER
    ? ethers.utils.getAddress(process.env.TAKER)
    : await findHolder(bStockAddr, amount, block.number);
  console.log(
    `taker (real ${sym} holder): ${taker}  balance=${ethers.utils.formatUnits(await bStock.balanceOf(taker), dec)}`,
  );

  // 2. Live LM quote + swap(disableSimulate) — taker as userAddress (not embedded in calldata; router
  //    keys off msg.sender, so the built blob is executable by whoever sends it).
  const quote = await getQuote({
    userAddress: taker,
    tokenIn: bStockAddr,
    tokenOut: LM_BSC_USDT,
    amountWei: amount.toString(),
  });
  const expectedOut = BigNumber.from(quote.outputAmount);
  console.log(
    `LM quote: ${process.env.AMOUNT || "10"} ${sym} -> ${ethers.utils.formatUnits(expectedOut, 18)} USDT ` +
      `[${quote.routePlans?.[0]?.subRouters?.[0]?.dexes?.map(d => `${d.dex}:${(d.weight / 100).toFixed(0)}%`).join(" ")}]`,
  );
  const minOut = expectedOut.mul(95).div(100);
  const swap = await buildSwap({
    userAddress: taker,
    tokenIn: bStockAddr,
    tokenOut: LM_BSC_USDT,
    amountWei: amount.toString(),
    minOutWei: minOut.toString(),
    routePlans: quote.routePlans,
    slippageBps: 50,
  });
  console.log(
    `LM /swap (disableSimulate): router=${swap.callMsg.to} dataLen=${swap.callMsg.data.length} expiry=${swap.expiryTimestamp}`,
  );

  // 3. Replicate `_swap`: impersonate the (real) holder, approve the SPENDER, call the router.
  const { impersonateAccount, setBalance } = await import("@nomicfoundation/hardhat-network-helpers");
  await impersonateAccount(taker);
  await setBalance(taker, ethers.utils.parseEther("10"));
  const takerSigner = await ethers.getSigner(taker);

  await bStock.connect(takerSigner).approve(LM_SPENDER, amount);
  console.log(`  approved spender ${LM_SPENDER} for ${ethers.utils.formatUnits(amount, dec)} ${sym}`);

  const usdtBefore: BigNumber = await usdt.balanceOf(taker);
  console.log(`  executing router.call(callMsg.data) ...`);
  const tx = await takerSigner.sendTransaction({
    to: swap.callMsg.to,
    data: swap.callMsg.data,
    value: swap.callMsg.value,
  });
  const rcpt = await tx.wait();
  const usdtAfter: BigNumber = await usdt.balanceOf(taker);
  const got = usdtAfter.sub(usdtBefore);

  console.log(`\n  gas ${rcpt.gasUsed.toString()}`);
  console.log(
    `  USDT received: ${ethers.utils.formatUnits(got, 18)}  (minOut ${ethers.utils.formatUnits(minOut, 18)})`,
  );
  if (got.lt(minOut)) throw new Error(`FAIL: received ${got} < minOut ${minOut}`);
  console.log(`\n✅ PASS — Liquid Mesh disableSimulate calldata EXECUTED on-chain and delivered USDT >= minOut.`);
  console.log(
    `   Proves the atomic path: the same call succeeds inside the liquidator's _swap (approve spender -> router.call).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error("\n❌", e.message || e);
    process.exit(1);
  });
