import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToBigInt, convertToUnit } from "../../../helpers/utils";
import {
  ComptrollerLens,
  ComptrollerMock,
  FaucetToken,
  FaucetToken__factory,
  IAccessControlManagerV5,
  IProtocolShareReserve,
  Liquidator,
  Liquidator__factory,
  MockVBNB,
  VAIController,
  VBep20Immutable,
  WBNB,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const repayAmount = 1000n;
const seizeTokens = 1000n * 4n;
const minLiquidatableVAI = convertToBigInt("500", 0);
const announcedIncentive = convertToBigInt("1.1", 18);
const treasuryPercent = convertToBigInt("0.05", 18);

const MANTISSA_ONE = convertToBigInt("1", 18);

const treasuryShare =
  (seizeTokens * (announcedIncentive - MANTISSA_ONE) * treasuryPercent) / (announcedIncentive * MANTISSA_ONE);
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
  accessControlManager: FakeContract<IAccessControlManagerV5>;
  collateralUnderlying: FakeContract<FaucetToken>;
};

async function deployLiquidator(): Promise<LiquidatorFixture> {
  const comptroller = await smock.fake<ComptrollerMock>("ComptrollerMock");
  const vBnb = await smock.fake<MockVBNB>("MockVBNB");
  const FaucetToken = await smock.mock<FaucetToken__factory>("FaucetToken");
  const borrowedUnderlying = await FaucetToken.deploy(convertToBigInt("100", 18), "USD", 18, "USD");
  const vai = await FaucetToken.deploy(convertToBigInt("100", 18), "VAI", 18, "VAI");
  const vaiController = await smock.fake<VAIController>("VAIController");
  const vTokenBorrowed = await smock.fake<VBep20Immutable>("VBep20Immutable");
  const vTokenCollateral = await smock.fake<VBep20Immutable>("VBep20Immutable");
  const protocolShareReserve = await smock.fake<IProtocolShareReserve>("IProtocolShareReserve");
  const wBnb = await smock.fake<WBNB>("WBNB");
  const comptrollerLens = await smock.fake<ComptrollerLens>("ComptrollerLens");

  const collateralUnderlying = await smock.fake<FaucetToken>("FaucetToken");
  collateralUnderlying.balanceOf.returns(convertToUnit(1, 10));
  collateralUnderlying.transfer.returns(true);
  vTokenCollateral.underlying.returns(collateralUnderlying.address);

  comptroller.liquidationIncentiveMantissa.returns(announcedIncentive);
  comptroller.vaiController.returns(vaiController.address);
  comptroller.comptrollerLens.returns(comptrollerLens.address);
  comptroller.markets.returns({
    isListed: true,
    collateralFactorMantissa: convertToUnit(5, 17),
    accountMembership: true,
    isVenus: true,
    liquidationThresholdMantissa: convertToUnit(5, 17),
    maxLiquidationIncentiveMantissa: convertToUnit(1.1, 18),
  });

  vaiController.getVAIAddress.returns(vai.address);

  const accessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
  accessControlManager.isAllowedToCall.returns(true);

  const Liquidator = await smock.mock<Liquidator__factory>("Liquidator");
  const liquidator = await upgrades.deployProxy(
    Liquidator,
    [treasuryPercent, accessControlManager.address, protocolShareReserve.address],
    {
      constructorArgs: [comptroller.address, vBnb.address, wBnb.address, comptrollerLens.address],
    },
  );

  await borrowedUnderlying.approve(liquidator.address, repayAmount);
  await vai.approve(liquidator.address, repayAmount);

  return {
    comptroller,
    vBnb,
    borrowedUnderlying,
    vai,
    vaiController,
    vTokenBorrowed,
    vTokenCollateral,
    liquidator,
    accessControlManager,
    collateralUnderlying,
  };
}

function configure(fixture: LiquidatorFixture) {
  const { comptroller, borrowedUnderlying, vai, vaiController, vTokenBorrowed, vTokenCollateral, vBnb } = fixture;

  comptroller["getDynamicLiquidationIncentive(address,uint256,uint256)"]
    .whenCalledWith(vTokenBorrowed.address, 0, 0)
    .returns(announcedIncentive);
  comptroller["getDynamicLiquidationIncentive(address,uint256,uint256)"]
    .whenCalledWith(vTokenCollateral.address, 0, 0)
    .returns(announcedIncentive);

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
  let borrower: SignerWithAddress;
  let borrowedUnderlying: MockContract<FaucetToken>;
  let vai: MockContract<FaucetToken>;
  let vaiController: FakeContract<VAIController>;
  let vTokenBorrowed: FakeContract<VBep20Immutable>;
  let vTokenCollateral: FakeContract<VBep20Immutable>;
  let vBnb: FakeContract<MockVBNB>;
  let liquidatorContract: MockContract<Liquidator>;
  let accessControlManager: FakeContract<IAccessControlManagerV5>;
  let collateralUnderlying: FakeContract<FaucetToken>;
  let comptroller: FakeContract<ComptrollerMock>;

  beforeEach(async () => {
    [liquidator, borrower] = await ethers.getSigners();
    const contracts = await loadFixture(deployLiquidator);
    configure(contracts);
    ({
      comptroller,
      vTokenBorrowed,
      borrowedUnderlying,
      vai,
      vaiController,
      vTokenCollateral,
      vBnb,
      liquidator: liquidatorContract,
      accessControlManager,
      collateralUnderlying,
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
        await expect(tx).to.be.revertedWithCustomError(liquidatorContract, "ZeroAddressNotAllowed");
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

      it("transfers the seized collateral to liquidator and protocolShareReserve", async () => {
        await liquidate();
        expect(vTokenCollateral.transfer).to.have.been.calledOnce;
        expect(collateralUnderlying.transfer).to.have.been.calledOnce;
        expect(vTokenCollateral.transfer).to.have.been.calledWith(liquidator.address, liquidatorShare);
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
          {
            totalCollateral: ethers.BigNumber.from(0),
            weightedCollateral: ethers.BigNumber.from(0),
            borrows: ethers.BigNumber.from(0),
            liquidity: ethers.BigNumber.from(0),
            shortfall: ethers.BigNumber.from(0),
            liquidationThresholdAvg: ethers.BigNumber.from(0),
            healthFactor: ethers.BigNumber.from(0),
            dynamicLiquidationIncentiveMantissa: ethers.BigNumber.from("0x0f43fc2c04ee0000"),
          },
        );
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
          {
            totalCollateral: ethers.BigNumber.from(0),
            weightedCollateral: ethers.BigNumber.from(0),
            borrows: ethers.BigNumber.from(0),
            liquidity: ethers.BigNumber.from(0),
            shortfall: ethers.BigNumber.from(0),
            liquidationThresholdAvg: ethers.BigNumber.from(0),
            healthFactor: ethers.BigNumber.from(0),
            dynamicLiquidationIncentiveMantissa: ethers.BigNumber.from("0x0f43fc2c04ee0000"),
          },
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
      console.log("VBNB address: ", vBnb.address);
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

    it("fails when permission is not granted", async () => {
      // toggle permissions
      accessControlManager.isAllowedToCall.returns(false);
      await expect(
        liquidatorContract.connect(borrower).setTreasuryPercent(convertToBigInt("0.08", 18)),
      ).to.be.revertedWithCustomError(liquidatorContract, "Unauthorized");
      // revert back
      accessControlManager.isAllowedToCall.returns(true);
    });

    it("fails when the percentage is too high", async () => {
      const maxPercentage = convertToBigInt("1", 18); // announced incentive - 1, with 18 decimals
      const tooHighPercentage = convertToBigInt("1.1", 18);
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

      const treasuryDelta =
        (seizeTokens * (announcedIncentive - MANTISSA_ONE) * convertToBigInt("0.08", 18)) /
        (announcedIncentive * MANTISSA_ONE);
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

  describe("Force VAI Liquidation", () => {
    beforeEach(async () => {
      await liquidatorContract.setMinLiquidatableVAI(minLiquidatableVAI);
      await liquidatorContract.resumeForceVAILiquidate();
    });
    async function liquidate() {
      return liquidatorContract.liquidateBorrow(vBnb.address, borrower.address, repayAmount, vTokenCollateral.address, {
        value: repayAmount,
      });
    }
    it("Should able to liquidate any token when VAI debt is lower than minLiquidatableVAI", async () => {
      await expect(liquidate()).to.be.emit(liquidatorContract, "LiquidateBorrowedTokens");
    });

    it("Should not able to liquidate any token when VAI debt is greater than minLiquidatableVAI", async () => {
      vaiController.getVAIRepayAmount.returns(2000);
      await expect(liquidate()).to.be.revertedWithCustomError(liquidatorContract, "VAIDebtTooHigh");
    });

    it("Should able to liquidate any token when VAI debt is greater than minLiquidatableVAI but forced liquidation is enabled", async () => {
      vaiController.getVAIRepayAmount.returns(2000);
      comptroller.isForcedLiquidationEnabled.returns(true);
      expect(
        liquidatorContract.liquidateBorrow(
          vaiController.address,
          borrower.address,
          repayAmount,
          vTokenCollateral.address,
        ),
      ).to.be.emit(liquidatorContract, "LiquidateBorrowedTokens");
    });

    it("Should able to liquidate VAI token when VAI debt is greater than minLiquidatableVAI", async () => {
      vaiController.getVAIRepayAmount.returns(2000);
      await expect(
        liquidatorContract.liquidateBorrow(
          vaiController.address,
          borrower.address,
          repayAmount,
          vTokenCollateral.address,
        ),
      ).to.be.emit(liquidatorContract, "LiquidateBorrowedTokens");
    });

    it("Should able to liquidate any token and VAI token when force Liquidation is off", async () => {
      vaiController.getVAIRepayAmount.returns(2000);
      await liquidatorContract.pauseForceVAILiquidate();
      await expect(
        liquidatorContract.liquidateBorrow(
          vTokenBorrowed.address,
          borrower.address,
          repayAmount,
          vTokenCollateral.address,
        ),
      ).to.be.emit(liquidatorContract, "LiquidateBorrowedTokens");
    });
  });
});
