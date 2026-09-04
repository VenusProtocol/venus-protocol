import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { PrimeLens } from "../../../typechain";
import {
  IntegrationFixture,
  deployIntegrationFixture,
  simulateVaultDeposit,
  simulateVaultWithdrawal,
} from "./helpers/integrationFixture";

const { expect } = chai;
chai.use(smock.matchers);

const MULTIPLIER = convertToUnit(2, 18);
const XVS_STAKE = convertToUnit(1000, 18);

// Decimals covered by the parameterised cases. 24 is the Venus Hub receipt tokens
// (vhUSDT, vhUSDC, vhU); the rest are the common ERC20 widths.
const DECIMALS = [6, 8, 18, 24];

interface Market {
  vToken: FakeContract<Contract>;
  underlying: FakeContract<Contract>;
  decimals: number;
}

/**
 * Registers a Prime market whose underlying reports `decimals`.
 *
 * The vToken is faked with an exchange rate of 1e18 so that the supply PrimeV2 derives
 * equals the balance set on it, which keeps the balances in each test readable. The
 * oracle price is scaled to 36 - decimals, matching what the Venus resilient oracle
 * returns, so that the USD supply cap compares against the right magnitude.
 */
async function addMarketWithDecimals(f: IntegrationFixture, decimals: number): Promise<Market> {
  const underlying = await smock.fake(
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol:IERC20MetadataUpgradeable",
  );
  underlying.decimals.returns(decimals);

  const vToken = await smock.fake("contracts/Tokens/Prime/Interfaces/IVToken.sol:IVToken");
  vToken.underlying.returns(underlying.address);
  vToken.borrowBalanceStored.returns(0);
  vToken.exchangeRateStored.returns(convertToUnit(1, 18));
  vToken.balanceOf.returns(0);

  f.oracle.getUnderlyingPrice.whenCalledWith(vToken.address).returns(convertToUnit(1, 36 - decimals));

  await f.primeV2.addMarket(vToken.address, MULTIPLIER, MULTIPLIER);

  return { vToken, underlying, decimals };
}

describe("PrimeV2 - underlyings with more than 18 decimals", () => {
  let f: IntegrationFixture;
  let user1Address: string;
  let user2Address: string;

  beforeEach(async () => {
    f = await loadFixture(deployIntegrationFixture);
    f.accessControlManager.isAllowedToCall.returns(true);
    f.primeLiquidityProvider.tokenAmountAccrued.returns(0);

    user1Address = await f.user1.getAddress();
    user2Address = await f.user2.getAddress();

    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([XVS_STAKE, 0, 0]);
    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user2Address).returns([XVS_STAKE, 0, 0]);
  });

  describe("score arithmetic", () => {
    it("normalises capital to 18 decimals, so equal value scores equally at 6, 8, 18 and 24 decimals", async () => {
      const markets: Market[] = [];
      for (const decimals of DECIMALS) {
        const market = await addMarketWithDecimals(f, decimals);
        // 1000 tokens in each market, so every market holds the same USD value.
        market.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, decimals));
        markets.push(market);
      }

      await f.primeV2["issue(address)"](user1Address);

      const scores = [];
      for (const market of markets) {
        const interest = await f.primeV2.interests(market.vToken.address, user1Address);
        scores.push(interest.score);
      }

      expect(scores[0]).to.be.gt(0);
      for (const score of scores) {
        expect(score).to.equal(scores[0]);
      }
    });

    it("scores a 24-decimal market equal to an 18-decimal market holding the same value", async () => {
      const wide = await addMarketWithDecimals(f, 24);
      const standard = await addMarketWithDecimals(f, 18);

      wide.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 24));
      standard.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));

      await f.primeV2["issue(address)"](user1Address);

      const wideScore = (await f.primeV2.interests(wide.vToken.address, user1Address)).score;
      const standardScore = (await f.primeV2.interests(standard.vToken.address, user1Address)).score;

      expect(wideScore).to.be.gt(0);
      expect(wideScore).to.equal(standardScore);
    });

    it("applies the supply cap before normalising, so a capped 24-decimal position matches 18 decimals", async () => {
      const wide = await addMarketWithDecimals(f, 24);
      const standard = await addMarketWithDecimals(f, 18);

      // supplyCapUSD is 6000e18 here (xvsPrice 3e18 * stake 1000e18 * multiplier 2e18 / 1e36),
      // so a 100000 token supply is capped in both markets.
      wide.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(100000, 24));
      standard.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(100000, 18));

      await f.primeV2["issue(address)"](user1Address);

      const wideScore = (await f.primeV2.interests(wide.vToken.address, user1Address)).score;
      const standardScore = (await f.primeV2.interests(standard.vToken.address, user1Address)).score;

      expect(wideScore).to.be.gt(0);
      expect(wideScore).to.equal(standardScore);
    });

    it("truncates a 24-decimal position smaller than one 18-decimal unit to a zero score", async () => {
      const wide = await addMarketWithDecimals(f, 24);

      // 999999 raw units is below 1e6, the smallest amount that survives the divide by 1e6.
      wide.vToken.balanceOf.whenCalledWith(user1Address).returns("999999");

      await f.primeV2["issue(address)"](user1Address);

      expect((await f.primeV2.interests(wide.vToken.address, user1Address)).score).to.equal(0);
    });
  });

  describe("addMarket decimals guard", () => {
    it("accepts a 24-decimal underlying", async () => {
      await expect(addMarketWithDecimals(f, 24)).to.not.be.reverted;
    });

    it("accepts an underlying at the 36 decimal ceiling", async () => {
      await expect(addMarketWithDecimals(f, 36)).to.not.be.reverted;
    });

    it("rejects an underlying above the 36 decimal ceiling", async () => {
      await expect(addMarketWithDecimals(f, 37)).to.be.revertedWithCustomError(
        f.primeV2,
        "UnsupportedUnderlyingDecimals",
      );
    });
  });

  describe("Comptroller hooks", () => {
    it("does not revert accrueInterestAndUpdateScore, the mintVerify and redeemVerify hook", async () => {
      const wide = await addMarketWithDecimals(f, 24);
      wide.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 24));

      await f.primeV2["issue(address)"](user1Address);

      await expect(f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, wide.vToken.address)).to.not
        .be.reverted;

      expect((await f.primeV2.interests(wide.vToken.address, user1Address)).score).to.be.gt(0);
    });

    it("does not revert the hook for a Prime holder with no position in the 24-decimal market", async () => {
      const wide = await addMarketWithDecimals(f, 24);

      await f.primeV2["issue(address)"](user1Address);

      await expect(f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, wide.vToken.address)).to.not
        .be.reverted;
    });
  });

  describe("updateScores", () => {
    it("completes a round with a 24-decimal market present", async () => {
      const wide = await addMarketWithDecimals(f, 24);
      const standard = await addMarketWithDecimals(f, 18);

      wide.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 24));
      standard.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));

      await f.primeV2.issueBatch([user1Address, user2Address]);

      await f.primeV2.updateAlpha(2, 3);
      expect(await f.primeV2.pendingScoreUpdates()).to.equal(2);

      await expect(f.primeV2.updateScores([user1Address, user2Address])).to.not.be.reverted;
      expect(await f.primeV2.pendingScoreUpdates()).to.equal(0);
    });

    it("does not revert for a holder with no position in the 24-decimal market", async () => {
      await addMarketWithDecimals(f, 24);

      // user2 holds nothing anywhere, so every market resolves a zero supply.
      await f.primeV2.issueBatch([user2Address]);
      await f.primeV2.updateAlpha(2, 3);

      await expect(f.primeV2.updateScores([user2Address])).to.not.be.reverted;
      expect(await f.primeV2.pendingScoreUpdates()).to.equal(0);
    });
  });

  describe("XVSVault callback chain", () => {
    it("does not revert on stake with a 24-decimal market present", async () => {
      const wide = await addMarketWithDecimals(f, 24);
      wide.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 24));

      await f.primeV2["issue(address)"](user1Address);

      await expect(simulateVaultDeposit(f, user1Address, convertToUnit(2000, 18))).to.not.be.reverted;
    });

    it("does not revert on unstake with a 24-decimal market present", async () => {
      const wide = await addMarketWithDecimals(f, 24);
      wide.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 24));

      await f.primeV2["issue(address)"](user1Address);
      await simulateVaultDeposit(f, user1Address, convertToUnit(2000, 18));

      await expect(simulateVaultWithdrawal(f, user1Address, convertToUnit(500, 18))).to.not.be.reverted;
    });

    it("moves the 24-decimal market score when the stake changes", async () => {
      const wide = await addMarketWithDecimals(f, 24);
      wide.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 24));

      await f.primeV2["issue(address)"](user1Address);
      const scoreBefore = (await f.primeV2.interests(wide.vToken.address, user1Address)).score;

      await simulateVaultDeposit(f, user1Address, convertToUnit(5000, 18));

      const scoreAfter = (await f.primeV2.interests(wide.vToken.address, user1Address)).score;
      expect(scoreAfter).to.be.gt(scoreBefore);
    });
  });

  describe("PrimeLens", () => {
    let lens: PrimeLens;

    beforeEach(async () => {
      const PrimeLensFactory = await ethers.getContractFactory("PrimeLens");
      lens = (await PrimeLensFactory.deploy(f.primeV2.address)) as PrimeLens;
      await lens.deployed();
    });

    it("estimates APR for a 24-decimal market", async () => {
      const wide = await addMarketWithDecimals(f, 24);
      wide.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 24));
      await f.primeV2["issue(address)"](user1Address);

      const aprInfo = await lens.estimateAPR(wide.vToken.address, user1Address, 0, convertToUnit(1000, 24), XVS_STAKE);

      expect(aprInfo.userScore).to.be.gt(0);
    });

    it("estimates the same score for a 24-decimal and an 18-decimal market of equal value", async () => {
      const wide = await addMarketWithDecimals(f, 24);
      const standard = await addMarketWithDecimals(f, 18);
      await f.primeV2["issue(address)"](user1Address);

      const wideApr = await lens.estimateAPR(wide.vToken.address, user1Address, 0, convertToUnit(1000, 24), XVS_STAKE);
      const standardApr = await lens.estimateAPR(
        standard.vToken.address,
        user1Address,
        0,
        convertToUnit(1000, 18),
        XVS_STAKE,
      );

      expect(wideApr.userScore).to.be.gt(0);
      expect(wideApr.userScore).to.equal(standardApr.userScore);
    });

    it("matches the score PrimeV2 stores for a 24-decimal market", async () => {
      const wide = await addMarketWithDecimals(f, 24);
      wide.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 24));
      await f.primeV2["issue(address)"](user1Address);

      const storedScore = (await f.primeV2.interests(wide.vToken.address, user1Address)).score;
      const aprInfo = await lens.estimateAPR(wide.vToken.address, user1Address, 0, convertToUnit(1000, 24), XVS_STAKE);

      expect(aprInfo.userScore).to.equal(storedScore);
    });
  });
});
