import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { convertToUnit } from "../../../../helpers/utils";
import {
  BEP20Harness,
  BEP20Harness__factory,
  ComptrollerLens__factory,
  ComptrollerMock,
  IAccessControlManagerV5,
  IProtocolShareReserve,
  InterestRateModel,
  PriceOracle,
  VBep20Harness,
  VBep20Harness__factory,
} from "../../../../typechain";
import { deployDiamond } from "./scripts/deploy";

const { expect } = chai;
chai.use(smock.matchers);

describe("RepayBorrow Capping Logic Tests", async () => {
  let admin: SignerWithAddress;
  let user: SignerWithAddress;
  let liquidator: SignerWithAddress;
  let vToken: MockContract<VBep20Harness>;
  let underlying: MockContract<BEP20Harness>;
  let comptroller: ComptrollerMock;
  let interestRateModel: FakeContract<InterestRateModel>;
  let oracle: FakeContract<PriceOracle>;
  let accessControlManager: FakeContract<IAccessControlManagerV5>;
  let protocolShareReserve: FakeContract<IProtocolShareReserve>;

  const borrowAmount = parseUnits("100", 18); // User borrows 100 tokens

  beforeEach(async () => {
    [admin, user, liquidator] = await ethers.getSigners();

    // Setup mocks
    oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
    oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));

    accessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
    accessControlManager.isAllowedToCall.returns(true);

    interestRateModel = await smock.fake<InterestRateModel>("InterestRateModel");
    interestRateModel.isInterestRateModel.returns(true);
    interestRateModel.getBorrowRate.returns(parseUnits("0.0000001", 18));
    interestRateModel.getSupplyRate.returns(parseUnits("0.000005", 18));

    protocolShareReserve = await smock.fake<IProtocolShareReserve>(
      "contracts/external/IProtocolShareReserve.sol:IProtocolShareReserve",
    );

    const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");

    // Deploy diamond comptroller
    const result = await deployDiamond("");
    const unitroller = result.unitroller;
    comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);

    // Setup comptroller
    const comptrollerLens = await ComptrollerLensFactory.deploy();
    await comptroller._setAccessControl(accessControlManager.address);
    await comptroller._setComptrollerLens(comptrollerLens.address);
    await comptroller._setPriceOracle(oracle.address);

    // Create underlying token
    const underlyingFactory = await smock.mock<BEP20Harness__factory>("BEP20Harness");
    underlying = await underlyingFactory.deploy(0, "Test Token", 18, "TEST");

    // Create vToken
    const vTokenFactory = await smock.mock<VBep20Harness__factory>("VBep20Harness");
    vToken = await vTokenFactory.deploy(
      underlying.address,
      comptroller.address,
      interestRateModel.address,
      parseUnits("200000000", 18), // Initial exchange rate
      "vTest Token",
      "vTEST",
      18,
      admin.address,
    );

    // Setup vToken
    await vToken.setAccessControlManager(accessControlManager.address);
    await vToken.setProtocolShareReserve(protocolShareReserve.address);

    // Support market in comptroller
    await comptroller._supportMarket(vToken.address);
    await comptroller["setCollateralFactor(address,uint256,uint256)"](
      vToken.address,
      parseUnits("0.8", 18),
      parseUnits("1", 18),
    );

    // Enable borrowing for the vToken market
    await comptroller.setIsBorrowAllowed(0, vToken.address, true);

    // FIX: Set supply and borrow caps to allow minting
    await comptroller.setMarketSupplyCaps([vToken.address], [parseUnits("10000000", 18)]);
    await comptroller.setMarketBorrowCaps([vToken.address], [parseUnits("5000000", 18)]);

    // Setup user with collateral and borrow position
    await underlying.harnessSetBalance(user.address, parseUnits("1000", 18));
    await underlying.connect(user).approve(vToken.address, parseUnits("1000", 18));
    await vToken.connect(user).mint(parseUnits("500", 18)); // Mint collateral
    await comptroller.connect(user).enterMarkets([vToken.address]);

    // User borrows
    await underlying.harnessSetBalance(vToken.address, parseUnits("500", 18));
    await vToken.connect(user).borrow(borrowAmount);
  });

  describe("Direct repayBorrow Tests", () => {
    it("Should cap repayment to actual debt when repayAmount > debt", async () => {
      const currentDebt = await vToken.borrowBalanceStored(user.address);
      const excessiveRepayAmount = currentDebt.add(parseUnits("50", 18)); // 50 tokens more than debt

      // Give user enough tokens to cover excessive repayment
      await underlying.harnessSetBalance(user.address, excessiveRepayAmount);
      await underlying.connect(user).approve(vToken.address, excessiveRepayAmount);

      const balanceBefore = await underlying.balanceOf(user.address);
      const tx = await vToken.connect(user).repayBorrow(excessiveRepayAmount);

      // Check that only the actual debt was repaid
      const balanceAfter = await underlying.balanceOf(user.address);
      const actualRepaid = balanceBefore.sub(balanceAfter);

      // Allow a small difference due to interest accrual
      expect(actualRepaid).to.be.closeTo(currentDebt, parseUnits("0.0001", 18));
      expect(actualRepaid).to.be.lt(excessiveRepayAmount);

      // Check debt is fully paid
      const debtAfter = await vToken.borrowBalanceStored(user.address);
      expect(debtAfter).to.equal(0);

      // Verify RepayBorrow event emits actual repaid amount
      await expect(tx).to.emit(vToken, "RepayBorrow");
    });

    it("Should work normally when repayAmount < debt", async () => {
      const currentDebt = await vToken.borrowBalanceStored(user.address);
      const partialRepayAmount = currentDebt.div(2); // Repay half

      await underlying.harnessSetBalance(user.address, partialRepayAmount);
      await underlying.connect(user).approve(vToken.address, partialRepayAmount);

      const balanceBefore = await underlying.balanceOf(user.address);
      await vToken.connect(user).repayBorrow(partialRepayAmount);

      // Check exact amount was repaid
      const balanceAfter = await underlying.balanceOf(user.address);
      const actualRepaid = balanceBefore.sub(balanceAfter);

      expect(actualRepaid).to.equal(partialRepayAmount);

      // Check remaining debt
      const debtAfter = await vToken.borrowBalanceStored(user.address);
      expect(debtAfter).to.be.gt(0);
      expect(debtAfter).to.be.approximately(currentDebt.sub(partialRepayAmount), parseUnits("0.1", 18)); // Allow for rounding
    });

    it("Should work with type(uint256).max for full repayment", async () => {
      const currentDebt = await vToken.borrowBalanceStored(user.address);

      await underlying.harnessSetBalance(user.address, currentDebt.mul(2)); // Give more than needed
      await underlying.connect(user).approve(vToken.address, ethers.constants.MaxUint256);

      const balanceBefore = await underlying.balanceOf(user.address);
      await vToken.connect(user).repayBorrow(ethers.constants.MaxUint256);

      // Check that only the actual debt was repaid
      const balanceAfter = await underlying.balanceOf(user.address);
      const actualRepaid = balanceBefore.sub(balanceAfter);

      // Allow a small difference due to interest accrual
      expect(actualRepaid).to.be.closeTo(currentDebt, parseUnits("0.0001", 18));

      // Check debt is fully paid
      const debtAfter = await vToken.borrowBalanceStored(user.address);
      expect(debtAfter).to.equal(0);
    });
  });

  describe("repayBorrowBehalf Tests", () => {
    it("Should cap repayment when paying for another user", async () => {
      const currentDebt = await vToken.borrowBalanceStored(user.address);
      const excessiveRepayAmount = currentDebt.add(parseUnits("30", 18));

      // Liquidator repays on behalf of user
      await underlying.harnessSetBalance(liquidator.address, excessiveRepayAmount);
      await underlying.connect(liquidator).approve(vToken.address, excessiveRepayAmount);

      const balanceBefore = await underlying.balanceOf(liquidator.address);
      await vToken.connect(liquidator).repayBorrowBehalf(user.address, excessiveRepayAmount);

      // Check that only the actual debt was repaid
      const balanceAfter = await underlying.balanceOf(liquidator.address);
      const actualRepaid = balanceBefore.sub(balanceAfter);

      // Allow a small difference due to interest accrual
      expect(actualRepaid).to.be.closeTo(currentDebt, parseUnits("0.0001", 18));
      expect(actualRepaid).to.be.lt(excessiveRepayAmount);

      // Check user's debt is fully paid
      const debtAfter = await vToken.borrowBalanceStored(user.address);
      expect(debtAfter).to.equal(0);
    });
  });

  describe("Liquidation Impact Tests", () => {
    it("Should cap liquidation repayment to borrower's actual debt", async () => {
      // Make user's position liquidatable by dropping collateral factor
      await comptroller["setCollateralFactor(address,uint256,uint256)"](
        vToken.address,
        parseUnits("0.3", 18), // Lower collateral factor
        parseUnits("1", 18),
      );

      const currentDebt = await vToken.borrowBalanceStored(user.address);
      const excessiveLiquidationAmount = currentDebt.add(parseUnits("20", 18));

      // Setup liquidator
      await underlying.harnessSetBalance(liquidator.address, excessiveLiquidationAmount);
      await underlying.connect(liquidator).approve(vToken.address, excessiveLiquidationAmount);

      const balanceBefore = await underlying.balanceOf(liquidator.address);

      // Attempt liquidation with excessive amount
      await vToken.connect(liquidator).liquidateBorrow(user.address, excessiveLiquidationAmount, vToken.address);

      // Check that liquidation was capped to actual debt
      const balanceAfter = await underlying.balanceOf(liquidator.address);
      const actualRepaid = balanceBefore.sub(balanceAfter);

      expect(actualRepaid).to.be.lte(currentDebt);
      expect(actualRepaid).to.be.lt(excessiveLiquidationAmount);
    });
  });

  describe("Mathematical Safety Tests", () => {
    it("Should prevent underflow in debt calculations", async () => {
      const massiveRepayAmount = parseUnits("999999999", 18); // Extremely large amount

      await underlying.harnessSetBalance(user.address, massiveRepayAmount);
      await underlying.connect(user).approve(vToken.address, massiveRepayAmount);

      // This should not revert due to underflow
      await expect(vToken.connect(user).repayBorrow(massiveRepayAmount)).to.not.be.reverted;

      // Check debt is fully paid, not negative
      const debtAfter = await vToken.borrowBalanceStored(user.address);
      expect(debtAfter).to.equal(0);
    });

    it("Should handle edge case where debt is exactly zero", async () => {
      // First, repay all debt
      const currentDebt = await vToken.borrowBalanceStored(user.address);
      await underlying.harnessSetBalance(user.address, currentDebt);
      await underlying.connect(user).approve(vToken.address, currentDebt);
      await vToken.connect(user).repayBorrow(currentDebt);

      // Now try to repay again with some amount
      const unnecessaryRepayAmount = parseUnits("10", 18);
      await underlying.harnessSetBalance(user.address, unnecessaryRepayAmount);
      await underlying.connect(user).approve(vToken.address, unnecessaryRepayAmount);

      const balanceBefore = await underlying.balanceOf(user.address);
      await vToken.connect(user).repayBorrow(unnecessaryRepayAmount);

      // Check that no tokens were taken (debt was 0, so repayAmount should be capped to 0)
      const balanceAfter = await underlying.balanceOf(user.address);
      expect(balanceAfter).to.be.closeTo(balanceBefore, parseUnits("0.0001", 18)); // Allow tiny difference
    });
  });
});
