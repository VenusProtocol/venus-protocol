import { smock } from "@defi-wonderland/smock";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber, BigNumberish } from "ethers";
import { Interface, parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  FaucetToken,
  TokenRedeemer,
  TokenRedeemer__factory,
  VAI,
  VAIController,
  VBNB,
  VBep20,
} from "../../../typechain";
import { deployComptrollerWithMarkets } from "../fixtures/ComptrollerWithMarkets";
import { FORK_MAINNET, around, forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const SUPPLIED_AMOUNT = parseUnits("3000", 18);
const BORROWED_AMOUNT = parseUnits("1000", 18);
const REPAY_AMOUNT = BORROWED_AMOUNT;

const addresses = {
  bscmainnet: {
    COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
    VUSDC: "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8",
    VUSDT: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
    VBNB: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
    USDC_HOLDERS: [
      "0xe2fc31F816A9b94326492132018C3aEcC4a93aE1",
      "0x3Dd878A95DCAEF2800cD57BB065B5e8f2F438131",
      "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
      "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
    ],
    TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
    ACCESS_CONTROL_MANAGER: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  },
};

const deployTokenRedeemer = async (owner: { address: string }, vBNB: { address: string }): Promise<TokenRedeemer> => {
  const redeemerFactory: TokenRedeemer__factory = await ethers.getContractFactory("TokenRedeemer");
  const redeemer = await redeemerFactory.deploy(owner.address, vBNB.address);
  await redeemer.deployed();
  return redeemer;
};

// bscmainnet interface differs from the one in this repo:
// Redeem event has a different signature
const bscmainnetVBNBInterface = new Interface([
  "function transfer(address,uint256) returns (bool)",
  "function mint() payable",
  "function borrow(uint256)",
  "function exchangeRateCurrent() returns (uint256)",
  "function borrowBalanceCurrent(address) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "event Redeem(address,uint256,uint256)",
  "event Transfer(address indexed,address indexed,uint256)",
]);

interface TokenRedeemerFixture {
  redeemer: TokenRedeemer;
  vToken: VBep20;
  vToken2: VBep20;
  vBNB: VBNB;
  vaiController: VAIController;
  vai: VAI;
  underlying: FaucetToken;
  underlying2: FaucetToken;
  owner: SignerWithAddress;
  supplier: SignerWithAddress;
  borrowers: SignerWithAddress[];
  treasury: SignerWithAddress;
}

interface VAIControllerFixture {
  vaiController: VAIController;
  vai: VAI;
}

const deployVAIController = async (acmAddress: string): Promise<VAIControllerFixture> => {
  const vaiControllerFactory = await ethers.getContractFactory("VAIController");
  const vaiControllerImpl = await vaiControllerFactory.deploy();
  const vaiUnitrollerFactory = await ethers.getContractFactory("VAIUnitroller");
  const vaiUnitroller = await vaiUnitrollerFactory.deploy();
  await vaiUnitroller._setPendingImplementation(vaiControllerImpl.address);
  await vaiControllerImpl._become(vaiUnitroller.address);
  const vaiController = await ethers.getContractAt("VAIController", vaiUnitroller.address);
  await vaiController.initialize();
  const vaiFactory = await ethers.getContractFactory("VAI");
  const vai = await vaiFactory.deploy(56);
  await vai.rely(vaiController.address);
  await vaiController.setVAIToken(vai.address);
  await vaiController.setAccessControl(acmAddress);
  return { vaiController, vai };
};

const setupLocal = async (): Promise<TokenRedeemerFixture> => {
  const [, owner, supplier, treasury, borrower1, borrower2, borrower3] = await ethers.getSigners();
  const { comptroller, vTokens, vBNB, accessControlManager } = await deployComptrollerWithMarkets({
    numBep20Tokens: 2,
  });
  const [vToken, vToken2] = vTokens;

  const redeemer = await deployTokenRedeemer(owner, vBNB);
  await comptroller._setMarketSupplyCaps(
    [vToken.address, vToken2.address, vBNB.address],
    [ethers.constants.MaxUint256, ethers.constants.MaxUint256, ethers.constants.MaxUint256],
  );
  await comptroller._setCollateralFactor(vToken.address, parseUnits("0.9", 18));
  const underlying = await ethers.getContractAt("FaucetToken", await vToken.underlying());
  const underlying2 = await ethers.getContractAt("FaucetToken", await vToken2.underlying());

  const { vaiController, vai } = await deployVAIController(accessControlManager.address);
  await comptroller._setVAIController(vaiController.address);
  await vaiController._setComptroller(comptroller.address);
  await comptroller._setVAIMintRate(10000);

  await underlying.allocateTo(supplier.address, SUPPLIED_AMOUNT);
  await underlying.connect(supplier).approve(vToken.address, SUPPLIED_AMOUNT);
  await vToken.connect(supplier).mint(SUPPLIED_AMOUNT);
  await vBNB.connect(supplier).mint({ value: SUPPLIED_AMOUNT });

  await underlying2.allocateTo(treasury.address, SUPPLIED_AMOUNT.mul(2));
  await underlying2.connect(treasury).approve(vToken2.address, SUPPLIED_AMOUNT);
  await vToken2.connect(treasury).mint(SUPPLIED_AMOUNT);
  await vBNB.connect(treasury).mint({ value: SUPPLIED_AMOUNT });

  const borrowers = [borrower1, borrower2, borrower3];
  for (const borrower of borrowers) {
    await underlying.allocateTo(borrower.address, SUPPLIED_AMOUNT);
    await underlying.connect(borrower).approve(vToken.address, SUPPLIED_AMOUNT);
    await vToken.connect(borrower).mint(SUPPLIED_AMOUNT);
    await comptroller.connect(borrower).enterMarkets([vToken.address]);
  }

  return {
    redeemer,
    supplier,
    vToken,
    underlying,
    owner,
    treasury,
    vToken2,
    underlying2,
    vBNB,
    vaiController,
    vai,
    borrowers,
  };
};

const setupFork = async (): Promise<TokenRedeemerFixture> => {
  const comptroller = await ethers.getContractAt("ComptrollerMock", addresses.bscmainnet.COMPTROLLER);
  const vToken = await ethers.getContractAt("VBep20", addresses.bscmainnet.VUSDC);
  const vToken2 = await ethers.getContractAt("VBep20", addresses.bscmainnet.VUSDT);
  const vBNB = new ethers.Contract(addresses.bscmainnet.VBNB, bscmainnetVBNBInterface, ethers.provider);
  const underlying = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vToken.underlying());
  const underlying2 = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vToken2.underlying());
  const treasuryAddress = await comptroller.treasuryAddress();
  const treasury = await initMainnetUser(treasuryAddress, SUPPLIED_AMOUNT.mul(2).add(parseEther("3")));

  const timelock = await initMainnetUser(addresses.bscmainnet.TIMELOCK, parseEther("1"));
  const redeemer = await deployTokenRedeemer(timelock, vBNB);
  await comptroller.connect(timelock)._setMarketSupplyCaps([vToken.address], [ethers.constants.MaxUint256]);
  const actions = { MINT: 0, ENTER_MARKET: 7 };
  await comptroller.connect(timelock)._setActionsPaused([vToken.address], [actions.MINT, actions.ENTER_MARKET], false);

  const supplier = await initMainnetUser(addresses.bscmainnet.USDC_HOLDERS[0], SUPPLIED_AMOUNT.add(parseEther("1")));
  await underlying.connect(supplier).approve(vToken.address, SUPPLIED_AMOUNT);
  await vToken.connect(supplier).mint(SUPPLIED_AMOUNT);
  await vBNB.connect(supplier).mint({ value: SUPPLIED_AMOUNT });

  await underlying2.connect(treasury).approve(vToken2.address, SUPPLIED_AMOUNT);
  await vToken2.connect(treasury).mint(SUPPLIED_AMOUNT);
  await vBNB.connect(treasury).mint({ value: SUPPLIED_AMOUNT });

  const borrowerAddresses = addresses.bscmainnet.USDC_HOLDERS.slice(1);
  const borrowers = await Promise.all(
    borrowerAddresses.map(async borrowerAddress => {
      const borrower = await initMainnetUser(borrowerAddress, parseEther("1"));
      await underlying.connect(borrower).approve(vToken.address, SUPPLIED_AMOUNT);
      await vToken.connect(borrower).mint(SUPPLIED_AMOUNT);
      await comptroller.connect(borrower).enterMarkets([vToken.address]);
      return borrower;
    }),
  );

  const vaiController = await ethers.getContractAt("VAIController", await comptroller.vaiController(), timelock);

  // @todo: remove the following lines and update the fork block once this upgrade is executed on chain
  const vaiUnitroller = await ethers.getContractAt("VAIUnitroller", vaiController.address);
  const vaiControllerFactory = await ethers.getContractFactory("VAIController");
  const vaiControllerImpl = await vaiControllerFactory.deploy();
  await vaiUnitroller.connect(timelock)._setPendingImplementation(vaiControllerImpl.address);
  await vaiControllerImpl.connect(timelock)._become(vaiUnitroller.address);

  await vaiController.setBaseRate(0);
  await vaiController.setFloatRate(0);
  await vaiController.toggleOnlyPrimeHolderMint();
  const vai = await ethers.getContractAt("VAI", await vaiController.getVAIAddress(), timelock);

  return {
    redeemer,
    supplier,
    vToken,
    underlying,
    owner: timelock,
    treasury,
    vToken2,
    underlying2,
    vBNB,
    vaiController,
    vai,
    borrowers,
  };
};

const test = (setup: () => Promise<TokenRedeemerFixture>) => () => {
  describe("TokenRedeemer", () => {
    let redeemer: TokenRedeemer;
    let vToken: VBep20;
    let vToken2: VBep20;
    let vBNB: VBNB;
    let vaiController: VAIController;
    let vai: VAI;
    let underlying: FaucetToken;
    let underlying2: FaucetToken;
    let owner: SignerWithAddress;
    let supplier: SignerWithAddress;
    let borrowers: SignerWithAddress[];
    let someone: SignerWithAddress;
    let treasury: SignerWithAddress;

    beforeEach(async () => {
      ({
        redeemer,
        vToken,
        underlying,
        owner,
        supplier,
        treasury,
        vToken2,
        underlying2,
        vBNB,
        vaiController,
        vai,
        borrowers,
      } = await loadFixture(setup));
      [someone] = await ethers.getSigners();
    });

    describe("redeemAndTransfer", () => {
      it("should fail if called by a non-owner", async () => {
        await expect(redeemer.connect(someone).redeemAndTransfer(vToken.address, treasury.address)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("should fail if redeem fails", async () => {
        const failingVToken = await smock.fake<VBep20>("VBep20");
        failingVToken.redeem.returns(42);
        await expect(redeemer.connect(owner).redeemAndTransfer(failingVToken.address, treasury.address))
          .to.be.revertedWithCustomError(redeemer, "RedeemFailed")
          .withArgs(42);
      });

      it("should succeed with zero amount", async () => {
        const tx = await redeemer.connect(owner).redeemAndTransfer(vToken.address, treasury.address);
        // Might want to redeem for side effects
        await expect(tx).to.emit(vToken, "Transfer").withArgs(redeemer.address, vToken.address, "0");
        await expect(tx).to.emit(underlying, "Transfer").withArgs(vToken.address, redeemer.address, "0");
        // No need to transfer underlying though
      });

      it("should redeem all vTokens", async () => {
        const vTokenAmount = await vToken.balanceOf(supplier.address);
        const closeToSuppliedAmount = around(SUPPLIED_AMOUNT, parseUnits("0.1", 18));
        await vToken.connect(supplier).transfer(redeemer.address, vTokenAmount);
        const tx = await redeemer.connect(owner).redeemAndTransfer(vToken.address, treasury.address);
        await expect(tx).to.emit(vToken, "Redeem").withArgs(redeemer.address, closeToSuppliedAmount, vTokenAmount, "0");
        await expect(tx).to.emit(vToken, "Transfer").withArgs(redeemer.address, vToken.address, vTokenAmount);
        await expect(tx)
          .to.emit(underlying, "Transfer")
          .withArgs(vToken.address, redeemer.address, closeToSuppliedAmount);
        expect(await vToken.balanceOf(redeemer.address)).to.equal(0);
      });

      it("should transfer all underlying to the receiver", async () => {
        const vTokenAmount = await vToken.balanceOf(supplier.address);
        const closeToSuppliedAmount = around(SUPPLIED_AMOUNT, parseUnits("0.1", 18));
        await vToken.connect(supplier).transfer(redeemer.address, vTokenAmount);
        const tx = await redeemer.connect(owner).redeemAndTransfer(vToken.address, treasury.address);
        await expect(tx)
          .to.emit(underlying, "Transfer")
          .withArgs(redeemer.address, treasury.address, closeToSuppliedAmount);
        expect(await underlying.balanceOf(redeemer.address)).to.equal(0);
      });
    });

    describe("redeemUnderlyingAndRepayBorrowBehalf", () => {
      let borrower: SignerWithAddress;

      before(() => {
        borrower = borrowers[0];
      });

      it("should revert if redeemer does not have vToken balance", async () => {
        await expect(
          redeemer
            .connect(owner)
            .redeemUnderlyingAndRepayBorrowBehalf(vToken2.address, borrower.address, REPAY_AMOUNT, treasury.address),
        ).to.be.reverted;
      });

      it("should redeem and repay succesfully", async () => {
        await vToken2.connect(borrower).borrow(BORROWED_AMOUNT);
        const vTokenAmount = await vToken2.balanceOf(treasury.address);

        await vToken2.connect(treasury).transfer(redeemer.address, vTokenAmount);

        const borrowBalanceOld = await vToken2.borrowBalanceStored(borrower.address);
        const totalBorrowsOld = await vToken2.callStatic.totalBorrowsCurrent();
        const exchRateCurr = await vToken2.callStatic.exchangeRateCurrent();
        const vTokenRedeemAmount = REPAY_AMOUNT.mul(parseUnits("1", 18)).div(exchRateCurr);

        const closeToRepayAmount = around(vTokenRedeemAmount, parseUnits("0.1", 18));
        const closeToRemainingVtokenBal = around(vTokenAmount.sub(vTokenRedeemAmount), parseUnits("0.1", 18));
        const closeToBorrowBalNew = around(borrowBalanceOld.sub(REPAY_AMOUNT), parseUnits("0.1", 18));

        const tx = await redeemer
          .connect(owner)
          .redeemUnderlyingAndRepayBorrowBehalf(vToken2.address, borrower.address, REPAY_AMOUNT, treasury.address);
        const closeToTotalBorrows = around(totalBorrowsOld.sub(REPAY_AMOUNT), parseUnits("4", 18));
        await expect(tx)
          .to.be.emit(vToken2, "Redeem")
          .withArgs(redeemer.address, REPAY_AMOUNT, closeToRepayAmount, closeToRemainingVtokenBal);
        await expect(tx)
          .to.be.emit(vToken2, "RepayBorrow")
          .withArgs(redeemer.address, borrower.address, BORROWED_AMOUNT, closeToBorrowBalNew, closeToTotalBorrows);
        await expect(tx).to.emit(vToken2, "Transfer").withArgs(redeemer.address, vToken2.address, closeToRepayAmount);

        const borrowBalanceNew = await vToken2.borrowBalanceStored(borrower.address);
        const totalBorrowsNew = await vToken2.totalBorrows();
        const receiverVtokenBalanceNew = await vToken2.balanceOf(treasury.address);
        const redeemerUnderlyingBal = await underlying2.balanceOf(redeemer.address);
        const redeemerVtokenBalance = await vToken2.balanceOf(redeemer.address);

        expect(borrowBalanceNew).to.closeTo(borrowBalanceOld.sub(REPAY_AMOUNT), parseUnits("0.1", 18));
        expect(totalBorrowsNew).to.closeTo(totalBorrowsOld.sub(REPAY_AMOUNT), parseUnits("4", 18));
        expect(receiverVtokenBalanceNew).to.closeTo(vTokenAmount.sub(vTokenRedeemAmount), parseUnits("0.1", 18));
        expect(redeemerUnderlyingBal).equals(0);
        expect(redeemerVtokenBalance).equals(0);
      });
    });

    describe("redeemAndBatchRepay", () => {
      // whether v is between 99.9% * v and 100.1% * v
      const closeTo = (v: BigNumber) => around(v, v.mul(1).div(1000));

      const either = (a: BigNumberish, b: BigNumberish) => (v: BigNumberish) => {
        const v_ = BigNumber.from(v);
        return v_.eq(a) || v_.eq(b);
      };

      describe("Generic", () => {
        it("fails if called by a non-owner", async () => {
          await expect(
            redeemer.connect(someone).redeemAndBatchRepay(
              vToken2.address,
              borrowers.map(b => b.address),
              treasury.address,
            ),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });

      const expectBNBRedeemEvent = async (
        tx: TransactionResponse,
        account: string,
        underlyingAmount: BigNumberish | ((v: BigNumberish) => boolean),
        redeemedVTokens: BigNumberish | ((v: BigNumberish) => boolean),
        remainingVTokens: BigNumberish | ((v: BigNumberish) => boolean),
      ) => {
        if (FORK_MAINNET) {
          await expect(tx).to.emit(vBNB, "Redeem").withArgs(account, underlyingAmount, redeemedVTokens);
        } else {
          await expect(tx)
            .to.emit(vBNB, "Redeem")
            .withArgs(account, underlyingAmount, redeemedVTokens, remainingVTokens);
        }
      };

      describe("Full repayment", () => {
        let borrowerAddresses: string[];
        let requiredVTokens: BigNumber;
        let excessVTokens: BigNumber;
        let totalBorrow: BigNumber;

        describe("Native asset", () => {
          beforeEach(async () => {
            borrowerAddresses = borrowers.map(b => b.address);
            await vBNB.connect(borrowers[0]).borrow(parseEther("1"));
            await vBNB.connect(borrowers[1]).borrow(parseEther("2"));
            await vBNB.connect(borrowers[2]).borrow(parseEther("3"));
            totalBorrow = parseEther("6");
            const exchangeRate = await vBNB.callStatic.exchangeRateCurrent();
            requiredVTokens = totalBorrow.mul(parseUnits("1", 18)).div(exchangeRate);
            const vTokensInTreasury = await vBNB.balanceOf(treasury.address);
            excessVTokens = vTokensInTreasury.sub(requiredVTokens);
            await vBNB.connect(treasury).transfer(redeemer.address, vTokensInTreasury);
          });

          it("redeems just the required amount of vTokens", async () => {
            const tx = await redeemer
              .connect(owner)
              .redeemAndBatchRepay(vBNB.address, borrowerAddresses, treasury.address);
            await expectBNBRedeemEvent(
              tx,
              redeemer.address,
              closeTo(totalBorrow),
              closeTo(requiredVTokens),
              closeTo(excessVTokens),
            );
          });

          it("repays all borrows in full", async () => {
            await redeemer.connect(owner).redeemAndBatchRepay(vBNB.address, borrowerAddresses, treasury.address);
            for (const borrower of borrowers) {
              expect(await vBNB.callStatic.borrowBalanceCurrent(borrower.address)).to.equal(0);
            }
          });

          it("transfers the excess vTokens to the receiver", async () => {
            const tx = await redeemer
              .connect(owner)
              .redeemAndBatchRepay(vBNB.address, borrowerAddresses, treasury.address);
            await expect(tx)
              .to.emit(vBNB, "Transfer")
              .withArgs(redeemer.address, treasury.address, closeTo(excessVTokens));
          });

          it("transfers the excess BNB to the receiver", async () => {
            const excessBNB = parseEther("1234");
            await treasury.sendTransaction({ to: redeemer.address, value: excessBNB });
            const tx = await redeemer
              .connect(owner)
              .redeemAndBatchRepay(vBNB.address, borrowerAddresses, treasury.address);
            await expect(tx).to.changeEtherBalance(treasury.address, excessBNB);
          });
        });

        describe("Tokens", () => {
          beforeEach(async () => {
            borrowerAddresses = borrowers.map(b => b.address);
            await vToken2.connect(borrowers[0]).borrow(parseUnits("1", 18));
            await vToken2.connect(borrowers[1]).borrow(parseUnits("2", 18));
            await vToken2.connect(borrowers[2]).borrow(parseUnits("3", 18));
            totalBorrow = parseUnits("6", 18);
            const exchangeRate = await vToken2.callStatic.exchangeRateCurrent();
            requiredVTokens = totalBorrow.mul(parseUnits("1", 18)).div(exchangeRate);
            const vTokensInTreasury = await vToken2.balanceOf(treasury.address);
            excessVTokens = vTokensInTreasury.sub(requiredVTokens);
            await vToken2.connect(treasury).transfer(redeemer.address, vTokensInTreasury);
          });

          it("redeems just the required amount of vTokens", async () => {
            const tx = await redeemer
              .connect(owner)
              .redeemAndBatchRepay(vToken2.address, borrowerAddresses, treasury.address);
            await expect(tx)
              .to.emit(vToken2, "Redeem")
              .withArgs(redeemer.address, closeTo(totalBorrow), closeTo(requiredVTokens), closeTo(excessVTokens));
          });

          it("repays all borrows in full", async () => {
            await redeemer.connect(owner).redeemAndBatchRepay(vToken2.address, borrowerAddresses, treasury.address);
            for (const borrower of borrowers) {
              expect(await vToken2.callStatic.borrowBalanceCurrent(borrower.address)).to.equal(0);
            }
          });

          it("transfers the excess vTokens to the receiver", async () => {
            const tx = await redeemer
              .connect(owner)
              .redeemAndBatchRepay(vToken2.address, borrowerAddresses, treasury.address);
            await expect(tx)
              .to.emit(vToken2, "Transfer")
              .withArgs(redeemer.address, treasury.address, closeTo(excessVTokens));
          });

          it("transfers the excess underlying to the receiver", async () => {
            const excessUnderlying = parseUnits("1234", 18);
            await underlying2.connect(treasury).transfer(redeemer.address, excessUnderlying);
            const tx = await redeemer
              .connect(owner)
              .redeemAndBatchRepay(vToken2.address, borrowerAddresses, treasury.address);
            await expect(tx)
              .to.emit(underlying2, "Transfer")
              .withArgs(redeemer.address, treasury.address, excessUnderlying);
          });
        });
      });

      describe("Partial repayment", () => {
        let borrowerAddresses: string[];
        let availableVTokens: BigNumber;
        let coveredBorrow: BigNumber;

        describe("Native asset", () => {
          beforeEach(async () => {
            borrowerAddresses = borrowers.map(b => b.address);
            await vBNB.connect(borrowers[0]).borrow(parseEther("1"));
            await vBNB.connect(borrowers[1]).borrow(parseEther("2"));
            await vBNB.connect(borrowers[2]).borrow(parseEther("3"));
            const exchangeRate = await vBNB.callStatic.exchangeRateCurrent();
            coveredBorrow = parseEther("2.5");
            availableVTokens = coveredBorrow.mul(parseUnits("1", 18)).div(exchangeRate);
            await vBNB.connect(treasury).transfer(redeemer.address, availableVTokens);
          });

          it("redeems all available vTokens, up to 1 vToken wei", async () => {
            const tx = await redeemer
              .connect(owner)
              .redeemAndBatchRepay(vBNB.address, borrowerAddresses, treasury.address);
            await expectBNBRedeemEvent(
              tx,
              redeemer.address,
              closeTo(coveredBorrow),
              around(availableVTokens, 1), // ok to redeem 1 vToken wei less due to rounding
              either(0, 1),
            );
          });

          it("repays the three borrows: [in full, partially, no repayment]", async () => {
            const borrow3Before = await vBNB.callStatic.borrowBalanceCurrent(borrowers[2].address);
            const expectedBorrow2After = parseEther("0.5");
            await redeemer.connect(owner).redeemAndBatchRepay(vBNB.address, borrowerAddresses, treasury.address);
            expect(await vBNB.callStatic.borrowBalanceCurrent(borrowers[0].address)).to.equal(0);
            expect(await vBNB.callStatic.borrowBalanceCurrent(borrowers[1].address)).to.satisfy(
              closeTo(expectedBorrow2After),
            );
            expect(await vBNB.callStatic.borrowBalanceCurrent(borrowers[2].address)).to.satisfy(closeTo(borrow3Before));
          });

          it("uses the excess BNB to repay the debt in full", async () => {
            const excessBNB = parseEther("1234");
            await treasury.sendTransaction({ to: redeemer.address, value: excessBNB });
            await redeemer.connect(owner).redeemAndBatchRepay(vBNB.address, borrowerAddresses, treasury.address);
            for (const borrower of borrowers) {
              expect(await vToken2.callStatic.borrowBalanceCurrent(borrower.address)).to.equal(0);
            }
          });

          it("does not keep any vBNB or BNB balance", async () => {
            const excessBNB = parseEther("1234");
            await treasury.sendTransaction({ to: redeemer.address, value: excessBNB });
            await redeemer.connect(owner).redeemAndBatchRepay(vBNB.address, borrowerAddresses, treasury.address);
            expect(await vBNB.balanceOf(redeemer.address)).to.equal(0);
            expect(await ethers.provider.getBalance(redeemer.address)).to.equal(0);
          });
        });

        describe("Tokens", () => {
          beforeEach(async () => {
            borrowerAddresses = borrowers.map(b => b.address);
            await vToken2.connect(borrowers[0]).borrow(parseUnits("1", 18));
            await vToken2.connect(borrowers[1]).borrow(parseUnits("2", 18));
            await vToken2.connect(borrowers[2]).borrow(parseUnits("3", 18));
            const exchangeRate = await vToken2.callStatic.exchangeRateCurrent();
            coveredBorrow = parseEther("2.5");
            availableVTokens = coveredBorrow.mul(parseUnits("1", 18)).div(exchangeRate);
            await vToken2.connect(treasury).transfer(redeemer.address, availableVTokens);
          });

          it("redeems all available vTokens, up to 1 vToken wei", async () => {
            const tx = await redeemer
              .connect(owner)
              .redeemAndBatchRepay(vToken2.address, borrowerAddresses, treasury.address);
            await expect(tx).to.emit(vToken2, "Redeem").withArgs(
              redeemer.address,
              closeTo(coveredBorrow),
              around(availableVTokens, 1), // ok to redeem 1 vToken wei less due to rounding
              either(0, 1),
            );
          });

          it("repays the three borrows: [in full, partially, no repayment]", async () => {
            const borrow3Before = await vToken2.callStatic.borrowBalanceCurrent(borrowers[2].address);
            const expectedBorrow2After = parseUnits("0.5", 18);
            await redeemer.connect(owner).redeemAndBatchRepay(vToken2.address, borrowerAddresses, treasury.address);
            expect(await vToken2.callStatic.borrowBalanceCurrent(borrowers[0].address)).to.equal(0);
            expect(await vToken2.callStatic.borrowBalanceCurrent(borrowers[1].address)).to.satisfy(
              closeTo(expectedBorrow2After),
            );
            expect(await vToken2.callStatic.borrowBalanceCurrent(borrowers[2].address)).to.satisfy(
              closeTo(borrow3Before),
            );
          });

          it("uses the excess underlying to repay the debt in full", async () => {
            const excessUnderlying = parseUnits("1234", 18);
            await underlying2.connect(treasury).transfer(redeemer.address, excessUnderlying);
            await redeemer.connect(owner).redeemAndBatchRepay(vToken2.address, borrowerAddresses, treasury.address);
            for (const borrower of borrowers) {
              expect(await vToken2.callStatic.borrowBalanceCurrent(borrower.address)).to.equal(0);
            }
          });

          it("does not keep any vBNB or underlying balance", async () => {
            const excessUnderlying = parseUnits("1234", 18);
            await underlying2.connect(treasury).transfer(redeemer.address, excessUnderlying);
            await redeemer.connect(owner).redeemAndBatchRepay(vToken2.address, borrowerAddresses, treasury.address);
            expect(await vToken2.balanceOf(redeemer.address)).to.equal(0);
            expect(await underlying2.balanceOf(redeemer.address)).to.equal(0);
          });
        });
      });
    });

    describe("batchRepayVAI", () => {
      let borrower: SignerWithAddress;

      before(() => {
        borrower = borrowers[0];
      });

      after(async () => {
        await ethers.provider.send("evm_setAutomine", [true]);
      });

      it("fails if called by a non-owner", async () => {
        await expect(
          redeemer.connect(someone).batchRepayVAI(vaiController.address, [borrower.address], treasury.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("repays one borrow succesfully", async () => {
        await vaiController.connect(borrower).mintVAI(BORROWED_AMOUNT);
        await vai.mint(redeemer.address, BORROWED_AMOUNT);
        expect(await vaiController.getVAIRepayAmount(borrower.address)).to.equal(BORROWED_AMOUNT);
        await redeemer.connect(owner).batchRepayVAI(vaiController.address, [borrower.address], treasury.address);
        expect(await vaiController.getVAIRepayAmount(borrower.address)).to.equal(0);
      });

      it("repays multiple borrows succesfully and transfers refund to treasury", async () => {
        for (const borrower of borrowers) {
          await vaiController.connect(borrower).mintVAI(BORROWED_AMOUNT);
        }
        await vai.mint(redeemer.address, BORROWED_AMOUNT.mul(borrowers.length + 1));
        const tx = await redeemer.connect(owner).batchRepayVAI(
          vaiController.address,
          borrowers.map(b => b.address),
          treasury.address,
        );
        for (const borrower of borrowers) {
          expect(await vaiController.getVAIRepayAmount(borrower.address)).to.equal(0);
        }
        await expect(tx).to.changeTokenBalance(vai, treasury.address, BORROWED_AMOUNT);
      });

      it("partially repays borrows if insufficient VAI", async () => {
        await vaiController.connect(borrowers[0]).mintVAI(parseUnits("50", 18));
        await vaiController.connect(borrowers[1]).mintVAI(parseUnits("100", 18));
        await vaiController.connect(borrowers[2]).mintVAI(parseUnits("200", 18));
        await vai.mint(redeemer.address, parseUnits("100", 18));
        await redeemer.connect(owner).batchRepayVAI(
          vaiController.address,
          borrowers.map(b => b.address),
          treasury.address,
        );
        expect(await vaiController.getVAIRepayAmount(borrowers[0].address)).to.equal(0);
        expect(await vaiController.getVAIRepayAmount(borrowers[1].address)).to.equal(parseUnits("50", 18));
        expect(await vaiController.getVAIRepayAmount(borrowers[2].address)).to.equal(parseUnits("200", 18));
      });

      it("can repay small amounts without failure", async () => {
        await vaiController.connect(borrowers[0]).mintVAI(1);
        await vaiController.connect(borrowers[1]).mintVAI(2);
        await vaiController.connect(borrowers[2]).mintVAI(3);
        await vai.mint(redeemer.address, 3);
        expect(await vai.balanceOf(redeemer.address)).to.equal(3);
        await ethers.provider.send("evm_setAutomine", [false]);
        await vaiController.setBaseRate(parseUnits("105120", 18)); // 1% each block
        await mine(99);
        await vaiController.accrueVAIInterest();
        await mine();
        // 100 blocks here, so debt before the repayment is twice the initial amount
        expect(await vaiController.getVAIRepayAmount(borrowers[0].address)).to.equal(2);
        expect(await vaiController.getVAIRepayAmount(borrowers[1].address)).to.equal(4);
        expect(await vaiController.getVAIRepayAmount(borrowers[2].address)).to.equal(6);
        // We transfer the refund to someone instead of treasury here so that we don't need
        // to account for interest that is also transferred to treasury
        const tx = await redeemer.connect(owner).batchRepayVAI(
          vaiController.address,
          borrowers.map(b => b.address),
          someone.address,
        );
        await mine();
        expect(await vaiController.getVAIRepayAmount(borrowers[0].address)).to.equal(0);
        // The second repayment doesn't happen due to rounding in VAIController
        expect(await vaiController.getVAIRepayAmount(borrowers[1].address)).to.equal(4);
        expect(await vaiController.getVAIRepayAmount(borrowers[2].address)).to.equal(6);
        await ethers.provider.send("evm_setAutomine", [true]);
        // Still transfers 1 wei refund to treasury
        await expect(tx).to.changeTokenBalance(vai, someone.address, 1);
      });
    });

    describe("sweepTokens", async () => {
      it("fails if called by a non-owner", async () => {
        await expect(redeemer.connect(someone).sweepTokens(underlying2.address, treasury.address)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("sweeps tokens to destination if called by owner", async () => {
        const amount = parseUnits("1.2345", 18);
        await underlying2.connect(treasury).transfer(redeemer.address, amount);
        const tx = await redeemer.connect(owner).sweepTokens(underlying2.address, treasury.address);
        await expect(tx).to.changeTokenBalance(underlying2, treasury.address, amount);
      });

      it("sweeps native asset to destination", async () => {
        const NATIVE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
        const amount = parseEther("1234");
        await treasury.sendTransaction({ to: redeemer.address, value: amount });
        const tx = await redeemer.connect(owner).sweepTokens(NATIVE, treasury.address);
        await expect(tx).to.changeEtherBalance(treasury.address, amount);
      });
    });
  });
};

if (FORK_MAINNET) {
  const blockNumber = 37535000;
  forking(blockNumber, test(setupFork));
} else {
  test(setupLocal)();
}
