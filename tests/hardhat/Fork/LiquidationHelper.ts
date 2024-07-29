import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { Interface, parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  BEP20,
  IVBNB,
  LiquidationHelper,
  LiquidationHelper__factory,
  Liquidator,
  VAI,
  VAIController,
  VBep20,
} from "../../../typechain";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const LIQUIDATOR = "0x0870793286aada55d39ce7f82fb2766e8004cf43";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
const TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const NATIVE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";

const deployLiquidationHelper = async (owner: { address: string }): Promise<LiquidationHelper> => {
  const liquidationHelperFactory: LiquidationHelper__factory = await ethers.getContractFactory("LiquidationHelper");
  const liquidationHelper = await liquidationHelperFactory.deploy(owner.address, LIQUIDATOR, VBNB);
  await liquidationHelper.deployed();
  return liquidationHelper;
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

interface LiquidationHelperFixture {
  liquidationHelper: LiquidationHelper;
  liquidatorContract: Liquidator;
  vUSDT: VBep20;
  vBNB: IVBNB;
  vaiController: VAIController;
  vai: VAI;
  usdt: BEP20;
  owner: SignerWithAddress;
  treasury: SignerWithAddress;
}

const setupFork = async (): Promise<LiquidationHelperFixture> => {
  const comptroller = await ethers.getContractAt("ComptrollerMock", COMPTROLLER);
  const liquidatorContract = await ethers.getContractAt("Liquidator", LIQUIDATOR);
  const vUSDT = await ethers.getContractAt("VBep20", VUSDT);
  const vBNB = new ethers.Contract(VBNB, bscmainnetVBNBInterface, ethers.provider);
  const usdt = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vUSDT.underlying());
  const treasuryAddress = await comptroller.treasuryAddress();
  const treasury = await initMainnetUser(treasuryAddress, parseUnits("3000", 18));

  const timelock = await initMainnetUser(TIMELOCK, parseEther("1"));
  const liquidationHelper = await deployLiquidationHelper(timelock);

  const vaiController = await ethers.getContractAt("VAIController", await comptroller.vaiController(), timelock);

  await vaiController.setBaseRate(0);
  await vaiController.setFloatRate(0);
  await vaiController.toggleOnlyPrimeHolderMint();
  const vai = await ethers.getContractAt("VAI", await vaiController.getVAIAddress(), timelock);

  return {
    liquidationHelper,
    liquidatorContract,
    owner: timelock,
    treasury,
    vUSDT,
    usdt,
    vBNB,
    vaiController,
    vai,
  };
};

const test = () => {
  describe("TokenRedeemer", () => {
    let liquidationHelper: LiquidationHelper;
    let liquidatorContract: Liquidator;
    let vUSDT: VBep20;
    let vBNB: IVBNB;
    let vaiController: VAIController;
    let vai: VAI;
    let usdt: BEP20;
    let owner: SignerWithAddress;
    let someone: SignerWithAddress;
    let treasury: SignerWithAddress;

    beforeEach(async () => {
      ({ liquidationHelper, liquidatorContract, vUSDT, usdt, owner, treasury, vBNB, vaiController, vai } =
        await loadFixture(setupFork));
      [someone] = await ethers.getSigners();
    });

    describe("liquidateBatch", () => {
      it("liquidates a batch with in-kind borrows", async () => {
        const bnbToRepay = parseEther("0.017101");
        const usdtToRepay = parseUnits("2.323", 18);
        await treasury.sendTransaction({ to: liquidationHelper.address, value: bnbToRepay });
        await usdt.connect(treasury).transfer(liquidationHelper.address, usdtToRepay);
        const tx = await liquidationHelper.connect(owner).liquidateBatch([
          {
            vTokenBorrowed: vBNB.address,
            vTokenCollateral: vBNB.address,
            amount: bnbToRepay,
            borrower: "0x6b7a803bb85c7d1f67470c50358d11902d3169e0",
          },
          {
            vTokenBorrowed: vUSDT.address,
            vTokenCollateral: vUSDT.address,
            amount: usdtToRepay,
            borrower: "0x107e5cff37c693424dd7f672f0a39f8df5777788",
          },
        ]);
        await expect(tx).to.emit(liquidatorContract, "LiquidateBorrowedTokens");
      });

      it("liquidates a VAI borrow", async () => {
        const vaiToRepay = parseUnits("1", 18);
        await vai.connect(treasury).transfer(liquidationHelper.address, vaiToRepay);
        const vXVSAddress = "0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D";
        const tx = await liquidationHelper.connect(owner).liquidateBatch([
          {
            vTokenBorrowed: vaiController.address,
            vTokenCollateral: vXVSAddress,
            amount: vaiToRepay,
            borrower: "0xfcc7b5f420610a24f05a0b59ec193da6dff0ab1f",
          },
        ]);
        await expect(tx).to.emit(liquidatorContract, "LiquidateBorrowedTokens");
      });
    });

    describe("sweepTokens", () => {
      it("fails if called by a non-owner", async () => {
        await expect(liquidationHelper.connect(someone).sweepTokens(usdt.address, treasury.address)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("sweeps tokens to destination if called by owner", async () => {
        const amount = parseUnits("1.2345", 18);
        await usdt.connect(treasury).transfer(liquidationHelper.address, amount);
        const tx = await liquidationHelper.connect(owner).sweepTokens(usdt.address, treasury.address);
        await expect(tx).to.changeTokenBalance(usdt, treasury.address, amount);
      });

      it("sweeps native asset to destination", async () => {
        const amount = parseEther("1");
        await treasury.sendTransaction({ to: liquidationHelper.address, value: amount });
        const tx = await liquidationHelper.connect(owner).sweepTokens(NATIVE, treasury.address);
        await expect(tx).to.changeEtherBalance(treasury.address, amount);
      });
    });

    describe("sweepTokensBatch", () => {
      it("fails if called by a non-owner", async () => {
        await expect(
          liquidationHelper.connect(someone).sweepTokensBatch([usdt.address, NATIVE], treasury.address),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("sweeps batch of tokens to destination if called by owner", async () => {
        const amount = parseUnits("1", 18);
        await usdt.connect(treasury).transfer(liquidationHelper.address, amount);
        await treasury.sendTransaction({ to: liquidationHelper.address, value: amount });
        const tx = await liquidationHelper.connect(owner).sweepTokensBatch([usdt.address, NATIVE], treasury.address);
        await expect(tx).to.changeTokenBalance(usdt, treasury.address, amount);
        await expect(tx).to.changeEtherBalance(treasury.address, amount);
      });
    });
  });
};

if (FORK_MAINNET) {
  const blockNumber = 40718800;
  forking(blockNumber, test);
}
