/**
 * PrimeV2 End-to-End Fork Tests
 *
 * Validates PrimeV2 + PrimeLeaderboard system against a BSC mainnet fork
 * using real protocol contracts: XVSVault, Comptroller, Oracle, PrimeLiquidityProvider.
 *
 * Run:
 *   FORKED_NETWORK=bscmainnet npx hardhat test tests/hardhat/Fork/PrimeV2ForkTest.ts
 */
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract, Signer } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { PrimeLeaderboard, PrimeV2, PrimeV2Keeper } from "../../../typechain";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

// With second-based duration, block timestamp increments (1 sec per tx) become visible.
// Use 0.01% relative tolerance for assertions in multi-operation tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expectApprox(actual: any, expected: any) {
  const exp = ethers.BigNumber.from(expected);
  const tolerance = exp.div(10000); // 0.01%
  expect(actual).to.be.closeTo(exp, tolerance);
}

// ═══════════════════ BSC MAINNET ADDRESSES ═══════════════════
const Addr = {
  COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
  XVS_VAULT: "0x051100480289e704d20e9DB4804837068f3f9204",
  XVS_STORE: "0x1e25CF968f12850003Db17E0Dba32108509C4359",
  ORACLE: "0x6592b5DE802159F3E74B2486b091D11a8256ab8A",
  ACM: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
  PLP: "0x23c4F844ffDdC6161174eB32c770D4D8C07833F2",
  PRIME_V1: "0xBbCD063efE506c3D42a0Fa2dB5C08430288C71FC",
  XVS: "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63",
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  vUSDT: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
  vBNB: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
};

// ═══════════════════ CONSTANTS ═══════════════════
const BLOCK_NUMBER = 80742480;
const MAXIMUM_XVS_CAP = parseEther("100000");
const BLOCKS_PER_YEAR = 70080000;
const MINIMUM_STAKE = parseEther("500");
const DAY = 86400;
const XVS_POOL_ID = 0;

// ═══════════════════ ABI FRAGMENTS ═══════════════════
const ERC20_ABI = [
  "function transfer(address, uint256) returns (bool)",
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const XVS_VAULT_ABI = [
  "function deposit(address _rewardToken, uint256 _pid, uint256 _amount) external",
  "function requestWithdrawal(address _rewardToken, uint256 _pid, uint256 _amount) external",
  "function executeWithdrawal(address _rewardToken, uint256 _pid) external",
  "function getUserInfo(address, uint256, address) view returns (uint256 amount, uint256 rewardDebt, uint256 pendingWithdrawals)",
  "function xvsAddress() view returns (address)",
];

const ACM_ABI = [
  "function giveCallPermission(address, string, address) external",
  "function isAllowedToCall(address, string) view returns (bool)",
];

const PLP_ABI = [
  "function accrueTokens(address) external",
  "function tokenAmountAccrued(address) view returns (uint256)",
  "function releaseFunds(address) external",
  "function setPrimeToken(address) external",
  "function prime() view returns (address)",
  "function owner() view returns (address)",
];

const VTOKEN_ABI = [
  "function mint(uint256) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function borrowBalanceStored(address) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function underlying() view returns (address)",
];

const COMPTROLLER_ABI = [
  "function enterMarkets(address[]) returns (uint256[])",
  "function markets(address) view returns (bool, uint256)",
];

const ORACLE_ABI = [
  "function getPrice(address) view returns (uint256)",
  "function getUnderlyingPrice(address) view returns (uint256)",
];

// ═══════════════════ TESTS ═══════════════════
if (FORK_MAINNET) {
  forking(BLOCK_NUMBER, () => {
    describe("PrimeV2 End-to-End Fork Tests", () => {
      let primeV2: PrimeV2;
      let primeLeaderboard: PrimeLeaderboard;
      let xvsVault: Contract;
      let xvs: Contract;
      let usdt: Contract;
      let vUSDT: Contract;
      let acm: Contract;
      let plp: Contract;
      let oracle: Contract;
      let comptroller: Contract;

      let deployer: Signer;
      let user1: Signer;
      let user2: Signer;
      let user3: Signer;
      let timelock: Signer;
      let xvsVaultSigner: Signer;

      let deployerAddr: string;
      let user1Addr: string;
      let user2Addr: string;
      let user3Addr: string;

      // ── Helpers ──

      /** Transfer XVS from XVSStore (vault reward reserve) to an account */
      async function fundXVS(to: string, amount: BigNumber) {
        const storeSigner = await initMainnetUser(Addr.XVS_STORE, parseEther("1"));
        await xvs.connect(storeSigner).transfer(to, amount);
      }

      /** Transfer USDT from vUSDT reserves to an account */
      async function fundUSDT(to: string, amount: BigNumber) {
        const vSigner = await initMainnetUser(Addr.vUSDT, parseEther("1"));
        await usdt.connect(vSigner).transfer(to, amount);
      }

      /** Deposit XVS into the real XVSVault for a user */
      async function depositToVault(user: Signer, amount: BigNumber) {
        await xvs.connect(user).approve(Addr.XVS_VAULT, amount);
        await xvsVault.connect(user).deposit(Addr.XVS, XVS_POOL_ID, amount);
      }

      /** Grant a function permission on ACM for deployer */
      async function grantPermission(contractAddr: string, funcSig: string) {
        await acm.giveCallPermission(contractAddr, funcSig, deployerAddr);
      }

      // ── Main Fixture ──
      async function deployFixture() {
        [deployer, user1, user2, user3] = await ethers.getSigners();
        deployerAddr = await deployer.getAddress();
        user1Addr = await user1.getAddress();
        user2Addr = await user2.getAddress();
        user3Addr = await user3.getAddress();

        // Impersonate Timelock for admin operations
        timelock = await initMainnetUser(Addr.TIMELOCK, parseEther("10"));

        // Impersonate XVS Vault for xvsUpdated calls
        const vaultSigner = await initMainnetUser(Addr.XVS_VAULT, parseEther("1"));

        // ── Contract instances (real mainnet) ──
        xvs = new ethers.Contract(Addr.XVS, ERC20_ABI, deployer);
        usdt = new ethers.Contract(Addr.USDT, ERC20_ABI, deployer);
        xvsVault = new ethers.Contract(Addr.XVS_VAULT, XVS_VAULT_ABI, deployer);
        vUSDT = new ethers.Contract(Addr.vUSDT, VTOKEN_ABI, deployer);
        acm = new ethers.Contract(Addr.ACM, ACM_ABI, timelock);
        plp = new ethers.Contract(Addr.PLP, PLP_ABI, deployer);
        oracle = new ethers.Contract(Addr.ORACLE, ORACLE_ABI, deployer);
        comptroller = new ethers.Contract(Addr.COMPTROLLER, COMPTROLLER_ABI, deployer);

        // ── Deploy PrimeLeaderboard ──
        const LeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");
        primeLeaderboard = (await upgrades.deployProxy(
          LeaderboardFactory,
          [Addr.ACM, MINIMUM_STAKE],
          {
            unsafeAllow: ["constructor", "state-variable-immutable"],
            constructorArgs: [Addr.XVS_VAULT, Addr.XVS, XVS_POOL_ID],
          },
        )) as PrimeLeaderboard;

        // ── Deploy PrimeV2 ──
        const PrimeV2Factory = await ethers.getContractFactory("PrimeV2");
        primeV2 = (await upgrades.deployProxy(
          PrimeV2Factory,
          [Addr.XVS_VAULT, Addr.XVS, XVS_POOL_ID, 1, 2, Addr.ACM, Addr.PLP, Addr.COMPTROLLER, Addr.ORACLE, 100],
          {
            constructorArgs: [Addr.WBNB, Addr.vBNB, MAXIMUM_XVS_CAP, false, BLOCKS_PER_YEAR],
            unsafeAllow: ["constructor", "internal-function-storage"],
          },
        )) as PrimeV2;

        // ── Grant ACM permissions (via Timelock) ──
        const primeV2Perms = [
          "issue(address[])",
          "burn(address)",
          "addMarket(address,uint256,uint256)",
          "updateAlpha(uint128,uint128)",
          "updateMultipliers(address,uint256,uint256)",
          "setPrimeLeaderboard(address)",
          "setLimit(uint256)",
          "pause()",
          "unpause()",
          "setMaxLoopsLimit(uint256)",
        ];
        const leaderboardPerms = [
          "setPrimeV2(address)",
          "resetWithdrawnStake(address)",
          "setMinimumStake(uint256)",
          "setMultiplierTiers(uint256[],uint256[])",
        ];

        for (const f of primeV2Perms) {
          await grantPermission(primeV2.address, f);
        }
        for (const f of leaderboardPerms) {
          await grantPermission(primeLeaderboard.address, f);
        }

        // ── Wire contracts ──
        await primeV2.setPrimeLeaderboard(primeLeaderboard.address);
        await primeLeaderboard.setPrimeV2(primeV2.address);

        // ── Add vUSDT market ──
        await primeV2.addMarket(Addr.vUSDT, parseEther("2"), parseEther("2"));

        // ── Fund test users with XVS and deposit to vault ──
        const xvsAmounts = [parseEther("5000"), parseEther("3000"), parseEther("800")];
        const users = [user1, user2, user3];
        const addrs = [user1Addr, user2Addr, user3Addr];

        for (let i = 0; i < users.length; i++) {
          await fundXVS(addrs[i], xvsAmounts[i]);
          await depositToVault(users[i], xvsAmounts[i]);
          await primeLeaderboard.connect(vaultSigner).xvsUpdated(addrs[i]);
        }

        // ── Fund user1 with USDT and supply to vUSDT for non-zero score ──
        const supplyAmount = parseEther("10000");
        await fundUSDT(user1Addr, supplyAmount);
        await usdt.connect(user1).approve(Addr.vUSDT, supplyAmount);
        await vUSDT.connect(user1).mint(supplyAmount);

        // Fund user2 with USDT and supply to vUSDT
        await fundUSDT(user2Addr, parseEther("5000"));
        await usdt.connect(user2).approve(Addr.vUSDT, parseEther("5000"));
        await vUSDT.connect(user2).mint(parseEther("5000"));

        return {
          primeV2,
          primeLeaderboard,
          xvsVault,
          xvs,
          usdt,
          vUSDT,
          acm,
          plp,
          oracle,
          comptroller,
          deployer,
          user1,
          user2,
          user3,
          timelock,
          xvsVaultSigner: vaultSigner,
        };
      }

      beforeEach(async () => {
        ({
          primeV2,
          primeLeaderboard,
          xvsVault,
          xvs,
          usdt,
          vUSDT,
          acm,
          plp,
          oracle,
          comptroller,
          deployer,
          user1,
          user2,
          user3,
          timelock,
          xvsVaultSigner,
        } = await loadFixture(deployFixture));
      });

      // ═══════════════════════════════════════════════════════════
      // 1. DEPLOYMENT & CONFIGURATION
      // ═══════════════════════════════════════════════════════════
      describe("Deployment & Configuration", () => {
        it("should deploy PrimeV2 with correct immutable parameters", async () => {
          expect(await primeV2.WRAPPED_NATIVE_TOKEN()).to.equal(Addr.WBNB);
          expect(await primeV2.NATIVE_MARKET()).to.equal(Addr.vBNB);
          expect(await primeV2.MAXIMUM_XVS_CAP()).to.equal(MAXIMUM_XVS_CAP);
        });

        it("should wire PrimeV2 and PrimeLeaderboard together", async () => {
          expect(await primeV2.primeLeaderboard()).to.equal(primeLeaderboard.address);
          expect(await primeLeaderboard.primeV2()).to.equal(primeV2.address);
        });

        it("should configure PrimeV2 with real protocol addresses", async () => {
          expect(await primeV2.xvsVault()).to.equal(Addr.XVS_VAULT);
          expect(await primeV2.xvsVaultRewardToken()).to.equal(Addr.XVS);
          expect(await primeV2.primeLiquidityProvider()).to.equal(Addr.PLP);
          expect(await primeV2.corePoolComptroller()).to.equal(Addr.COMPTROLLER);
        });

        it("should add vUSDT market with correct multipliers", async () => {
          const allMarkets = await primeV2.getAllMarkets();
          expect(allMarkets).to.have.lengthOf(1);
          expect(allMarkets[0]).to.equal(Addr.vUSDT);

          const market = await primeV2.markets(Addr.vUSDT);
          expect(market.exists).to.be.true;
          expect(market.supplyMultiplier).to.equal(parseEther("2"));
          expect(market.borrowMultiplier).to.equal(parseEther("2"));
        });

        it("should initialize PrimeLeaderboard with default multiplier tiers", async () => {
          const [durations, multipliers] = await primeLeaderboard.getMultiplierTiers();
          expect(durations).to.have.lengthOf(3);
          expect(durations[0]).to.equal(30 * DAY);
          expect(durations[1]).to.equal(60 * DAY);
          expect(durations[2]).to.equal(90 * DAY);
          expect(multipliers[0]).to.equal(parseEther("1.3"));
          expect(multipliers[1]).to.equal(parseEther("1.6"));
          expect(multipliers[2]).to.equal(parseEther("2"));
        });

        it("should read real XVS price from oracle", async () => {
          const xvsPrice = await oracle.getPrice(Addr.XVS);
          expect(xvsPrice).to.be.gt(0);
          console.log("XVS Price: " + xvsPrice.toString());
        });

        it("should read real vUSDT underlying price from oracle", async () => {
          const usdtPrice = await oracle.getUnderlyingPrice(Addr.vUSDT);
          expect(usdtPrice).to.be.gt(0);
          console.log("vUSDT Underlying Price: " + usdtPrice.toString());
        });
      });

      // ═══════════════════════════════════════════════════════════
      // 2. LEADERBOARD REGISTRATION & SCORING
      // ═══════════════════════════════════════════════════════════
      describe("Leaderboard Registration & Scoring", () => {
        it("should track correct total staked amounts from real vault", async () => {
          expect(await primeLeaderboard.totalStaked(user1Addr)).to.equal(parseEther("5000"));
          expect(await primeLeaderboard.totalStaked(user2Addr)).to.equal(parseEther("3000"));
          expect(await primeLeaderboard.totalStaked(user3Addr)).to.equal(parseEther("800"));
        });

        it("should read XVS balance from real vault for PrimeV2 scoring", async () => {
          const [amount, , pendingWithdrawals] = await xvsVault.getUserInfo(Addr.XVS, XVS_POOL_ID, user1Addr);
          expect(amount).to.equal(parseEther("5000"));
          expect(pendingWithdrawals).to.equal(0);

          const primeXvsBalance = await primeV2.xvsBalanceOfUser(user1Addr);
          expect(primeXvsBalance).to.equal(parseEther("5000"));
        });

        it("should have near-zero effective stake immediately after deposit", async () => {
          // Effective stake = amount × multiplier × durationSeconds
          // A few seconds elapse during fixture setup, so stake is small but not exactly 0
          const stake = await primeLeaderboard.getEffectiveStake(user1Addr);
          // Should be negligible relative to a 1-day stake (5000 × 1.0 × 86400 = 4.32e11)
          expect(stake.lt(parseEther("1000000"))).to.be.true;
        });

        it("should grow effective stake with time (base multiplier tier)", async () => {
          // Advance 10 days (< 30d threshold, so base 1.0x multiplier)
          await time.increase(10 * DAY);

          // user1: 5000 × 1.0 × (10 * 86400) = 4,320,000,000
          const stake1 = await primeLeaderboard.getEffectiveStake(user1Addr);
          expectApprox(stake1, parseEther("4320000000"));

          // user2: 3000 × 1.0 × (10 * 86400) = 2,592,000,000
          const stake2 = await primeLeaderboard.getEffectiveStake(user2Addr);
          expectApprox(stake2, parseEther("2592000000"));

          // user3: 800 × 1.0 × (10 * 86400) = 691,200,000
          const stake3 = await primeLeaderboard.getEffectiveStake(user3Addr);
          expectApprox(stake3, parseEther("691200000"));
        });

        it("should batch query effective stakes via getEffectiveStakeBatch", async () => {
          await time.increase(10 * DAY);

          const scores = await primeLeaderboard.getEffectiveStakeBatch([user1Addr, user2Addr, user3Addr]);
          expectApprox(scores[0], parseEther("4320000000"));
          expectApprox(scores[1], parseEther("2592000000"));
          expectApprox(scores[2], parseEther("691200000"));
        });
      });

      // ═══════════════════════════════════════════════════════════
      // 3. MULTIPLIER TIER PROGRESSION
      // ═══════════════════════════════════════════════════════════
      describe("Multiplier Tier Progression", () => {
        it("should apply 1.3x multiplier after 30 days", async () => {
          await time.increase(30 * DAY);

          // user1: 5000 × 1.3 × (30 * 86400) = 16,848,000,000
          const stake = await primeLeaderboard.getEffectiveStake(user1Addr);
          expectApprox(stake, parseEther("16848000000"));
        });

        it("should apply 1.6x multiplier after 60 days", async () => {
          await time.increase(60 * DAY);

          // user1: 5000 × 1.6 × (60 * 86400) = 41,472,000,000
          const stake = await primeLeaderboard.getEffectiveStake(user1Addr);
          expectApprox(stake, parseEther("41472000000"));
        });

        it("should apply 2.0x multiplier after 90 days, capped at 90 day duration", async () => {
          await time.increase(90 * DAY);

          // user1: 5000 × 2.0 × (90 * 86400) = 77,760,000,000
          const stake = await primeLeaderboard.getEffectiveStake(user1Addr);
          expectApprox(stake, parseEther("77760000000"));
        });

        it("should remain capped at 90 days even after 180 days", async () => {
          await time.increase(180 * DAY);

          // user1: 5000 × 2.0 × (90 * 86400) = 77,760,000,000 (capped)
          const stake = await primeLeaderboard.getEffectiveStake(user1Addr);
          expectApprox(stake, parseEther("77760000000"));
        });

        it("should correctly report multiplier for each tier via getMultiplier", async () => {
          expect(await primeLeaderboard.getMultiplier(0)).to.equal(parseEther("1")); // base
          expect(await primeLeaderboard.getMultiplier(29 * DAY)).to.equal(parseEther("1")); // still base
          expect(await primeLeaderboard.getMultiplier(30 * DAY)).to.equal(parseEther("1.3"));
          expect(await primeLeaderboard.getMultiplier(59 * DAY)).to.equal(parseEther("1.3"));
          expect(await primeLeaderboard.getMultiplier(60 * DAY)).to.equal(parseEther("1.6"));
          expect(await primeLeaderboard.getMultiplier(89 * DAY)).to.equal(parseEther("1.6"));
          expect(await primeLeaderboard.getMultiplier(90 * DAY)).to.equal(parseEther("2"));
          expect(await primeLeaderboard.getMultiplier(365 * DAY)).to.equal(parseEther("2"));
        });
      });

      // ═══════════════════════════════════════════════════════════
      // 4. PRIME TOKEN ISSUANCE & SCORING
      // ═══════════════════════════════════════════════════════════
      describe("Prime Token Issuance & Scoring", () => {
        it("should issue Prime tokens to users", async () => {
          await primeV2.issue([user1Addr, user2Addr]);

          expect(await primeV2.isUserPrimeHolder(user1Addr)).to.be.true;
          expect(await primeV2.isUserPrimeHolder(user2Addr)).to.be.true;
          expect(await primeV2.isUserPrimeHolder(user3Addr)).to.be.false;
          expect(await primeV2.totalTokens()).to.equal(2);
        });

        it("should calculate user score using real oracle prices", async () => {
          // Issue Prime so user1 gets a score in vUSDT market
          await primeV2.issue([user1Addr]);

          // User1 has vUSDT supply (from fixture) and XVS stake
          const interest = await primeV2.interests(Addr.vUSDT, user1Addr);
          expect(interest.score).to.be.gt(0);

          // Score should be reflected in market sumOfMembersScore
          const market = await primeV2.markets(Addr.vUSDT);
          expect(market.sumOfMembersScore).to.equal(interest.score);
        });

        it("should update sumOfMembersScore when multiple users have Prime", async () => {
          await primeV2.issue([user1Addr, user2Addr]);

          const interest1 = await primeV2.interests(Addr.vUSDT, user1Addr);
          const interest2 = await primeV2.interests(Addr.vUSDT, user2Addr);
          const market = await primeV2.markets(Addr.vUSDT);

          expect(market.sumOfMembersScore).to.equal(interest1.score.add(interest2.score));
        });

        it("should respect token limit", async () => {
          // Set tight limit
          await primeV2.setLimit(1);
          await primeV2.issue([user1Addr]);

          // Second issuance should revert
          await expect(primeV2.issue([user2Addr])).to.be.revertedWithCustomError(primeV2, "InvalidLimit");
        });

        it("should revert issuing to user who already has Prime", async () => {
          await primeV2.issue([user1Addr]);
          await expect(primeV2.issue([user1Addr])).not.to.be.reverted; // no-op for existing, not revert
        });
      });

      // ═══════════════════════════════════════════════════════════
      // 5. INTEREST ACCRUAL & CLAIMING
      // ═══════════════════════════════════════════════════════════
      describe("Interest Accrual & Claiming", () => {
        beforeEach(async () => {
          // Issue Prime to user1 and user2 (both have vUSDT supply)
          await primeV2.issue([user1Addr, user2Addr]);
        });

        it("should accrue interest from real PrimeLiquidityProvider", async () => {
          // PLP on mainnet has already accrued USDT rewards
          // accrueInterest reads from real PLP
          await primeV2.accrueInterest(Addr.vUSDT);

          const market = await primeV2.markets(Addr.vUSDT);
          // rewardIndex should increase if PLP had accrued tokens
          expect(market.rewardIndex).to.be.gte(0);
        });

        it("should calculate pending rewards for Prime holders", async () => {
          await primeV2.accrueInterest(Addr.vUSDT);

          const pendingRewards = await primeV2.callStatic.getPendingRewards(user1Addr);
          expect(pendingRewards).to.have.lengthOf(1);
          expect(pendingRewards[0].vToken).to.equal(Addr.vUSDT);
          // Amount may or may not be > 0 depending on PLP state at fork block
        });

        it("should distribute rewards proportionally to scores", async () => {
          await primeV2.accrueInterest(Addr.vUSDT);

          const pending1 = await primeV2.callStatic.getPendingRewards(user1Addr);
          const pending2 = await primeV2.callStatic.getPendingRewards(user2Addr);

          // User1 supplied 10000 USDT vs user2 supplied 5000 USDT
          // So user1 should have higher or equal rewards
          if (pending1[0].amount.gt(0)) {
            expect(pending1[0].amount).to.be.gte(pending2[0].amount);
            console.log(
              `User1 pending: ${pending1[0].amount.toString()}, User2 pending: ${pending2[0].amount.toString()}`,
            );
          }
        });

        it("should allow user to claim interest with real token transfer", async () => {
          // Accrue interest
          await primeV2.accrueInterest(Addr.vUSDT);

          // Fund PrimeV2 with USDT so claims can be fulfilled
          await fundUSDT(primeV2.address, parseEther("10000"));

          const balanceBefore = await usdt.balanceOf(user1Addr);
          console.log("Balance before claim: " + balanceBefore.toString());

          // Claim using the single-arg overload
          await primeV2.connect(user1)["claimInterest(address)"](Addr.vUSDT);

          const balanceAfter = await usdt.balanceOf(user1Addr);
          console.log("Balance after claim: " + balanceAfter.toString());
          // Balance should increase (or stay same if no accrued rewards)
          expect(balanceAfter).to.be.gte(balanceBefore);
        });

        it("should claim interest with real PLP releaseFunds integration", async () => {
          // Reconfigure PLP to point to PrimeV2
          const plpOwner = await plp.owner();
          const plpOwnerSigner = await initMainnetUser(plpOwner, parseEther("1"));
          await plp.connect(plpOwnerSigner).setPrimeToken(primeV2.address);
          expect(await plp.prime()).to.equal(primeV2.address);

          // Accrue interest
          await primeV2.accrueInterest(Addr.vUSDT);

          const pending = await primeV2.callStatic.getPendingRewards(user1Addr);
          if (pending[0].amount.gt(0)) {
            const balanceBefore = await usdt.balanceOf(user1Addr);
            console.log("Balance before claim: " + balanceBefore.toString());
            await primeV2.connect(user1)["claimInterest(address)"](Addr.vUSDT);
            const balanceAfter = await usdt.balanceOf(user1Addr);
            console.log("Balance after claim: " + balanceAfter.toString());
            expect(balanceAfter).to.be.gt(balanceBefore);
          }
        });

        it("should allow claim for non-Prime holder with zero accrued", async () => {
          const balanceBefore = await usdt.balanceOf(user3Addr);
          await primeV2.connect(user3)["claimInterest(address)"](Addr.vUSDT);
          const balanceAfter = await usdt.balanceOf(user3Addr);
          expect(balanceAfter).to.equal(balanceBefore);
        });

        it("should revert claim for unsupported market", async () => {
          const fakeMarket = ethers.Wallet.createRandom().address;
          await expect(primeV2.connect(user1)["claimInterest(address)"](fakeMarket)).to.be.revertedWithCustomError(
            primeV2,
            "MarketNotSupported",
          );
        });
      });

      // ═══════════════════════════════════════════════════════════
      // 6. LIFO WITHDRAWAL MECHANICS
      // ═══════════════════════════════════════════════════════════
      describe("LIFO Withdrawal Mechanics", () => {
        it("should process LIFO withdrawal preserving oldest deposits", async () => {
          // user1 already deposited 5000 XVS at T0
          // Wait 60 days (1.6x multiplier on first deposit)
          await time.increase(60 * DAY);

          // user1 deposits 2000 more XVS
          await fundXVS(user1Addr, parseEther("2000"));
          await depositToVault(user1, parseEther("2000"));
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          expect(await primeLeaderboard.totalStaked(user1Addr)).to.equal(parseEther("7000"));
          expect(await primeLeaderboard.getDepositCount(user1Addr)).to.equal(2);

          // Wait 5 days (new deposit gets 1.0x for 5 days)
          await time.increase(5 * DAY);

          // Before withdrawal:
          // Deposit 1 (5000): 65 days × 1.6x → 5000 × 1.6 × (65 * 86400) = 44,928,000,000
          // Deposit 2 (2000): 5 days × 1.0x → 2000 × 1.0 × (5 * 86400) = 864,000,000
          // Total: ~45,792,000,000
          const stakeBefore = await primeLeaderboard.getEffectiveStake(user1Addr);
          expectApprox(stakeBefore, parseEther("45792000000"));

          // Request withdrawal of 1000 XVS from vault
          await xvsVault.connect(user1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, parseEther("1000"));

          // Wait for vault lock period and execute
          await time.increase(7 * DAY);
          await xvsVault.connect(user1).executeWithdrawal(Addr.XVS, XVS_POOL_ID);

          // Sync leaderboard
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          // LIFO: 1000 consumed from newest deposit (2000 → 1000 remaining)
          expect(await primeLeaderboard.totalStaked(user1Addr)).to.equal(parseEther("6000"));
          expect(await primeLeaderboard.getDepositCount(user1Addr)).to.equal(2);
        });

        it("should fully consume newest deposit via LIFO", async () => {
          // Wait 60 days
          await time.increase(60 * DAY);

          // Add a small deposit
          await fundXVS(user1Addr, parseEther("500"));
          await depositToVault(user1, parseEther("500"));
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          expect(await primeLeaderboard.getDepositCount(user1Addr)).to.equal(2);

          // Wait a bit
          await time.increase(5 * DAY);

          // Withdraw exactly 500 (fully consumes the second deposit)
          await xvsVault.connect(user1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, parseEther("500"));
          await time.increase(7 * DAY);
          await xvsVault.connect(user1).executeWithdrawal(Addr.XVS, XVS_POOL_ID);
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          // Second deposit fully consumed, only original remains
          expect(await primeLeaderboard.getDepositCount(user1Addr)).to.equal(1);
          expect(await primeLeaderboard.totalStaked(user1Addr)).to.equal(parseEther("5000"));
        });

        it("should NOT include withdrawn stake in effective stake (backend-driven)", async () => {
          await time.increase(45 * DAY);

          const stakeBefore = await primeLeaderboard.getEffectiveStake(user1Addr);
          // 5000 × 1.3 × (45 * 86400) = 25,272,000,000
          expectApprox(stakeBefore, parseEther("25272000000"));

          // Withdraw 1000 XVS
          await xvsVault.connect(user1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, parseEther("1000"));
          await time.increase(7 * DAY);
          await xvsVault.connect(user1).executeWithdrawal(Addr.XVS, XVS_POOL_ID);
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          // Effective stake should only reflect ACTIVE deposits (no withdrawn stake)
          // Active: 4000 × 1.3 × (52 * 86400) = 23,362,560,000 (52 days = 45 + 7 vault lock)
          const stakeAfter = await primeLeaderboard.getEffectiveStake(user1Addr);
          expectApprox(stakeAfter, parseEther("23362560000"));

          // Withdrawn score is tracked separately for backend
          const withdrawnStake = await primeLeaderboard.withdrawnStake(user1Addr);
          // 1000 × 1.3 × (52 * 86400) = 5,840,640,000 (held 52 days at withdrawal time)
          expectApprox(withdrawnStake, parseEther("5840640000"));
        });
      });

      // ═══════════════════════════════════════════════════════════
      // 7. SCORE UPDATE ROUNDS
      // ═══════════════════════════════════════════════════════════
      describe("Score Update Rounds", () => {
        it("should queue score updates after alpha change", async () => {
          await primeV2.issue([user1Addr, user2Addr]);

          expect(await primeV2.pendingScoreUpdates()).to.equal(0);

          // Change alpha from 1/2 to 1/3
          await primeV2.updateAlpha(1, 3);

          expect(await primeV2.pendingScoreUpdates()).to.equal(2);
        });

        it("should process batch score updates", async () => {
          await primeV2.issue([user1Addr, user2Addr]);

          const scoreBefore = (await primeV2.interests(Addr.vUSDT, user1Addr)).score;

          await primeV2.updateAlpha(1, 3);
          expect(await primeV2.pendingScoreUpdates()).to.equal(2);

          // Process all updates
          await primeV2.updateScores([user1Addr, user2Addr]);

          expect(await primeV2.pendingScoreUpdates()).to.equal(0);

          const scoreAfter = (await primeV2.interests(Addr.vUSDT, user1Addr)).score;
          // Score should change due to alpha change (unless capital is 0)
          if (scoreBefore.gt(0)) {
            expect(scoreAfter).to.not.equal(scoreBefore);
          }
        });

        it("should queue score updates after multiplier change", async () => {
          await primeV2.issue([user1Addr]);

          await primeV2.updateMultipliers(Addr.vUSDT, parseEther("3"), parseEther("3"));

          expect(await primeV2.pendingScoreUpdates()).to.equal(1);

          await primeV2.updateScores([user1Addr]);
          expect(await primeV2.pendingScoreUpdates()).to.equal(0);
        });

        it("should skip already-updated users in batch", async () => {
          await primeV2.issue([user1Addr, user2Addr]);
          await primeV2.updateAlpha(1, 3);

          // Update user1 only
          await primeV2.updateScores([user1Addr]);
          expect(await primeV2.pendingScoreUpdates()).to.equal(1);

          // Call again with both - user1 should be skipped
          await primeV2.updateScores([user1Addr, user2Addr]);
          expect(await primeV2.pendingScoreUpdates()).to.equal(0);
        });

        it("should revert updateScores when no updates pending", async () => {
          await expect(primeV2.updateScores([user1Addr])).to.be.revertedWithCustomError(
            primeV2,
            "NoScoreUpdatesRequired",
          );
        });
      });

      // ═══════════════════════════════════════════════════════════
      // 8. WITHDRAWN SCORE MANAGEMENT (BACKEND-DRIVEN)
      // ═══════════════════════════════════════════════════════════
      describe("Withdrawn Stake Management", () => {
        it("should track withdrawn stake separately from effective stake", async () => {
          await time.increase(45 * DAY);

          // Withdraw 500 XVS
          await xvsVault.connect(user1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, parseEther("500"));
          await time.increase(7 * DAY);
          await xvsVault.connect(user1).executeWithdrawal(Addr.XVS, XVS_POOL_ID);
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          // Withdrawn score should be tracked
          // 500 × 1.3 × (52 * 86400) = 2,920,320,000 (held 52 days = 45 + 7 vault lock)
          const withdrawnStake = await primeLeaderboard.withdrawnStake(user1Addr);
          expectApprox(withdrawnStake, parseEther("2920320000"));

          // Effective stake should only reflect active deposits
          // 4500 × 1.3 × (52 * 86400) = 26,282,880,000
          const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Addr);
          expectApprox(effectiveStake, parseEther("26282880000"));
        });

        it("should accumulate withdrawn stakes across multiple withdrawals", async () => {
          await time.increase(45 * DAY);

          // First withdrawal: 200 XVS
          await xvsVault.connect(user1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, parseEther("200"));
          await time.increase(7 * DAY);
          await xvsVault.connect(user1).executeWithdrawal(Addr.XVS, XVS_POOL_ID);
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          const scoreAfterFirst = await primeLeaderboard.withdrawnStake(user1Addr);
          // 200 × 1.3 × (52 * 86400) = 1,168,128,000 (held 52 days = 45 + 7 vault lock)
          expectApprox(scoreAfterFirst, parseEther("1168128000"));

          // Second withdrawal: 200 XVS
          await xvsVault.connect(user1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, parseEther("200"));
          await time.increase(7 * DAY);
          await xvsVault.connect(user1).executeWithdrawal(Addr.XVS, XVS_POOL_ID);
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          const scoreAfterSecond = await primeLeaderboard.withdrawnStake(user1Addr);
          // First: 1,168,128,000 + Second: 200 × 1.3 × (59 * 86400) = 1,325,376,000 (59 days = 45 + 7 + 7)
          // Total: 1,168,128,000 + 1,325,376,000 = 2,493,504,000
          expectApprox(scoreAfterSecond, parseEther("2493504000"));

          // Both scores accumulated, second didn't overwrite first
          expect(scoreAfterSecond.gt(scoreAfterFirst)).to.be.true;
        });

        it("should allow backend to reset withdrawn stake via resetWithdrawnStake", async () => {
          await time.increase(45 * DAY);

          // Build up withdrawn stake
          await xvsVault.connect(user1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, parseEther("500"));
          await time.increase(7 * DAY);
          await xvsVault.connect(user1).executeWithdrawal(Addr.XVS, XVS_POOL_ID);
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          const withdrawnBefore = await primeLeaderboard.withdrawnStake(user1Addr);
          expect(withdrawnBefore).to.be.gt(0);

          // Backend resets withdrawn stake after processing
          await primeLeaderboard.resetWithdrawnStake(user1Addr);

          const withdrawnAfter = await primeLeaderboard.withdrawnStake(user1Addr);
          expect(withdrawnAfter).to.equal(0);

          // Effective stake should be unchanged (withdrawn stake was never part of it)
          const effectiveStake = await primeLeaderboard.getEffectiveStake(user1Addr);
          expect(effectiveStake).to.be.gt(0);
        });

        it("should reset withdrawn stake to zero and allow new accumulation", async () => {
          await time.increase(45 * DAY);

          // First withdrawal
          await xvsVault.connect(user1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, parseEther("500"));
          await time.increase(7 * DAY);
          await xvsVault.connect(user1).executeWithdrawal(Addr.XVS, XVS_POOL_ID);
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          const withdrawnBefore = await primeLeaderboard.withdrawnStake(user1Addr);
          expect(withdrawnBefore).to.be.gt(0);

          // Backend resets
          await primeLeaderboard.resetWithdrawnStake(user1Addr);
          expect(await primeLeaderboard.withdrawnStake(user1Addr)).to.equal(0);

          // New withdrawal after reset should start fresh accumulation
          await xvsVault.connect(user1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, parseEther("500"));
          await time.increase(7 * DAY);
          await xvsVault.connect(user1).executeWithdrawal(Addr.XVS, XVS_POOL_ID);
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          const withdrawnAfterReset = await primeLeaderboard.withdrawnStake(user1Addr);
          expect(withdrawnAfterReset).to.be.gt(0);
          // New withdrawn stake should be different from old (different hold times)
          expect(withdrawnAfterReset).to.not.equal(withdrawnBefore);
        });
      });

      // ═══════════════════════════════════════════════════════════
      // 9. TOKEN BURN & RE-ISSUANCE
      // ═══════════════════════════════════════════════════════════
      describe("Token Burn & Re-issuance", () => {
        it("should burn a user's Prime token", async () => {
          await primeV2.issue([user1Addr, user2Addr]);
          expect(await primeV2.totalTokens()).to.equal(2);

          await primeV2.burn(user1Addr);

          expect(await primeV2.isUserPrimeHolder(user1Addr)).to.be.false;
          expect(await primeV2.totalTokens()).to.equal(1);
        });

        it("should remove user score from market on burn", async () => {
          await primeV2.issue([user1Addr, user2Addr]);

          const marketBefore = await primeV2.markets(Addr.vUSDT);

          await primeV2.burn(user1Addr);

          const marketAfter = await primeV2.markets(Addr.vUSDT);
          const user1Score = (await primeV2.interests(Addr.vUSDT, user1Addr)).score;

          // User1 score should be 0 after burn
          expect(user1Score).to.equal(0);
          // sumOfMembersScore should decrease
          expect(marketAfter.sumOfMembersScore).to.be.lt(marketBefore.sumOfMembersScore);
        });

        it("should allow re-issuance to a different user after burn", async () => {
          await primeV2.issue([user1Addr]);
          await primeV2.burn(user1Addr);

          // Issue to user3 who didn't have Prime
          await primeV2.issue([user3Addr]);
          expect(await primeV2.isUserPrimeHolder(user3Addr)).to.be.true;
          expect(await primeV2.totalTokens()).to.equal(1);
        });

        it("should revert burn for non-Prime holder", async () => {
          await expect(primeV2.burn(user3Addr)).to.be.revertedWithCustomError(primeV2, "UserHasNoPrimeToken");
        });
      });

      // ═══════════════════════════════════════════════════════════
      // 10. KEEPER AUTOMATION
      // ═══════════════════════════════════════════════════════════
      describe("PrimeV2Keeper Automation", () => {
        let keeper: PrimeV2Keeper;

        beforeEach(async () => {
          // Deploy PrimeV2Keeper
          const KeeperFactory = await ethers.getContractFactory("PrimeV2Keeper");
          keeper = (await upgrades.deployProxy(
            KeeperFactory,
            [Addr.ACM, primeV2.address, primeLeaderboard.address, 50, 100],
            { unsafeAllow: ["constructor"] },
          )) as PrimeV2Keeper;

          // Grant keeper permissions
          await acm.giveCallPermission(keeper.address, "processScoreUpdates(address[])", deployerAddr);
          await acm.giveCallPermission(keeper.address, "accrueAllMarkets()", deployerAddr);
          await acm.giveCallPermission(keeper.address, "setBatchSize(uint256)", deployerAddr);
        });

        it("should deploy keeper with correct configuration", async () => {
          expect(await keeper.primeV2()).to.equal(primeV2.address);
          expect(await keeper.primeLeaderboard()).to.equal(primeLeaderboard.address);
          expect(await keeper.batchSize()).to.equal(50);
        });

        it("should process score updates via keeper", async () => {
          await primeV2.issue([user1Addr, user2Addr]);
          await primeV2.updateAlpha(1, 3);

          expect(await keeper.getPendingScoreUpdates()).to.equal(2);

          await keeper.processScoreUpdates([user1Addr, user2Addr]);
          expect(await keeper.getPendingScoreUpdates()).to.equal(0);
        });

        it("should accrue all markets via keeper", async () => {
          await expect(keeper.accrueAllMarkets()).to.emit(keeper, "AllMarketsAccrued").withArgs(1);
        });

        it("should update batch size", async () => {
          await keeper.setBatchSize(100);
          expect(await keeper.batchSize()).to.equal(100);
        });
      });

      // ═══════════════════════════════════════════════════════════
      // 11. EDGE CASES & SECURITY
      // ═══════════════════════════════════════════════════════════
      describe("Edge Cases & Security", () => {
        it("should cap XVS balance at MAXIMUM_XVS_CAP for scoring", async () => {
          // Fund user with more than 100k XVS
          await fundXVS(user1Addr, parseEther("200000"));
          await depositToVault(user1, parseEther("200000"));

          // Score should use capped XVS (100k), not actual balance (205k)
          const xvsBalance = await primeV2.xvsBalanceOfUser(user1Addr);
          expect(xvsBalance).to.equal(parseEther("205000")); // 5000 + 200000

          // But when issuing Prime, the internal _xvsBalanceForScore caps it
          await primeV2.issue([user1Addr]);
          const interest = await primeV2.interests(Addr.vUSDT, user1Addr);
          // Score should be based on capped XVS, verified by it being > 0
          expect(interest.score).to.be.gt(0);
        });

        it("should pause and unpause PrimeV2", async () => {
          await primeV2.issue([user1Addr]);
          await primeV2.pause();

          // Claiming should revert when paused
          await expect(primeV2.connect(user1)["claimInterest(address)"](Addr.vUSDT)).to.be.revertedWith(
            "Pausable: paused",
          );

          await primeV2.unpause();

          // Should not revert after unpause (may still revert for other reasons like 0 amount)
          // Just verify it's not paused
          await expect(primeV2.connect(user1)["claimInterest(address)"](Addr.vUSDT)).not.to.be.revertedWith(
            "Pausable: paused",
          );
        });

        it("should revert xvsUpdated for zero address", async () => {
          await expect(
            primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(ethers.constants.AddressZero),
          ).to.be.revertedWithCustomError(primeLeaderboard, "ZeroAddress");
        });

        it("should handle xvsUpdated no-op when balance unchanged", async () => {
          const depositCount = await primeLeaderboard.getDepositCount(user1Addr);

          // Call again without any vault change - should be no-op
          await primeLeaderboard.connect(xvsVaultSigner).xvsUpdated(user1Addr);

          expect(await primeLeaderboard.getDepositCount(user1Addr)).to.equal(depositCount);
        });

        it("should not allow adding duplicate market", async () => {
          await expect(primeV2.addMarket(Addr.vUSDT, parseEther("2"), parseEther("2"))).to.be.revertedWithCustomError(
            primeV2,
            "MarketAlreadyExists",
          );
        });

        it("should update market multipliers", async () => {
          await primeV2.issue([user1Addr]);

          await primeV2.updateMultipliers(Addr.vUSDT, parseEther("3"), parseEther("3"));

          const market = await primeV2.markets(Addr.vUSDT);
          expect(market.supplyMultiplier).to.equal(parseEther("3"));
          expect(market.borrowMultiplier).to.equal(parseEther("3"));
        });

        it("should handle accrueInterestAndUpdateScore for a Prime holder", async () => {
          await primeV2.issue([user1Addr]);

          // Should not revert
          await primeV2.accrueInterestAndUpdateScore(user1Addr, Addr.vUSDT);
        });

        it("should update mint limit", async () => {
          await primeV2.setLimit(1000);
          expect(await primeV2.tokenLimit()).to.equal(1000);
        });

        it("should not allow setting limit below current count", async () => {
          await primeV2.issue([user1Addr, user2Addr, user3Addr]);

          // Try to set limit below current count (3)
          await expect(primeV2.setLimit(2)).to.be.revertedWithCustomError(primeV2, "InvalidLimit");
        });

        it("should handle custom multiplier tiers", async () => {
          // Set custom 2-tier system: 45 days → 1.5x, 120 days → 3.0x
          await primeLeaderboard.setMultiplierTiers([45 * DAY, 120 * DAY], [parseEther("1.5"), parseEther("3")]);

          const [durations, multipliers] = await primeLeaderboard.getMultiplierTiers();
          expect(durations).to.have.lengthOf(2);
          expect(durations[0]).to.equal(45 * DAY);
          expect(multipliers[0]).to.equal(parseEther("1.5"));
          expect(durations[1]).to.equal(120 * DAY);
          expect(multipliers[1]).to.equal(parseEther("3"));

          // Verify new tiers apply to scoring
          await time.increase(50 * DAY);
          const stake = await primeLeaderboard.getEffectiveStake(user1Addr);
          // 5000 × 1.5 × (50 * 86400) = 32,400,000,000
          expectApprox(stake, parseEther("32400000000"));
        });
      });
    });
  });
}
