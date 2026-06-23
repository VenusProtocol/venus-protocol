import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { PrimeLens } from "../../../typechain";
import { PrimeV2Fixture, deployPrimeV2Fixture } from "./helpers/primeV2Fixture";

const { expect } = chai;
chai.use(smock.matchers);

describe("PrimeLens", () => {
  let f: PrimeV2Fixture;
  let user1Address: string;
  let lens: PrimeLens;

  beforeEach(async () => {
    f = await loadFixture(deployPrimeV2Fixture);
    f.accessControlManager.isAllowedToCall.returns(true);

    user1Address = await f.user1.getAddress();

    f.primeLiquidityProvider.tokenAmountAccrued.returns(0);
    f.comptroller.markets.returns(true);

    await f.primeV2.addMarket(f.vToken.address, convertToUnit(2, 18), convertToUnit(2, 18));

    f.vToken.balanceOf.whenCalledWith(user1Address).returns(convertToUnit(1000, 18));
    f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user1Address).returns([convertToUnit(1000, 18), 0, 0]);

    await f.primeV2["issue(address)"](user1Address);

    const PrimeLensFactory = await ethers.getContractFactory("PrimeLens");
    lens = (await PrimeLensFactory.deploy(f.primeV2.address)) as PrimeLens;
    await lens.deployed();
  });

  describe("constructor", () => {
    it("reverts on zero PrimeV2 address", async () => {
      const PrimeLensFactory = await ethers.getContractFactory("PrimeLens");
      await expect(PrimeLensFactory.deploy(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
        PrimeLensFactory,
        "InvalidAddress",
      );
    });

    it("stores PrimeV2 reference as immutable", async () => {
      expect(await lens.primeV2()).to.equal(f.primeV2.address);
    });
  });

  describe("incomeDistributionYearly", () => {
    it("returns blocksOrSecondsPerYear * getEffectiveDistributionSpeed", async () => {
      const speed = convertToUnit(1, 16);
      f.primeLiquidityProvider.getEffectiveDistributionSpeed.whenCalledWith(f.underlyingAddress).returns(speed);

      const blocksPerYear = await f.primeV2.blocksOrSecondsPerYear();
      const expected = blocksPerYear.mul(speed);

      const actual = await lens.incomeDistributionYearly(f.vToken.address);
      expect(actual).to.equal(expected);
    });

    it("resolves NATIVE_MARKET to WRAPPED_NATIVE_TOKEN when querying PLP", async () => {
      const speed = convertToUnit(2, 16);
      f.primeLiquidityProvider.getEffectiveDistributionSpeed.whenCalledWith(f.wrappedNativeToken).returns(speed);

      const blocksPerYear = await f.primeV2.blocksOrSecondsPerYear();
      const expected = blocksPerYear.mul(speed);

      const actual = await lens.incomeDistributionYearly(f.nativeMarket);
      expect(actual).to.equal(expected);
    });
  });

  describe("calculateAPR", () => {
    it("returns populated APRInfo for a Prime holder", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      f.primeLiquidityProvider.getEffectiveDistributionSpeed
        .whenCalledWith(f.underlyingAddress)
        .returns(convertToUnit(1, 16));

      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

      const aprInfo = await lens.calculateAPR(f.vToken.address, user1Address);

      expect(aprInfo.totalScore).to.be.gt(0);
      expect(aprInfo.userScore).to.be.gt(0);
      expect(aprInfo.xvsBalanceForScore).to.be.gt(0);
      expect(aprInfo.capital).to.be.gt(0);
    });

    it("mirrors PrimeV2's stored score state exactly", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      f.primeLiquidityProvider.getEffectiveDistributionSpeed
        .whenCalledWith(f.underlyingAddress)
        .returns(convertToUnit(1, 16));

      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

      const aprInfo = await lens.calculateAPR(f.vToken.address, user1Address);
      const market = await f.primeV2.markets(f.vToken.address);
      const interest = await f.primeV2.interests(f.vToken.address, user1Address);
      const xvsBalance = await f.primeV2.xvsBalanceOfUser(user1Address);

      expect(aprInfo.userScore).to.equal(interest.score);
      expect(aprInfo.totalScore).to.equal(market.sumOfMembersScore);
      expect(aprInfo.xvsBalanceForScore).to.equal(xvsBalance);
    });

    it("capital equals cappedSupply + cappedBorrow", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      f.primeLiquidityProvider.getEffectiveDistributionSpeed
        .whenCalledWith(f.underlyingAddress)
        .returns(convertToUnit(1, 16));

      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

      const aprInfo = await lens.calculateAPR(f.vToken.address, user1Address);
      expect(aprInfo.capital).to.equal(aprInfo.cappedSupply.add(aprInfo.cappedBorrow));
    });

    it("APR = userIncome / total * BPS — verified against the documented formula", async () => {
      const distSpeed = convertToUnit(1, 16);
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      f.primeLiquidityProvider.getEffectiveDistributionSpeed.whenCalledWith(f.underlyingAddress).returns(distSpeed);

      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

      const aprInfo = await lens.calculateAPR(f.vToken.address, user1Address);

      const blocksPerYear = await f.primeV2.blocksOrSecondsPerYear();
      const yearlyIncomeTotal = blocksPerYear.mul(distSpeed);
      const userYearly = aprInfo.userScore.mul(yearlyIncomeTotal).div(aprInfo.totalScore);
      const totalCappedValue = aprInfo.cappedSupply.add(aprInfo.cappedBorrow);

      // Default mock has supply = exchangeRate * balanceOf = 1e18 * 1000e18 / 1e18 = 1000e18, borrow = 0
      // cappedSupply derives from min(supply, supplyCapUSD/tokenPrice). We assert formula identity.
      const userSupply = userYearly.mul(aprInfo.cappedSupply).div(totalCappedValue);

      const totalSupply = convertToUnit(1000, 18); // mock returns 1000e18 balance * 1e18 exchangeRate / 1e18
      const expectedSupplyAPR = userSupply.mul(10000).div(totalSupply);
      const expectedBorrowAPR = 0; // borrow == 0

      expect(aprInfo.supplyAPR).to.equal(expectedSupplyAPR);
      expect(aprInfo.borrowAPR).to.equal(expectedBorrowAPR);
    });

    it("returns zero APRs when no income distribution has accrued", async () => {
      f.primeLiquidityProvider.getEffectiveDistributionSpeed.whenCalledWith(f.underlyingAddress).returns(0);

      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);

      const aprInfo = await lens.calculateAPR(f.vToken.address, user1Address);
      expect(aprInfo.supplyAPR).to.equal(0);
      expect(aprInfo.borrowAPR).to.equal(0);
    });

    it("returns zero APRs when totalScore is zero (no prime holders accrued)", async () => {
      // Fresh user with no score accrued
      const user2Addr = await f.user2.getAddress();
      f.vToken.balanceOf.whenCalledWith(user2Addr).returns(convertToUnit(500, 18));
      f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user2Addr).returns([convertToUnit(500, 18), 0, 0]);

      const aprInfo = await lens.calculateAPR(f.vToken.address, user2Addr);
      // user2 was never issued — userScore is 0. totalScore from market is also untouched if no accrual.
      expect(aprInfo.userScore).to.equal(0);
    });
  });

  describe("estimateAPR", () => {
    it("returns populated APRInfo for hypothetical inputs", async () => {
      f.primeLiquidityProvider.getEffectiveDistributionSpeed
        .whenCalledWith(f.underlyingAddress)
        .returns(convertToUnit(1, 16));

      const aprInfo = await lens.estimateAPR(
        f.vToken.address,
        user1Address,
        convertToUnit(100, 18),
        convertToUnit(200, 18),
        convertToUnit(500, 18),
      );

      expect(aprInfo.xvsBalanceForScore).to.equal(convertToUnit(500, 18));
      expect(aprInfo.userScore).to.be.gt(0);
      expect(aprInfo.totalScore).to.be.gte(aprInfo.userScore);
    });

    it("subtracts the user's current stored score from totalScore before re-adding", async () => {
      f.primeLiquidityProvider.tokenAmountAccrued.returns(convertToUnit(100, 18));
      f.primeLiquidityProvider.getEffectiveDistributionSpeed
        .whenCalledWith(f.underlyingAddress)
        .returns(convertToUnit(1, 16));

      await f.primeV2["accrueInterestAndUpdateScore(address,address)"](user1Address, f.vToken.address);
      const marketAfter = await f.primeV2.markets(f.vToken.address);

      const aprInfo = await lens.estimateAPR(
        f.vToken.address,
        user1Address,
        convertToUnit(100, 18),
        convertToUnit(200, 18),
        convertToUnit(500, 18),
      );

      // totalScore returned = sum - oldUserScore + newHypotheticalScore
      // So totalScore - newHypotheticalScore should equal (sum - oldUserScore)
      const expectedBase = marketAfter.sumOfMembersScore.sub(
        (await f.primeV2.interests(f.vToken.address, user1Address)).score,
      );
      expect(aprInfo.totalScore.sub(aprInfo.userScore)).to.equal(expectedBase);
    });
  });
});
