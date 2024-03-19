import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { FaucetToken, TokenRedeemer, TokenRedeemer__factory, VBep20 } from "../../../typechain";
import { deployComptrollerWithMarkets } from "../fixtures/ComptrollerWithMarkets";
import { FORK_MAINNET, around, forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const SUPPLIED_AMOUNT = parseUnits("5000", 18);
const BORROWED_AMOUNT = parseUnits("1000", 18);
const REPAY_AMOUNT = BORROWED_AMOUNT;

const addresses = {
  bscmainnet: {
    COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
    VBUSD: "0x95c78222B3D6e262426483D42CfA53685A67Ab9D",
    VUSDT: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
    BUSD_HOLDER: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    BUSD_HOLDER_2: "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
    TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
    ACCESS_CONTROL_MANAGER: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  },
};

const deployTokenRedeemer = async (owner: { address: string }): Promise<TokenRedeemer> => {
  const redeemerFactory: TokenRedeemer__factory = await ethers.getContractFactory("TokenRedeemer");
  const redeemer = await redeemerFactory.deploy(owner.address);
  await redeemer.deployed();
  return redeemer;
};

interface TokenRedeemerFixture {
  redeemer: TokenRedeemer;
  vToken: VBep20;
  vToken2: VBep20;
  underlying: FaucetToken;
  underlying2: FaucetToken;
  owner: SignerWithAddress;
  supplier: SignerWithAddress;
  borrower: SignerWithAddress;
  treasuryAddress: string;
}

const setupLocal = async (): Promise<TokenRedeemerFixture> => {
  const [, owner, supplier, treasury, borrower] = await ethers.getSigners();
  const { comptroller, vTokens } = await deployComptrollerWithMarkets({ numBep20Tokens: 2 });
  const [vToken, vToken2] = vTokens;

  const redeemer = await deployTokenRedeemer(owner);
  await comptroller._setMarketSupplyCaps(
    [vToken.address, vToken2.address],
    [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
  );
  await comptroller._setCollateralFactor(vToken.address, parseUnits("0.9", 18));
  const underlying = await ethers.getContractAt("FaucetToken", await vToken.underlying());
  const underlying2 = await ethers.getContractAt("FaucetToken", await vToken2.underlying());

  await underlying.allocateTo(supplier.address, SUPPLIED_AMOUNT);
  await underlying.connect(supplier).approve(vToken.address, SUPPLIED_AMOUNT);
  await vToken.connect(supplier).mint(SUPPLIED_AMOUNT);

  await underlying2.allocateTo(treasury.address, SUPPLIED_AMOUNT);
  await underlying2.connect(treasury).approve(vToken2.address, SUPPLIED_AMOUNT);
  await vToken2.connect(treasury).mint(SUPPLIED_AMOUNT);

  await underlying.allocateTo(borrower.address, SUPPLIED_AMOUNT);
  await underlying.connect(borrower).approve(vToken.address, SUPPLIED_AMOUNT);
  await vToken.connect(borrower).mint(SUPPLIED_AMOUNT);

  await comptroller.connect(borrower).enterMarkets([vToken.address]);

  return {
    redeemer,
    supplier,
    vToken,
    underlying,
    owner,
    treasuryAddress: treasury.address,
    vToken2,
    underlying2,
    borrower,
  };
};

const setupFork = async (): Promise<TokenRedeemerFixture> => {
  const comptroller = await ethers.getContractAt("ComptrollerMock", addresses.bscmainnet.COMPTROLLER);
  const vToken = await ethers.getContractAt("VBep20", addresses.bscmainnet.VBUSD);
  const vToken2 = await ethers.getContractAt("VBep20", addresses.bscmainnet.VUSDT);
  const underlying = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vToken.underlying());
  const underlying2 = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vToken2.underlying());
  const treasuryAddress = await comptroller.treasuryAddress();
  const treasurySigner = await initMainnetUser(treasuryAddress, ethers.utils.parseEther("3"));

  const timelock = await initMainnetUser(addresses.bscmainnet.TIMELOCK, parseEther("1"));
  const redeemer = await deployTokenRedeemer(timelock);
  await comptroller.connect(timelock)._setMarketSupplyCaps([vToken.address], [ethers.constants.MaxUint256]);
  const actions = { MINT: 0, ENTER_MARKET: 7 };
  await comptroller.connect(timelock)._setActionsPaused([vToken.address], [actions.MINT, actions.ENTER_MARKET], false);

  const supplier = await initMainnetUser(addresses.bscmainnet.BUSD_HOLDER, parseEther("1"));
  await underlying.connect(supplier).approve(vToken.address, SUPPLIED_AMOUNT);
  await vToken.connect(supplier).mint(SUPPLIED_AMOUNT); // inject liquidity

  await underlying2.connect(treasurySigner).approve(vToken2.address, SUPPLIED_AMOUNT);
  await vToken2.connect(treasurySigner).mint(SUPPLIED_AMOUNT);

  const borrower = await initMainnetUser(addresses.bscmainnet.BUSD_HOLDER_2, parseEther("1"));
  await underlying.connect(borrower).approve(vToken.address, SUPPLIED_AMOUNT);
  await vToken.connect(borrower).mint(SUPPLIED_AMOUNT);

  await comptroller.connect(borrower).enterMarkets([vToken.address]);

  return { redeemer, supplier, vToken, underlying, owner: timelock, treasuryAddress, vToken2, underlying2, borrower };
};

const test = (setup: () => Promise<TokenRedeemerFixture>) => () => {
  describe("TokenRedeemer", () => {
    let redeemer: TokenRedeemer;
    let vToken: VBep20;
    let vToken2: VBep20;
    let underlying: FaucetToken;
    let underlying2: FaucetToken;
    let owner: SignerWithAddress;
    let supplier: SignerWithAddress;
    let borrower: SignerWithAddress;
    let someone: SignerWithAddress;
    let treasuryAddress: string;

    beforeEach(async () => {
      ({ redeemer, vToken, underlying, owner, supplier, treasuryAddress, vToken2, underlying2, borrower } =
        await loadFixture(setup));
      [someone] = await ethers.getSigners();
    });

    describe("redeemAndTransfer", () => {
      it("should fail if called by a non-owner", async () => {
        await expect(redeemer.connect(someone).redeemAndTransfer(vToken.address, treasuryAddress)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("should fail if redeem fails", async () => {
        const failingVToken = await smock.fake<VBep20>("VBep20");
        failingVToken.redeem.returns(42);
        await expect(redeemer.connect(owner).redeemAndTransfer(failingVToken.address, treasuryAddress))
          .to.be.revertedWithCustomError(redeemer, "RedeemFailed")
          .withArgs(42);
      });

      it("should succeed with zero amount", async () => {
        const tx = await redeemer.connect(owner).redeemAndTransfer(vToken.address, treasuryAddress);
        await expect(tx).to.emit(vToken, "Transfer").withArgs(redeemer.address, vToken.address, "0");
        await expect(tx).to.emit(underlying, "Transfer").withArgs(redeemer.address, treasuryAddress, "0");
      });

      it("should redeem all vTokens", async () => {
        const vTokenAmount = await vToken.balanceOf(supplier.address);
        const closeToSuppliedAmount = around(SUPPLIED_AMOUNT, parseUnits("0.1", 18));
        await vToken.connect(supplier).transfer(redeemer.address, vTokenAmount);
        const tx = await redeemer.connect(owner).redeemAndTransfer(vToken.address, treasuryAddress);
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
        const tx = await redeemer.connect(owner).redeemAndTransfer(vToken.address, treasuryAddress);
        await expect(tx)
          .to.emit(underlying, "Transfer")
          .withArgs(redeemer.address, treasuryAddress, closeToSuppliedAmount);
        expect(await underlying.balanceOf(redeemer.address)).to.equal(0);
        expect(await underlying.balanceOf(treasuryAddress)).to.satisfy(closeToSuppliedAmount);
      });

      it("should revert if redeemer does not have vToken balance", async () => {
        await expect(
          redeemer
            .connect(owner)
            .redeemUnderlyingAndRepayBorrowBehalf(vToken2.address, borrower.address, REPAY_AMOUNT, treasuryAddress),
        ).to.be.reverted;
      });

      it("should redeem and repay succesfully", async () => {
        await vToken2.connect(borrower).borrow(BORROWED_AMOUNT);
        const treasurySigner = await ethers.getSigner(treasuryAddress);
        const vTokenAmount = await vToken2.balanceOf(treasuryAddress);

        await vToken2.connect(treasurySigner).transfer(redeemer.address, vTokenAmount);

        const borrowBalanceOld = await vToken2.borrowBalanceStored(borrower.address);
        const totalBorrowsOld = await vToken2.callStatic.totalBorrowsCurrent();
        const exchRateCurr = await vToken2.callStatic.exchangeRateCurrent();
        const vTokenRedeemAmount = REPAY_AMOUNT.mul(parseUnits("1", 18)).div(exchRateCurr);

        const closeToRepayAmount = around(vTokenRedeemAmount, parseUnits("0.1", 18));
        const closeToRemainingVtokenBal = around(vTokenAmount.sub(vTokenRedeemAmount), parseUnits("0.1", 18));
        const closeToBorrowBalNew = around(borrowBalanceOld.sub(REPAY_AMOUNT), parseUnits("0.1", 18));

        const tx = await redeemer
          .connect(owner)
          .redeemUnderlyingAndRepayBorrowBehalf(vToken2.address, borrower.address, REPAY_AMOUNT, treasuryAddress);
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
        const receiverVtokenBalanceNew = await vToken2.balanceOf(treasuryAddress);
        const redeemerUnderlyingBal = await underlying2.balanceOf(redeemer.address);
        const redeemerVtokenBalance = await vToken2.balanceOf(redeemer.address);

        expect(borrowBalanceNew).to.closeTo(borrowBalanceOld.sub(REPAY_AMOUNT), parseUnits("0.1", 18));
        expect(totalBorrowsNew).to.closeTo(totalBorrowsOld.sub(REPAY_AMOUNT), parseUnits("4", 18));
        expect(receiverVtokenBalanceNew).to.closeTo(vTokenAmount.sub(vTokenRedeemAmount), parseUnits("0.1", 18));
        expect(redeemerUnderlyingBal).equals(0);
        expect(redeemerVtokenBalance).equals(0);
      });
    });
  });
};

if (FORK_MAINNET) {
  const blockNumber = 34699200;
  forking(blockNumber, test(setupFork));
} else {
  test(setupLocal)();
}
