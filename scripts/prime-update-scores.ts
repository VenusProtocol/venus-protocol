/**
 * Drains the Prime pendingScoreUpdates queue after a parameter change.
 *
 * Triggers (functions that queue a fresh round of score updates by calling
 * `_startScoreUpdateRound()` internally):
 *   - addMarket
 *   - updateAlpha
 *   - updateMultipliers
 *
 * Prime exposes no on-chain holder enumeration, so this script reconstructs
 * the current holder set from `Mint` and `Burn` events, then calls
 * `updateScores` in batches sized to `maxLoopsLimit()` until the queue drains.
 *
 * Resumes correctly across runs: per-user, per-round dedup via
 * `isScoreUpdated[roundId][user]` is read on-chain.
 *
 * Usage:
 *   npx hardhat run scripts/prime-update-scores.ts --network <network>
 *
 * Optional env vars:
 *   FROM_BLOCK         First block to scan for Mint/Burn
 *                      (default: BSC mainnet Prime deploy block, 33_264_762)
 *   BLOCK_RANGE        Max blocks per getLogs call (default: 5000)
 *   DRY_RUN            "1" to skip sending txs
 */
import { deployments, ethers } from "hardhat";

export type HolderEvent = {
  kind: "Mint" | "Burn";
  user: string;
  blockNumber: number;
  logIndex: number;
};

/**
 * Pure function: split an array into chunks of at most `size` items.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Pure function: replay Mint/Burn events to compute the set of current holders.
 * Events must be applied in (blockNumber, logIndex) order. Mints set the
 * user as a holder; Burns unset. The final holder set is every address whose
 * last state was holder=true.
 */
export function eventsToHolders(events: HolderEvent[]): string[] {
  const ordered = [...events].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.logIndex - b.logIndex;
  });

  const holders = new Map<string, boolean>();
  for (const ev of ordered) {
    holders.set(ev.user, ev.kind === "Mint");
  }

  const current: string[] = [];
  for (const [addr, isHolder] of holders) {
    if (isHolder) current.push(addr);
  }
  return current;
}

/**
 * Fetch all Mint and Burn events from a Prime contract, paginated.
 * Uses `prime.filters.Mint()` / `prime.filters.Burn()` and `queryFilter`.
 */
export async function fetchHolderEvents(
  prime: any,
  fromBlock: number,
  blockRange: number,
  latest?: number,
  log: (msg: string) => void = () => undefined,
): Promise<HolderEvent[]> {
  const toLatest = latest ?? (await prime.provider.getBlockNumber());
  const mintFilter = prime.filters.Mint();
  const burnFilter = prime.filters.Burn();

  const events: HolderEvent[] = [];

  for (let from = fromBlock; from <= toLatest; from += blockRange) {
    const to = Math.min(from + blockRange - 1, toLatest);
    const [mints, burns] = await Promise.all([
      prime.queryFilter(mintFilter, from, to),
      prime.queryFilter(burnFilter, from, to),
    ]);

    // Mint(address indexed user, bool isIrrevocable): we only need `user`.
    for (const m of mints) {
      events.push({ kind: "Mint", user: m.args!.user, blockNumber: m.blockNumber, logIndex: m.logIndex });
    }
    // Burn(address indexed user)
    for (const b of burns) {
      events.push({ kind: "Burn", user: b.args!.user, blockNumber: b.blockNumber, logIndex: b.logIndex });
    }

    log(`  scanned blocks ${from}-${to}: +${mints.length} mints, -${burns.length} burns`);
  }

  return events;
}

export type RunUpdateOptions = {
  dryRun?: boolean;
  log?: (msg: string) => void;
};

export type RunUpdateResult = {
  pendingBefore: bigint;
  pendingAfter: bigint;
  batchesSent: number;
  usersUpdated: number;
};

/**
 * Drains pendingScoreUpdates for the given holders.
 * Filters out users already processed in the current round via isScoreUpdated.
 * Batches by maxLoopsLimit() and calls updateScores() per batch.
 */
export async function runUpdate(prime: any, holders: string[], opts: RunUpdateOptions = {}): Promise<RunUpdateResult> {
  const dryRun = opts.dryRun ?? false;
  const log = opts.log ?? ((msg: string) => console.log(msg));

  const pendingBefore: bigint = (await prime.pendingScoreUpdates()).toBigInt();
  if (pendingBefore === 0n) {
    log("pendingScoreUpdates = 0 — nothing to do");
    return { pendingBefore: 0n, pendingAfter: 0n, batchesSent: 0, usersUpdated: 0 };
  }
  log(`pendingScoreUpdates: ${pendingBefore}`);

  const roundId: bigint = (await prime.nextScoreUpdateRoundId()).toBigInt();
  const maxLoops: bigint = (await prime.maxLoopsLimit()).toBigInt();
  log(`round ${roundId}, maxLoopsLimit ${maxLoops}`);

  // Parallelize isScoreUpdated reads in batches to avoid serial RPC latency
  // when there are many holders. RPC providers tolerate ~20 in-flight reads
  // comfortably without rate-limiting.
  const ISSCOREUPDATED_BATCH = 20;
  const remaining: string[] = [];
  for (let i = 0; i < holders.length; i += ISSCOREUPDATED_BATCH) {
    const slice = holders.slice(i, i + ISSCOREUPDATED_BATCH);
    const flags: boolean[] = await Promise.all(slice.map(h => prime.isScoreUpdated(roundId, h)));
    for (let j = 0; j < slice.length; j++) {
      if (!flags[j]) remaining.push(slice[j]);
    }
  }
  log(`Pending this round: ${remaining.length}`);

  if (remaining.length === 0) {
    log(
      "All current holders already updated for this round. Pending counter may include burned users — verify off-chain.",
    );
    return { pendingBefore, pendingAfter: pendingBefore, batchesSent: 0, usersUpdated: 0 };
  }

  const batches = chunk(remaining, Number(maxLoops));
  log(`Sending ${batches.length} batch(es) of up to ${maxLoops} users`);

  let usersUpdated = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    log(`  [${i + 1}/${batches.length}] updateScores(${batch.length} users)`);
    if (dryRun) {
      usersUpdated += batch.length;
      continue;
    }

    const tx = await prime.updateScores(batch);
    const rcpt = await tx.wait();
    log(`    tx ${rcpt.transactionHash} gasUsed=${rcpt.gasUsed.toString()}`);
    usersUpdated += batch.length;
  }

  const pendingAfter: bigint = (await prime.pendingScoreUpdates()).toBigInt();
  log(`pendingScoreUpdates after: ${pendingAfter}`);

  return { pendingBefore, pendingAfter, batchesSent: batches.length, usersUpdated };
}

// BSC mainnet Prime deployment block (proxy creation tx
// 0xfd09cf4011f863f65f1dc6a37cb325468f0ce6311849f77205e891bd36107433).
// Used as the default lower bound for the Mint/Burn event scan so an
// operator on bscmainnet doesn't have to look it up manually.
const PRIME_BSCMAINNET_DEPLOY_BLOCK = 33_264_762;

async function main() {
  const fromBlock = Number(process.env.FROM_BLOCK ?? PRIME_BSCMAINNET_DEPLOY_BLOCK);
  const blockRange = Number(process.env.BLOCK_RANGE ?? 5000);
  const dryRun = process.env.DRY_RUN === "1";

  const dep = await deployments.get("Prime");
  console.log(`Prime: ${dep.address}`);

  const prime = await ethers.getContractAt("Prime", dep.address);

  console.log("Reconstructing holder set from Mint/Burn events...");
  const events = await fetchHolderEvents(prime, fromBlock, blockRange, undefined, m => console.log(m));
  const holders = eventsToHolders(events);
  console.log(`Total current holders: ${holders.length}`);

  await runUpdate(prime, holders, { dryRun, log: m => console.log(m) });
}

// Only execute when invoked directly via `hardhat run`, not when imported by tests.
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
