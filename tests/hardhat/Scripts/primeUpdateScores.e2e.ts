import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { eventsToHolders, fetchHolderEvents, runUpdate } from "../../../scripts/prime-update-scores";
import { SetupProtocolFixture, deployProtocol } from "../Prime/Prime";

const { expect } = chai;

// Mirror the bigNumber18 constant from the Prime fixture.
const bigNumber18 = BigNumber.from("1000000000000000000");

/**
 * End-to-end test of scripts/prime-update-scores against a real deployed
 * Prime instance. Verifies the full pipeline triggered by addMarket on a new
 * market (modeled here as the "U" market via the fixture's vbnb token):
 *
 *   issue holders -> addMarket(vU) triggers _startScoreUpdateRound
 *   -> fetchHolderEvents (queryFilter scan)
 *   -> eventsToHolders (replay events)
 *   -> runUpdate (chunk + updateScores per batch)
 *   -> pendingScoreUpdates drains to 0, isScoreUpdated set per user.
 */
describe("scripts/prime-update-scores — E2E against deployed Prime", () => {
  let f: SetupProtocolFixture;
  let user1: Signer;
  let user2: Signer;
  let user3: Signer;

  /**
   * The Prime fixture deploys but does not add vbnb to Prime. We use it as
   * the "U" market — the newly-added market triggering a score update round.
   * fetchHolderEvents only needs Mint/Burn events, but updateScores walks all
   * Prime markets so we set a price for vbnb to make score computation valid.
   */
  async function addUMarket() {
    f.oracle.getUnderlyingPrice.returns((vToken: string) => {
      if (vToken == f.vusdt.address) return convertToUnit(1, 18);
      if (vToken == f.veth.address) return convertToUnit(1200, 18);
      // The fixture has a vbnb that is not part of the typed return; use the
      // raw address via the smock fake's wildcard match.
      return convertToUnit(300, 18);
    });

    // vbnb is exposed on the fixture's comptroller (already _supportMarket'd
    // in deployProtocol). Pull its address from the comptroller's market list.
    // The fixture stores vbnb via `comptroller._supportMarket(vbnb)` at line 129.
    const vbnbAddress = (await f.comptroller.getAllMarkets())[2]; // [vusdt, veth, vbnb]

    await f.prime.addMarket(f.comptroller.address, vbnbAddress, bigNumber18.mul(1), bigNumber18.mul(1));
    return vbnbAddress;
  }

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    [, user1, user2, user3] = signers; // skip deployer (index 0)
    f = await loadFixture(deployProtocol);
  });

  it("drains pendingScoreUpdates to 0 after addMarket(vU)", async () => {
    const u1 = await user1.getAddress();
    const u2 = await user2.getAddress();
    const u3 = await user3.getAddress();

    // Issue Prime tokens to three users. This emits three Mint events that
    // the script will discover via queryFilter.
    await f.prime.issue(false, [u1, u2, u3]);

    // Sanity: nothing queued yet (issue doesn't trigger a round).
    expect(await f.prime.pendingScoreUpdates()).to.equal(0);

    // Add the new U market. addMarket calls _startScoreUpdateRound()
    // internally, setting pendingScoreUpdates = totalIrrevocable + totalRevocable = 3.
    await addUMarket();

    const pendingBefore = await f.prime.pendingScoreUpdates();
    expect(pendingBefore).to.equal(3);

    const roundId = await f.prime.nextScoreUpdateRoundId();

    // ── Run the script's pipeline against the deployed instance ──
    const events = await fetchHolderEvents(f.prime, 0, 5000);
    const holders = eventsToHolders(events);

    // Reconstructed holder set must contain exactly the three issued addresses.
    expect(holders).to.have.members([u1, u2, u3]);
    expect(holders.length).to.equal(3);

    const result = await runUpdate(f.prime, holders, { log: () => undefined });

    // Final state: queue drained.
    expect(result.pendingBefore.toString()).to.equal("3");
    expect(result.pendingAfter.toString()).to.equal("0");
    expect(result.usersUpdated).to.equal(3);
    expect(await f.prime.pendingScoreUpdates()).to.equal(0);

    // Per-user dedup mapping must be set for this round.
    expect(await f.prime.isScoreUpdated(roundId, u1)).to.equal(true);
    expect(await f.prime.isScoreUpdated(roundId, u2)).to.equal(true);
    expect(await f.prime.isScoreUpdated(roundId, u3)).to.equal(true);
  });

  it("respects maxLoopsLimit by splitting into multiple batches", async () => {
    // Fixture sets maxLoopsLimit = 10 and MaxLoopsLimitHelper only allows
    // increasing it. Use 11 unique holders to force a 2-batch split (10 + 1).
    const holdersToIssue: string[] = [];
    for (let i = 0; i < 11; i++) {
      holdersToIssue.push(ethers.Wallet.createRandom().address);
    }

    await f.prime.issue(false, holdersToIssue);
    await addUMarket();
    expect(await f.prime.pendingScoreUpdates()).to.equal(11);

    const events = await fetchHolderEvents(f.prime, 0, 5000);
    const holders = eventsToHolders(events);
    expect(holders.length).to.equal(11);

    const result = await runUpdate(f.prime, holders, { log: () => undefined });

    expect(result.batchesSent).to.equal(2); // ceil(11/10) = 2
    expect(result.usersUpdated).to.equal(11);
    expect(await f.prime.pendingScoreUpdates()).to.equal(0);
  });

  it("is resumable: re-running after a partial drain skips already-processed users", async () => {
    const u1 = await user1.getAddress();
    const u2 = await user2.getAddress();
    const u3 = await user3.getAddress();

    await f.prime.issue(false, [u1, u2, u3]);
    await addUMarket();

    const roundId = await f.prime.nextScoreUpdateRoundId();

    // First run processes only u1 (simulate partial run by passing one user).
    await f.prime.updateScores([u1]);
    expect(await f.prime.isScoreUpdated(roundId, u1)).to.equal(true);
    expect(await f.prime.pendingScoreUpdates()).to.equal(2);

    // Now the script should pick up u2, u3 and skip u1.
    const events = await fetchHolderEvents(f.prime, 0, 5000);
    const holders = eventsToHolders(events);

    const result = await runUpdate(f.prime, holders, { log: () => undefined });

    // runUpdate filters u1 out via isScoreUpdated check, so only 2 users updated.
    expect(result.usersUpdated).to.equal(2);
    expect(await f.prime.pendingScoreUpdates()).to.equal(0);
  });

  it("excludes burned holders from the reconstructed set", async () => {
    const u1 = await user1.getAddress();
    const u2 = await user2.getAddress();
    const u3 = await user3.getAddress();

    await f.prime.issue(false, [u1, u2, u3]);
    // Burn u2 — burn emits Burn event, which the script must apply.
    await f.prime.burn(u2);

    await addUMarket();
    // After burn, totalIrrevocable + totalRevocable = 2, so queue size = 2.
    expect(await f.prime.pendingScoreUpdates()).to.equal(2);

    const events = await fetchHolderEvents(f.prime, 0, 5000);
    const holders = eventsToHolders(events);

    expect(holders).to.have.members([u1, u3]);
    expect(holders).to.not.include(u2);

    const result = await runUpdate(f.prime, holders, { log: () => undefined });
    expect(result.usersUpdated).to.equal(2);
    expect(await f.prime.pendingScoreUpdates()).to.equal(0);
  });
});
