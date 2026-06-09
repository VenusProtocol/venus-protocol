/**
 * PrimeV2 + PrimeLeaderboard — Testnet QA Cycle-Reset Replay Fork Test
 *
 * Targets the REDEPLOYED testnet pair (new proxies) wired by VIP-675 addendum 3 (PR #712):
 *   PrimeV2          0xeC22366d2572e52BCB29B50C905b945BA421B9b2
 *   PrimeLeaderboard 0x1a4408613eec291f2d338F7A88E9D550fa9cD8dC
 *
 * Pin the fork at a block AFTER VIP-675 addendum 3 has executed on testnet, BEFORE the
 * Guardian runs the off-chain `initializeStakers + finalizeInitialization` seeding step.
 * At that block, the pair is wired, ACM grants are in place, markets are configured, the
 * mint window is open, but `stakersInitialized == false` — exactly the state Phase A boots
 * into.
 *
 * QA mental model:
 *   Phase A — Bootstrap (steps 3, 4, 5):
 *     3. initializeStakers(...)
 *     4. finalizeInitialization()
 *     5. recordCycleSnapshot(1)
 *   Phase B — Cycle work (issue / accrue / claim / etc.)
 *   Phase C — Reset (steps 1, 2):
 *     1. PrimeV2.resetCycle(holders)
 *     2. PrimeLeaderboard.resetCycle(stakers)
 *   Phase D — Retry the initialization phase (steps 3, 4, 5 again with a new snapshot)
 *
 * Run:
 *   FORK=true FORKED_NETWORK=bsctestnet npx hardhat test \
 *     tests/hardhat/Fork/PrimeV2TestnetResetCycleForkTest.ts
 */
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract, Signer } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { PrimeLeaderboard, PrimeLeaderboard__factory, PrimeV2, PrimeV2__factory } from "../../../typechain";
import { FORK_TESTNET, initMainnetUser, setForkBlock } from "./utils";

// ═══════════════════ BSC TESTNET ADDRESSES ═══════════════════
const Addr = {
  // Prime system (deployed for VIP-675 addendum 3)
  PRIME_V2: "0xeC22366d2572e52BCB29B50C905b945BA421B9b2",
  PRIME_V2_IMPL: "0x9Ab9dA79df616a4b55B1f9c9994d582D6865aB08",
  PRIME_LEADERBOARD: "0x1a4408613eec291f2d338F7A88E9D550fa9cD8dC",
  PRIME_LEADERBOARD_IMPL: "0x3f4869b098E6a781e86475eF5C79888F266ec257",
  PLP: "0xAdeddc73eAFCbed174e6C400165b111b0cb80B7E",
  LEGACY_PRIME: "0xe840F8EC2Dc50E7D22e5e2991975b9F6e34b62Ad",

  // Core infra
  XVS_VAULT: "0x9aB56bAD2D7631B2A857ccf36d998232A8b82280",
  XVS: "0xB9e0E753630434d7863528cc73CB7AC638a7c8ff",
  COMPTROLLER: "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D",
  ORACLE: "0x3cD69251D04A28d887Ac14cbe2E14c52F3D57823",
  ACM: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",

  // Governance
  NORMAL_TIMELOCK: "0xce10739590001705F7FF231611ba4A48B2820327",
  GUARDIAN: "0x2Ce1d0ffD7E869D9DF33e28552b12DdDed326706",

  // Prime markets (Core pool)
  vUSDT: "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A",
  USDT: "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c",
  vUSDC: "0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7",
  vBTC: "0xb6e9322C49FD75a367Fcb17B0Fcd62C5070EbCBe",
  vETH: "0x162D005F0Fff510E54958Cfc5CF32A3180A84aab",
};

// EIP-1967 storage slots
const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

// ═══════════════════ CONSTANTS ═══════════════════
// VIP-675 addendum 3 executed at block 112394810; pin one block later so the wired/granted state is visible.
const BLOCK_NUMBER = 112394811;
const HOUR = 3600;
// BSC testnet runs ~0.45s blocks but `mine()` only accepts integer seconds per block.
// Use 1s/block — block.timestamp still advances by the exact `seconds` arg, block.number
// over-counts vs reality but no test asserts an absolute block.number.
const SECONDS_PER_BLOCK = 1;

const PRIME_MARKETS = [
  { vToken: Addr.vUSDT, supplyMultiplier: parseEther("2"), borrowMultiplier: parseEther("2") },
  { vToken: Addr.vUSDC, supplyMultiplier: parseEther("2"), borrowMultiplier: parseEther("2") },
  { vToken: Addr.vBTC, supplyMultiplier: parseEther("1"), borrowMultiplier: parseEther("4") },
  { vToken: Addr.vETH, supplyMultiplier: parseEther("2"), borrowMultiplier: parseEther("2") },
];

const PLP_ABI = [
  "function tokenAmountAccrued(address) view returns (uint256)",
  "function prime() view returns (address)",
];

if (FORK_TESTNET) {
  describe("PrimeV2 Testnet — QA Cycle-Reset Replay", () => {
    let primeV2: PrimeV2;
    let leaderboard: PrimeLeaderboard;
    let plp: Contract;

    let guardian: Signer;
    let timelock: Signer;

    let u1: Signer;
    let u2: Signer;
    let u3: Signer;
    let u1Addr: string;
    let u2Addr: string;
    let u3Addr: string;

    async function advance(seconds: number) {
      const blocks = Math.max(1, Math.floor(seconds / SECONDS_PER_BLOCK));
      await mine(blocks, { interval: SECONDS_PER_BLOCK });
    }

    /** Phase A — Bootstrap (steps 3, 4, 5). Seeds stakers, finalizes, anchors cycle. */
    async function bootstrap(
      cycleId: number,
      stakers: { addr: string; amount: BigNumber }[],
      stakeAgeSeconds: number = 3 * HOUR,
    ): Promise<void> {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const seedTs = now - stakeAgeSeconds;

      const addrs = stakers.map(s => s.addr);
      const amounts = stakers.map(s => s.amount);
      const timestamps = stakers.map(() => seedTs);

      await leaderboard.connect(guardian).initializeStakers(addrs, amounts, timestamps);
      await leaderboard.connect(guardian).finalizeInitialization();
      await primeV2.connect(guardian).recordCycleSnapshot(cycleId);
    }

    /** Phase C — Reset (steps 1, 2). */
    async function reset(holders: string[], stakers: string[]): Promise<void> {
      await primeV2.connect(guardian).resetCycle(holders);
      await leaderboard.connect(guardian).resetCycle(stakers);
    }

    /**
     * QA/BE pre-test setup — actions QA performs after VIP-675 addendum 3 lands and BEFORE
     * the cycle-replay flow begins. Lives outside `fixture()` so the human reader can see
     * exactly what QA touches.
     *
     * Currently:
     *   - Compress PrimeLeaderboard multiplier tiers to the testnet schedule
     *     (1h/2h/3h → 1.3x/1.6x/2x). VIP-675 addendum 3 deliberately did NOT carry these
     *     over from the prior pair, so the Normal Timelock applies them as a separate
     *     setMultiplierTiers call.
     */
    async function qaSetup(): Promise<void> {
      await leaderboard
        .connect(timelock)
        .setMultiplierTiers([HOUR, 2 * HOUR, 3 * HOUR], [parseEther("1.3"), parseEther("1.6"), parseEther("2")]);
    }

    /** Guard: fork must be pinned AFTER VIP-675 addendum 3 lands on testnet. */
    async function assertVipExecuted(): Promise<void> {
      const marketCount = (await primeV2.getAllMarkets()).length;
      if (marketCount === 0) {
        throw new Error(
          `Fork block ${BLOCK_NUMBER} predates VIP-675 addendum 3 execution. ` +
            `Bump BLOCK_NUMBER to a block after the VIP lands on testnet.`,
        );
      }
    }

    async function fixture() {
      [u1, u2, u3] = (await ethers.getSigners()).slice(0, 3);
      u1Addr = await u1.getAddress();
      u2Addr = await u2.getAddress();
      u3Addr = await u3.getAddress();

      guardian = await initMainnetUser(Addr.GUARDIAN, parseEther("100"));
      timelock = await initMainnetUser(Addr.NORMAL_TIMELOCK, parseEther("100"));

      plp = new ethers.Contract(Addr.PLP, PLP_ABI, u1);

      primeV2 = PrimeV2__factory.connect(Addr.PRIME_V2, u1);
      leaderboard = PrimeLeaderboard__factory.connect(Addr.PRIME_LEADERBOARD, u1);

      await assertVipExecuted();
      await qaSetup();

      return { primeV2, leaderboard };
    }

    before(async () => {
      await setForkBlock(BLOCK_NUMBER);
    });

    beforeEach(async () => {
      await loadFixture(fixture);
    });

    // ═══════════════════════════════════════════════════════════════════
    // DEPLOYED ADDRESSES — verify the pair, impls, hooks, and admins
    // ═══════════════════════════════════════════════════════════════════
    describe("Deployed addresses", () => {
      it("all known addresses have code on-chain (not EOA / not zero)", async () => {
        const targets = [
          Addr.PRIME_V2,
          Addr.PRIME_V2_IMPL,
          Addr.PRIME_LEADERBOARD,
          Addr.PRIME_LEADERBOARD_IMPL,
          Addr.PLP,
          Addr.LEGACY_PRIME,
          Addr.XVS_VAULT,
          Addr.XVS,
          Addr.COMPTROLLER,
          Addr.ORACLE,
          Addr.ACM,
          Addr.NORMAL_TIMELOCK,
        ];
        for (const t of targets) {
          const code = await ethers.provider.getCode(t);
          expect(code, `no code at ${t}`).to.not.equal("0x");
        }
      });

      it("PrimeV2 proxy points to PRIME_V2_IMPL via EIP-1967 slot", async () => {
        const raw = await ethers.provider.getStorageAt(Addr.PRIME_V2, EIP1967_IMPL_SLOT);
        const impl = ethers.utils.getAddress("0x" + raw.slice(-40));
        expect(impl).to.equal(Addr.PRIME_V2_IMPL);
      });

      it("PrimeLeaderboard proxy points to PRIME_LEADERBOARD_IMPL via EIP-1967 slot", async () => {
        const raw = await ethers.provider.getStorageAt(Addr.PRIME_LEADERBOARD, EIP1967_IMPL_SLOT);
        const impl = ethers.utils.getAddress("0x" + raw.slice(-40));
        expect(impl).to.equal(Addr.PRIME_LEADERBOARD_IMPL);
      });

      it("PrimeV2 immutables wired to expected XVS vault + reward token + comptroller + oracle + ACM", async () => {
        expect(await primeV2.xvsVault()).to.equal(Addr.XVS_VAULT);
        expect(await primeV2.xvsVaultRewardToken()).to.equal(Addr.XVS);
        expect(await primeV2.corePoolComptroller()).to.equal(Addr.COMPTROLLER);
        expect(await primeV2.oracle()).to.equal(Addr.ORACLE);
        expect(await primeV2.accessControlManager()).to.equal(Addr.ACM);
        expect(await primeV2.primeLiquidityProvider()).to.equal(Addr.PLP);
      });

      it("PrimeLeaderboard immutables wired to expected XVS vault + reward token + ACM", async () => {
        expect(await leaderboard.xvsVault()).to.equal(Addr.XVS_VAULT);
        expect(await leaderboard.xvsVaultRewardToken()).to.equal(Addr.XVS);
        expect(await leaderboard.accessControlManager()).to.equal(Addr.ACM);
      });

      it("NormalTimelock owns both proxies (post-acceptOwnership)", async () => {
        const ownableAbi = ["function owner() view returns (address)"];
        const p = new ethers.Contract(Addr.PRIME_V2, ownableAbi, u1);
        const l = new ethers.Contract(Addr.PRIME_LEADERBOARD, ownableAbi, u1);
        expect(await p.owner()).to.equal(Addr.NORMAL_TIMELOCK);
        expect(await l.owner()).to.equal(Addr.NORMAL_TIMELOCK);
      });

      it("Legacy Prime contract is deployed at the documented address", async () => {
        // Address-existence check only. Pause state is not asserted because the legacy
        // contract's pause toggling lives outside the VIP-675 addendum 3 scope.
        const code = await ethers.provider.getCode(Addr.LEGACY_PRIME);
        expect(code).to.not.equal("0x");
      });
    });

    // ═══════════════════════════════════════════════════════════════════
    // VIP-675 ADDENDUM 3 — ON-CHAIN STATE SANITY
    // ═══════════════════════════════════════════════════════════════════
    describe("VIP-675 addendum 3 — on-chain state sanity", () => {
      it("pair is wired", async () => {
        expect(await primeV2.primeLeaderboard()).to.equal(Addr.PRIME_LEADERBOARD);
        expect(await leaderboard.primeV2()).to.equal(Addr.PRIME_V2);
      });

      it("PLP repointed to new PrimeV2", async () => {
        expect(await plp.prime()).to.equal(Addr.PRIME_V2);
      });

      it("4 Core markets configured with non-zero multipliers", async () => {
        const markets = await primeV2.getAllMarkets();
        expect(markets.length).to.equal(PRIME_MARKETS.length);
        for (const m of PRIME_MARKETS) {
          expect(markets).to.include(m.vToken);
          const market = await primeV2.markets(m.vToken);
          expect(market.exists).to.be.true;
          // At least one multiplier must be non-zero (supply OR borrow side scored)
          expect(market.supplyMultiplier.add(market.borrowMultiplier)).to.be.gt(0);
        }
      });

      it("mint window open", async () => {
        expect(await primeV2.mintThreshold()).to.be.gt(0);
      });

      it("Guardian holds resetCycle perms on both contracts (ACM grants landed)", async () => {
        await primeV2.connect(guardian).resetCycle([]);
        await leaderboard.connect(guardian).resetCycle([]);
      });

      it("multiplier tiers use the compressed testnet schedule (1h/2h/3h → 1.3x/1.6x/2x)", async () => {
        const [durations, multipliers] = await leaderboard.getMultiplierTiers();
        expect(durations.map((d: BigNumber) => d.toNumber())).to.deep.equal([HOUR, 2 * HOUR, 3 * HOUR]);
        expect(multipliers[0]).to.equal(parseEther("1.3"));
        expect(multipliers[1]).to.equal(parseEther("1.6"));
        expect(multipliers[2]).to.equal(parseEther("2"));
      });
    });

    // ═══════════════════════════════════════════════════════════════════
    // MULTIPLIER TIER MATH — applied to a seeded staker
    // ═══════════════════════════════════════════════════════════════════
    describe("Compressed-tier effective stake at each boundary", () => {
      it("returns the right multiplier at each hour boundary", async () => {
        expect(await leaderboard.getMultiplier(HOUR - 1)).to.equal(parseEther("1")); // <1h base
        expect(await leaderboard.getMultiplier(HOUR)).to.equal(parseEther("1.3")); // 1h tier
        expect(await leaderboard.getMultiplier(2 * HOUR - 1)).to.equal(parseEther("1.3"));
        expect(await leaderboard.getMultiplier(2 * HOUR)).to.equal(parseEther("1.6")); // 2h tier
        expect(await leaderboard.getMultiplier(3 * HOUR - 1)).to.equal(parseEther("1.6"));
        expect(await leaderboard.getMultiplier(3 * HOUR)).to.equal(parseEther("2")); // 3h cap
        expect(await leaderboard.getMultiplier(100 * HOUR)).to.equal(parseEther("2"));
      });
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE A — BOOTSTRAP (steps 3, 4, 5)
    // ═══════════════════════════════════════════════════════════════════
    describe("Phase A — Bootstrap (initializeStakers + finalizeInitialization + recordCycleSnapshot)", () => {
      it("seeds stakers, finalizes, and anchors cycle 1", async () => {
        await bootstrap(1, [
          { addr: u1Addr, amount: parseEther("2000") },
          { addr: u2Addr, amount: parseEther("1000") },
          { addr: u3Addr, amount: parseEther("500") },
        ]);

        expect(await leaderboard.stakersInitialized()).to.be.true;
        expect(await leaderboard.totalStaked(u1Addr)).to.equal(parseEther("2000"));
        expect(await leaderboard.totalStaked(u2Addr)).to.equal(parseEther("1000"));
        expect(await leaderboard.totalStaked(u3Addr)).to.equal(parseEther("500"));
      });

      it("second initializeStakers reverts after finalize (until a reset)", async () => {
        await bootstrap(1, [{ addr: u1Addr, amount: parseEther("2000") }]);

        const now = (await ethers.provider.getBlock("latest")).timestamp;
        await expect(
          leaderboard.connect(guardian).initializeStakers([u2Addr], [parseEther("100")], [now - HOUR]),
        ).to.be.revertedWithCustomError(leaderboard, "StakersAlreadyInitialized");
      });

      it("recordCycleSnapshot emits CycleSnapshotRecorded with block + timestamp anchor", async () => {
        const now = (await ethers.provider.getBlock("latest")).timestamp;
        await leaderboard.connect(guardian).initializeStakers([u1Addr], [parseEther("1000")], [now - 2 * HOUR]);
        await leaderboard.connect(guardian).finalizeInitialization();

        const tx = await primeV2.connect(guardian).recordCycleSnapshot(1);
        const receipt = await tx.wait();
        const blk = await ethers.provider.getBlock(receipt.blockNumber);
        await expect(tx).to.emit(primeV2, "CycleSnapshotRecorded").withArgs(1, receipt.blockNumber, blk.timestamp);
      });
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE B — END OF CYCLE 1 / START OF CYCLE 2 + ISSUE COHORT
    //   A few hours after the first cycle, the keeper:
    //     1. recordCycleSnapshot(2) — anchors cycle 2 start, marks cycle 1 closed
    //     2. issueBatch(addresses)   — mints Prime to the ranked cohort
    // ═══════════════════════════════════════════════════════════════════
    describe("Phase B — Close cycle 1 + open cycle 2 + issueBatch", () => {
      it("anchors cycle 2 a few hours into cycle 1, then issues the cohort", async () => {
        // Phase A — bootstrap cycle 1
        await bootstrap(1, [
          { addr: u1Addr, amount: parseEther("2000") },
          { addr: u2Addr, amount: parseEther("1000") },
        ]);

        // A few hours of cycle 1 elapse
        await advance(3 * HOUR);

        // Step 1: anchor cycle 2 start (marks end of cycle 1)
        const tx = await primeV2.connect(guardian).recordCycleSnapshot(2);
        const receipt = await tx.wait();
        const blk = await ethers.provider.getBlock(receipt.blockNumber);
        await expect(tx).to.emit(primeV2, "CycleSnapshotRecorded").withArgs(2, receipt.blockNumber, blk.timestamp);

        // Step 2: issueBatch — addresses ranked off-chain become Prime holders
        await primeV2.connect(guardian).issueBatch([u1Addr, u2Addr]);

        expect(await primeV2.totalTokens()).to.equal(2);
        expect(await primeV2.isUserPrimeHolder(u1Addr)).to.be.true;
        expect(await primeV2.isUserPrimeHolder(u2Addr)).to.be.true;

        // accrueInterest must not revert even when PLP is empty on testnet
        await primeV2.accrueInterest(Addr.vUSDT);
      });
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE C — RESET (steps 1, 2)
    // ═══════════════════════════════════════════════════════════════════
    describe("Phase C — Reset (PrimeV2.resetCycle + PrimeLeaderboard.resetCycle)", () => {
      it("PrimeV2.resetCycle clears cohort, interests, and market accumulators", async () => {
        await bootstrap(1, [
          { addr: u1Addr, amount: parseEther("2000") },
          { addr: u2Addr, amount: parseEther("1000") },
        ]);
        await primeV2.connect(guardian).issueBatch([u1Addr, u2Addr]);
        await advance(HOUR);
        await primeV2.accrueInterest(Addr.vUSDT);

        await primeV2.connect(guardian).resetCycle([u1Addr, u2Addr]);

        for (const u of [u1Addr, u2Addr]) {
          const i = await primeV2.interests(Addr.vUSDT, u);
          expect(i.accrued).to.equal(0);
          expect(i.score).to.equal(0);
          expect(i.rewardIndex).to.equal(0);
          expect(i.lifetimeAccrued).to.equal(0);
          expect(await primeV2.isUserPrimeHolder(u)).to.be.false;
        }
        for (const m of PRIME_MARKETS) {
          const market = await primeV2.markets(m.vToken);
          expect(market.rewardIndex).to.equal(0);
          expect(market.sumOfMembersScore).to.equal(0);
          expect(market.exists).to.be.true;
        }
        expect(await primeV2.totalTokens()).to.equal(0);
      });

      it("PrimeLeaderboard.resetCycle clears stakers and unlocks initializeStakers", async () => {
        await bootstrap(1, [
          { addr: u1Addr, amount: parseEther("2000") },
          { addr: u2Addr, amount: parseEther("1000") },
        ]);

        await leaderboard.connect(guardian).resetCycle([u1Addr, u2Addr]);

        expect(await leaderboard.stakersInitialized()).to.be.false;
        for (const u of [u1Addr, u2Addr]) {
          expect(await leaderboard.totalStaked(u)).to.equal(0);
          expect(await leaderboard.getDepositCount(u)).to.equal(0);
        }
      });

      it("reset preserves market config, multiplier tiers, governance params", async () => {
        await bootstrap(1, [{ addr: u1Addr, amount: parseEther("2000") }]);
        const [durBefore, multBefore] = await leaderboard.getMultiplierTiers();
        const thresholdBefore = await primeV2.mintThreshold();

        await reset([u1Addr], [u1Addr]);

        expect(await primeV2.mintThreshold()).to.equal(thresholdBefore);
        expect(await primeV2.tokenLimit()).to.equal(500);
        expect((await primeV2.getAllMarkets()).length).to.equal(PRIME_MARKETS.length);

        const [durAfter, multAfter] = await leaderboard.getMultiplierTiers();
        expect(durAfter.map((d: BigNumber) => d.toString())).to.deep.equal(
          durBefore.map((d: BigNumber) => d.toString()),
        );
        expect(multAfter.map((d: BigNumber) => d.toString())).to.deep.equal(
          multBefore.map((d: BigNumber) => d.toString()),
        );
      });

      it("non-Guardian / non-Timelock call reverts on both resets", async () => {
        await expect(primeV2.connect(u3).resetCycle([u1Addr])).to.be.revertedWithCustomError(primeV2, "Unauthorized");
        await expect(leaderboard.connect(u3).resetCycle([u1Addr])).to.be.revertedWithCustomError(
          leaderboard,
          "Unauthorized",
        );
      });
    });

    // ═══════════════════════════════════════════════════════════════════
    // PHASE D — RETRY INITIALIZATION PHASE (headline QA scenario)
    // ═══════════════════════════════════════════════════════════════════
    describe("Phase D — Retry initialization phase after reset", () => {
      it("QA full flow: Phase A → Phase B → reset → retry Phase A → retry Phase B", async () => {
        // ── Phase A: initial bootstrap (steps 1, 2, 3) ──
        await bootstrap(
          1,
          [
            { addr: u1Addr, amount: parseEther("2000") },
            { addr: u2Addr, amount: parseEther("1000") },
            { addr: u3Addr, amount: parseEther("500") },
          ],
          3 * HOUR,
        );
        expect(await leaderboard.stakersInitialized()).to.be.true;

        // ── Phase B: a few hours later, close cycle 1 + open cycle 2 + issue ──
        await advance(3 * HOUR);
        await primeV2.connect(guardian).recordCycleSnapshot(2);
        await primeV2.connect(guardian).issueBatch([u1Addr, u2Addr]);
        expect(await primeV2.totalTokens()).to.equal(2);

        // ── Phase C: reset (QA wants to retry initialization) ──
        await reset([u1Addr, u2Addr], [u1Addr, u2Addr, u3Addr]);
        expect(await primeV2.totalTokens()).to.equal(0);
        expect(await leaderboard.stakersInitialized()).to.be.false;

        // ── Retry Phase A: re-run steps 1, 2, 3 with a DIFFERENT snapshot ──
        await bootstrap(
          1,
          [
            { addr: u1Addr, amount: parseEther("10000") },
            { addr: u3Addr, amount: parseEther("2000") }, // u2 dropped from cohort
          ],
          HOUR, // shorter age → 1.3x tier instead of 2x
        );
        expect(await leaderboard.stakersInitialized()).to.be.true;
        expect(await leaderboard.totalStaked(u1Addr)).to.equal(parseEther("10000"));
        expect(await leaderboard.totalStaked(u3Addr)).to.equal(parseEther("2000"));
        expect(await leaderboard.totalStaked(u2Addr)).to.equal(0);

        // ── Retry Phase B: hours pass, anchor cycle 2, issue cohort ──
        await advance(3 * HOUR);
        await primeV2.connect(guardian).recordCycleSnapshot(2);
        await primeV2.connect(guardian).issueBatch([u1Addr, u3Addr]);

        expect(await primeV2.isUserPrimeHolder(u1Addr)).to.be.true;
        expect(await primeV2.isUserPrimeHolder(u3Addr)).to.be.true;
        expect(await primeV2.isUserPrimeHolder(u2Addr)).to.be.false;
        expect(await primeV2.totalTokens()).to.equal(2);

        // Re-issued holders start from a clean baseline — no carry-over from pre-reset cycle.
        const i = await primeV2.interests(Addr.vUSDT, u1Addr);
        expect(i.lifetimeAccrued).to.equal(0);
        expect(i.accrued).to.equal(0);
      });

      it("retry can repeat indefinitely (cycle 1 → 2 → 3 with reset in between each)", async () => {
        await bootstrap(1, [
          { addr: u1Addr, amount: parseEther("2000") },
          { addr: u2Addr, amount: parseEther("1000") },
        ]);
        await primeV2.connect(guardian).issueBatch([u1Addr, u2Addr]);

        for (const cycleId of [2, 3]) {
          await reset([u1Addr, u2Addr], [u1Addr, u2Addr]);
          await bootstrap(cycleId, [
            { addr: u1Addr, amount: parseEther("3000") },
            { addr: u2Addr, amount: parseEther("1500") },
          ]);
          await primeV2.connect(guardian).issueBatch([u1Addr, u2Addr]);

          expect(await primeV2.totalTokens()).to.equal(2);
          expect(await leaderboard.stakersInitialized()).to.be.true;

          await advance(HOUR);
        }
      });

      it("retry re-locks: initializeStakers reverts again after re-finalize", async () => {
        await bootstrap(1, [{ addr: u1Addr, amount: parseEther("2000") }]);
        await reset([], [u1Addr]);
        await bootstrap(2, [{ addr: u1Addr, amount: parseEther("5000") }]);

        const now = (await ethers.provider.getBlock("latest")).timestamp;
        await expect(
          leaderboard.connect(guardian).initializeStakers([u2Addr], [parseEther("100")], [now - HOUR]),
        ).to.be.revertedWithCustomError(leaderboard, "StakersAlreadyInitialized");
      });

      it("PLP anchor stays consistent across retries (no replay of past income)", async () => {
        await bootstrap(1, [{ addr: u1Addr, amount: parseEther("2000") }]);
        await primeV2.connect(guardian).issueBatch([u1Addr]);
        await advance(HOUR);
        await primeV2.accrueInterest(Addr.vUSDT);

        await reset([u1Addr], [u1Addr]);
        const plpAccruedPostReset = await plp.tokenAmountAccrued(Addr.USDT);
        expect(await primeV2.unreleasedPLPIncome(Addr.USDT)).to.equal(plpAccruedPostReset);
        expect(await primeV2.undistributedReward(Addr.USDT)).to.equal(0);

        await bootstrap(2, [{ addr: u1Addr, amount: parseEther("2000") }]);
        await primeV2.connect(guardian).issueBatch([u1Addr]);

        const beforeDelta = await plp.tokenAmountAccrued(Addr.USDT);
        await advance(HOUR);
        await primeV2.accrueInterest(Addr.vUSDT);
        const afterDelta = await plp.tokenAmountAccrued(Addr.USDT);
        expect(afterDelta).to.be.gte(beforeDelta);
      });
    });
  });
}
