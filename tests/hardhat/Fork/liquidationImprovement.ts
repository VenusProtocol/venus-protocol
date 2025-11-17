import { smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { FacetCutAction, getSelectors } from "../../../script/deploy/comptroller/diamond";
import {
  ComptrollerMock__factory,
  Diamond__factory,
  IAccessControlManagerV8__factory,
  LiquidationManager,
  Liquidator as LiquidatorContract,
  Liquidator__factory,
  ProxyAdmin__factory,
  Unitroller__factory,
  VBep20Delegator,
  VBep20Delegator__factory,
} from "../../../typechain";
import { deployJumpRateModel } from "../fixtures/ComptrollerWithMarkets";
import { forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

async function upgradeComptroller() {
  const timelock = await initMainnetUser(addresses.bscmainnet.TIMELOCK, parseEther("1"));
  const DiamondFactory = await ethers.getContractFactory("Diamond");
  const newDiamond = await DiamondFactory.deploy();

  const Unitroller = Unitroller__factory.connect(addresses.bscmainnet.UNITROLLER, timelock);
  await Unitroller._setPendingImplementation(newDiamond.address);
  await newDiamond.connect(timelock)._become(Unitroller.address);

  const diamond = Diamond__factory.connect(addresses.bscmainnet.UNITROLLER, timelock);

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
      selectors = selectors.filter(x => !["0xbf32442d"].includes(x));
      cut.push({
        facetAddress: facet.address,
        action: FacetCutAction.Add,
        functionSelectors: selectors,
      });
    }
  }

  await diamond.diamondCut(cut);

  const comptrollerNew = ComptrollerMock__factory.connect(addresses.bscmainnet.UNITROLLER, timelock);

  // set updated lens
  const ComptrollerLens = await ethers.getContractFactory("ComptrollerLens");
  const lens = await ComptrollerLens.deploy();
  await comptrollerNew._setComptrollerLens(lens.address);

  const liquidatorNewFactory = await ethers.getContractFactory("Liquidator");
  const liquidatorNewImpl = await liquidatorNewFactory.deploy(
    addresses.bscmainnet.UNITROLLER,
    addresses.bscmainnet.VBNB,
    addresses.bscmainnet.WBNB,
    lens.address,
  );
  const proxyAdmin = ProxyAdmin__factory.connect("0x2b40B43AC5F7949905b0d2Ed9D6154a8ce06084a", timelock);

  await proxyAdmin.connect(timelock).upgrade(addresses.bscmainnet.LIQUIDATOR, liquidatorNewImpl.address);
  const liquidatorNew = Liquidator__factory.connect(addresses.bscmainnet.LIQUIDATOR, timelock);

  const protocolShareReserveFactory = await ethers.getContractFactory("ProtocolShareReserve");
  const protocolShareReserve = await protocolShareReserveFactory.deploy(
    comptrollerNew.address,
    addresses.bscmainnet.WBNB,
    addresses.bscmainnet.VBNB,
  );

  await liquidatorNew.connect(timelock).setProtocolShareReserve(protocolShareReserve.address);

  return comptrollerNew;
}

const addresses = {
  bscmainnet: {
    VBNB: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
    UNITROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
    VUSDT: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
    VETH: "0xf508fCD89b8bd15579dc79A6827cB4686A3592c8",
    ETH_HOLDER: "0x98B4be9C7a32A5d3bEFb08bB98d65E6D204f7E98",
    USDT_HOLDER: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    ACCESS_CONTROL_MANAGER: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
    LIQUIDATOR: "0x0870793286aada55d39ce7f82fb2766e8004cf43", // existing on-chain Liquidator
  },
};

const FORK_BLOCK = 68034344;

describe("Fork - Liquidator (Liquidator.sol) uses dynamic closeFactor & incentive", function () {
  this.timeout(180000);

  forking(FORK_BLOCK, () => {
    let timelock: any;
    let comptroller: any;
    let VETH: VBep20Delegator;
    let vUSDT: VBep20Delegator;
    let eth: any;
    let usdt: any;
    let liquidationManager: LiquidationManager;
    let liquidatorOnChain: LiquidatorContract;
    let borrower: any;
    let executor: any; // account that will call liquidator and provide repay funds

    before(async () => {
      // impersonate timelock and fund it
      timelock = await initMainnetUser(addresses.bscmainnet.TIMELOCK, parseEther("1"));

      // upgrade comptroller to new Diamond implementation (same pattern used elsewhere)

      comptroller = await upgradeComptroller();

      // Deploy LiquidationManager and set it on comptroller
      const baseCloseFactorMantissa = parseUnits("0.05", 18); // 5%
      const defaultCloseFactorMantissa = parseUnits("0.5", 18); // 50%
      const targetHealthFactor = parseUnits("1.1", 18); // 1.1

      const LMFactory = await ethers.getContractFactory("LiquidationManager");
      liquidationManager = (await LMFactory.connect(timelock).deploy(
        baseCloseFactorMantissa,
        defaultCloseFactorMantissa,
        targetHealthFactor,
      )) as LiquidationManager;
      await liquidationManager.deployed();
      await liquidationManager.connect(timelock).initialize(addresses.bscmainnet.ACCESS_CONTROL_MANAGER);

      // Grant timelock permission to set LiquidationManager via ACM and set it
      const acm = IAccessControlManagerV8__factory.connect(addresses.bscmainnet.ACCESS_CONTROL_MANAGER, timelock);
      await acm
        .connect(timelock)
        .giveCallPermission(
          addresses.bscmainnet.UNITROLLER,
          "setLiquidationManager(address)",
          addresses.bscmainnet.TIMELOCK,
        );

      await acm
        .connect(timelock)
        .giveCallPermission(
          addresses.bscmainnet.UNITROLLER,
          "setMarketMaxLiquidationIncentive(address,uint256)",
          addresses.bscmainnet.TIMELOCK,
        );

      await comptroller.connect(timelock).setLiquidationManager(liquidationManager.address);

      // Prepare vToken instances and set interest model to zero for determinism
      VETH = VBep20Delegator__factory.connect(addresses.bscmainnet.VETH, timelock) as VBep20Delegator;
      vUSDT = VBep20Delegator__factory.connect(addresses.bscmainnet.VUSDT, timelock) as VBep20Delegator;

      const vTokenFactory = await ethers.getContractFactory("VBep20Delegate");
      const vTokenImpl = await vTokenFactory.connect(timelock).deploy();
      await vTokenImpl.deployed();
      await (VETH as any).connect(timelock)._setImplementation(vTokenImpl.address, true, "0x00");
      await (vUSDT as any).connect(timelock)._setImplementation(vTokenImpl.address, true, "0x00");

      // zero interest rate model
      const zeroRateModel = await deployJumpRateModel({
        baseRatePerYear: 0,
        multiplierPerYear: 0,
        jumpMultiplierPerYear: 0,
      });

      await (VETH as any).connect(timelock)._setInterestRateModel(zeroRateModel.address);
      await (vUSDT as any).connect(timelock)._setInterestRateModel(zeroRateModel.address);

      // set market caps and force liquidation for determinism
      await comptroller
        .connect(timelock)
        ._setMarketSupplyCaps(
          [VETH.address, vUSDT.address],
          [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
        );
      await comptroller
        .connect(timelock)
        ._setMarketBorrowCaps(
          [VETH.address, vUSDT.address],
          [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
        );
      await comptroller.connect(timelock)._setForcedLiquidation(VETH.address, true);

      // set market max liquidation incentive to allow manager capping
      await comptroller
        .connect(timelock)
        ["setMarketMaxLiquidationIncentive(address,uint256)"](vUSDT.address, parseUnits("1.15", 18));
      await comptroller
        .connect(timelock)
        ["setMarketMaxLiquidationIncentive(address,uint256)"](VETH.address, parseUnits("1.15", 18));

      await comptroller
        .connect(timelock)
        ["setCollateralFactor(address,uint256,uint256)"](vUSDT.address, parseUnits("0.2", 18), parseUnits("0.2", 18));

      // get underlying token contracts
      eth = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await VETH.underlying());
      usdt = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vUSDT.underlying());

      // set up executor (liquidation caller) and borrower
      const signers = await ethers.getSigners();
      executor = signers[3];
      borrower = signers[2];

      // impersonate rich holders and transfer tokens
      const ethHolder = await initMainnetUser(addresses.bscmainnet.ETH_HOLDER, parseEther("1"));
      const usdtHolder = await initMainnetUser(addresses.bscmainnet.USDT_HOLDER, parseEther("1"));

      // fund executor with eth and approve the on-chain Liquidator
      await eth.connect(ethHolder).transfer(executor.address, parseUnits("1000", 18));
      const liquidatorAddr = addresses.bscmainnet.LIQUIDATOR;
      await eth.connect(executor).approve(liquidatorAddr, parseUnits("1000", 18));

      // prepare borrower: supply USDT as collateral and borrow eth
      await usdt.connect(usdtHolder).transfer(borrower.address, parseUnits("500", 18));

      await usdt.connect(borrower).approve(vUSDT.address, parseUnits("500", 18));

      await (vUSDT as any).connect(borrower).mint(parseUnits("500", 18));

      await comptroller.connect(borrower).enterMarkets([vUSDT.address]);

      await (VETH as any).connect(borrower).borrow(parseUnits("2", 16));

      // connect to on-chain Liquidator contract (existing deployment) as contract instance
      liquidatorOnChain = (await ethers.getContractAt("Liquidator", liquidatorAddr)) as LiquidatorContract;

      await acm
        .connect(timelock)
        .giveCallPermission(
          ethers.constants.AddressZero,
          "setDynamicCloseFactorEnabled(address,bool)",
          addresses.bscmainnet.TIMELOCK,
        );

      await acm
        .connect(timelock)
        .giveCallPermission(
          ethers.constants.AddressZero,
          "setDynamicLiquidationIncentiveEnabled(address,bool)",
          addresses.bscmainnet.TIMELOCK,
        );
    });

    it("executes liquidation via Liquidator and observes dynamic closeFactor & incentive", async () => {
      // enable dynamic flags in manager for the involved markets
      await liquidationManager.connect(timelock).setDynamicCloseFactorEnabled(VETH.address, true);
      await liquidationManager.connect(timelock).setDynamicLiquidationIncentiveEnabled(vUSDT.address, true);

      await comptroller
        .connect(timelock)
        ["setCollateralFactor(address,uint256,uint256)"](vUSDT.address, parseUnits("0.14", 18), parseUnits("0.14", 18));

      // compute a sample repay amount and precompute expected seize using comptroller calc
      const repayAmount = parseUnits("1", 16);

      const [err, totalSeized] = await comptroller.callStatic[
        "liquidateCalculateSeizeTokens(address,address,address,uint256)"
      ](borrower.address, VETH.address, vUSDT.address, repayAmount);

      expect(err).to.equal(0);

      // balances before
      const borrowerCollateralBefore = await vUSDT.callStatic.balanceOf(borrower.address);

      // execute liquidation using on-chain Liquidator contract; caller is executor
      await mine(30000);

      await liquidatorOnChain
        .connect(executor)
        .liquidateBorrow(VETH.address, borrower.address, repayAmount, vUSDT.address);
      // balances after
      const borrowerCollateralAfter = await vUSDT.callStatic.balanceOf(borrower.address);

      const actualSeized = borrowerCollateralBefore.sub(borrowerCollateralAfter);
      // actual seized should approximately equal comptroller's calculation
      expect(actualSeized).to.be.closeTo(totalSeized, 2);

      const markets = await comptroller["markets(address)"](vUSDT.address);
      const dynamicIncentive = await comptroller["getDynamicLiquidationIncentive(address,address)"](
        borrower.address,
        vUSDT.address,
      );
      // verify dynamic incentive is sane
      expect(dynamicIncentive.toString()).to.be.equal(markets.liquidationIncentiveMantissa.toString());

      const [, snapshot] = await comptroller.getHypotheticalHealthSnapshot(
        borrower.address,
        ethers.constants.AddressZero,
        0,
        0,
        1,
      );
      // verify dynamic close factor is sane
      const borrowBalance = await VETH.callStatic.borrowBalanceCurrent(borrower.address);
      const wtAvg = snapshot.liquidationThresholdAvg.div(10);
      const totalCollateral = snapshot.totalCollateral;
      const dynamicCloseFactor = await liquidationManager.calculateDynamicCloseFactor(
        VETH.address,
        borrowBalance,
        wtAvg,
        totalCollateral,
        dynamicIncentive,
        markets.liquidationIncentiveMantissa,
      );

      expect(dynamicCloseFactor.toString()).to.be.lte(parseUnits("1", 18));
      expect(dynamicCloseFactor.toString()).to.be.gte(parseUnits("0.01", 18));
    });
  });
});
