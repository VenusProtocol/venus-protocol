/**
 * Drains PrimeV2's pendingScoreUpdates after addMarket / updateAlpha / updateMultipliers.
 *
 *   STAGE=index   replay Mint/Burn into the holder set, check it against totalTokens(), write HOLDERS_FILE
 *   STAGE=update  read HOLDERS_FILE, send updateScores in batches; skips users already done, so re-runnable
 *
 * The list cannot go stale during a round: every mint/burn entry point reverts ScoreUpdateInProgress
 * while pendingScoreUpdates > 0. index records the round id and update refuses any other round.
 * Drain promptly: an open round also blocks the monthly keeper burnBatch/issueBatch.
 */
import type { Event } from "ethers";
import * as fs from "fs";
import { deployments, ethers } from "hardhat";

/** Which stage to run: "index" (build holder list, no txs) or "update" (send updateScores). Required. */
const STAGE = process.env.STAGE;
/** hardhat-deploy name the Prime address + ABI are read from (deployments/<network>/PrimeV2.json). Both stages. */
const PRIME_DEPLOYMENT = "PrimeV2";
/** Where the holder list is written (index) and read from (update). Default .prime-holders-<chainId>.json in cwd. */
const HOLDERS_FILE = process.env.HOLDERS_FILE;
/** First block of the Mint/Burn scan. index only. Default: the proxy's deployment block from the
 *  hardhat-deploy artifact (bscmainnet 107,040,035 / bsctestnet 112,385,727) — no events exist before it. */
const FROM_BLOCK = process.env.FROM_BLOCK ? Number(process.env.FROM_BLOCK) : undefined;
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
const toEvent =
  (kind: HolderEvent["kind"]) =>
  (e: Event): HolderEvent => ({ kind, user: e.args?.user, blockNumber: e.blockNumber, logIndex: e.logIndex });

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
    const [mints, burns] = await Promise.all([
      prime.queryFilter(prime.filters.Mint(), from, to),
      prime.queryFilter(prime.filters.Burn(), from, to),
    ]);
    events.push(...mints.map(toEvent("Mint")), ...burns.map(toEvent("Burn")));
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

  // READ_CONCURRENCY reads in flight; fine for 500 holders, use a multicall if it ever isn't.
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
    const fromBlock = FROM_BLOCK ?? dep.receipt?.blockNumber ?? 0;
    const toBlock = await ethers.provider.getBlockNumber();
    const events = await fetchHolderEvents(prime, fromBlock, BLOCK_RANGE, toBlock, console.log);
    const holders = eventsToHolders(events);
    const onChain = Number(await prime.totalTokens());
    const round = Number(await prime.nextScoreUpdateRoundId());
    if (holders.length !== onChain)
      throw new Error(`indexed ${holders.length} holders but totalTokens is ${onChain} — check FROM_BLOCK / RPC gaps`);
    fs.writeFileSync(file, JSON.stringify({ address: dep.address, chainId, toBlock, round, holders }, null, 2));
    console.log(`${events.length} events → ${holders.length} holders, round ${round}. Wrote ${file}`);
    return;
  }

  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  if (saved.address.toLowerCase() !== dep.address.toLowerCase() || saved.chainId !== chainId) {
    throw new Error(`${file} was indexed for ${saved.address} on chain ${saved.chainId}`);
  }
  // Same round id ⇒ same holder set (see header). A mid-round re-queue also bumps it; that just costs a re-index.
  const round = Number(await prime.nextScoreUpdateRoundId());
  if (saved.round !== round) {
    throw new Error(`${file} was indexed during round ${saved.round}; current round is ${round} — re-run STAGE=index`);
  }
  console.log(`${saved.holders.length} holders indexed at block ${saved.toBlock}, round ${round}`);
  await runUpdate(prime, saved.holders, { dryRun: DRY_RUN, batchSize: BATCH_SIZE });
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
