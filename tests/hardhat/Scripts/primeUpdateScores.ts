import chai from "chai";
import { BigNumber } from "ethers";

import { HolderEvent, chunk, eventsToHolders, runUpdate } from "../../../scripts/prime-update-scores";

const { expect } = chai;

function addr(n: number): string {
  return "0x" + n.toString(16).padStart(40, "0");
}

/**
 * Hand-rolled stub conforming to the subset of the Prime ABI the script uses.
 * Avoids smock since the methods we need are public-state-var getters that
 * smock can't synthesize without the concrete contract type.
 */
class PrimeStub {
  pendingValues: BigNumber[] = [BigNumber.from(0)]; // can change across calls
  pendingCallCount = 0;
  roundId = BigNumber.from(0);
  maxLoops = BigNumber.from(100);
  doneSet = new Set<string>(); // users with isScoreUpdated == true
  updateScoresCalls: string[][] = [];

  async pendingScoreUpdates(): Promise<BigNumber> {
    const idx = Math.min(this.pendingCallCount, this.pendingValues.length - 1);
    this.pendingCallCount++;
    return this.pendingValues[idx];
  }

  async nextScoreUpdateRoundId(): Promise<BigNumber> {
    return this.roundId;
  }

  async maxLoopsLimit(): Promise<BigNumber> {
    return this.maxLoops;
  }

  async isScoreUpdated(_roundId: BigNumber, user: string): Promise<boolean> {
    return this.doneSet.has(user);
  }

  async updateScores(users: string[]): Promise<{ wait(): Promise<{ transactionHash: string; gasUsed: BigNumber }> }> {
    this.updateScoresCalls.push([...users]);
    return {
      wait: async () => ({ transactionHash: "0xdead", gasUsed: BigNumber.from(123456) }),
    };
  }
}

describe("scripts/prime-update-scores", () => {
  describe("chunk()", () => {
    it("returns empty when input is empty", () => {
      expect(chunk([], 5)).to.deep.equal([]);
    });

    it("splits an array evenly when size divides length", () => {
      expect(chunk([1, 2, 3, 4], 2)).to.deep.equal([
        [1, 2],
        [3, 4],
      ]);
    });

    it("places remainder in the last chunk when size does not divide length", () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).to.deep.equal([[1, 2], [3, 4], [5]]);
    });

    it("returns one chunk when size >= length", () => {
      expect(chunk([1, 2, 3], 10)).to.deep.equal([[1, 2, 3]]);
    });

    it("throws when size <= 0", () => {
      expect(() => chunk([1, 2], 0)).to.throw(/size must be > 0/);
      expect(() => chunk([1, 2], -1)).to.throw(/size must be > 0/);
    });
  });

  describe("eventsToHolders()", () => {
    it("treats a single Mint as a current holder", () => {
      const events: HolderEvent[] = [{ kind: "Mint", user: addr(1), blockNumber: 1, logIndex: 0 }];
      expect(eventsToHolders(events)).to.deep.equal([addr(1)]);
    });

    it("treats Mint → Burn as not a current holder", () => {
      const events: HolderEvent[] = [
        { kind: "Mint", user: addr(1), blockNumber: 1, logIndex: 0 },
        { kind: "Burn", user: addr(1), blockNumber: 2, logIndex: 0 },
      ];
      expect(eventsToHolders(events)).to.deep.equal([]);
    });

    it("treats Mint → Burn → Mint as a current holder (latest event wins)", () => {
      const events: HolderEvent[] = [
        { kind: "Mint", user: addr(1), blockNumber: 1, logIndex: 0 },
        { kind: "Burn", user: addr(1), blockNumber: 2, logIndex: 0 },
        { kind: "Mint", user: addr(1), blockNumber: 3, logIndex: 0 },
      ];
      expect(eventsToHolders(events)).to.deep.equal([addr(1)]);
    });

    it("applies events in (blockNumber, logIndex) order even when input is unsorted", () => {
      // Burn at (2, 0) must apply AFTER Mint at (1, 0).
      const events: HolderEvent[] = [
        { kind: "Burn", user: addr(1), blockNumber: 2, logIndex: 0 },
        { kind: "Mint", user: addr(1), blockNumber: 1, logIndex: 0 },
      ];
      expect(eventsToHolders(events)).to.deep.equal([]);
    });

    it("breaks ties on blockNumber using logIndex", () => {
      // Same block: Mint at logIndex 0, then Burn at logIndex 1 -> not holder.
      const events: HolderEvent[] = [
        { kind: "Burn", user: addr(1), blockNumber: 1, logIndex: 1 },
        { kind: "Mint", user: addr(1), blockNumber: 1, logIndex: 0 },
      ];
      expect(eventsToHolders(events)).to.deep.equal([]);

      // Reverse logIndex order: Burn first, then Mint -> holder.
      const events2: HolderEvent[] = [
        { kind: "Mint", user: addr(1), blockNumber: 1, logIndex: 1 },
        { kind: "Burn", user: addr(1), blockNumber: 1, logIndex: 0 },
      ];
      expect(eventsToHolders(events2)).to.deep.equal([addr(1)]);
    });

    it("returns all holders for multiple distinct users", () => {
      const events: HolderEvent[] = [
        { kind: "Mint", user: addr(1), blockNumber: 1, logIndex: 0 },
        { kind: "Mint", user: addr(2), blockNumber: 1, logIndex: 1 },
        { kind: "Mint", user: addr(3), blockNumber: 2, logIndex: 0 },
        { kind: "Burn", user: addr(2), blockNumber: 3, logIndex: 0 },
      ];
      const holders = eventsToHolders(events);
      expect(holders).to.have.members([addr(1), addr(3)]);
      expect(holders).to.not.include(addr(2));
    });
  });

  describe("runUpdate()", () => {
    let prime: PrimeStub;

    beforeEach(() => {
      prime = new PrimeStub();
    });

    it("short-circuits when pendingScoreUpdates is 0", async () => {
      prime.pendingValues = [BigNumber.from(0)];

      const result = await runUpdate(prime as any, [addr(1), addr(2)], { log: () => undefined });

      expect(result).to.deep.equal({ pendingBefore: 0n, pendingAfter: 0n, batchesSent: 0, usersUpdated: 0 });
      expect(prime.updateScoresCalls).to.have.length(0);
    });

    it("short-circuits when all holders already processed in current round", async () => {
      prime.pendingValues = [BigNumber.from(5)];
      prime.roundId = BigNumber.from(7);
      prime.doneSet = new Set([addr(1), addr(2), addr(3)]);

      const result = await runUpdate(prime as any, [addr(1), addr(2), addr(3)], { log: () => undefined });

      expect(result.batchesSent).to.equal(0);
      expect(result.usersUpdated).to.equal(0);
      expect(result.pendingAfter).to.equal(5n);
      expect(prime.updateScoresCalls).to.have.length(0);
    });

    it("calls updateScores once when holders fit in a single batch", async () => {
      prime.pendingValues = [BigNumber.from(2), BigNumber.from(0)];
      prime.maxLoops = BigNumber.from(10);

      const holders = [addr(1), addr(2)];
      const result = await runUpdate(prime as any, holders, { log: () => undefined });

      expect(result.batchesSent).to.equal(1);
      expect(result.usersUpdated).to.equal(2);
      expect(prime.updateScoresCalls).to.deep.equal([holders]);
    });

    it("splits holders across multiple batches sized by maxLoopsLimit", async () => {
      prime.pendingValues = [BigNumber.from(5), BigNumber.from(0)];
      prime.maxLoops = BigNumber.from(2);

      const holders = [addr(1), addr(2), addr(3), addr(4), addr(5)];
      const result = await runUpdate(prime as any, holders, { log: () => undefined });

      expect(result.batchesSent).to.equal(3); // ceil(5/2) = 3
      expect(result.usersUpdated).to.equal(5);
      expect(prime.updateScoresCalls).to.deep.equal([[addr(1), addr(2)], [addr(3), addr(4)], [addr(5)]]);
    });

    it("skips users already processed and only sends remaining", async () => {
      prime.pendingValues = [BigNumber.from(2), BigNumber.from(0)];
      prime.roundId = BigNumber.from(3);
      prime.maxLoops = BigNumber.from(10);
      prime.doneSet = new Set([addr(1)]); // user(1) already done; (2) & (3) pending

      await runUpdate(prime as any, [addr(1), addr(2), addr(3)], { log: () => undefined });

      expect(prime.updateScoresCalls).to.deep.equal([[addr(2), addr(3)]]);
    });

    it("does not call updateScores in dryRun mode", async () => {
      prime.pendingValues = [BigNumber.from(3), BigNumber.from(3)]; // unchanged since dryRun
      prime.maxLoops = BigNumber.from(10);

      const result = await runUpdate(prime as any, [addr(1), addr(2), addr(3)], {
        dryRun: true,
        log: () => undefined,
      });

      expect(prime.updateScoresCalls).to.have.length(0);
      expect(result.batchesSent).to.equal(1);
      expect(result.usersUpdated).to.equal(3); // counted as would-have-been-updated
    });

    it("reports pendingAfter from the contract after batches drain", async () => {
      prime.pendingValues = [BigNumber.from(3), BigNumber.from(0)];
      prime.maxLoops = BigNumber.from(10);

      const result = await runUpdate(prime as any, [addr(1), addr(2), addr(3)], { log: () => undefined });

      expect(result.pendingBefore).to.equal(3n);
      expect(result.pendingAfter).to.equal(0n);
    });
  });
});
