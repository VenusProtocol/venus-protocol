import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { deployComptrollerWithMarkets, deployInterestRateModelHarness } from "../fixtures/ComptrollerWithMarkets";
import { TokenErrorReporter } from "../util/Errors";

const factor = parseUnits("0.02", 18);
const reserves = parseUnits("3", 12);
const cash = reserves.mul(2);
const reduction = parseUnits("2", 12);

describe("VToken", function () {
  let _root, accounts;

  beforeEach(async () => {
    [_root, ...accounts] = await ethers.getSigners();
  });

  describe("_setReserveFactorFresh", () => {
    let vToken;
    let acm;
    beforeEach(async () => {
      const { comptroller, vTokens, accessControlManager } = await deployComptrollerWithMarkets({ numBep20Tokens: 2 });
      vToken = vTokens[0];
      acm = accessControlManager;
      await comptroller._setMarketSupplyCaps(
        vTokens.map(vt => vt.address),
        [100000000000, 100000000000],
      );
    });

    afterEach(async () => {
      // Make sure we are set back to automine if a  test fails
      await ethers.provider.send("evm_setAutomine", [true]);
    });

    it("rejects change by non-admin", async () => {
      acm.isAllowedToCall.returns(false);
      await expect(vToken.connect(accounts[0])._setReserveFactor(factor)).revertedWith("access denied");
      acm.isAllowedToCall.returns(true);
    });

    it("rejects change if market not fresh", async () => {
      await vToken.harnessFastForward(5);
      await expect(vToken.harnessSetReserveFactorFresh(factor))
        .to.emit(vToken, "Failure")
        .withArgs(
          TokenErrorReporter.Error.MARKET_NOT_FRESH,
          TokenErrorReporter.FailureInfo.SET_RESERVE_FACTOR_FRESH_CHECK,
          0,
        );
    });

    it("rejects newReserveFactor that descales to 1", async () => {
      await ethers.provider.send("evm_setAutomine", [false]);
      await vToken.accrueInterest();
      const result = await vToken.harnessSetReserveFactorFresh(parseUnits("1.01", 18));
      await mine(1);
      await expect(result)
        .to.emit(vToken, "Failure")
        .withArgs(
          TokenErrorReporter.Error.BAD_INPUT,
          TokenErrorReporter.FailureInfo.SET_RESERVE_FACTOR_BOUNDS_CHECK,
          0,
        );
    });

    it("accepts newReserveFactor in valid range and emits log", async () => {
      await ethers.provider.send("evm_setAutomine", [false]);
      await vToken.accrueInterest();
      const result = await vToken.harnessSetReserveFactorFresh(factor);
      await mine(1);
      await expect(result).to.emit(vToken, "NewReserveFactor").withArgs("0", factor.toString());

      expect((await vToken.reserveFactorMantissa()).toString()).to.equal(factor.toString());
    });

    it("accepts a change back to zero", async () => {
      await ethers.provider.send("evm_setAutomine", [false]);

      await vToken.accrueInterest();
      await vToken.harnessSetReserveFactorFresh(factor);
      await mine(1);

      await vToken.accrueInterest();
      const result = await vToken.harnessSetReserveFactorFresh(0);
      await mine(1);

      await expect(result).to.emit(vToken, "NewReserveFactor").withArgs(factor.toString(), "0");

      expect(await vToken.reserveFactorMantissa()).to.equal("0");
    });
  });

  describe("_setReserveFactor", () => {
    let vToken;
    let interestRateModel;
    beforeEach(async () => {
      interestRateModel = await deployInterestRateModelHarness();
      const { comptroller, vTokens } = await deployComptrollerWithMarkets({ numBep20Tokens: 2, interestRateModel });
      vToken = vTokens[0];

      await comptroller._setMarketSupplyCaps(
        vTokens.map(vt => vt.address),
        [100000000000, 100000000000],
      );
      await interestRateModel.setFailBorrowRate(false);
      await vToken.harnessSetReserveFactorFresh(0);
    });

    afterEach(async () => {
      // Make sure we are set back to automine if a  test fails
      await ethers.provider.send("evm_setAutomine", [true]);
    });

    it("emits a reserve factor failure if interest accrual fails", async () => {
      await interestRateModel.setFailBorrowRate(true);
      await vToken.harnessFastForward(1);
      await expect(vToken._setReserveFactor(factor)).revertedWith("INTEREST_RATE_MODEL_ERROR");
      expect(await vToken.reserveFactorMantissa()).to.equal(0);
    });

    it("returns error from setReserveFactorFresh without emitting any extra logs", async () => {
      await ethers.provider.send("evm_setAutomine", [false]);
      await vToken.accrueInterest();
      const result = await vToken.harnessSetReserveFactorFresh(parseUnits("2", 18));
      mine(1);
      await expect(result)
        .to.emit(vToken, "Failure")
        .withArgs(
          TokenErrorReporter.Error.BAD_INPUT,
          TokenErrorReporter.FailureInfo.SET_RESERVE_FACTOR_BOUNDS_CHECK,
          0,
        );
      expect(await vToken.reserveFactorMantissa()).to.equal(0);
    });

    it("returns success from setReserveFactorFresh", async () => {
      expect(await vToken.reserveFactorMantissa()).to.equal(0);
      await vToken.harnessFastForward(5);
      await vToken._setReserveFactor(factor);
      expect(await vToken.reserveFactorMantissa()).to.equal(factor);
    });
  });

  describe("_reduceReservesFresh", () => {
    let vToken;
    let underlying;
    let acm;
    let psr;
    beforeEach(async () => {
      const { accessControlManager, vTokens, protocolShareReserve } = await deployComptrollerWithMarkets({
        numBep20Tokens: 2,
      });
      vToken = vTokens[0];
      acm = accessControlManager;
      psr = protocolShareReserve;
      underlying = await ethers.getContractAt("FaucetToken", await vToken.underlying());

      await vToken.harnessSetTotalReserves(reserves);
      await underlying.allocateTo(vToken.address, cash);
    });

    afterEach(async () => {
      // Make sure we are set back to automine if a  test fails
      await ethers.provider.send("evm_setAutomine", [true]);
    });

    it("fails if called by non-admin", async () => {
      acm.isAllowedToCall.returns(false);
      await expect(vToken.connect(accounts[0])._reduceReserves(reduction)).revertedWith("access denied");
      expect(await vToken.totalReserves()).to.equal(reserves);
      acm.isAllowedToCall.returns(true);
    });

    it("fails if market not fresh", async () => {
      expect(await vToken.harnessFastForward(5));
      await expect(vToken.harnessReduceReservesFresh(reduction))
        .to.emit(vToken, "Failure")
        .withArgs(
          TokenErrorReporter.Error.MARKET_NOT_FRESH,
          TokenErrorReporter.FailureInfo.REDUCE_RESERVES_FRESH_CHECK,
          0,
        );
      expect(await vToken.totalReserves()).to.equal(reserves);
    });

    it("fails if amount exceeds available cash", async () => {
      // Reduce cash to zero
      await vToken.accrueInterest();
      await vToken.harnessSetTotalReserves(reserves);
      await vToken.accrueInterest();
      await vToken.harnessSetTotalReserves(reserves);
      // Reduce try to reduce reserves with not enough cash
      await ethers.provider.send("evm_setAutomine", [false]);
      await vToken.accrueInterest();
      const result = await vToken.harnessReduceReservesFresh(reserves);
      mine(1);
      await expect(result)
        .to.emit(vToken, "Failure")
        .withArgs(
          TokenErrorReporter.Error.TOKEN_INSUFFICIENT_CASH,
          TokenErrorReporter.FailureInfo.REDUCE_RESERVES_CASH_NOT_AVAILABLE,
          0,
        );
      expect(await vToken.totalReserves()).to.equal(reserves);
    });

    it("if there isn't enough cash, reduces with available cash", async () => {
      const underlyingBalance = await underlying.balanceOf(vToken.address);
      const largeReserves = underlyingBalance.mul(2);
      await vToken.harnessSetTotalReserves(largeReserves);

      await expect(vToken.accrueInterest())
        .to.emit(vToken, "ReservesReduced")
        .withArgs(psr.address, underlyingBalance.toString(), largeReserves.sub(underlyingBalance));

      expect(await vToken.totalReserves()).to.equal(largeReserves.sub(underlyingBalance));
    });

    it("increases admin balance and reduces reserves on success", async () => {
      // setup
      await underlying.allocateTo(vToken.address, reserves.mul(2));
      await vToken.harnessSetTotalReserves(reserves);
      const balance = await underlying.balanceOf(psr.address);

      // Distribute income while accruing interest
      await expect(vToken.accrueInterest())
        .to.emit(vToken, "ReservesReduced")
        .withArgs(psr.address, reserves.toString(), "0");
      mine(1);

      expect(await underlying.balanceOf(psr.address)).to.equal(balance.add(reserves));
      expect(await vToken.totalReserves()).to.equal(0);
    });
  });

  describe("_reduceReserves", () => {
    let vToken;
    let interestRateModel;
    let underlying;
    beforeEach(async () => {
      interestRateModel = await deployInterestRateModelHarness();
      const { vTokens } = await deployComptrollerWithMarkets({ numBep20Tokens: 2, interestRateModel });
      vToken = vTokens[0];
      underlying = await ethers.getContractAt("FaucetToken", await vToken.underlying());
      await interestRateModel.setFailBorrowRate(false);
      await vToken.harnessSetTotalReserves(reserves);
      await underlying.allocateTo(vToken.address, cash);
    });

    afterEach(async () => {
      // Make sure we are set back to automine if a  test fails
      await ethers.provider.send("evm_setAutomine", [true]);
    });

    it("emits a reserve-reduction failure if interest accrual fails", async () => {
      await interestRateModel.setFailBorrowRate(true);
      await vToken.harnessFastForward(1);
      await expect(vToken._reduceReserves(reduction)).revertedWith("INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from _reduceReservesFresh without emitting any extra logs", async () => {
      await underlying.allocateTo(vToken.address, reserves);
      await ethers.provider.send("evm_setAutomine", [false]);
      await vToken.accrueInterest();
      const result = await vToken.harnessReduceReservesFresh(reserves.add(1));
      mine(1);
      await expect(result)
        .to.emit(vToken, "Failure")
        .withArgs(TokenErrorReporter.Error.BAD_INPUT, TokenErrorReporter.FailureInfo.REDUCE_RESERVES_VALIDATION, 0);
    });

    it("returns success code from _reduceReservesFresh and reduces the correct amount", async () => {
      expect(await vToken.totalReserves()).to.equal(reserves);
      await vToken.harnessFastForward(5);
      await vToken._reduceReserves(reduction);
    });
  });
});
