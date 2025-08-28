import { smock } from "@defi-wonderland/smock";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { FacetCutAction, getSelectors } from "../../../script/deploy/comptroller/diamond";
import {
  ComptrollerMock,
  ComptrollerMock__factory,
  Diamond,
  DiamondConsolidated,
  DiamondConsolidated__factory,
  Diamond__factory,
  IAccessControlManagerV8,
  IAccessControlManagerV8__factory,
  IERC20,
  IERC20__factory,
  ResilientOracleInterface,
  Unitroller__factory,
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

const FORK_MAINNET = process.env.FORKED_NETWORK === "bscmainnet";

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
    UNITROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
  },
};

let accessControlManager: IAccessControlManagerV8;
let timelock: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let vaiController: VAIController;
let vaiControllerProxy: VAIUnitroller;
let vai: VAI;
let usdt: IERC20;
let vUSDT: VBep20Delegate;
let comptroller: DiamondConsolidated;
let comptrollerNew: ComptrollerMock;
let diamond: Diamond;

const MINTED_AMOUNT = parseUnits("100", 18);

async function upgradeComptroller() {
  const DiamondFactory = await ethers.getContractFactory("Diamond");
  const newDiamond = await DiamondFactory.deploy();

  const Unitroller = Unitroller__factory.connect(networkAddresses.bscmainnet.UNITROLLER, timelock);
  await Unitroller._setPendingImplementation(newDiamond.address);
  await newDiamond.connect(timelock)._become(Unitroller.address);

  diamond = Diamond__factory.connect(networkAddresses.bscmainnet.UNITROLLER, timelock);

  // remove existing facets (excluding reward which has no changes)
  const excludeFacets = ["0xc2F6bDCEa4907E8CB7480d3d315bc01c125fb63C"];
  const cut: any[] = [];

  const facets = await diamond.facets();
  for (const facet of facets) {
    if (excludeFacets.includes(facet.facetAddress)) continue;
    cut.push({
      facetAddress: ethers.constants.AddressZero,
      action: FacetCutAction.Remove,
      functionSelectors: facet.functionSelectors,
    });
  }

  await diamond.diamondCut(cut);
  cut.length = 0; // clear array

  // deploy and add new facets
  const FacetNames = ["MarketFacet", "PolicyFacet", "SetterFacet"];
  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName);
    const facet = await Facet.deploy();
    await facet.deployed();

    const facetInterface = await ethers.getContractAt(`I${FacetName}`, facet.address);
    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facetInterface),
    });

    if (FacetName === "MarketFacet") {
      const baseIface = await ethers.getContractAt("IFacetBase", facet.address);
      let selectors = getSelectors(baseIface);
      // exclude duplicate selectors
      selectors = selectors.filter(x => !["0xbf32442d", "0xe85a2960"].includes(x));
      cut.push({
        facetAddress: facet.address,
        action: FacetCutAction.Add,
        functionSelectors: selectors,
      });
    }
  }

  await diamond.diamondCut(cut);

  comptrollerNew = ComptrollerMock__factory.connect(networkAddresses.bscmainnet.UNITROLLER, timelock);

  // set updated lens
  const ComptrollerLens = await ethers.getContractFactory("ComptrollerLens");
  const lens = await ComptrollerLens.deploy();
  await comptrollerNew._setComptrollerLens(lens.address);

  return comptrollerNew;
}

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

  accessControlManager = await IAccessControlManagerV8__factory.connect(networkAddresses.bscmainnet.acm, timelock);
  let tx = await accessControlManager
    .connect(timelock)
    .giveCallPermission(
      networkAddresses.bscmainnet.UNITROLLER,
      "setLiquidationManager(address)",
      networkAddresses.bscmainnet.normalTimelock,
    );
  await tx.wait();

  tx = await accessControlManager
    .connect(timelock)
    .giveCallPermission(
      networkAddresses.bscmainnet.UNITROLLER,
      "setMarketMaxLiquidationIncentive(address,uint256)",
      networkAddresses.bscmainnet.normalTimelock,
    );
  await tx.wait();

  comptrollerNew = await upgradeComptroller();
  const LiquidationManager = await ethers.getContractFactory("LiquidationManager");

  // constructor parameters
  const baseCloseFactorMantissa = ethers.utils.parseUnits("0.05", 18); // 5%
  const defaultCloseFactorMantissa = ethers.utils.parseUnits("0.5", 18); // 50%
  const targetHealthFactor = ethers.utils.parseUnits("1.1", 18); // 1.1

  const liquidationManager = await LiquidationManager.deploy(
    baseCloseFactorMantissa,
    defaultCloseFactorMantissa,
    targetHealthFactor,
  );
  await liquidationManager.deployed();
  await liquidationManager.initialize(accessControlManager.address);

  await comptrollerNew.setLiquidationManager(liquidationManager.address);

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
        await comptroller.connect(timelock).setCollateralFactor(addresses.vUSDT, 0, 0);
        await comptroller.connect(timelock).setMarketMaxLiquidationIncentive(addresses.vUSDT, parseUnits("1.1", 18));
        await vaiController.connect(timelock).setBaseRate(parseUnits("1", 18));
        await mine(100);

        const [, snapshotRaw] = await comptrollerNew.getHypotheticalHealthSnapshot(
          user1.address,
          ethers.constants.AddressZero,
          0,
          0,
        );

        const totalIncentive = await comptrollerNew["getDynamicLiquidationIncentive(address,uint256,uint256)"](
          addresses.vUSDT,
          snapshotRaw.liquidationThresholdAvg,
          snapshotRaw.healthFactor,
        );

        const snapshot = { ...snapshotRaw };
        snapshot.dynamicLiquidationIncentiveMantissa = totalIncentive;

        const [err, repaidAmountInSimulation] = await vaiController
          .connect(user2)
          .callStatic.liquidateVAI(user1.address, parseUnits("50", 18), addresses.vUSDT, snapshot);
        expect(err).to.equal(0);

        // The returned amount may be a bit less due to round-down in computing
        // the repaid percentage
        expect(repaidAmountInSimulation).to.satisfy(around(parseUnits("50", 18), 100));

        const vaiBalanceBefore = await vai.balanceOf(user2.address);
        await vaiController.connect(user2).liquidateVAI(user1.address, parseUnits("50", 18), addresses.vUSDT, snapshot);
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
