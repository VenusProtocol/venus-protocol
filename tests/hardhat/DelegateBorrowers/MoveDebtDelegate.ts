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

const ANY_USER = "0x0000000000000000000000000000000000000001";

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
  let someVToken: FakeContract<VBep20>;
  let moveDebtDelegate: MockContract<MoveDebtDelegate>;

  type MoveDebtFixture = {
    moveDebtDelegate: MockContract<MoveDebtDelegate>;
    vTokenToRepay: FakeContract<VBep20>;
    vTokenToBorrow: FakeContract<VBep20>;
  };

  async function moveDebtFixture(): Promise<MoveDebtFixture> {
    const [, oldBorrower, newBorrower] = await ethers.getSigners();
    const vTokenToRepay = await smock.fake<VBep20>("VBep20");
    const vTokenToBorrow = await smock.fake<VBep20>("VBep20");
    const MoveDebtDelegate = await smock.mock<MoveDebtDelegate__factory>("MoveDebtDelegate");
    const moveDebtDelegate = await upgrades.deployProxy(MoveDebtDelegate, [], {
      constructorArgs: [newBorrower.address],
    });
    await moveDebtDelegate.setBorrowAllowed(vTokenToBorrow.address, true);
    await moveDebtDelegate.setRepaymentAllowed(vTokenToRepay.address, oldBorrower.address, true);
    return { moveDebtDelegate, vTokenToRepay, vTokenToBorrow };
  }

  beforeEach(async () => {
    [owner, oldBorrower, newBorrower] = await ethers.getSigners();

    ({ moveDebtDelegate, vTokenToRepay, vTokenToBorrow } = await loadFixture(moveDebtFixture));

    priceOracle = await smock.fake<PriceOracle>("PriceOracle");
    comptroller = await smock.fake<ComptrollerMock>("ComptrollerMock");
    foo = await smock.fake<IERC20Upgradeable>("IERC20Upgradeable");
    bar = await smock.fake<IERC20Upgradeable>("IERC20Upgradeable");
    someVToken = await smock.fake<VBep20>("VBep20");

    vTokenToRepay.repayBorrowBehalf.reset();
    vTokenToRepay.borrowBalanceCurrent.reset();
    vTokenToRepay.underlying.returns(foo.address);
    vTokenToRepay.comptroller.returns(comptroller.address);

    vTokenToBorrow.borrowBehalf.reset();
    vTokenToBorrow.underlying.returns(bar.address);
    vTokenToBorrow.comptroller.returns(comptroller.address);

    comptroller.oracle.returns(priceOracle.address);
    priceOracle.getUnderlyingPrice.whenCalledWith(vTokenToRepay.address).returns(fooPrice);
    priceOracle.getUnderlyingPrice.whenCalledWith(vTokenToBorrow.address).returns(barPrice);
    foo.transferFrom.returns(true);
    foo.approve.returns(true);
    bar.transfer.returns(true);
  });

  describe("setBorrowAllowed", () => {
    it("fails if called by a non-owner", async () => {
      await expect(moveDebtDelegate.connect(oldBorrower).setBorrowAllowed(someVToken.address, true)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("fails if called with zero address for vTokenToBorrow", async () => {
      await expect(moveDebtDelegate.setBorrowAllowed(ethers.constants.AddressZero, true)).to.be.revertedWithCustomError(
        moveDebtDelegate,
        "ZeroAddressNotAllowed",
      );
    });

    it("sets borrowAllowed to the specified value", async () => {
      await moveDebtDelegate.setBorrowAllowed(someVToken.address, true);
      expect(await moveDebtDelegate.borrowAllowed(someVToken.address)).to.be.true;
    });

    it("emits an event", async () => {
      const tx = await moveDebtDelegate.setBorrowAllowed(someVToken.address, true);
      await expect(tx).to.emit(moveDebtDelegate, "BorrowAllowedSet").withArgs(someVToken.address, true);
    });

    it("does not emit an event if no-op", async () => {
      await moveDebtDelegate.setBorrowAllowed(someVToken.address, true);
      const tx = await moveDebtDelegate.setBorrowAllowed(someVToken.address, true);
      await expect(tx).to.not.emit(moveDebtDelegate, "BorrowAllowedSet");
    });
  });

  describe("setRepaymentAllowed", () => {
    it("fails if called by a non-owner", async () => {
      await expect(
        moveDebtDelegate.connect(oldBorrower).setRepaymentAllowed(someVToken.address, ANY_USER, true),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("fails if called with zero address for vTokenToRepay", async () => {
      await expect(
        moveDebtDelegate.setRepaymentAllowed(ethers.constants.AddressZero, ANY_USER, true),
      ).to.be.revertedWithCustomError(moveDebtDelegate, "ZeroAddressNotAllowed");
    });

    it("sets borrowAllowed to the specified value", async () => {
      await moveDebtDelegate.setRepaymentAllowed(someVToken.address, ANY_USER, true);
      expect(await moveDebtDelegate.repaymentAllowed(someVToken.address, ANY_USER)).to.be.true;
    });

    it("emits an event", async () => {
      const tx = await moveDebtDelegate.setRepaymentAllowed(someVToken.address, ANY_USER, true);
      await expect(tx).to.emit(moveDebtDelegate, "RepaymentAllowedSet").withArgs(someVToken.address, ANY_USER, true);
    });

    it("does not emit an event if no-op", async () => {
      await moveDebtDelegate.setRepaymentAllowed(someVToken.address, ANY_USER, true);
      const tx = await moveDebtDelegate.setRepaymentAllowed(someVToken.address, ANY_USER, true);
      await expect(tx).to.not.emit(moveDebtDelegate, "RepaymentAllowedSet");
    });
  });

  describe("moveDebt", () => {
    it("fails if called with a token that is not allowed to be borrowed", async () => {
      const wrongTokenToBorrow = vTokenToRepay.address;
      await expect(
        moveDebtDelegate.moveDebt(vTokenToRepay.address, oldBorrower.address, parseUnits("1", 18), wrongTokenToBorrow),
      )
        .to.be.revertedWithCustomError(moveDebtDelegate, "BorrowNotAllowed")
        .withArgs(wrongTokenToBorrow);
    });

    it("fails if called with a token that is not allowed to be repaid", async () => {
      const wrongTokenToRepay = vTokenToBorrow.address;
      await expect(
        moveDebtDelegate.moveDebt(wrongTokenToRepay, oldBorrower.address, parseUnits("1", 18), vTokenToBorrow.address),
      )
        .to.be.revertedWithCustomError(moveDebtDelegate, "RepaymentNotAllowed")
        .withArgs(wrongTokenToRepay, oldBorrower.address);
    });

    it("fails if called with a borrower who is not in the repayment allowlist", async () => {
      const wrongCurrentBorrower = newBorrower.address;
      await expect(
        moveDebtDelegate.moveDebt(
          vTokenToRepay.address,
          wrongCurrentBorrower,
          parseUnits("1", 18),
          vTokenToBorrow.address,
        ),
      )
        .to.be.revertedWithCustomError(moveDebtDelegate, "RepaymentNotAllowed")
        .withArgs(vTokenToRepay.address, wrongCurrentBorrower);
    });

    it("succeeds if repayments are allowed for ANY_USER", async () => {
      // Disallow old borrower
      await moveDebtDelegate.setRepaymentAllowed(vTokenToRepay.address, oldBorrower.address, false);
      // Allow wildcard
      await moveDebtDelegate.setRepaymentAllowed(vTokenToRepay.address, ANY_USER, true);
      const tx = await moveDebtDelegate.moveDebt(
        vTokenToRepay.address,
        oldBorrower.address,
        parseUnits("1", 18),
        vTokenToBorrow.address,
      );
      await expect(tx).to.emit(moveDebtDelegate, "DebtMoved");
    });

    it("fails if comptrollers don't match", async () => {
      vTokenToRepay.comptroller.returns(owner.address);
      await expect(
        moveDebtDelegate.moveDebt(
          vTokenToRepay.address,
          oldBorrower.address,
          parseUnits("1", 18),
          vTokenToBorrow.address,
        ),
      ).to.be.revertedWithCustomError(moveDebtDelegate, "ComptrollerMismatch");
    });

    it("fails if repayBorrowBehalf returns a non-zero error code", async () => {
      vTokenToRepay.repayBorrowBehalf.returns(42);
      await expect(
        moveDebtDelegate.moveDebt(
          vTokenToRepay.address,
          oldBorrower.address,
          parseUnits("1", 18),
          vTokenToBorrow.address,
        ),
      ).to.be.revertedWithCustomError(moveDebtDelegate, "RepaymentFailed");
    });

    it("fails if borrowBehalf returns a non-zero error code", async () => {
      vTokenToBorrow.borrowBehalf.returns(42);
      await expect(
        moveDebtDelegate.moveDebt(
          vTokenToRepay.address,
          oldBorrower.address,
          parseUnits("1", 18),
          vTokenToBorrow.address,
        ),
      ).to.be.revertedWithCustomError(moveDebtDelegate, "BorrowFailed");
    });

    it("transfers repayAmount of vTokenToRepay.underlying() from the sender", async () => {
      const repayAmount = parseUnits("1", 18);
      await moveDebtDelegate.moveDebt(
        vTokenToRepay.address,
        oldBorrower.address,
        parseUnits("1", 18),
        vTokenToBorrow.address,
      );
      expect(foo.transferFrom).to.have.been.calledOnceWith(owner.address, moveDebtDelegate.address, repayAmount);
    });

    it("approves vToken to transfer money from the contract", async () => {
      const repayAmount = parseUnits("1", 18);
      foo.balanceOf.returnsAtCall(0, 0);
      foo.balanceOf.returnsAtCall(1, repayAmount);
      await moveDebtDelegate.moveDebt(vTokenToRepay.address, oldBorrower.address, repayAmount, vTokenToBorrow.address);
      expect(foo.approve).to.have.been.calledTwice;
      expect(foo.approve.atCall(0)).to.have.been.calledWith(vTokenToRepay.address, repayAmount);
      expect(foo.approve.atCall(1)).to.have.been.calledWith(vTokenToRepay.address, 0);
      expect(foo.approve).to.have.been.calledAfter(foo.transferFrom);
    });

    it("calls repayBorrowBehalf after transferring the underlying to self", async () => {
      const repayAmount = parseUnits("1", 18);
      foo.balanceOf.returnsAtCall(0, 0);
      foo.balanceOf.returnsAtCall(1, repayAmount);
      await moveDebtDelegate.moveDebt(vTokenToRepay.address, oldBorrower.address, repayAmount, vTokenToBorrow.address);
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

      await moveDebtDelegate.moveDebt(vTokenToRepay.address, oldBorrower.address, repayAmount, vTokenToBorrow.address);
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
        vTokenToRepay.address,
        oldBorrower.address,
        requestedRepayAmount,
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

      await moveDebtDelegate.moveDebt(vTokenToRepay.address, oldBorrower.address, repayAmount, vTokenToBorrow.address);
      expect(bar.transfer).to.have.been.calledOnceWith(owner.address, actualBorrowAmount);
      expect(bar.transfer).to.have.been.calledAfter(vTokenToBorrow.borrowBehalf);
    });
  });

  describe("sweepTokens", () => {
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
