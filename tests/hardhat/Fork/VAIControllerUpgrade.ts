import { smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  DiamondConsolidated,
  DiamondConsolidated__factory,
  IERC20,
  IERC20__factory,
  ResilientOracleInterface,
  VAI,
  VAIController,
  VAIController__factory,
  VAIUnitroller,
  VAIUnitroller__factory,
  VAI__factory,
  VBep20Delegate,
  VBep20Delegate__factory,
} from "../../../typechain";
import { around, forking, initMainnetUser } from "./utils";

const FORK_MAINNET = process.env.FORK === "true" && process.env.FORKED_NETWORK === "bscmainnet";

const forkedNetwork = () => {
  const net = process.env.FORKED_NETWORK || "";
  if (["bscmainnet"].includes(net)) {
    return net;
  }
  throw new Error("Unsupported network");
};

const networkAddresses = {
  bscmainnet: {
    vaiControllerProxy: "0x004065D34C6b18cE4370ced1CeBDE94865DbFAFE",
    oldVaiControllerImplementation: "0x9817823d5C4023EFb6173099928F17bb77CD1d69",
    vai: "0x4BD17003473389A42DAF6a0a729f6Fdb328BbBd7",
    normalTimelock: "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396",
    acm: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
    usdt: "0x55d398326f99059fF775485246999027B3197955",
    vUSDT: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
    usdtHolder: "0x796db965bB0aDf9f3732e84428af1bc0efBebb37",
  },
};

let timelock: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let vaiController: VAIController;
let vaiControllerProxy: VAIUnitroller;
let vai: VAI;
let usdt: IERC20;
let vUSDT: VBep20Delegate;
let comptroller: DiamondConsolidated;

const MINTED_AMOUNT = parseUnits("100", 18);

const current = async () => {
  [, user1, user2] = await ethers.getSigners();
  const addresses = networkAddresses[forkedNetwork()];
  timelock = await initMainnetUser(addresses.normalTimelock, parseEther("1"));
  const usdtHolder = await initMainnetUser(addresses.usdtHolder, parseEther("1"));
  vaiControllerProxy = VAIUnitroller__factory.connect(addresses.vaiControllerProxy, timelock);
  vaiController = VAIController__factory.connect(addresses.vaiControllerProxy, timelock);
  vai = VAI__factory.connect(addresses.vai, user1);
  usdt = IERC20__factory.connect(addresses.usdt, usdtHolder);
  vUSDT = VBep20Delegate__factory.connect(addresses.vUSDT, usdtHolder);
  await vaiController.connect(timelock).toggleOnlyPrimeHolderMint();
  await vaiController.connect(timelock).setBaseRate(0);
  await vaiController.connect(timelock).setFloatRate(0);
  await usdt.approve(addresses.vUSDT, ethers.constants.MaxUint256);
  await vUSDT.mintBehalf(user1.address, parseUnits("1000", 18));
  comptroller = DiamondConsolidated__factory.connect(await vUSDT.comptroller(), user1);
  const oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
  oracle.getPrice.returns(parseUnits("1", 18));
  oracle.getUnderlyingPrice.returns(parseUnits("1", 18));
  await comptroller.connect(timelock)._setPriceOracle(oracle.address);
  await comptroller.connect(timelock)._setLiquidatorContract(user2.address);
  await comptroller.enterMarkets([vUSDT.address]);
  await vaiController.connect(user1).mintVAI(MINTED_AMOUNT);
  await vai.connect(timelock).rely(timelock.address);
  await vai.connect(timelock).mint(user1.address, parseUnits("1000", 18));
  await vai.connect(timelock).mint(user2.address, parseUnits("1000", 18));
  await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
  await vai.connect(user2).approve(vaiController.address, ethers.constants.MaxUint256);
};

const upgraded = async () => {
  await loadFixture(current);

  const vaiControllerFactory = await ethers.getContractFactory("VAIController");
  const vaiControllerImpl = await vaiControllerFactory.deploy();
  await vaiControllerImpl.deployed();

  await vaiControllerProxy.connect(timelock)._setPendingImplementation(vaiControllerImpl.address);
  await vaiControllerImpl.connect(timelock)._become(vaiControllerProxy.address);
};

if (FORK_MAINNET) {
  const blockNumber = 37654321;
  forking(blockNumber, () => {
    const addresses = networkAddresses[forkedNetwork()];

    describe("before upgrade", async () => {
      beforeEach(async () => {
        await loadFixture(current);
      });

      it("has the old implementation", async () => {
        expect(await vaiControllerProxy.vaiControllerImplementation()).to.equal(
          addresses.oldVaiControllerImplementation,
        );
      });

      it("does not include interest in repaid amount", async () => {
        await vaiController.connect(timelock).setBaseRate(parseUnits("0.2", 18));
        await mine(100);
        await vaiController.accrueVAIInterest();
        const amountToRepay = await vaiController.getVAIRepayAmount(user1.address);
        const [err, repaidAmount] = await vaiController.connect(user1).callStatic.repayVAI(amountToRepay);
        expect(err).to.equal(0);
        expect(repaidAmount).to.equal(MINTED_AMOUNT); // No interest here
      });
    });

    describe("after upgrade", async () => {
      beforeEach(async () => {
        await loadFixture(upgraded);
      });

      it("includes interest in repaid amount", async () => {
        await vaiController.connect(timelock).setBaseRate(parseUnits("100", 18));
        await mine(100);
        await vaiController.accrueVAIInterest();
        const amountToRepay = await vaiController.getVAIRepayAmount(user1.address);
        const [err, repaidAmount] = await vaiController.connect(user1).callStatic.repayVAI(amountToRepay);
        expect(err).to.equal(0);
        expect(repaidAmount).to.equal(amountToRepay); // Exactly the entire debt for full repayments
      });

      it("sends the actually repaid amount * liquidation incentive during liquidation", async () => {
        await comptroller.connect(timelock)._setCollateralFactor(addresses.vUSDT, 0);
        await vaiController.connect(timelock).setBaseRate(parseUnits("1", 18));
        await mine(100);

        const [err, repaidAmountInSimulation] = await vaiController
          .connect(user2)
          .callStatic.liquidateVAI(user1.address, parseUnits("50", 18), addresses.vUSDT);
        expect(err).to.equal(0);

        // The returned amount may be a bit less due to round-down in computing
        // the repaid percentage
        expect(repaidAmountInSimulation).to.satisfy(around(parseUnits("50", 18), 100));

        const vaiBalanceBefore = await vai.balanceOf(user2.address);
        await vaiController.connect(user2).liquidateVAI(user1.address, parseUnits("50", 18), addresses.vUSDT);
        const vaiBalanceAfter = await vai.balanceOf(user2.address);

        // One block of interest changes the percentage, so the transferred amount may
        // not exactly match the amount simulated above, but they should be pretty close
        const actuallyRepaidAmount = vaiBalanceBefore.sub(vaiBalanceAfter);
        expect(actuallyRepaidAmount).to.satisfy(around(repaidAmountInSimulation, 100));

        // Up to (underlying decimals - vToken decimals) precision
        const expectedUSDT = actuallyRepaidAmount.mul(110).div(100);
        expect(await vUSDT.callStatic.balanceOfUnderlying(user2.address)).to.satisfy(
          around(expectedUSDT, parseUnits("1", 10)),
        );
      });
    });
  });
}
