/**
 * PrimeV2 + PrimeLeaderboard — End-to-End BSC **Testnet** Fork Test
 *
 * Exercises the *already-deployed* testnet contracts (PrimeV2 proxy + PrimeLeaderboard proxy)
 * with the real protocol around them: XVSVault, Comptroller, ResilientOracle and the
 * PrimeLiquidityProvider. VIP-675 (wiring, 4 Core markets, mintThreshold = 1 XVS), its addendum
 * (compressed 1h/2h/3h multiplier tiers) and the sweep / carry-forward impl upgrade are all
 * already live on testnet, so the fixture attaches to the deployed proxies as-is and only:
 *   1. Grants an `admin` signer the ACM permissions for the keeper / config calls.
 *   2. Seeds a few synthetic test users into PrimeLeaderboard via `initializeStakers` with the
 *      **same timestamp** (the migration path), then finalizes.
 *   3. Gives those users real XVS vault stake (deposit == seeded amount → the live `xvsUpdated`
 *      callback is a no-op, so the same-timestamp seeding is preserved) and real vUSDT supply.
 *   4. Funds the PLP so interest actually accrues and can be claimed.
 *
 * The fork is pinned past block 111412944, where the VIP upgraded the proxy to the impl carrying
 * the undistributed-income sweep / carry-forward logic.
 *
 * Testnet specifics baked in:
 *   - PrimeV2 is **block-based** (isTimeBased = false, blocksPerYear = 70_080_000), so interest
 *     accrual advances with `block.number`. We mine blocks (with an interval) so both block
 *     height *and* timestamp move — timestamp drives the leaderboard multiplier tiers.
 *   - Compressed tiers: <1h → 1.0x, 1h → 1.3x, 2h → 1.6x, 3h → 2.0x (cap at 3h).
 *
 * Covers:
 *   - Deployment/wiring: PrimeV2 ↔ Leaderboard, 4 Core markets, compressed tiers, sweep getter.
 *   - Same-timestamp seeding: equal-per-XVS effective stake, single deposit, vault delta no-op, 3h cap.
 *   - Tier progression: multiplier at each hour boundary.
 *   - Becoming a holder: claimPrime disabled at threshold 0, enabled window, keeper issue/issueBatch,
 *     token limit, real oracle/vault/market supply-weighted score.
 *   - Interest: block-based PLP accrual, claim, proportional split, claim-on-behalf.
 *   - Carry-forward: undistributed income accrues with no scored members, then sweepUndistributed.
 *   - Burn/re-issue, score-update rounds + ScoreUpdateInProgress gate.
 *   - Live vault tracking post-finalization + LIFO withdrawal.
 *   - Pause gating claimInterest.
 *   - Borrow-side scoring: vBTC borrow position (borrowMultiplier 4x) yields a non-zero score.
 *   - Keeper cycle reconciliation: swap (burn-then-issue) and at-cap (issue reverts until slot freed).
 *   - Unstake-without-auto-burn: full unstake → effectiveStake 0 but isPrimeHolder until keeper burns.
 *   - Exact interest math: payout split proportional to member scores (cross-multiplied).
 *   - Access control: ACM-gated calls revert Unauthorized for outsiders; xvsUpdated is vault-only.
 *
 * Run:
 *   FORK=true FORKED_NETWORK=bsctestnet npx hardhat test tests/hardhat/Fork/PrimeV2TestnetForkTest.ts
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
  // Prime system (deployed, see deployments/bsctestnet)
  PRIME_V2: "0x4B8b963324dB0D40f64539032AB49CB07c88e312",
  PRIME_LEADERBOARD: "0x45E9b8A46558c359b6Ee30580A599AAa1e5d9cDE",
  PLP: "0xAdeddc73eAFCbed174e6C400165b111b0cb80B7E",
  LEGACY_PRIME: "0xe840F8EC2Dc50E7D22e5e2991975b9F6e34b62Ad",

  // Core protocol
  COMPTROLLER: "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D",
  XVS_VAULT: "0x9aB56bAD2D7631B2A857ccf36d998232A8b82280", // XVSVaultProxy (NOT the impl)
  XVS: "0xB9e0E753630434d7863528cc73CB7AC638a7c8ff",
  ORACLE: "0x3cd69251D04A28d887Ac14cbe2E14c52F3D57823", // ResilientOracle
  ACM: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
  WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
  vBNB: "0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c",

  // Governance
  NORMAL_TIMELOCK: "0xce10739590001705F7FF231611ba4A48B2820327",
  GUARDIAN: "0x2Ce1d0ffD7E869D9DF33e28552b12DdDed326706",

  // Prime markets (Core pool) + underlyings
  vUSDT: "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A",
  USDT: "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c",
  vUSDC: "0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7",
  USDC: "0x16227D60f7a0e586C66B005219dfc887D13C9531",
  vBTC: "0xb6e9322C49FD75a367Fcb17B0Fcd62C5070EbCBe", // borrowMultiplier 4x — borrow-side scoring
  BTCB: "0xA808e341e8e723DC6BA0Bb5204Bafc2330d7B8e4",
};

// ═══════════════════ CONSTANTS ═══════════════════
const BLOCK_NUMBER = 111415000; // testnet block after VIP-675 + addendum + sweep impl upgrade (>111412944)
const XVS_POOL_ID = 1; // Prime pool on testnet
const HOUR = 3600;
const SECONDS_PER_BLOCK = 3; // BSC ~3s/block — keeps mined timestamps realistic

// 0.05% relative tolerance — mined blocks advance the timestamp a touch on every tx.
function expectApprox(actual: BigNumber, expected: BigNumber) {
  const tolerance = expected.div(2000).add(1);
  expect(actual).to.be.closeTo(expected, tolerance);
}

// ═══════════════════ ABIs ═══════════════════
const ERC20_ABI = [
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allocateTo(address,uint256)",
];
const XVS_VAULT_ABI = [
  "function deposit(address,uint256,uint256) external",
  "function requestWithdrawal(address,uint256,uint256) external",
  "function executeWithdrawal(address,uint256) external",
  "function getUserInfo(address,uint256,address) view returns (uint256,uint256,uint256)",
];
const ACM_ABI = ["function giveCallPermission(address,string,address) external"];
const PLP_ABI = [
  "function initializeTokens(address[]) external",
  "function setMaxTokensDistributionSpeed(address[],uint256[]) external",
  "function setTokensDistributionSpeed(address[],uint256[]) external",
  "function setPrimeToken(address) external",
  "function tokenAmountAccrued(address) view returns (uint256)",
  "function prime() view returns (address)",
];
const VTOKEN_ABI = [
  "function mint(uint256) returns (uint256)",
  "function borrow(uint256) returns (uint256)",
  "function borrowBalanceStored(address) view returns (uint256)",
  "function underlying() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
];
const COMPTROLLER_ABI = ["function enterMarkets(address[]) returns (uint256[])"];

if (FORK_TESTNET) {
  describe("PrimeV2 Testnet Fork — End-to-End", () => {
    let primeV2: PrimeV2;
    let leaderboard: PrimeLeaderboard;
    let vault: Contract;
    let plp: Contract;
    let xvs: Contract;
    let usdt: Contract;
    let usdc: Contract;
    let vUSDT: Contract;
    let vBTC: Contract;
    let comptroller: Contract;

    let admin: Signer; // holds the ACM keeper/config permissions we grant
    let recipient: Signer; // sweep recipient
    let u1: Signer;
    let u2: Signer;
    let u3: Signer;
    let timelock: Signer;
    let vaultSigner: Signer; // XVS source (vault proxy holds ~6.28M XVS)

    let adminAddr: string;
    let u1Addr: string;
    let u2Addr: string;
    let u3Addr: string;

    // Seeded stake amounts (also the exact vault deposits → live callback is a no-op)
    const A1 = parseEther("2000");
    const A2 = parseEther("1000");
    const A3 = parseEther("500");

    // ── helpers ──
    async function grant(target: string, signature: string, who: string) {
      const acm = new ethers.Contract(Addr.ACM, ACM_ABI, timelock);
      await acm.giveCallPermission(target, signature, who);
    }

    /** Move both block height and timestamp forward (block-based accrual + tier timestamps). */
    async function advance(seconds: number) {
      const blocks = Math.max(1, Math.floor(seconds / SECONDS_PER_BLOCK));
      await mine(blocks, { interval: SECONDS_PER_BLOCK });
    }

    /** Fund `user` with `amount` XVS (out of the vault's balance) and stake it in pool 1. */
    async function fundAndStakeXVS(user: Signer, userAddr: string, amount: BigNumber) {
      await xvs.connect(vaultSigner).transfer(userAddr, amount);
      await xvs.connect(user).approve(Addr.XVS_VAULT, amount);
      await vault.connect(user).deposit(Addr.XVS, XVS_POOL_ID, amount);
    }

    /** Mint `amount` USDT to `user` and supply it to vUSDT (gives the user market capital). */
    async function supplyUSDT(user: Signer, userAddr: string, amount: BigNumber) {
      await usdt.allocateTo(userAddr, amount);
      await usdt.connect(user).approve(Addr.vUSDT, amount);
      await vUSDT.connect(user).mint(amount);
    }

    async function fixture() {
      const signers = await ethers.getSigners();
      [admin, recipient, u1, u2, u3] = signers;
      adminAddr = await admin.getAddress();
      u1Addr = await u1.getAddress();
      u2Addr = await u2.getAddress();
      u3Addr = await u3.getAddress();

      timelock = await initMainnetUser(Addr.NORMAL_TIMELOCK, parseEther("100"));
      vaultSigner = await initMainnetUser(Addr.XVS_VAULT, parseEther("100"));

      // Real protocol instances
      vault = new ethers.Contract(Addr.XVS_VAULT, XVS_VAULT_ABI, admin);
      plp = new ethers.Contract(Addr.PLP, PLP_ABI, admin);
      xvs = new ethers.Contract(Addr.XVS, ERC20_ABI, admin);
      usdt = new ethers.Contract(Addr.USDT, ERC20_ABI, admin);
      usdc = new ethers.Contract(Addr.USDC, ERC20_ABI, admin);
      vUSDT = new ethers.Contract(Addr.vUSDT, VTOKEN_ABI, admin);
      vBTC = new ethers.Contract(Addr.vBTC, VTOKEN_ABI, admin);
      comptroller = new ethers.Contract(Addr.COMPTROLLER, COMPTROLLER_ABI, admin);

      // Attach to the deployed proxies (impl already carries sweep/carry-forward at this block).
      primeV2 = PrimeV2__factory.connect(Addr.PRIME_V2, admin);
      leaderboard = PrimeLeaderboard__factory.connect(Addr.PRIME_LEADERBOARD, admin);

      // ── 1. Grant the `admin` signer the keeper / config permissions ──
      const primeV2Perms = [
        "issue(address)",
        "issueBatch(address[])",
        "burn(address)",
        "burnBatch(address[])",
        "addMarket(address,uint256,uint256)",
        "removeMarket(address)",
        "setLimit(uint256)",
        "updateAlpha(uint128,uint128)",
        "updateMultipliers(address,uint256,uint256)",
        "setMaxLoopsLimit(uint256)",
        "setMintThreshold(uint256,uint256)",
        "setPrimeLeaderboard(address)",
        "pause()",
        "unpause()",
        "sweepUndistributed(address,address)",
      ];
      const leaderboardPerms = [
        "initializeStakers(address[],uint256[],uint64[])",
        "finalizeInitialization()",
        "setMultiplierTiers(uint256[],uint256[])",
        "setPrimeV2(address)",
        "setMaxLoopsLimit(uint256)",
      ];
      for (const f of primeV2Perms) await grant(Addr.PRIME_V2, f, adminAddr);
      for (const f of leaderboardPerms) await grant(Addr.PRIME_LEADERBOARD, f, adminAddr);
      // PLP distribution-speed setter is ACM-gated; the rest of PLP is onlyOwner (= timelock).
      await grant(Addr.PLP, "setMaxTokensDistributionSpeed(address[],uint256[])", adminAddr);
      await grant(Addr.PLP, "setTokensDistributionSpeed(address[],uint256[])", adminAddr);

      // Force the intended testnet default: permissionless mint disabled (keeper-driven cycle).
      // Production keeps mintThreshold = 0; individual tests open a window explicitly when needed.
      await primeV2.setMintThreshold(0, 0);

      // ── 2. Seed test users into the leaderboard with the SAME timestamp, then finalize ──
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const seedTs = now - 3 * HOUR; // 3h ago → top (2.0x) tier, capped at 3h duration
      await leaderboard.initializeStakers([u1Addr, u2Addr, u3Addr], [A1, A2, A3], [seedTs, seedTs, seedTs]);
      await leaderboard.finalizeInitialization();

      // ── 3. Give the users real vault stake (== seeded amount → live xvsUpdated is a no-op) ──
      await fundAndStakeXVS(u1, u1Addr, A1);
      await fundAndStakeXVS(u2, u2Addr, A2);
      await fundAndStakeXVS(u3, u3Addr, A3);

      // Market capital so per-market scores are non-zero (u1 > u2; u3 left without supply).
      await supplyUSDT(u1, u1Addr, parseEther("10000"));
      await supplyUSDT(u2, u2Addr, parseEther("4000"));

      // ── 4. Fund the PLP so USDT interest accrues (PLP repointed to PrimeV2 by VIP-675) ──
      if ((await plp.prime()) !== Addr.PRIME_V2) {
        await plp.connect(timelock).setPrimeToken(Addr.PRIME_V2);
      }
      // initializeTokens reverts if already initialized — ignore in that case.
      try {
        await plp.connect(timelock).initializeTokens([Addr.USDT, Addr.USDC]);
      } catch {
        /* already initialized */
      }
      const speed = parseEther("1"); // 1 USDT-wei-scale unit per block
      await plp.setMaxTokensDistributionSpeed([Addr.USDT, Addr.USDC], [speed, speed]);
      await plp.setTokensDistributionSpeed([Addr.USDT, Addr.USDC], [speed, speed]);
      await usdt.allocateTo(Addr.PLP, parseEther("1000000"));
      await usdc.allocateTo(Addr.PLP, parseEther("1000000"));

      return { primeV2, leaderboard };
    }

    before(async () => {
      await setForkBlock(BLOCK_NUMBER);
    });

    beforeEach(async () => {
      await loadFixture(fixture);
    });

    // ═══════════════════ 1. SETUP / WIRING ═══════════════════
    describe("Deployment state & wiring", () => {
      it("PrimeV2 and PrimeLeaderboard are wired together", async () => {
        expect(await leaderboard.primeV2()).to.equal(Addr.PRIME_V2);
        expect(await primeV2.primeLeaderboard()).to.equal(Addr.PRIME_LEADERBOARD);
      });

      it("has the 4 Core markets (from VIP-675) with permissionless mint disabled by default", async () => {
        const markets = await primeV2.getAllMarkets();
        expect(markets).to.include(Addr.vUSDT);
        expect(markets.length).to.equal(4);
        // Keeper-driven cycle: mintThreshold == 0 means claimPrime is disabled until a window opens.
        expect(await primeV2.mintThreshold()).to.equal(0);
      });

      it("uses the compressed testnet tiers (1h/2h/3h → 1.3/1.6/2.0x)", async () => {
        const [durations, multipliers] = await leaderboard.getMultiplierTiers();
        expect(durations.map((d: BigNumber) => d.toNumber())).to.deep.equal([HOUR, 2 * HOUR, 3 * HOUR]);
        expect(multipliers[0]).to.equal(parseEther("1.3"));
        expect(multipliers[1]).to.equal(parseEther("1.6"));
        expect(multipliers[2]).to.equal(parseEther("2"));
      });

      it("upgraded proxy exposes the carry-forward getter (current impl)", async () => {
        // undistributedReward getter only exists on the upgraded impl — a stale impl would revert.
        expect(await primeV2.undistributedReward(Addr.USDT)).to.be.gte(0);
      });
    });

    // ═══════════════════ 2. SAME-TIMESTAMP SEEDING ═══════════════════
    describe("Same-timestamp leaderboard seeding", () => {
      it("seeds all users at the same timestamp (one deposit each, top tier)", async () => {
        expect(await leaderboard.totalStaked(u1Addr)).to.equal(A1);
        expect(await leaderboard.totalStaked(u2Addr)).to.equal(A2);
        expect(await leaderboard.totalStaked(u3Addr)).to.equal(A3);
        expect(await leaderboard.getDepositCount(u1Addr)).to.equal(1);

        const d1 = (await leaderboard.getDeposits(u1Addr))[0];
        const d2 = (await leaderboard.getDeposits(u2Addr))[0];
        const d3 = (await leaderboard.getDeposits(u3Addr))[0];
        expect(d1.timestamp).to.equal(d2.timestamp);
        expect(d2.timestamp).to.equal(d3.timestamp);
      });

      it("effective stake is amount × 2.0x × 3h (capped) and proportional across users", async () => {
        const cap = BigNumber.from(3 * HOUR);
        const mult = parseEther("2");
        const e1 = await leaderboard.getEffectiveStake(u1Addr);
        const e2 = await leaderboard.getEffectiveStake(u2Addr);
        const e3 = await leaderboard.getEffectiveStake(u3Addr);
        expectApprox(e1, A1.mul(mult).div(parseEther("1")).mul(cap));
        expectApprox(e2, A2.mul(mult).div(parseEther("1")).mul(cap));
        expectApprox(e3, A3.mul(mult).div(parseEther("1")).mul(cap));
        // 2000 : 1000 : 500 = 4 : 2 : 1
        expectApprox(e1, e3.mul(4));
        expectApprox(e2, e3.mul(2));
      });

      it("the vault deposit equal to the seed did NOT create a second leaderboard deposit", async () => {
        // live xvsUpdated saw delta 0 → still a single seeded deposit
        expect(await leaderboard.getDepositCount(u1Addr)).to.equal(1);
        const [vaultStake] = await vault.getUserInfo(Addr.XVS, XVS_POOL_ID, u1Addr);
        expect(vaultStake).to.equal(A1);
      });

      it("stays capped at the 3h tier even after more time passes", async () => {
        const before = await leaderboard.getEffectiveStake(u1Addr);
        await advance(10 * HOUR);
        const after = await leaderboard.getEffectiveStake(u1Addr);
        expectApprox(after, before);
      });
    });

    // ═══════════════════ 3. COMPRESSED TIER PROGRESSION ═══════════════════
    describe("Compressed multiplier tiers", () => {
      it("reports the right multiplier at each hour boundary", async () => {
        expect(await leaderboard.getMultiplier(HOUR - 1)).to.equal(parseEther("1"));
        expect(await leaderboard.getMultiplier(HOUR)).to.equal(parseEther("1.3"));
        expect(await leaderboard.getMultiplier(2 * HOUR - 1)).to.equal(parseEther("1.3"));
        expect(await leaderboard.getMultiplier(2 * HOUR)).to.equal(parseEther("1.6"));
        expect(await leaderboard.getMultiplier(3 * HOUR)).to.equal(parseEther("2"));
        expect(await leaderboard.getMultiplier(100 * HOUR)).to.equal(parseEther("2"));
      });
    });

    // ═══════════════════ 4. PERMISSIONLESS CLAIM + KEEPER ISSUE ═══════════════════
    describe("Becoming a Prime holder", () => {
      it("claimPrime is disabled while mintThreshold is 0", async () => {
        await expect(primeV2.connect(u1).claimPrime(u1Addr)).to.be.revertedWithCustomError(
          primeV2,
          "MintThresholdNotSet",
        );
      });

      it("eligible staker can permissionlessly claimPrime once a window is opened", async () => {
        await primeV2.setMintThreshold(parseEther("1"), 0); // keeper opens a 1 XVS window
        await primeV2.connect(u1).claimPrime(u1Addr);
        expect(await primeV2.isUserPrimeHolder(u1Addr)).to.be.true;
        expect(await primeV2.totalTokens()).to.equal(1);
      });

      it("keeper can issue / issueBatch and respects the token limit", async () => {
        await primeV2.issueBatch([u1Addr, u2Addr]);
        expect(await primeV2.totalTokens()).to.equal(2);
        expect(await primeV2.isUserPrimeHolder(u2Addr)).to.be.true;

        await primeV2.setLimit(2);
        await expect(primeV2.issue(u3Addr)).to.be.revertedWithCustomError(primeV2, "InvalidLimit");
      });

      it("computes a non-zero, supply-weighted score from real oracle + vault + market", async () => {
        await primeV2.issueBatch([u1Addr, u2Addr]);
        const s1 = (await primeV2.interests(Addr.vUSDT, u1Addr)).score;
        const s2 = (await primeV2.interests(Addr.vUSDT, u2Addr)).score;
        expect(s1).to.be.gt(0);
        expect(s2).to.be.gt(0);
        expect(s1).to.be.gt(s2); // u1 supplied more USDT and staked more XVS
        const market = await primeV2.markets(Addr.vUSDT);
        expect(market.sumOfMembersScore).to.equal(s1.add(s2));
      });
    });

    // ═══════════════════ 5. INTEREST ACCRUAL & CLAIM ═══════════════════
    describe("Interest accrual & claim (block-based)", () => {
      beforeEach(async () => {
        await primeV2.issueBatch([u1Addr, u2Addr]);
      });

      it("accrues PLP income across mined blocks and pays it out proportionally", async () => {
        await primeV2.accrueInterest(Addr.vUSDT);
        await advance(2 * HOUR); // mine blocks → PLP accrues USDT
        await primeV2.accrueInterest(Addr.vUSDT);

        const market = await primeV2.markets(Addr.vUSDT);
        expect(market.rewardIndex).to.be.gt(0);

        const p1 = await primeV2.callStatic.getPendingRewards(u1Addr);
        const p2 = await primeV2.callStatic.getPendingRewards(u2Addr);
        const r1 = p1.find((r: { vToken: string }) => r.vToken === Addr.vUSDT).amount;
        const r2 = p2.find((r: { vToken: string }) => r.vToken === Addr.vUSDT).amount;
        expect(r1).to.be.gt(0);
        expect(r1).to.be.gte(r2); // higher score → higher share

        const before = await usdt.balanceOf(u1Addr);
        await primeV2.connect(u1)["claimInterest(address)"](Addr.vUSDT);
        const after = await usdt.balanceOf(u1Addr);
        expect(after.sub(before)).to.be.gt(0);
      });

      it("lets anyone claim on behalf of a holder, tokens go to the holder", async () => {
        await advance(HOUR);
        await primeV2.accrueInterest(Addr.vUSDT);
        const before = await usdt.balanceOf(u2Addr);
        await primeV2.connect(u3)["claimInterest(address,address)"](Addr.vUSDT, u2Addr);
        expect(await usdt.balanceOf(u2Addr)).to.be.gte(before);
      });
    });

    // ═══════════════════ 6. SWEEP / CARRY-FORWARD OF UNDISTRIBUTED INCOME ═══════════════════
    describe("Undistributed income sweep (no scored members)", () => {
      it("carries forward USDC income while vUSDC has no holders, then sweeps it", async () => {
        // No user supplies USDC and no one is a Prime holder in vUSDC → sumOfMembersScore == 0.
        const market = await primeV2.markets(Addr.vUSDC);
        expect(market.sumOfMembersScore).to.equal(0);

        await primeV2.accrueInterest(Addr.vUSDC);
        await advance(3 * HOUR);
        await primeV2.accrueInterest(Addr.vUSDC);

        const undistributed = await primeV2.undistributedReward(Addr.USDC);
        expect(undistributed).to.be.gt(0);

        // sweepUndistributed accrues one more block internally before transferring, so the swept
        // amount is at least the pre-read figure.
        const to = await recipient.getAddress();
        const before = await usdc.balanceOf(to);
        await expect(primeV2.sweepUndistributed(Addr.vUSDC, to)).to.emit(primeV2, "UndistributedSwept");
        const swept = (await usdc.balanceOf(to)).sub(before);
        expect(swept).to.be.gte(undistributed);
        expect(await primeV2.undistributedReward(Addr.USDC)).to.equal(0);
      });
    });

    // ═══════════════════ 7. BURN / RE-ISSUE & SCORE ROUNDS ═══════════════════
    describe("Burn, re-issue and score-update rounds", () => {
      it("burns a holder and clears their market score", async () => {
        await primeV2.issueBatch([u1Addr, u2Addr]);
        const before = (await primeV2.markets(Addr.vUSDT)).sumOfMembersScore;
        await primeV2.burn(u1Addr);
        expect(await primeV2.isUserPrimeHolder(u1Addr)).to.be.false;
        expect((await primeV2.interests(Addr.vUSDT, u1Addr)).score).to.equal(0);
        expect((await primeV2.markets(Addr.vUSDT)).sumOfMembersScore).to.be.lt(before);
      });

      it("queues a score round on updateAlpha and blocks issue until drained", async () => {
        await primeV2.issueBatch([u1Addr, u2Addr]);
        await primeV2.updateAlpha(1, 3);
        expect(await primeV2.pendingScoreUpdates()).to.equal(2);
        await expect(primeV2.issue(u3Addr)).to.be.revertedWithCustomError(primeV2, "ScoreUpdateInProgress");

        await primeV2.updateScores([u1Addr, u2Addr]);
        expect(await primeV2.pendingScoreUpdates()).to.equal(0);
        await primeV2.issue(u3Addr);
        expect(await primeV2.isUserPrimeHolder(u3Addr)).to.be.true;
      });
    });

    // ═══════════════════ 8. LIVE VAULT TRACKING & LIFO WITHDRAWAL ═══════════════════
    describe("Live vault tracking (post-finalization)", () => {
      it("records an additional live deposit and LIFO-consumes it on withdrawal", async () => {
        // A genuine NEW deposit (beyond the seeded amount) is tracked live via xvsUpdated.
        await fundAndStakeXVS(u1, u1Addr, parseEther("1000"));
        expect(await leaderboard.totalStaked(u1Addr)).to.equal(A1.add(parseEther("1000")));
        expect(await leaderboard.getDepositCount(u1Addr)).to.equal(2);

        // Withdraw 1000 → LIFO consumes the newest deposit, oldest (seeded) deposit survives.
        await vault.connect(u1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, parseEther("1000"));
        await advance(2 * HOUR); // clear the 300s vault lock
        await vault.connect(u1).executeWithdrawal(Addr.XVS, XVS_POOL_ID);

        expect(await leaderboard.totalStaked(u1Addr)).to.equal(A1);
        expect(await leaderboard.getDepositCount(u1Addr)).to.equal(1);
      });
    });

    // ═══════════════════ 9. PAUSE ═══════════════════
    describe("Pause", () => {
      it("blocks claimInterest while paused and resumes after unpause", async () => {
        await primeV2.issue(u1Addr);
        await primeV2.pause();
        await expect(primeV2.connect(u1)["claimInterest(address)"](Addr.vUSDT)).to.be.revertedWith("Pausable: paused");
        await primeV2.unpause();
        await expect(primeV2.connect(u1)["claimInterest(address)"](Addr.vUSDT)).not.to.be.revertedWith(
          "Pausable: paused",
        );
      });
    });

    // ═══════════════════ 10. BORROW-SIDE SCORING ═══════════════════
    describe("Borrow-side scoring (vBTC, borrowMultiplier 4x)", () => {
      it("scores a borrow position using borrowBalanceStored × borrowMultiplier", async () => {
        // u1 already supplies 10k USDT (collateral). Enter the collateral market and borrow vBTC.
        await comptroller.connect(u1).enterMarkets([Addr.vUSDT]);
        await vBTC.connect(u1).borrow(parseEther("0.001"));
        expect(await vBTC.borrowBalanceStored(u1Addr)).to.be.gt(0);

        await primeV2.issue(u1Addr);
        // The vBTC market score is driven entirely by the borrow side (supplyMultiplier path is 0
        // here since u1 has no vBTC supply), so a non-zero score proves the borrow branch ran.
        const scoreBTC = (await primeV2.interests(Addr.vBTC, u1Addr)).score;
        expect(scoreBTC).to.be.gt(0);
        expect((await primeV2.markets(Addr.vBTC)).sumOfMembersScore).to.equal(scoreBTC);
      });
    });

    // ═══════════════════ 11. CYCLE RECONCILIATION ═══════════════════
    describe("Keeper cycle reconciliation", () => {
      it("swap cycle: burn dropped holder then issue new entrant, totalTokens constant", async () => {
        await primeV2.issueBatch([u1Addr, u2Addr]);
        expect(await primeV2.totalTokens()).to.equal(2);

        // Off-chain rank decides u1 drops out, u3 rises in. Burn first, then issue.
        await primeV2.burnBatch([u1Addr]);
        await primeV2.issueBatch([u3Addr]);

        expect(await primeV2.totalTokens()).to.equal(2);
        expect(await primeV2.isUserPrimeHolder(u1Addr)).to.be.false;
        expect(await primeV2.isUserPrimeHolder(u2Addr)).to.be.true;
        expect(await primeV2.isUserPrimeHolder(u3Addr)).to.be.true;
      });

      it("at-cap cycle: issuing into a full set reverts until a slot is freed", async () => {
        await primeV2.issueBatch([u1Addr, u2Addr]);
        await primeV2.setLimit(2); // tokenLimit == totalTokens — full

        await expect(primeV2.issue(u3Addr)).to.be.revertedWithCustomError(primeV2, "InvalidLimit");

        await primeV2.burn(u1Addr); // free a slot first (cycle rule: burn before issue)
        await primeV2.issue(u3Addr);

        expect(await primeV2.totalTokens()).to.equal(2);
        expect(await primeV2.isUserPrimeHolder(u3Addr)).to.be.true;
        expect(await primeV2.isUserPrimeHolder(u1Addr)).to.be.false;
      });
    });

    // ═══════════════════ 12. UNSTAKE WITHOUT AUTO-BURN ═══════════════════
    describe("Unstake does not auto-burn the holder", () => {
      it("keeps isPrimeHolder true after a full unstake until the keeper burns", async () => {
        await primeV2.issue(u1Addr);
        expect(await primeV2.isUserPrimeHolder(u1Addr)).to.be.true;

        // u1 fully withdraws their vault stake → effective stake drops to 0 via xvsUpdated.
        await vault.connect(u1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, A1);
        await advance(2 * HOUR);
        await vault.connect(u1).executeWithdrawal(Addr.XVS, XVS_POOL_ID);

        expect(await leaderboard.totalStaked(u1Addr)).to.equal(0);
        expect(await leaderboard.getEffectiveStake(u1Addr)).to.equal(0);
        // Token is NOT auto-revoked — the slot stays occupied until the keeper acts.
        expect(await primeV2.isUserPrimeHolder(u1Addr)).to.be.true;

        await primeV2.burn(u1Addr);
        expect(await primeV2.isUserPrimeHolder(u1Addr)).to.be.false;
      });
    });

    // ═══════════════════ 13. EXACT INTEREST DISTRIBUTION ═══════════════════
    describe("Exact interest distribution math", () => {
      it("splits accrued income in proportion to member scores", async () => {
        await primeV2.issueBatch([u1Addr, u2Addr]);
        await primeV2.accrueInterest(Addr.vUSDT);

        const s1 = (await primeV2.interests(Addr.vUSDT, u1Addr)).score;
        const s2 = (await primeV2.interests(Addr.vUSDT, u2Addr)).score;
        expect(s1).to.be.gt(0);
        expect(s2).to.be.gt(0);

        await advance(3 * HOUR); // accrue PLP income across blocks
        await primeV2.accrueInterest(Addr.vUSDT);

        const get = async (u: string): Promise<BigNumber> => {
          const rewards = await primeV2.callStatic.getPendingRewards(u);
          const row = rewards.find((r: { vToken: string }) => r.vToken === Addr.vUSDT);
          return row ? row.amount : BigNumber.from(0);
        };
        const r1 = await get(u1Addr);
        const r2 = await get(u2Addr);
        expect(r1).to.be.gt(0);
        expect(r2).to.be.gt(0);

        // r1 / r2 == s1 / s2  ⇔  r1 * s2 == r2 * s1 (cross-multiply, tolerant of index rounding).
        expectApprox(r1.mul(s2), r2.mul(s1));
      });
    });

    // ═══════════════════ 14. ACCESS CONTROL (negatives) ═══════════════════
    describe("Access control", () => {
      it("reverts ACM-gated calls from an unpermissioned account", async () => {
        const outsider = recipient; // never granted any ACM permission
        const outsiderAddr = await outsider.getAddress();

        await expect(primeV2.connect(outsider).issue(u1Addr)).to.be.revertedWithCustomError(primeV2, "Unauthorized");
        await expect(primeV2.connect(outsider).burn(u1Addr)).to.be.revertedWithCustomError(primeV2, "Unauthorized");
        await expect(primeV2.connect(outsider).addMarket(Addr.vUSDT, parseEther("2"), 0)).to.be.revertedWithCustomError(
          primeV2,
          "Unauthorized",
        );
        await expect(primeV2.connect(outsider).setMintThreshold(parseEther("1"), 0)).to.be.revertedWithCustomError(
          primeV2,
          "Unauthorized",
        );
        await expect(
          primeV2.connect(outsider).sweepUndistributed(Addr.vUSDT, outsiderAddr),
        ).to.be.revertedWithCustomError(primeV2, "Unauthorized");
        await expect(
          leaderboard.connect(outsider).setMultiplierTiers([HOUR], [parseEther("2")]),
        ).to.be.revertedWithCustomError(leaderboard, "Unauthorized");
      });

      it("only the XVS vault can call xvsUpdated", async () => {
        await expect(leaderboard.connect(recipient).xvsUpdated(u1Addr)).to.be.revertedWithCustomError(
          leaderboard,
          "OnlyXVSVaultAllowed",
        );
      });
    });
  });
}
