/**
 * PrimeLens Fork Tests (BSC Testnet)
 *
 * Deploys fresh PrimeV2 + PrimeLeaderboard + PrimeLens against bsctestnet's
 * real protocol infrastructure (Comptroller, Oracle, XVSVault, PLP, ACM) and
 * verifies the three view helpers (`calculateAPR`, `estimateAPR`,
 * `incomeDistributionYearly`) compute the expected outputs.
 *
 * Run:
 *   FORK=true FORKED_NETWORK=bsctestnet npx hardhat test tests/hardhat/Fork/PrimeLensForkTest.ts
 */
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { PrimeLeaderboard, PrimeLens, PrimeV2 } from "../../../typechain";
import { FORK_TESTNET, forking, initMainnetUser } from "./utils";

// ═══════════════════ BSC TESTNET ADDRESSES ═══════════════════
const Addr = {
  COMPTROLLER: "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D",
  // XVS vault used by the existing PrimeV2 testnet deployment (block-based vault).
  XVS_VAULT: "0x9aB56bAD2D7631B2A857ccf36d998232A8b82280",
  ORACLE: "0x3cD69251D04A28d887Ac14cbe2E14c52F3D57823",
  ACM: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
  PLP: "0xAdeddc73eAFCbed174e6C400165b111b0cb80B7E",
  XVS: "0xB9e0E753630434d7863528cc73CB7AC638a7c8ff",
  USDT: "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c",
  vUSDT: "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A",
  WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
  vBNB: "0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c",
};

const BLOCK_NUMBER = 115033000;
// Block-based config (matches existing testnet PrimeV2 deployment).
const TIME_BASED = false;
const BLOCKS_PER_YEAR = 70080000;
const MINIMUM_STAKE = parseEther("100");
const XVS_POOL_ID = 1; // testnet XVS pool used by existing PrimeV2 deployment

const ACM_ABI = ["function giveCallPermission(address, string, address) external"];

if (FORK_TESTNET) {
  forking(BLOCK_NUMBER, () => {
    describe("PrimeLens Fork Tests (bsctestnet)", () => {
      let primeV2: PrimeV2;
      let primeLeaderboard: PrimeLeaderboard;
      let lens: PrimeLens;
      let deployer: Signer;
      let deployerAddr: string;

      async function deployFixture() {
        [deployer] = await ethers.getSigners();
        deployerAddr = await deployer.getAddress();

        // Impersonate ACM admin so we can grant ourselves call permissions.
        // bsctestnet ACM admin is the deployer EOA used by Venus, but for the
        // fork we impersonate the timelock or whoever owns ACM. Easiest path:
        // find the ACM owner from a storage slot or just impersonate a known
        // permissioned address. For bsctestnet we use a known dev address.
        const acmAdmin = await initMainnetUser(
          "0xce10739590001705F7FF231611ba4A48B2820327", // testnet normal timelock
          parseEther("10"),
        );
        const acm = new ethers.Contract(Addr.ACM, ACM_ABI, acmAdmin);

        // ── Deploy PrimeLeaderboard ──
        const LeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");
        primeLeaderboard = (await upgrades.deployProxy(LeaderboardFactory, [Addr.ACM, MINIMUM_STAKE], {
          unsafeAllow: ["constructor", "state-variable-immutable"],
          constructorArgs: [Addr.XVS_VAULT, Addr.XVS, XVS_POOL_ID],
        })) as PrimeLeaderboard;

        // ── Deploy PrimeV2 ──
        const PrimeV2Factory = await ethers.getContractFactory("PrimeV2");
        primeV2 = (await upgrades.deployProxy(
          PrimeV2Factory,
          [1, 2, Addr.ACM, Addr.PLP, Addr.COMPTROLLER, Addr.ORACLE, 100],
          {
            constructorArgs: [Addr.WBNB, Addr.vBNB, Addr.XVS_VAULT, Addr.XVS, XVS_POOL_ID, TIME_BASED, BLOCKS_PER_YEAR],
            unsafeAllow: ["constructor", "state-variable-immutable", "internal-function-storage"],
          },
        )) as PrimeV2;

        // ── Grant permissions ──
        const primePerms = [
          "issue(address)",
          "burn(address)",
          "issueBatch(address[])",
          "addMarket(address,uint256,uint256)",
          "updateMultipliers(address,uint256,uint256)",
          "setPrimeLeaderboard(address)",
          "setMintThreshold(uint256,uint256)",
          "setLimit(uint256)",
        ];
        const leaderboardPerms = ["setPrimeV2(address)", "setMultiplierTiers(uint256[],uint256[])"];

        for (const f of primePerms) {
          await acm.giveCallPermission(primeV2.address, f, deployerAddr);
        }
        for (const f of leaderboardPerms) {
          await acm.giveCallPermission(primeLeaderboard.address, f, deployerAddr);
        }

        // ── Wire ──
        await primeLeaderboard.setPrimeV2(primeV2.address);
        await primeV2.setPrimeLeaderboard(primeLeaderboard.address);
        await primeV2.addMarket(Addr.vUSDT, parseEther("2"), parseEther("2"));

        // ── Deploy lens against fresh PrimeV2 ──
        const PrimeLensFactory = await ethers.getContractFactory("PrimeLens");
        lens = (await PrimeLensFactory.deploy(primeV2.address)) as PrimeLens;
        await lens.deployed();

        return { primeV2, primeLeaderboard, lens, deployer, deployerAddr };
      }

      beforeEach(async () => {
        ({ primeV2, primeLeaderboard, lens, deployer, deployerAddr } = await loadFixture(deployFixture));
      });

      describe("deployment", () => {
        it("lens points at the deployed PrimeV2 proxy", async () => {
          expect(await lens.primeV2()).to.equal(primeV2.address);
        });

        it("constructor rejects zero PrimeV2 address", async () => {
          const PrimeLensFactory = await ethers.getContractFactory("PrimeLens");
          await expect(PrimeLensFactory.deploy(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
            PrimeLensFactory,
            "InvalidAddress",
          );
        });
      });

      describe("incomeDistributionYearly", () => {
        it("returns blocksOrSecondsPerYear * PLP.getEffectiveDistributionSpeed(underlying)", async () => {
          const plp = new ethers.Contract(
            Addr.PLP,
            ["function getEffectiveDistributionSpeed(address) view returns (uint256)"],
            deployer,
          );
          const blocksPerYear = await primeV2.blocksOrSecondsPerYear();
          const speed: BigNumber = await plp.getEffectiveDistributionSpeed(Addr.USDT);
          const expected = blocksPerYear.mul(speed);

          const actual = await lens.incomeDistributionYearly(Addr.vUSDT);
          expect(actual).to.equal(expected);
        });

        it("resolves vBNB (NATIVE_MARKET) to WBNB (WRAPPED_NATIVE_TOKEN) when querying PLP", async () => {
          const plp = new ethers.Contract(
            Addr.PLP,
            ["function getEffectiveDistributionSpeed(address) view returns (uint256)"],
            deployer,
          );
          const blocksPerYear = await primeV2.blocksOrSecondsPerYear();
          const speed: BigNumber = await plp.getEffectiveDistributionSpeed(Addr.WBNB);
          const expected = blocksPerYear.mul(speed);

          const actual = await lens.incomeDistributionYearly(Addr.vBNB);
          expect(actual).to.equal(expected);
        });
      });

      describe("calculateAPR", () => {
        it("mirrors PrimeV2's stored score state exactly", async () => {
          const probe = "0x000000000000000000000000000000000000dEaD";

          const aprInfo = await lens.calculateAPR(Addr.vUSDT, probe);
          const onChainInterest = await primeV2.interests(Addr.vUSDT, probe);
          const onChainMarket = await primeV2.markets(Addr.vUSDT);
          const xvs = await primeV2.xvsBalanceOfUser(probe);

          expect(aprInfo.userScore).to.equal(onChainInterest.score);
          expect(aprInfo.totalScore).to.equal(onChainMarket.sumOfMembersScore);
          expect(aprInfo.xvsBalanceForScore).to.equal(xvs);
        });

        it("capital = cappedSupply + cappedBorrow identity holds", async () => {
          const aprInfo = await lens.calculateAPR(Addr.vUSDT, "0x000000000000000000000000000000000000dEaD");
          expect(aprInfo.capital).to.equal(aprInfo.cappedSupply.add(aprInfo.cappedBorrow));
        });

        it("APRs are zero for an address with no Prime status (no score)", async () => {
          const aprInfo = await lens.calculateAPR(Addr.vUSDT, "0x000000000000000000000000000000000000dEaD");
          expect(aprInfo.supplyAPR).to.equal(0);
          expect(aprInfo.borrowAPR).to.equal(0);
        });
      });

      describe("estimateAPR", () => {
        it("xvsBalanceForScore equals the passed xvsStaked", async () => {
          const xvsStaked = parseEther("1234");
          const aprInfo = await lens.estimateAPR(
            Addr.vUSDT,
            "0x000000000000000000000000000000000000dEaD",
            parseEther("500"),
            parseEther("2000"),
            xvsStaked,
          );

          expect(aprInfo.xvsBalanceForScore).to.equal(xvsStaked);
        });

        it("hypothetical user contributes to totalScore (totalScore >= userScore)", async () => {
          const aprInfo = await lens.estimateAPR(
            Addr.vUSDT,
            "0x000000000000000000000000000000000000dEaD",
            parseEther("100"),
            parseEther("200"),
            parseEther("500"),
          );

          expect(aprInfo.totalScore).to.be.gte(aprInfo.userScore);
        });

        it("APRs are zero when hypothetical supply and borrow are both zero", async () => {
          const aprInfo = await lens.estimateAPR(
            Addr.vUSDT,
            "0x000000000000000000000000000000000000dEaD",
            0,
            0,
            parseEther("500"),
          );

          expect(aprInfo.supplyAPR).to.equal(0);
          expect(aprInfo.borrowAPR).to.equal(0);
        });
      });
    });
  });
}
