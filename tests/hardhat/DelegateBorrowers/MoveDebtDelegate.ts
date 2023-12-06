import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  ComptrollerMock,
  IERC20Upgradeable,
  MoveDebtDelegate,
  MoveDebtDelegate__factory,
  PriceOracle,
  VBep20,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

describe("MoveDebtDelegate", () => {
  const fooPrice = parseUnits("10", 18);
  const barPrice = parseUnits("2", 18);
  let owner: SignerWithAddress;
  let oldBorrower: SignerWithAddress;
  let newBorrower: SignerWithAddress;
  let priceOracle: FakeContract<PriceOracle>;
  let comptroller: FakeContract<ComptrollerMock>;
  let foo: FakeContract<IERC20Upgradeable>;
  let bar: FakeContract<IERC20Upgradeable>;
  let vTokenToRepay: FakeContract<VBep20>;
  let vTokenToBorrow: FakeContract<VBep20>;
  let moveDebtDelegate: MockContract<MoveDebtDelegate>;

  type MoveDebtFixture = {
    moveDebtDelegate: MockContract<MoveDebtDelegate>;
    vTokenToRepay: FakeContract<VBep20>;
  };

  async function moveDebtFixture(): Promise<MoveDebtFixture> {
    const vTokenToRepay = await smock.fake<VBep20>("VBep20");
    const MoveDebtDelegate = await smock.mock<MoveDebtDelegate__factory>("MoveDebtDelegate");
    const moveDebtDelegate = await upgrades.deployProxy(MoveDebtDelegate, [], {
      constructorArgs: [vTokenToRepay.address],
    });
    return { moveDebtDelegate, vTokenToRepay };
  }

  beforeEach(async () => {
    [owner, oldBorrower, newBorrower] = await ethers.getSigners();

    ({ moveDebtDelegate, vTokenToRepay } = await loadFixture(moveDebtFixture));

    priceOracle = await smock.fake<PriceOracle>("PriceOracle");
    comptroller = await smock.fake<ComptrollerMock>("ComptrollerMock");
    foo = await smock.fake<IERC20Upgradeable>("IERC20Upgradeable");
    bar = await smock.fake<IERC20Upgradeable>("IERC20Upgradeable");
    vTokenToBorrow = await smock.fake<VBep20>("VBep20");

    vTokenToRepay.repayBorrowBehalf.reset();
    vTokenToRepay.borrowBalanceCurrent.reset();
    vTokenToRepay.underlying.returns(foo.address);
    vTokenToBorrow.underlying.returns(bar.address);
    vTokenToRepay.comptroller.returns(comptroller.address);
    vTokenToBorrow.comptroller.returns(comptroller.address);
    comptroller.oracle.returns(priceOracle.address);
    priceOracle.getUnderlyingPrice.whenCalledWith(vTokenToRepay.address).returns(fooPrice);
    priceOracle.getUnderlyingPrice.whenCalledWith(vTokenToBorrow.address).returns(barPrice);
    foo.transferFrom.returns(true);
    foo.approve.returns(true);
    bar.transfer.returns(true);
  });

  describe("moveDebt", async () => {
    it("fails if called by a non-owner", async () => {
      await expect(
        moveDebtDelegate
          .connect(oldBorrower)
          .moveDebt(oldBorrower.address, parseUnits("1", 18), newBorrower.address, vTokenToBorrow.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("fails if comptrollers don't match", async () => {
      vTokenToRepay.comptroller.returns(owner.address);
      await expect(
        moveDebtDelegate.moveDebt(
          oldBorrower.address,
          parseUnits("1", 18),
          newBorrower.address,
          vTokenToBorrow.address,
        ),
      ).to.be.revertedWithCustomError(moveDebtDelegate, "ComptrollerMismatch");
    });

    it("fails if repayBorrowBehalf returns a non-zero error code", async () => {
      vTokenToRepay.repayBorrowBehalf.returns(42);
      await expect(
        moveDebtDelegate.moveDebt(
          oldBorrower.address,
          parseUnits("1", 18),
          newBorrower.address,
          vTokenToBorrow.address,
        ),
      ).to.be.revertedWithCustomError(moveDebtDelegate, "RepaymentFailed");
    });

    it("fails if borrowBehalf returns a non-zero error code", async () => {
      vTokenToBorrow.borrowBehalf.returns(42);
      await expect(
        moveDebtDelegate.moveDebt(
          oldBorrower.address,
          parseUnits("1", 18),
          newBorrower.address,
          vTokenToBorrow.address,
        ),
      ).to.be.revertedWithCustomError(moveDebtDelegate, "BorrowFailed");
    });

    it("transfers repayAmount of vTokenToRepay.underlying() from the sender", async () => {
      const repayAmount = parseUnits("1", 18);
      await moveDebtDelegate.moveDebt(
        oldBorrower.address,
        parseUnits("1", 18),
        newBorrower.address,
        vTokenToBorrow.address,
      );
      expect(foo.transferFrom).to.have.been.calledOnceWith(owner.address, moveDebtDelegate.address, repayAmount);
    });

    it("approves vToken to transfer money from the contract", async () => {
      const repayAmount = parseUnits("1", 18);
      foo.balanceOf.returnsAtCall(0, 0);
      foo.balanceOf.returnsAtCall(1, repayAmount);
      await moveDebtDelegate.moveDebt(oldBorrower.address, repayAmount, newBorrower.address, vTokenToBorrow.address);
      expect(foo.approve).to.have.been.calledTwice;
      expect(foo.approve.atCall(0)).to.have.been.calledWith(vTokenToRepay.address, repayAmount);
      expect(foo.approve.atCall(1)).to.have.been.calledWith(vTokenToRepay.address, 0);
      expect(foo.approve).to.have.been.calledAfter(foo.transferFrom);
    });

    it("calls repayBorrowBehalf after transferring the underlying to self", async () => {
      const repayAmount = parseUnits("1", 18);
      foo.balanceOf.returnsAtCall(0, 0);
      foo.balanceOf.returnsAtCall(1, repayAmount);
      await moveDebtDelegate.moveDebt(oldBorrower.address, repayAmount, newBorrower.address, vTokenToBorrow.address);
      expect(vTokenToRepay.repayBorrowBehalf).to.have.been.calledOnceWith(oldBorrower.address, repayAmount);
      expect(vTokenToRepay.repayBorrowBehalf).to.have.been.calledAfter(foo.approve);
    });

    it("converts the amounts using the oracle exchange rates", async () => {
      const initialBorrowBalance = parseUnits("100", 18);
      const repayAmount = parseUnits("1", 18);
      const borrowBalanceAfterRepayment = initialBorrowBalance.sub(repayAmount);
      vTokenToRepay.borrowBalanceCurrent.returnsAtCall(0, initialBorrowBalance);
      vTokenToRepay.borrowBalanceCurrent.returnsAtCall(1, borrowBalanceAfterRepayment);

      // fooPrice / barPrice = 5, so we should borrow 5 times more than we repaid
      const expectedBorrowAmount = parseUnits("5", 18);

      await moveDebtDelegate.moveDebt(oldBorrower.address, repayAmount, newBorrower.address, vTokenToBorrow.address);
      expect(vTokenToBorrow.borrowBehalf).to.have.been.calledOnceWith(newBorrower.address, expectedBorrowAmount);
      expect(vTokenToBorrow.borrowBehalf).to.have.been.calledAfter(vTokenToRepay.repayBorrowBehalf);
    });

    it("uses the actually repaid amount rather than specified amount", async () => {
      const initialBorrowBalance = parseUnits("100", 18);
      const actualRepayAmount = parseUnits("1", 18);
      const requestedRepayAmount = parseUnits("500", 18);
      const borrowBalanceAfterRepayment = initialBorrowBalance.sub(actualRepayAmount);
      vTokenToRepay.borrowBalanceCurrent.returnsAtCall(0, initialBorrowBalance);
      vTokenToRepay.borrowBalanceCurrent.returnsAtCall(1, borrowBalanceAfterRepayment);

      // fooPrice / barPrice = 5, so we should borrow 5 times more than we repaid (and we repaid 1e18)
      const expectedBorrowAmount = parseUnits("5", 18);

      await moveDebtDelegate.moveDebt(
        oldBorrower.address,
        requestedRepayAmount,
        newBorrower.address,
        vTokenToBorrow.address,
      );
      expect(vTokenToBorrow.borrowBehalf).to.have.been.calledOnceWith(newBorrower.address, expectedBorrowAmount);
      expect(vTokenToBorrow.borrowBehalf).to.have.been.calledAfter(vTokenToRepay.repayBorrowBehalf);
    });

    it("transfers the actually borrowed amount to the owner", async () => {
      const initialFooBorrowBalance = parseUnits("100", 18);
      const repayAmount = parseUnits("1", 18);
      const fooBorrowBalanceAfterRepayment = initialFooBorrowBalance.sub(repayAmount);
      vTokenToRepay.borrowBalanceCurrent.returnsAtCall(0, initialFooBorrowBalance);
      vTokenToRepay.borrowBalanceCurrent.returnsAtCall(1, fooBorrowBalanceAfterRepayment);

      const initialBarBalance = parseUnits("100", 18);
      const actualBorrowAmount = parseUnits("3", 18);
      const barBalanceAfterBorrow = initialBarBalance.add(actualBorrowAmount);
      bar.balanceOf.returnsAtCall(0, initialBarBalance);
      bar.balanceOf.returnsAtCall(1, barBalanceAfterBorrow);

      await moveDebtDelegate.moveDebt(oldBorrower.address, repayAmount, newBorrower.address, vTokenToBorrow.address);
      expect(bar.transfer).to.have.been.calledOnceWith(owner.address, actualBorrowAmount);
      expect(bar.transfer).to.have.been.calledAfter(vTokenToBorrow.borrowBehalf);
    });
  });

  describe("sweepTokens", async () => {
    it("fails if called by a non-owner", async () => {
      await expect(moveDebtDelegate.connect(oldBorrower).sweepTokens(foo.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("transfers the full balance to the owner", async () => {
      const balance = parseUnits("12345", 18);
      foo.balanceOf.whenCalledWith(moveDebtDelegate.address).returns(balance);
      foo.transfer.returns(true);
      await moveDebtDelegate.sweepTokens(foo.address);
      expect(foo.transfer).to.have.been.calledOnceWith(owner.address, balance);
    });
  });
});
