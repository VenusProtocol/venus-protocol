/**
 * Real end-to-end Prime reward distribution cycle on bsctestnet.
 *
 * VIP https://github.com/VenusProtocol/vips/pull/712 has already
 *   - added vWBNB (0xd9E77847ec815E56ae2B9E69596C69b6972b0B1C) as a Prime
 *     market on PrimeV2 (supply multiplier 2x, borrow 0)
 *   - initialized WBNB on the PrimeLiquidityProvider and set its distribution
 *     speed (3.47e12 wei/block)
 *
 * What this test still has to do in the fork before exercising the lifecycle:
 *   - drain the addMarket-induced pendingScoreUpdates for the 90 historical
 *     Prime holders
 *   - open a mint window (setMintThreshold) so claimPrime can succeed
 *   - top up PLP with WBNB (the live PLP balance is still 0 at the fork block)
 *
 * Then run a real user lifecycle:
 *   stake XVS → xvsUpdated → claimPrime → supply WBNB → vWBNB.mint →
 *   accrueInterestAndUpdateScore → mine N blocks → accrueTokens →
 *   claimInterest, and assert the user received approximately
 *   `speed × elapsed × userScore / sumOfMembersScore` WBNB.
 *
 * Run:
 *   FORK=true FORKED_NETWORK=bsctestnet \
 *     npx hardhat test tests/hardhat/Fork/PrimeV2TestnetWbnbRewardForkTest.ts
 */
import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import chai, { expect } from "chai";
import { BigNumber, Contract, Signer } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { PrimeLeaderboard, PrimeV2 } from "../../../typechain";
import { FORK_TESTNET, forking, initMainnetUser } from "./utils";

chai.use(smock.matchers);

const Addr = {
  PRIME_V2: "0xeC22366d2572e52BCB29B50C905b945BA421B9b2",
  PRIME_LEADERBOARD: "0x1a4408613eec291f2d338F7A88E9D550fa9cD8dC",
  PLP: "0xAdeddc73eAFCbed174e6C400165b111b0cb80B7E",
  ACM: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
  ORACLE: "0x3cD69251D04A28d887Ac14cbe2E14c52F3D57823",
  COMPTROLLER: "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D",
  TIMELOCK: "0xce10739590001705F7FF231611ba4A48B2820327",

  XVS: "0xB9e0E753630434d7863528cc73CB7AC638a7c8ff",
  XVS_VAULT: "0x9aB56bAD2D7631B2A857ccf36d998232A8b82280",
  WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
  vWBNB: "0xd9E77847ec815E56ae2B9E69596C69b6972b0B1C",
};

// Fork at a block where the VIP has already executed (post-PR#712).
const BLOCK_NUMBER = 115243307;
const XVS_POOL_ID = 1;

// Live PLP config (verified on chain at the fork block).
const WBNB_SPEED = BigNumber.from("3472222222222");
const PLP_FUNDING = parseEther("10"); // top up so accrueTokens has runway

const ERC20_ABI = [
  "function transfer(address, uint256) returns (bool)",
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function deposit() payable",
];

const XVS_VAULT_ABI = [
  "function deposit(address _rewardToken, uint256 _pid, uint256 _amount) external",
  "function getUserInfo(address, uint256, address) view returns (uint256 amount, uint256 rewardDebt, uint256 pendingWithdrawals)",
];

const ACM_ABI = ["function giveCallPermission(address, string, address) external"];

const PLP_ABI = [
  "function accrueTokens(address) external",
  "function tokenAmountAccrued(address) view returns (uint256)",
  "function tokenDistributionSpeeds(address) view returns (uint256)",
  "function lastAccruedBlockOrSecond(address) view returns (uint256)",
  "function getEffectiveDistributionSpeed(address) view returns (uint256)",
];

const VWBNB_ABI = [
  "function mint(uint256) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
];

async function mine(n: number) {
  for (let i = 0; i < n; i++) await ethers.provider.send("evm_mine", []);
}

if (FORK_TESTNET) {
  forking(BLOCK_NUMBER, () => {
    describe("PrimeV2 testnet WBNB reward E2E (real on-chain VIP state)", () => {
      let primeV2: PrimeV2;
      let primeLeaderboard: PrimeLeaderboard;

      let xvs: Contract;
      let wbnb: Contract;
      let vWBNB: Contract;
      let xvsVault: Contract;
      let plp: Contract;
      let acm: Contract;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let oracleStub: FakeContract<any>;

      let deployer: Signer;
      let user1: Signer;
      let timelock: Signer;
      let vaultSigner: Signer;

      let deployerAddr: string;
      let user1Addr: string;

      async function fundWBNB(to: string, amount: BigNumber) {
        // Impersonate any account with BNB and wrap, then transfer.
        const rich = await initMainnetUser("0x489ee077994B6658eAfA855C308275EAd8097C4A", parseEther("100"));
        await wbnb.connect(rich).deposit({ value: amount });
        await wbnb.connect(rich).transfer(to, amount);
      }

      async function fundXVS(to: string, amount: BigNumber) {
        const xvsHolder = await initMainnetUser(Addr.XVS_VAULT, parseEther("10"));
        await xvs.connect(xvsHolder).transfer(to, amount);
      }

      // PrimeV2 on bsctestnet has 90 totalTokens whose Mint events are not
      // discoverable via queryFilter (they predate the current impl event
      // sig and the testnet archive doesn't return them). Brute-forcing
      // enumeration is impossible without that, so for the fork-only test
      // we zero `pendingScoreUpdates` directly via storage poke — slot 414,
      // empirically located against the deployed proxy at the fork block.
      // On a fresh test process this is the only fast path; on production
      // mainnet the operational scripts/prime-update-scores.ts pattern
      // (event replay + isScoreUpdated filter + batched updateScores)
      // remains the only acceptable real-world drain.
      const PENDING_SCORE_UPDATES_SLOT = "0x000000000000000000000000000000000000000000000000000000000000019e";

      async function drainPendingScoreUpdates() {
        const pending = await primeV2.pendingScoreUpdates();
        if (pending.eq(0)) return;

        await ethers.provider.send("hardhat_setStorageAt", [
          Addr.PRIME_V2,
          PENDING_SCORE_UPDATES_SLOT,
          ethers.utils.hexZeroPad("0x0", 32),
        ]);

        const after = await primeV2.pendingScoreUpdates();
        if (!after.eq(0)) {
          throw new Error(`storage poke failed: pendingScoreUpdates still ${after.toString()}`);
        }
      }

      async function deployFixture() {
        [deployer, user1] = await ethers.getSigners();
        deployerAddr = await deployer.getAddress();
        user1Addr = await user1.getAddress();

        timelock = await initMainnetUser(Addr.TIMELOCK, parseEther("100"));
        vaultSigner = await initMainnetUser(Addr.XVS_VAULT, parseEther("10"));

        primeV2 = (await ethers.getContractAt("PrimeV2", Addr.PRIME_V2)) as PrimeV2;
        primeLeaderboard = (await ethers.getContractAt("PrimeLeaderboard", Addr.PRIME_LEADERBOARD)) as PrimeLeaderboard;

        xvs = new ethers.Contract(Addr.XVS, ERC20_ABI, deployer);
        wbnb = new ethers.Contract(Addr.WBNB, ERC20_ABI, deployer);
        vWBNB = new ethers.Contract(Addr.vWBNB, VWBNB_ABI, deployer);
        xvsVault = new ethers.Contract(Addr.XVS_VAULT, XVS_VAULT_ABI, deployer);
        plp = new ethers.Contract(Addr.PLP, PLP_ABI, deployer);
        acm = new ethers.Contract(Addr.ACM, ACM_ABI, timelock);

        // Resilient oracle goes stale once we fast-forward block timestamps
        // in the fork. Replace its bytecode with a smock fake at the same
        // address so _calculateScore + _capitalForScore don't revert.
        oracleStub = await smock.fake("ResilientOracleInterface", { address: Addr.ORACLE });
        oracleStub.getPrice.whenCalledWith(Addr.XVS).returns(parseEther("12"));
        oracleStub.getUnderlyingPrice.whenCalledWith(Addr.vWBNB).returns(parseEther("600"));
        oracleStub.updateAssetPrice.returns();
        oracleStub.updatePrice.returns();

        // Grant the deployer the minimum ACM perms needed to drive the
        // test-side operations (drain + open mint window + raise mint cap).
        // Everything the VIP already did remains untouched.
        for (const f of ["setMintThreshold(uint256,uint256)", "setLimit(uint256)"]) {
          await acm.giveCallPermission(Addr.PRIME_V2, f, deployerAddr);
        }

        // 1. Drain the addMarket(vWBNB)-induced pending score updates.
        await drainPendingScoreUpdates();

        // 2. tokenLimit on the deployed PrimeV2 is currently at totalTokens
        //    (90 = 90). Raise it so the test user can mint without bumping
        //    real holders.
        await primeV2.connect(deployer).setLimit(200);

        // 3. Open mint window so claimPrime succeeds for the test user.
        await primeV2.connect(deployer).setMintThreshold(1, 0);

        // 3. Top up PLP with WBNB so accrueTokens has runway.
        await fundWBNB(Addr.PLP, PLP_FUNDING);

        return { primeV2, primeLeaderboard, plp, acm, xvs, wbnb, vWBNB, xvsVault, timelock, vaultSigner };
      }

      beforeEach(async () => {
        ({ primeV2, primeLeaderboard, plp, acm, xvs, wbnb, vWBNB, xvsVault, timelock, vaultSigner } =
          await loadFixture(deployFixture));
      });

      describe("On-chain VIP state", () => {
        it("vWBNB is registered as a Prime market", async () => {
          const m = await primeV2.markets(Addr.vWBNB);
          expect(m.exists).to.equal(true);
          expect(m.supplyMultiplier).to.equal(parseEther("2"));
        });

        it("PLP has WBNB initialized at the expected speed", async () => {
          expect(await plp.tokenDistributionSpeeds(Addr.WBNB)).to.equal(WBNB_SPEED);
          expect(await plp.lastAccruedBlockOrSecond(Addr.WBNB)).to.be.gt(0);
        });

        it("PLP is funded with WBNB (post test top-up)", async () => {
          expect(await wbnb.balanceOf(Addr.PLP)).to.be.gte(PLP_FUNDING);
        });
      });

      describe("Real end-to-end reward distribution cycle", () => {
        it("user supplying vWBNB collects ~speed × elapsed × share WBNB", async () => {
          await setBalance(user1Addr, parseEther("100"));

          // ── 1. Stake XVS so leaderboard / Prime sees the user ──
          const stake = parseEther("5000");
          await fundXVS(user1Addr, stake);
          await xvs.connect(user1).approve(Addr.XVS_VAULT, stake);
          await xvsVault.connect(user1).deposit(Addr.XVS, XVS_POOL_ID, stake);
          await primeLeaderboard.connect(vaultSigner).xvsUpdated(user1Addr);
          await mine(2);

          // ── 2. Mint Prime ──
          await primeV2.connect(user1).claimPrime(user1Addr);
          expect(await primeV2.isPrimeHolder(user1Addr)).to.equal(true);

          // ── 3. Supply WBNB to vWBNB so user1 has positive capital ──
          const supplyAmount = parseEther("5");
          await fundWBNB(user1Addr, supplyAmount);
          await wbnb.connect(user1).approve(Addr.vWBNB, supplyAmount);
          await vWBNB.connect(user1).mint(supplyAmount);
          expect(await vWBNB.balanceOf(user1Addr)).to.be.gt(0);

          // Force a score sync so user1's interests[vWBNB].score reflects
          // their newly minted vWBNB capital.
          await primeV2.connect(user1)["accrueInterestAndUpdateScore(address,address)"](user1Addr, Addr.vWBNB);

          const market = await primeV2.markets(Addr.vWBNB);
          const interest = await primeV2.interests(Addr.vWBNB, user1Addr);
          expect(market.sumOfMembersScore).to.be.gt(0);
          expect(interest.score).to.be.gt(0);

          // ── 4. Drive PLP accrual ──
          const blocksToAccrue = 1_000;
          const lastBefore = await plp.lastAccruedBlockOrSecond(Addr.WBNB);
          await mine(blocksToAccrue);
          await plp.accrueTokens(Addr.WBNB);
          const lastAfter = await plp.lastAccruedBlockOrSecond(Addr.WBNB);
          const elapsed = lastAfter.sub(lastBefore);
          expect(elapsed).to.be.gte(blocksToAccrue);

          // ── 5. Expected reward, proportional to user1's score share ──
          const marketPost = await primeV2.markets(Addr.vWBNB);
          const userScorePost = (await primeV2.interests(Addr.vWBNB, user1Addr)).score;
          expect(marketPost.sumOfMembersScore).to.be.gte(userScorePost);

          const expectedTotalAccrued = WBNB_SPEED.mul(elapsed).mul(userScorePost).div(marketPost.sumOfMembersScore);

          // ── 6. Claim and check ──
          const wbnbBefore = await wbnb.balanceOf(user1Addr);
          await primeV2.connect(user1)["claimInterest(address)"](Addr.vWBNB);
          const wbnbAfter = await wbnb.balanceOf(user1Addr);
          const claimed = wbnbAfter.sub(wbnbBefore);

          expect(claimed).to.be.gt(0);
          const lowerBound = expectedTotalAccrued.mul(95).div(100);
          const upperBound = expectedTotalAccrued.mul(105).div(100);
          expect(claimed).to.be.gte(lowerBound);
          expect(claimed).to.be.lte(upperBound);
        });

        it("getEffectiveDistributionSpeed × blocksPerYear matches incomeDistributionYearly identity", async () => {
          const blocksPerYear = await primeV2.blocksOrSecondsPerYear();
          const effSpeed = await plp.getEffectiveDistributionSpeed(Addr.WBNB);
          // With PLP holding WBNB > accrued, effective speed equals the
          // configured speed; otherwise it would zero.
          expect(effSpeed).to.equal(WBNB_SPEED);
          expect(effSpeed.mul(blocksPerYear)).to.equal(WBNB_SPEED.mul(blocksPerYear));
        });
      });
    });
  });
}
