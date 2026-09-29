/**
 * PrimeV2 24-decimal underlying fork tests (VPD-1982)
 *
 * Upgrades the live PrimeV2 proxy on a BSC mainnet fork and registers vvhUSDT, whose
 * underlying vhUSDT has 24 decimals, against real Comptroller, oracle, XVSVault and
 * PrimeLiquidityProvider state.
 *
 * Run:
 *   FORKED_NETWORK=bscmainnet npx hardhat test tests/hardhat/Fork/PrimeV2DecimalsForkTest.ts
 */
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract, Signer } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { PrimeLens, PrimeV2 } from "../../../typechain";
import { FORK_MAINNET, forking, initMainnetUser, setForkBlock } from "./utils";

const Addr = {
  COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
  PRIME_V2: "0x059EabA8676b03e4e8f009eFb7F587C28450F50f",
  PRIME_V2_PROXY_ADMIN: "0x1bb765b741a5f3c2a338369dab539385534e3343",
  PLP: "0x23c4F844ffDdC6161174eB32c770D4D8C07833F2",
  ORACLE: "0x6592b5DE802159F3E74B2486b091D11a8256ab8A",
  ACM: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
  XVS_VAULT: "0x051100480289e704d20e9DB4804837068f3f9204",
  XVS_STORE: "0x1e25CF968f12850003Db17E0Dba32108509C4359",
  XVS: "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63",
  WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  vBNB: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  vUSDT: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
  vWBNB: "0x6bCa74586218dB34cdB402295796b79663d816e9",
  vhUSDT: "0x18AfDACF30F8671021dec4b78297E39d2FE87226",
  vvhUSDT: "0xc0768948e668B7BacFf8b4BD1BaBe0eD2b512d3c",
};

const BLOCK_NUMBER = 120600000;
const BLOCKS_PER_YEAR = 70080000;
const XVS_POOL_ID = 0;
const SUPPLY_MULTIPLIER = parseEther("2");
// Borrowing is disabled on the Hub receipt markets, so the VIP will list them borrow-side zero.
const BORROW_MULTIPLIER = BigNumber.from(0);

const ERC20_ABI = [
  "function transfer(address, uint256) returns (bool)",
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const VTOKEN_ABI = [
  "function mint(uint256) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function underlying() view returns (address)",
];
const ACM_ABI = ["function giveCallPermission(address, string, address) external"];
const WBNB_ABI = ["function deposit() payable", "function approve(address, uint256) returns (bool)"];
const PROXY_ADMIN_ABI = [
  "function upgrade(address, address) external",
  "function getProxyImplementation(address) view returns (address)",
];
const ORACLE_ABI = ["function getUnderlyingPrice(address) view returns (uint256)"];
const PLP_ABI = [
  "function initializeTokens(address[]) external",
  "function lastAccruedBlockOrSecond(address) view returns (uint256)",
];
const XVS_VAULT_ABI = [
  "function deposit(address, uint256, uint256) external",
  "function requestWithdrawal(address, uint256, uint256) external",
];

if (FORK_MAINNET) {
  forking(BLOCK_NUMBER, () => {
    describe("PrimeV2 - 24 decimal underlying (vvhUSDT)", () => {
      let primeV2: PrimeV2;
      let lens: PrimeLens;
      let timelock: Signer;
      let acm: Contract;
      let proxyAdmin: Contract;
      let oracle: Contract;
      let vhUSDT: Contract;
      let vvhUSDT: Contract;
      let vUSDT: Contract;
      let usdt: Contract;
      let xvs: Contract;
      let xvsVault: Contract;
      let plp: Contract;
      let user1: Signer;
      let user1Addr: string;
      let newImpl: string;

      const PERMS = [
        "issue(address)",
        "burn(address)",
        "issueBatch(address[])",
        "addMarket(address,uint256,uint256)",
        "removeMarket(address)",
        "updateAlpha(uint128,uint128)",
        "setLimit(uint256)",
      ];

      /** Attach contracts and grant the deployer the ACM permissions the tests need. */
      async function baseSetup() {
        const signers = await ethers.getSigners();
        const deployer = signers[0];
        user1 = signers[1];
        user1Addr = await user1.getAddress();

        timelock = await initMainnetUser(Addr.TIMELOCK, parseEther("100"));

        primeV2 = (await ethers.getContractAt("PrimeV2", Addr.PRIME_V2)) as PrimeV2;
        acm = new ethers.Contract(Addr.ACM, ACM_ABI, timelock);
        proxyAdmin = new ethers.Contract(Addr.PRIME_V2_PROXY_ADMIN, PROXY_ADMIN_ABI, timelock);
        oracle = new ethers.Contract(Addr.ORACLE, ORACLE_ABI, deployer);
        vhUSDT = new ethers.Contract(Addr.vhUSDT, ERC20_ABI, deployer);
        vvhUSDT = new ethers.Contract(Addr.vvhUSDT, VTOKEN_ABI, deployer);
        vUSDT = new ethers.Contract(Addr.vUSDT, VTOKEN_ABI, deployer);
        usdt = new ethers.Contract(Addr.USDT, ERC20_ABI, deployer);
        xvs = new ethers.Contract(Addr.XVS, ERC20_ABI, deployer);
        xvsVault = new ethers.Contract(Addr.XVS_VAULT, XVS_VAULT_ABI, deployer);
        plp = new ethers.Contract(Addr.PLP, PLP_ABI, timelock);

        const deployerAddr = await deployer.getAddress();
        for (const f of PERMS) {
          await acm.giveCallPermission(Addr.PRIME_V2, f, deployerAddr);
        }

        // The live mint cap sits at the current holder count, so make room for the test users.
        await primeV2.setLimit((await primeV2.totalTokens()).add(10));
      }

      /** Deploy the fixed implementation with the live immutables. */
      async function deployNewImplementation(): Promise<string> {
        const factory = await ethers.getContractFactory("PrimeV2");
        const impl = await factory.deploy(
          Addr.WBNB,
          Addr.vBNB,
          Addr.XVS_VAULT,
          Addr.XVS,
          XVS_POOL_ID,
          false,
          BLOCKS_PER_YEAR,
        );
        await impl.deployed();
        return impl.address;
      }

      async function preUpgradeSetup() {
        await setForkBlock(BLOCK_NUMBER);
        await baseSetup();
        newImpl = await deployNewImplementation();
      }

      async function upgradedSetup() {
        await setForkBlock(BLOCK_NUMBER);
        await baseSetup();
        newImpl = await deployNewImplementation();
        await proxyAdmin.upgrade(Addr.PRIME_V2, newImpl);

        const LensFactory = await ethers.getContractFactory("PrimeLens");
        lens = (await LensFactory.deploy(Addr.PRIME_V2)) as PrimeLens;
        await lens.deployed();
      }

      /** Move vhUSDT out of the vvhUSDT market's own cash to fund a test account. */
      async function fundVhUSDT(to: string, amount: BigNumber) {
        const whale = await initMainnetUser(Addr.vvhUSDT, parseEther("1"));
        await vhUSDT.connect(whale).transfer(to, amount);
      }

      async function fundUSDT(to: string, amount: BigNumber) {
        const whale = await initMainnetUser(Addr.vUSDT, parseEther("1"));
        await usdt.connect(whale).transfer(to, amount);
      }

      async function fundXVS(to: string, amount: BigNumber) {
        const store = await initMainnetUser(Addr.XVS_STORE, parseEther("1"));
        await xvs.connect(store).transfer(to, amount);
      }

      describe("live implementation, before the fix", () => {
        beforeEach(async () => {
          await preUpgradeSetup();
        });

        it("rejects the 24-decimal market with UnsupportedUnderlyingDecimals", async () => {
          await expect(
            primeV2.addMarket(Addr.vvhUSDT, SUPPLY_MULTIPLIER, BORROW_MULTIPLIER),
          ).to.be.revertedWithCustomError(primeV2, "UnsupportedUnderlyingDecimals");
        });

        it("confirms the underlying really is 24 decimals and priced by the live oracle", async () => {
          expect(await vhUSDT.decimals()).to.equal(24);

          // Venus scales underlying prices to 36 - decimals, so a ~$1 asset at 24 decimals
          // lands near 1e12 rather than the 1e18 an 18-decimal asset would report.
          const vhPrice = await oracle.getUnderlyingPrice(Addr.vvhUSDT);
          expect(vhPrice).to.be.gt(parseUnits("0.9", 12));
          expect(vhPrice).to.be.lt(parseUnits("1.1", 12));

          const usdtPrice = await oracle.getUnderlyingPrice(Addr.vUSDT);
          expect(usdtPrice).to.be.gt(parseUnits("0.9", 18));
        });
      });

      describe("upgrade regression on the existing 18-decimal markets", () => {
        beforeEach(async () => {
          await preUpgradeSetup();
        });

        it("computes identical scores on every existing market before and after the upgrade", async () => {
          await fundXVS(user1Addr, parseEther("10000"));
          await xvs.connect(user1).approve(Addr.XVS_VAULT, parseEther("10000"));
          await xvsVault.connect(user1).deposit(Addr.XVS, XVS_POOL_ID, parseEther("10000"));

          await fundUSDT(user1Addr, parseUnits("5000", 18));
          await usdt.connect(user1).approve(Addr.vUSDT, parseUnits("5000", 18));
          await vUSDT.connect(user1).mint(parseUnits("5000", 18));

          // Take a WBNB position too, so more than one existing market carries a real score.
          await setBalance(user1Addr, parseEther("100"));
          const wbnb = new ethers.Contract(Addr.WBNB, WBNB_ABI, user1);
          const vWBNB = new ethers.Contract(Addr.vWBNB, VTOKEN_ABI, user1);
          await wbnb.deposit({ value: parseEther("10") });
          await wbnb.approve(Addr.vWBNB, parseEther("10"));
          await vWBNB.mint(parseEther("10"));

          // Scored by the live implementation, before any upgrade.
          await primeV2["issue(address)"](user1Addr);

          const markets = await primeV2.getAllMarkets();
          const before: Record<string, BigNumber> = {};
          for (const m of markets) {
            before[m] = (await primeV2.interests(m, user1Addr)).score;
          }
          expect(before[Addr.vUSDT]).to.be.gt(0);
          expect(before[Addr.vWBNB]).to.be.gt(0);

          await proxyAdmin.upgrade(Addr.PRIME_V2, newImpl);

          // Recompute the same scores through the fixed implementation.
          for (const m of markets) {
            await primeV2["accrueInterestAndUpdateScore(address,address)"](user1Addr, m);
            expect((await primeV2.interests(m, user1Addr)).score).to.equal(before[m]);
          }
        });

        it("leaves the aggregate score of each existing market untouched by the upgrade", async () => {
          const markets = await primeV2.getAllMarkets();
          const before: Record<string, BigNumber> = {};
          for (const m of markets) {
            before[m] = (await primeV2.markets(m)).sumOfMembersScore;
          }

          await proxyAdmin.upgrade(Addr.PRIME_V2, newImpl);

          for (const m of markets) {
            expect((await primeV2.markets(m)).sumOfMembersScore).to.equal(before[m]);
            expect(before[m]).to.be.gt(0);
          }
        });
      });

      describe("after upgrading the live proxy", () => {
        beforeEach(async () => {
          await upgradedSetup();
        });

        it("preserves existing markets, holders and alpha across the upgrade", async () => {
          expect(await proxyAdmin.getProxyImplementation(Addr.PRIME_V2)).to.equal(newImpl);

          const markets = await primeV2.getAllMarkets();
          expect(markets).to.deep.equal([
            Addr.vUSDT,
            "0x6bCa74586218dB34cdB402295796b79663d816e9",
            "0x3d5E269787d562b74aCC55F18Bd26C5D09Fa245E",
          ]);
          expect(await primeV2.totalTokens()).to.equal(500);
          expect(await primeV2.alphaNumerator()).to.equal(1);
          expect(await primeV2.alphaDenominator()).to.equal(2);
        });

        it("registers the 24-decimal market", async () => {
          await expect(primeV2.addMarket(Addr.vvhUSDT, SUPPLY_MULTIPLIER, BORROW_MULTIPLIER)).to.not.be.reverted;

          const market = await primeV2.markets(Addr.vvhUSDT);
          expect(market.exists).to.equal(true);
          expect(market.supplyMultiplier).to.equal(SUPPLY_MULTIPLIER);
          expect(await primeV2.getAllMarkets()).to.have.lengthOf(4);
        });

        it("queues a score update round for every existing holder when the market is added", async () => {
          expect(await primeV2.pendingScoreUpdates()).to.equal(0);
          await primeV2.addMarket(Addr.vvhUSDT, SUPPLY_MULTIPLIER, BORROW_MULTIPLIER);
          expect(await primeV2.pendingScoreUpdates()).to.equal(500);
        });

        it("still rejects an underlying above the 24 decimal ceiling", async () => {
          // No listed Core market has a wider underlying, so the ceiling itself is covered
          // by the unit tests. Here we only confirm 24 is admitted rather than merely tolerated.
          const decimals = await vhUSDT.decimals();
          expect(decimals).to.equal(24);
          await expect(primeV2.addMarket(Addr.vvhUSDT, SUPPLY_MULTIPLIER, BORROW_MULTIPLIER)).to.not.be.reverted;
        });

        describe("market added before the PLP knows the reward token", () => {
          let plpTyped: Contract;

          beforeEach(async () => {
            plpTyped = await ethers.getContractAt("PrimeLiquidityProvider", Addr.PLP);

            await fundXVS(user1Addr, parseEther("10000"));
            await xvs.connect(user1).approve(Addr.XVS_VAULT, parseEther("10000"));
            await xvsVault.connect(user1).deposit(Addr.XVS, XVS_POOL_ID, parseEther("10000"));
            await primeV2["issue(address)"](user1Addr);

            // Deliberately skip plp.initializeTokens([vhUSDT]) to model the VIP running
            // addMarket first.
            await primeV2.addMarket(Addr.vvhUSDT, SUPPLY_MULTIPLIER, BORROW_MULTIPLIER);
          });

          it("makes updateScores revert, so the queued round can never finish", async () => {
            await expect(primeV2.updateScores([user1Addr]))
              .to.be.revertedWithCustomError(plpTyped, "TokenNotInitialized")
              .withArgs(Addr.vhUSDT);
          });

          it("makes removeMarket revert, so the market cannot simply be withdrawn", async () => {
            expect((await primeV2.markets(Addr.vvhUSDT)).sumOfMembersScore).to.equal(0);

            await expect(primeV2.removeMarket(Addr.vvhUSDT))
              .to.be.revertedWithCustomError(plpTyped, "TokenNotInitialized")
              .withArgs(Addr.vhUSDT);
          });

          it("breaks XVSVault staking for an existing Prime holder", async () => {
            await fundXVS(user1Addr, parseEther("100"));
            await xvs.connect(user1).approve(Addr.XVS_VAULT, parseEther("100"));

            await expect(xvsVault.connect(user1).deposit(Addr.XVS, XVS_POOL_ID, parseEther("100"))).to.be.reverted;
          });

          it("recovers once the PLP initialises the token", async () => {
            const pendingBefore = await primeV2.pendingScoreUpdates();

            await plp.initializeTokens([Addr.vhUSDT]);

            await expect(primeV2.updateScores([user1Addr])).to.not.be.reverted;
            expect(await primeV2.pendingScoreUpdates()).to.equal(pendingBefore.sub(1));
          });
        });

        describe("with the 24-decimal market registered and a Prime holder", () => {
          beforeEach(async () => {
            await fundXVS(user1Addr, parseEther("10000"));
            await xvs.connect(user1).approve(Addr.XVS_VAULT, parseEther("10000"));
            await xvsVault.connect(user1).deposit(Addr.XVS, XVS_POOL_ID, parseEther("10000"));

            // Issue before addMarket: issue() is blocked while a score round is pending.
            await primeV2["issue(address)"](user1Addr);

            await fundVhUSDT(user1Addr, parseUnits("1000", 24));
            await vhUSDT.connect(user1).approve(Addr.vvhUSDT, parseUnits("1000", 24));
            await vvhUSDT.connect(user1).mint(parseUnits("1000", 24));

            await fundUSDT(user1Addr, parseUnits("1000", 18));
            await usdt.connect(user1).approve(Addr.vUSDT, parseUnits("1000", 18));
            await vUSDT.connect(user1).mint(parseUnits("1000", 18));

            // The PLP must know the reward token before the market is scored: PrimeV2.accrueInterest
            // calls PLP.accrueTokens(underlying), which reverts for an uninitialised token.
            await plp.initializeTokens([Addr.vhUSDT]);

            await primeV2.addMarket(Addr.vvhUSDT, SUPPLY_MULTIPLIER, BORROW_MULTIPLIER);
          });

          it("scores the holder on the 24-decimal market without reverting", async () => {
            await expect(primeV2.updateScores([user1Addr])).to.not.be.reverted;

            const interest = await primeV2.interests(Addr.vvhUSDT, user1Addr);
            expect(interest.score).to.be.gt(0);
          });

          it("scores 1000 vhUSDT within 2% of 1000 USDT, so the normalisation is right", async () => {
            await primeV2.updateScores([user1Addr]);

            const vhScore = (await primeV2.interests(Addr.vvhUSDT, user1Addr)).score;
            const usdtScore = (await primeV2.interests(Addr.vUSDT, user1Addr)).score;

            expect(vhScore).to.be.gt(0);
            expect(usdtScore).to.be.gt(0);

            const diff = vhScore.sub(usdtScore).abs();
            expect(diff.mul(100).div(usdtScore)).to.be.lte(2);
          });

          it("lets the Comptroller mint hook run on the 24-decimal market", async () => {
            await fundVhUSDT(user1Addr, parseUnits("10", 24));
            await vhUSDT.connect(user1).approve(Addr.vvhUSDT, parseUnits("10", 24));

            // mint() calls Comptroller.mintVerify, which calls
            // PrimeV2.accrueInterestAndUpdateScore for a Prime holder.
            await expect(vvhUSDT.connect(user1).mint(parseUnits("10", 24))).to.not.be.reverted;
          });

          it("lets XVSVault stake and unstake run with the market registered", async () => {
            await fundXVS(user1Addr, parseEther("100"));
            await xvs.connect(user1).approve(Addr.XVS_VAULT, parseEther("100"));

            await expect(xvsVault.connect(user1).deposit(Addr.XVS, XVS_POOL_ID, parseEther("100"))).to.not.be.reverted;
            await expect(xvsVault.connect(user1).requestWithdrawal(Addr.XVS, XVS_POOL_ID, parseEther("50"))).to.not.be
              .reverted;
          });

          it("does not revert for a holder with no position in the 24-decimal market", async () => {
            const other = (await ethers.getSigners())[2];
            const otherAddr = await other.getAddress();

            await expect(primeV2["accrueInterestAndUpdateScore(address,address)"](otherAddr, Addr.vvhUSDT)).to.not.be
              .reverted;
          });

          it("reports a non-zero APR score through PrimeLens matching the stored score", async () => {
            await primeV2.updateScores([user1Addr]);

            const stored = (await primeV2.interests(Addr.vvhUSDT, user1Addr)).score;
            const supply = await vvhUSDT.balanceOf(user1Addr);
            const rate = await vvhUSDT.exchangeRateStored();
            const underlyingSupply = supply.mul(rate).div(parseEther("1"));

            const aprInfo = await lens.estimateAPR(Addr.vvhUSDT, user1Addr, 0, underlyingSupply, parseEther("10000"));

            expect(aprInfo.userScore).to.be.gt(0);
            const diff = aprInfo.userScore.sub(stored).abs();
            expect(diff.mul(100).div(stored)).to.be.lte(1);
          });
        });
      });
    });
  });
}
