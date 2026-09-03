/**
 * Drains PrimeV2's pendingScoreUpdates queue after addMarket / updateAlpha /
 * updateMultipliers. Two stages, so the holder list is reviewed before any tx:
 *
 *   STAGE=index  npx hardhat run scripts/prime-update-scores.ts --network bscmainnet
 *     Replays Mint/Burn events since the PrimeV2 deploy block into the current
 *     holder set, checks the count against totalTokens(), writes HOLDERS_FILE.
 *
 *   STAGE=update npx hardhat run scripts/prime-update-scores.ts --network bscmainnet
 *     Reads HOLDERS_FILE, skips users already done this round (isScoreUpdated),
 *     sends updateScores in batches. Re-runnable: a crashed run just resumes.
 *
 * Configuration (env var, or constant below) — one line each: meaning · stage · default
 */
import * as fs from "fs";
import { deployments, ethers } from "hardhat";

/** Which stage to run: "index" (build holder list, no txs) or "update" (send updateScores). Required. */
const STAGE = process.env.STAGE;
/** hardhat-deploy name the Prime address + ABI are read from (deployments/<network>/PrimeV2.json). Both stages. */
const PRIME_DEPLOYMENT = "PrimeV2";
/** Where the holder list is written (index) and read from (update). Default .prime-holders-<chainId>.json in cwd. */
const HOLDERS_FILE = process.env.HOLDERS_FILE; // resolved in main() once chainId is known
/** First block of the Mint/Burn scan. index only. Default: PrimeV2 proxy creation on bscmainnet
 *  (tx 0x41d505b974f7435664281ce32a39df8bcfee74e5a36548c2710f0deede74b0fe) — no Prime events exist before it; 0 elsewhere. */
const FROM_BLOCK = process.env.FROM_BLOCK ? Number(process.env.FROM_BLOCK) : undefined;
const PRIMEV2_DEPLOY_BLOCK_BSCMAINNET = 107_040_035;
/** Blocks per eth_getLogs call. index only. Default 5000 (safe on public RPCs; NodeReal takes 50000). */
const BLOCK_RANGE = Number(process.env.BLOCK_RANGE ?? 5000);
/** Users per updateScores tx. update only. Default 14: BSC caps a tx at 16,777,216 gas and one user
 *  costs ~0.93M, so 14 ≈ 13M. Must not exceed the contract's maxLoopsLimit (20). */
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 14);
/** Gas limit sent with each updateScores tx (estimateGas is skipped). update only. */
const TX_GAS_LIMIT = 15_000_000;
/** isScoreUpdated reads kept in flight at once while filtering the holder list. update only. */
const READ_CONCURRENCY = 20;
/** "1" = do everything in the update stage except send the txs. Default off. index never sends. */
const DRY_RUN = process.env.DRY_RUN === "1";

export type HolderEvent = { kind: "Mint" | "Burn"; user: string; blockNumber: number; logIndex: number };

export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Replay Mint/Burn in (block, logIndex) order; a user's last event decides. */
export function eventsToHolders(events: HolderEvent[]): string[] {
  const ordered = [...events].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  const state = new Map<string, boolean>();
  for (const e of ordered) state.set(e.user, e.kind === "Mint");
  return [...state].filter(([, held]) => held).map(([user]) => user);
}

/** Both Prime and PrimeV2 name the event arg `user`, so this works for either ABI. */
export async function fetchHolderEvents(
  prime: any,
  fromBlock: number,
  blockRange: number,
  latest?: number,
  log: (msg: string) => void = () => undefined,
): Promise<HolderEvent[]> {
  const toBlock = latest ?? (await prime.provider.getBlockNumber());
  const events: HolderEvent[] = [];
  for (let from = fromBlock; from <= toBlock; from += blockRange) {
    const to = Math.min(from + blockRange - 1, toBlock);
    for (const kind of ["Mint", "Burn"] as const) {
      for (const e of await prime.queryFilter(prime.filters[kind](), from, to)) {
        events.push({ kind, user: e.args.user, blockNumber: e.blockNumber, logIndex: e.logIndex });
      }
    }
    log(`  scanned ${from}-${to}: ${events.length} events so far`);
  }
  return events;
}

export type RunUpdateOptions = { dryRun?: boolean; batchSize?: number; log?: (msg: string) => void };
export type RunUpdateResult = {
  pendingBefore: bigint;
  pendingAfter: bigint;
  batchesSent: number;
  usersUpdated: number;
};

export async function runUpdate(prime: any, holders: string[], opts: RunUpdateOptions = {}): Promise<RunUpdateResult> {
  const log = opts.log ?? console.log;
  const pendingBefore: bigint = (await prime.pendingScoreUpdates()).toBigInt();
  if (pendingBefore === 0n) {
    log("pendingScoreUpdates = 0 — nothing to do");
    return { pendingBefore, pendingAfter: 0n, batchesSent: 0, usersUpdated: 0 };
  }
  const round = await prime.nextScoreUpdateRoundId();
  const maxLoops = Number(await prime.maxLoopsLimit());
  log(`pendingScoreUpdates ${pendingBefore}, round ${round}, maxLoopsLimit ${maxLoops}`);

  // ponytail: READ_CONCURRENCY reads in flight; fine for 500 holders, use a multicall if it ever isn't.
  const done: boolean[] = [];
  for (const slice of chunk(holders, READ_CONCURRENCY))
    done.push(...(await Promise.all(slice.map(h => prime.isScoreUpdated(round, h)))));
  const remaining = holders.filter((_, i) => !done[i]);
  log(`Pending this round: ${remaining.length}`);
  if (remaining.length === 0) {
    log(
      "Every listed holder is already updated. If pendingScoreUpdates > 0 the list is missing someone — re-run STAGE=index.",
    );
    return { pendingBefore, pendingAfter: pendingBefore, batchesSent: 0, usersUpdated: 0 };
  }

  const batchSize = opts.batchSize ?? maxLoops;
  if (batchSize > maxLoops) throw new Error(`BATCH_SIZE ${batchSize} > maxLoopsLimit ${maxLoops}`);
  const batches = chunk(remaining, batchSize);
  for (const [i, batch] of batches.entries()) {
    log(`  [${i + 1}/${batches.length}] updateScores(${batch.length})`);
    if (opts.dryRun) continue;
    const rcpt = await (await prime.updateScores(batch, { gasLimit: TX_GAS_LIMIT })).wait();
    log(`    ${rcpt.transactionHash} gasUsed=${rcpt.gasUsed}`);
  }

  const pendingAfter: bigint = (await prime.pendingScoreUpdates()).toBigInt();
  log(`pendingScoreUpdates after: ${pendingAfter}`);
  return { pendingBefore, pendingAfter, batchesSent: batches.length, usersUpdated: remaining.length };
}

async function main() {
  if (STAGE !== "index" && STAGE !== "update") throw new Error('STAGE must be "index" or "update"');

  const dep = await deployments.get(PRIME_DEPLOYMENT);
  const prime = await ethers.getContractAt(dep.abi, dep.address);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const file = HOLDERS_FILE ?? `.prime-holders-${chainId}.json`;
  console.log(`${PRIME_DEPLOYMENT} ${dep.address} chainId ${chainId}, holders file ${file}`);

  if (STAGE === "index") {
    const fromBlock = FROM_BLOCK ?? (chainId === 56 ? PRIMEV2_DEPLOY_BLOCK_BSCMAINNET : 0);
    const toBlock = await ethers.provider.getBlockNumber();
    const events = await fetchHolderEvents(prime, fromBlock, BLOCK_RANGE, toBlock, console.log);
    const holders = eventsToHolders(events);
    const onChain = Number(await prime.totalTokens());
    fs.writeFileSync(file, JSON.stringify({ address: dep.address, chainId, toBlock, holders }, null, 2));
    console.log(`${events.length} events → ${holders.length} holders (on-chain totalTokens ${onChain}). Wrote ${file}`);
    if (holders.length !== onChain)
      throw new Error("indexed holder count != totalTokens — check FROM_BLOCK / RPC gaps");
    return;
  }

  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  if (saved.address.toLowerCase() !== dep.address.toLowerCase() || saved.chainId !== chainId) {
    throw new Error(`${file} was indexed for ${saved.address} on chain ${saved.chainId}`);
  }
  const onChain = Number(await prime.totalTokens());
  console.log(`${saved.holders.length} holders indexed at block ${saved.toBlock}; on-chain totalTokens now ${onChain}`);
  if (onChain !== saved.holders.length)
    console.warn("WARNING: holder set changed since indexing — burned users are skipped, new mints are missing.");
  await runUpdate(prime, saved.holders, { dryRun: DRY_RUN, batchSize: BATCH_SIZE });
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
