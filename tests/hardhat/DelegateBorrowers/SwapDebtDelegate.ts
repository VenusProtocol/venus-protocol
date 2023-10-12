import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  ComptrollerMock,
  IERC20Upgradeable,
  PriceOracle,
  SwapDebtDelegate,
  SwapDebtDelegate__factory,
  VBep20,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("assetListTest", () => {
  const fooPrice = parseUnits("10", 18);
  const barPrice = parseUnits("2", 18);
  let owner: SignerWithAddress;
  let borrower: SignerWithAddress;
  let priceOracle: FakeContract<PriceOracle>;
  let comptroller: FakeContract<ComptrollerMock>;
  let foo: FakeContract<IERC20Upgradeable>;
  let bar: FakeContract<IERC20Upgradeable>;
  let vFoo: FakeContract<VBep20>;
  let vBar: FakeContract<VBep20>;
  let swapDebtDelegate: MockContract<SwapDebtDelegate>;

  type SwapDebtFixture = {
    swapDebtDelegate: MockContract<SwapDebtDelegate>;
  };

  async function swapDebtFixture(): Promise<SwapDebtFixture> {
    const SwapDebtDelegate = await smock.mock<SwapDebtDelegate__factory>("SwapDebtDelegate");
    const swapDebtDelegate = await upgrades.deployProxy(SwapDebtDelegate, []);
    return { swapDebtDelegate };
  }

  beforeEach(async () => {
    [owner, borrower] = await ethers.getSigners();

    priceOracle = await smock.fake<PriceOracle>("PriceOracle");
    comptroller = await smock.fake<ComptrollerMock>("ComptrollerMock");
    foo = await smock.fake<IERC20Upgradeable>("IERC20Upgradeable");
    bar = await smock.fake<IERC20Upgradeable>("IERC20Upgradeable");
    vFoo = await smock.fake<VBep20>("VBep20");
    vBar = await smock.fake<VBep20>("VBep20");

    vFoo.underlying.returns(foo.address);
    vBar.underlying.returns(bar.address);
    vFoo.comptroller.returns(comptroller.address);
    vBar.comptroller.returns(comptroller.address);
    comptroller.oracle.returns(priceOracle.address);
    priceOracle.getUnderlyingPrice.whenCalledWith(vFoo.address).returns(fooPrice);
    priceOracle.getUnderlyingPrice.whenCalledWith(vBar.address).returns(barPrice);
    foo.transferFrom.returns(true);
    foo.approve.returns(true);
    bar.transfer.returns(true);

    ({ swapDebtDelegate } = await loadFixture(swapDebtFixture));
  });

  describe("swapDebt", async () => {
    it("fails if called by a non-owner", async () => {
      await expect(
        swapDebtDelegate.connect(borrower).swapDebt(borrower.address, vFoo.address, vBar.address, parseUnits("1", 18)),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("fails if comptrollers don't match", async () => {
      vFoo.comptroller.returns(owner.address);
      await expect(
        swapDebtDelegate.swapDebt(borrower.address, vFoo.address, vBar.address, parseUnits("1", 18)),
      ).to.be.revertedWithCustomError(swapDebtDelegate, "ComptrollerMismatch");
    });

    it("fails if repayBorrowBehalf returns a non-zero error code", async () => {
      vFoo.repayBorrowBehalf.returns(42);
      await expect(
        swapDebtDelegate.swapDebt(borrower.address, vFoo.address, vBar.address, parseUnits("1", 18)),
      ).to.be.revertedWithCustomError(swapDebtDelegate, "RepaymentFailed");
    });

    it("fails if borrowBehalf returns a non-zero error code", async () => {
      vBar.borrowBehalf.returns(42);
      await expect(
        swapDebtDelegate.swapDebt(borrower.address, vFoo.address, vBar.address, parseUnits("1", 18)),
      ).to.be.revertedWithCustomError(swapDebtDelegate, "BorrowFailed");
    });

    it("transfers repayAmount of underlying from the sender", async () => {
      const repayAmount = parseUnits("1", 18);
      await swapDebtDelegate.swapDebt(borrower.address, vFoo.address, vBar.address, repayAmount);
      expect(foo.transferFrom).to.have.been.calledOnceWith(owner.address, swapDebtDelegate.address, repayAmount);
    });

    it("approves vToken to transfer money from the contract", async () => {
      const repayAmount = parseUnits("1", 18);
      foo.balanceOf.returnsAtCall(0, 0);
      foo.balanceOf.returnsAtCall(1, repayAmount);
      await swapDebtDelegate.swapDebt(borrower.address, vFoo.address, vBar.address, repayAmount);
      expect(foo.approve).to.have.been.calledTwice;
      expect(foo.approve.atCall(0)).to.have.been.calledWith(vFoo.address, 0);
      expect(foo.approve.atCall(1)).to.have.been.calledWith(vFoo.address, repayAmount);
      expect(foo.approve).to.have.been.calledAfter(foo.transferFrom);
    });

    it("calls repayBorrowBehalf after transferring the underlying to self", async () => {
      const repayAmount = parseUnits("1", 18);
      foo.balanceOf.returnsAtCall(0, 0);
      foo.balanceOf.returnsAtCall(1, repayAmount);
      await swapDebtDelegate.swapDebt(borrower.address, vFoo.address, vBar.address, repayAmount);
      expect(vFoo.repayBorrowBehalf).to.have.been.calledOnceWith(borrower.address, repayAmount);
      expect(vFoo.repayBorrowBehalf).to.have.been.calledAfter(foo.approve);
    });

    it("converts the amounts using the oracle exchange rates", async () => {
      const initialBorrowBalance = parseUnits("100", 18);
      const repayAmount = parseUnits("1", 18);
      const borrowBalanceAfterRepayment = initialBorrowBalance.sub(repayAmount);
      vFoo.borrowBalanceCurrent.returnsAtCall(0, initialBorrowBalance);
      vFoo.borrowBalanceCurrent.returnsAtCall(1, borrowBalanceAfterRepayment);

      // fooPrice / barPrice = 5, so we should borrow 5 times more than we repaid
      const expectedBorrowAmount = parseUnits("5", 18);

      await swapDebtDelegate.swapDebt(borrower.address, vFoo.address, vBar.address, repayAmount);
      expect(vBar.borrowBehalf).to.have.been.calledOnceWith(borrower.address, expectedBorrowAmount);
      expect(vBar.borrowBehalf).to.have.been.calledAfter(vFoo.repayBorrowBehalf);
    });

    it("uses the actually repaid amount rather than specified amount", async () => {
      const initialBorrowBalance = parseUnits("100", 18);
      const actualRepayAmount = parseUnits("1", 18);
      const requestedRepayAmount = parseUnits("500", 18);
      const borrowBalanceAfterRepayment = initialBorrowBalance.sub(actualRepayAmount);
      vFoo.borrowBalanceCurrent.returnsAtCall(0, initialBorrowBalance);
      vFoo.borrowBalanceCurrent.returnsAtCall(1, borrowBalanceAfterRepayment);

      // fooPrice / barPrice = 5, so we should borrow 5 times more than we repaid (and we repaid 1e18)
      const expectedBorrowAmount = parseUnits("5", 18);

      await swapDebtDelegate.swapDebt(borrower.address, vFoo.address, vBar.address, requestedRepayAmount);
      expect(vBar.borrowBehalf).to.have.been.calledOnceWith(borrower.address, expectedBorrowAmount);
      expect(vBar.borrowBehalf).to.have.been.calledAfter(vFoo.repayBorrowBehalf);
    });

    it("transfers the actually borrowed amount to the owner", async () => {
      const initialFooBorrowBalance = parseUnits("100", 18);
      const repayAmount = parseUnits("1", 18);
      const fooBorrowBalanceAfterRepayment = initialFooBorrowBalance.sub(repayAmount);
      vFoo.borrowBalanceCurrent.returnsAtCall(0, initialFooBorrowBalance);
      vFoo.borrowBalanceCurrent.returnsAtCall(1, fooBorrowBalanceAfterRepayment);

      const initialBarBalance = parseUnits("100", 18);
      const actualBorrowAmount = parseUnits("3", 18);
      const barBalanceAfterBorrow = initialBarBalance.add(actualBorrowAmount);
      bar.balanceOf.returnsAtCall(0, initialBarBalance);
      bar.balanceOf.returnsAtCall(1, barBalanceAfterBorrow);

      await swapDebtDelegate.swapDebt(borrower.address, vFoo.address, vBar.address, repayAmount);
      expect(bar.transfer).to.have.been.calledOnceWith(owner.address, actualBorrowAmount);
      expect(bar.transfer).to.have.been.calledAfter(vBar.borrowBehalf);
    });
  });

  describe("sweepTokens", async () => {
    it("fails if called by a non-owner", async () => {
      await expect(swapDebtDelegate.connect(borrower).sweepTokens(foo.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("transfers the full balance to the owner", async () => {
      const balance = parseUnits("12345", 18);
      foo.balanceOf.whenCalledWith(swapDebtDelegate.address).returns(balance);
      foo.transfer.returns(true);
      await swapDebtDelegate.sweepTokens(foo.address);
      expect(foo.transfer).to.have.been.calledOnceWith(owner.address, balance);
    });
  });
});
