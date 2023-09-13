import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToBigInt } from "../../../helpers/utils";
import {
  ComptrollerMock,
  FaucetToken,
  FaucetToken__factory,
  Liquidator,
  Liquidator__factory,
  MockVBNB,
  VAIController,
  VBep20Immutable,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const repayAmount = 1000n;
const seizeTokens = 1000n * 4n;
const announcedIncentive = convertToBigInt("1.1", 18);
const treasuryPercent = convertToBigInt("0.05", 18);

const treasuryShare = 181n; // seizeTokens * treasuryPercent / announcedIncentive
const liquidatorShare = seizeTokens - treasuryShare;

type LiquidatorFixture = {
  comptroller: FakeContract<ComptrollerMock>;
  borrowedUnderlying: MockContract<FaucetToken>;
  vai: MockContract<FaucetToken>;
  vaiController: FakeContract<VAIController>;
  vTokenBorrowed: FakeContract<VBep20Immutable>;
  vTokenCollateral: FakeContract<VBep20Immutable>;
  liquidator: MockContract<Liquidator>;
  vBnb: FakeContract<MockVBNB>;
};

async function deployLiquidator(): Promise<LiquidatorFixture> {
  const [, treasury] = await ethers.getSigners();

  const comptroller = await smock.fake<ComptrollerMock>("ComptrollerMock");
  const vBnb = await smock.fake<MockVBNB>("MockVBNB");
  const FaucetToken = await smock.mock<FaucetToken__factory>("FaucetToken");
  const borrowedUnderlying = await FaucetToken.deploy(convertToBigInt("100", 18), "USD", 18, "USD");
  const vai = await FaucetToken.deploy(convertToBigInt("100", 18), "VAI", 18, "VAI");
  const vaiController = await smock.fake<VAIController>("VAIController");
  const vTokenBorrowed = await smock.fake<VBep20Immutable>("VBep20Immutable");
  const vTokenCollateral = await smock.fake<VBep20Immutable>("VBep20Immutable");

  comptroller.liquidationIncentiveMantissa.returns(announcedIncentive);
  comptroller.vaiController.returns(vaiController.address);
  vaiController.getVAIAddress.returns(vai.address);

  const Liquidator = await smock.mock<Liquidator__factory>("Liquidator");
  const liquidator = await upgrades.deployProxy(Liquidator, [treasuryPercent], {
    constructorArgs: [comptroller.address, vBnb.address, treasury.address],
  });
  await borrowedUnderlying.approve(liquidator.address, repayAmount);
  await vai.approve(liquidator.address, repayAmount);

  return { comptroller, vBnb, borrowedUnderlying, vai, vaiController, vTokenBorrowed, vTokenCollateral, liquidator };
}

function configure(fixture: LiquidatorFixture) {
  const { comptroller, borrowedUnderlying, vai, vaiController, vTokenBorrowed, vTokenCollateral, vBnb } = fixture;
  comptroller.liquidationIncentiveMantissa.returns(announcedIncentive);
  vTokenBorrowed.underlying.returns(borrowedUnderlying.address);
  for (const vToken of [vTokenBorrowed, vTokenCollateral]) {
    vToken.transfer.reset();
    vToken.transfer.returns(true);
  }

  borrowedUnderlying.approve.reset();
  vai.approve.reset();
  vaiController.liquidateVAI.reset();
  vBnb.liquidateBorrow.reset();
  vTokenBorrowed.liquidateBorrow.reset();
  vTokenCollateral.balanceOf.reset();
  vTokenCollateral.balanceOf.returnsAtCall(0, 999n);
  vTokenCollateral.balanceOf.returnsAtCall(1, 999n + seizeTokens);
}

describe("Liquidator", () => {
  let liquidator: SignerWithAddress;
  let treasury: SignerWithAddress;
  let borrower: SignerWithAddress;
  let borrowedUnderlying: MockContract<FaucetToken>;
  let vai: MockContract<FaucetToken>;
  let vaiController: FakeContract<VAIController>;
  let vTokenBorrowed: FakeContract<VBep20Immutable>;
  let vTokenCollateral: FakeContract<VBep20Immutable>;
  let vBnb: FakeContract<MockVBNB>;
  let liquidatorContract: MockContract<Liquidator>;

  beforeEach(async () => {
    [liquidator, treasury, borrower] = await ethers.getSigners();
    const contracts = await loadFixture(deployLiquidator);
    configure(contracts);
    ({
      vTokenBorrowed,
      borrowedUnderlying,
      vai,
      vaiController,
      vTokenCollateral,
      vBnb,
      liquidator: liquidatorContract,
    } = contracts);
  });

  describe("liquidateBorrow", () => {
    describe("liquidating BEP-20 debt", () => {
      async function liquidate() {
        return liquidatorContract.liquidateBorrow(
          vTokenBorrowed.address,
          borrower.address,
          repayAmount,
          vTokenCollateral.address,
        );
      }

      it("fails if borrower is zero address", async () => {
        const tx = liquidatorContract.liquidateBorrow(
          vTokenBorrowed.address,
          constants.AddressZero,
          repayAmount,
          vTokenCollateral.address,
        );
        await expect(tx).to.be.revertedWithCustomError(liquidatorContract, "UnexpectedZeroAddress");
      });

      it("fails if some BNB is sent along with the transaction", async () => {
        const tx = liquidatorContract.liquidateBorrow(
          vTokenBorrowed.address,
          borrower.address,
          repayAmount,
          vTokenCollateral.address,
          { value: 1n },
        );
        await expect(tx).to.be.revertedWithCustomError(liquidatorContract, "WrongTransactionAmount").withArgs(0n, 1n);
      });

      it("transfers tokens from the liquidator", async () => {
        const tx = await liquidate();
        await expect(tx).to.changeTokenBalance(borrowedUnderlying, liquidator.address, -repayAmount);
      });

      it("approves the borrowed VToken to spend underlying", async () => {
        await liquidate();
        expect(borrowedUnderlying.approve).to.have.been.calledTwice;
        expect(borrowedUnderlying.approve).to.have.been.calledWith(vTokenBorrowed.address, 0);
        expect(borrowedUnderlying.approve).to.have.been.calledWith(vTokenBorrowed.address, repayAmount);
      });

      it("calls liquidateBorrow on borrowed VToken", async () => {
        await liquidate();
        expect(vTokenBorrowed.liquidateBorrow).to.have.been.calledOnce;
        expect(vTokenBorrowed.liquidateBorrow).to.have.been.calledWith(
          borrower.address,
          repayAmount,
          vTokenCollateral.address,
        );
      });

      it("transfers the seized collateral to liquidator and treasury", async () => {
        await liquidate();
        expect(vTokenCollateral.transfer).to.have.been.calledTwice;
        expect(vTokenCollateral.transfer).to.have.been.calledWith(liquidator.address, liquidatorShare);
        expect(vTokenCollateral.transfer).to.have.been.calledWith(treasury.address, treasuryShare);
      });

      it("emits LiquidateBorrowedTokens event", async () => {
        const tx = await liquidate();
        await expect(tx)
          .to.emit(liquidatorContract, "LiquidateBorrowedTokens")
          .withArgs(
            liquidator.address,
            borrower.address,
            repayAmount,
            vTokenBorrowed.address,
            vTokenCollateral.address,
            treasuryShare,
            liquidatorShare,
          );
      });
    });

    describe("liquidating VAI debt", () => {
      async function liquidate() {
        return liquidatorContract.liquidateBorrow(
          vaiController.address,
          borrower.address,
          repayAmount,
          vTokenCollateral.address,
        );
      }

      it("transfers VAI from the liquidator", async () => {
        const tx = await liquidate();
        await expect(tx).to.changeTokenBalance(vai, liquidator.address, -repayAmount);
      });

      it("approves VAIController to spend VAI", async () => {
        await liquidate();
        expect(vai.approve).to.have.been.calledTwice;
        expect(vai.approve).to.have.been.calledWith(vaiController.address, 0);
        expect(vai.approve).to.have.been.calledWith(vaiController.address, repayAmount);
      });

      it("calls liquidateVAI on VAIController", async () => {
        await liquidate();
        expect(vaiController.liquidateVAI).to.have.been.calledOnce;
        expect(vaiController.liquidateVAI).to.have.been.calledWith(
          borrower.address,
          repayAmount,
          vTokenCollateral.address,
        );
      });
    });
  });

  describe("liquidating BNB debt", () => {
    async function liquidate() {
      return liquidatorContract.liquidateBorrow(vBnb.address, borrower.address, repayAmount, vTokenCollateral.address, {
        value: repayAmount,
      });
    }

    it("fails if msg.value is not equal to repayment amount", async () => {
      const tx1 = liquidatorContract.liquidateBorrow(
        vBnb.address,
        borrower.address,
        repayAmount,
        vTokenCollateral.address,
        { value: repayAmount - 1n },
      );
      await expect(tx1)
        .to.be.revertedWithCustomError(liquidatorContract, "WrongTransactionAmount")
        .withArgs(repayAmount, repayAmount - 1n);

      const tx2 = liquidatorContract.liquidateBorrow(
        vBnb.address,
        borrower.address,
        repayAmount,
        vTokenCollateral.address,
        { value: repayAmount + 1n },
      );
      await expect(tx2)
        .to.be.revertedWithCustomError(liquidatorContract, "WrongTransactionAmount")
        .withArgs(repayAmount, repayAmount + 1n);
    });

    it("transfers BNB from the liquidator", async () => {
      const tx = await liquidate();
      await expect(tx).to.changeEtherBalance(liquidator.address, -repayAmount);
    });

    it("calls liquidateBorrow on VBNB", async () => {
      await liquidate();
      expect(vBnb.liquidateBorrow).to.have.been.calledOnce;
      expect(vBnb.liquidateBorrow).to.have.been.calledWithValue(repayAmount);
      expect(vBnb.liquidateBorrow).to.have.been.calledWith(borrower.address, vTokenCollateral.address);
    });

    it("forwards BNB to VBNB contract", async () => {
      const tx = await liquidate();
      await expect(tx).to.changeEtherBalance(vBnb.address, repayAmount);
    });
  });

  describe("setTreasuryPercent", () => {
    it("updates treasury percent in storage", async () => {
      const tx = await liquidatorContract.setTreasuryPercent(convertToBigInt("0.08", 18));
      await expect(tx)
        .to.emit(liquidatorContract, "NewLiquidationTreasuryPercent")
        .withArgs(treasuryPercent, convertToBigInt("0.08", 18));
      const newPercent = await liquidatorContract.treasuryPercentMantissa();
      expect(newPercent).to.equal(convertToBigInt("0.08", 18));
    });

    it("fails when called from non-admin", async () => {
      await expect(
        liquidatorContract.connect(borrower).setTreasuryPercent(convertToBigInt("0.08", 18)),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("fails when the percentage is too high", async () => {
      const maxPercentage = convertToBigInt("0.1", 18); // announced incentive - 1, with 18 decimals
      const tooHighPercentage = convertToBigInt("0.1000000000001", 18);
      await expect(liquidatorContract.setTreasuryPercent(tooHighPercentage))
        .to.be.revertedWithCustomError(liquidatorContract, "TreasuryPercentTooHigh")
        .withArgs(maxPercentage, tooHighPercentage);
    });

    it("uses the new treasury percent during distributions", async () => {
      await liquidatorContract.setTreasuryPercent(convertToBigInt("0.08", 18));

      const tx = await liquidatorContract.liquidateBorrow(
        vTokenBorrowed.address,
        borrower.address,
        repayAmount,
        vTokenCollateral.address,
      );

      const treasuryDelta = (seizeTokens * convertToBigInt("0.08", 18)) / announcedIncentive;
      const liquidatorDelta = seizeTokens - treasuryDelta;

      await expect(tx)
        .to.emit(liquidatorContract, "LiquidateBorrowedTokens")
        .withArgs(
          liquidator.address,
          borrower.address,
          repayAmount,
          vTokenBorrowed.address,
          vTokenCollateral.address,
          treasuryDelta,
          liquidatorDelta,
        );
    });
  });
});
