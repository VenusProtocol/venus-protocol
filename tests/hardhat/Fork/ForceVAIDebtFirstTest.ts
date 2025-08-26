import { smock } from "@defi-wonderland/smock";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";

import { convertToUnit } from "../../../helpers/utils";
import { FacetCutAction, getSelectors } from "../../../script/deploy/comptroller/diamond";
import {
  ComptrollerMock,
  ComptrollerMock__factory,
  ComptrollerHarness__factory as Comptroller__factory,
  Diamond,
  Diamond__factory,
  FaucetToken__factory,
  IAccessControlManagerV8__factory,
  IProtocolShareReserve,
  Liquidator,
  Liquidator__factory,
  PriceOracle,
  ProxyAdmin__factory,
  Unitroller__factory,
  VAI,
  VAIController,
  VAIController__factory,
  VAI__factory,
  VBep20Delegate__factory,
} from "../../../typechain";
import { IAccessControlManagerV8 } from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const { ethers } = require("hardhat");

const FORK_MAINNET = process.env.FORKED_NETWORK === "bscmainnet";

// Address of the VAI_UNITROLLER
const VAI_CONTROLLER = "0x004065D34C6b18cE4370ced1CeBDE94865DbFAFE";
// Address of VAI token contract
const VAI_HOLDER = "0xce74a760b754f7717e7a62e389d4b153aa753e0e";
// Address of already deployed access control manager
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
// Owner of the ACM
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
// Proxy address of Liquidator
const LIQUIDATOR = "0x0870793286aada55d39ce7f82fb2766e8004cf43";
// Address of comptroller proxy
const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
// VBNB contract address
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
// WBNB contrat Address
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

let impersonatedTimelock: Signer;
let accessControlManager: IAccessControlManagerV8;
let liquidatorOld: Liquidator;
let liquidatorNew: Liquidator;
let comptroller: ComptrollerMock;
let vaiController: VAIController;
let vai: VAI;
let diamond: Diamond;

async function upgradeComptroller() {
  const DiamondFactory = await ethers.getContractFactory("Diamond");
  const newDiamond = await DiamondFactory.deploy();

  const Unitroller = Unitroller__factory.connect(UNITROLLER, impersonatedTimelock);
  await Unitroller._setPendingImplementation(newDiamond.address);
  await newDiamond.connect(impersonatedTimelock)._become(Unitroller.address);

  diamond = Diamond__factory.connect(UNITROLLER, impersonatedTimelock);

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

  comptroller = ComptrollerMock__factory.connect(UNITROLLER, impersonatedTimelock);

  // set updated lens
  const ComptrollerLens = await ethers.getContractFactory("ComptrollerLens");
  const lens = await ComptrollerLens.deploy();
  await comptroller._setComptrollerLens(lens.address);

  return comptroller;
}

async function deployAndConfigureLiquidator() {
  /*
   *  Forking mainnet
   * */
  await impersonateAccount(NORMAL_TIMELOCK);
  impersonatedTimelock = await ethers.getSigner(NORMAL_TIMELOCK);
  await setBalance(NORMAL_TIMELOCK, ethers.utils.parseEther("2"));

  comptroller = await upgradeComptroller();

  const comptrollerLensFactory = await ethers.getContractFactory("ComptrollerLens");
  const comptrollerLens = await comptrollerLensFactory.deploy();
  await comptrollerLens.deployed();

  accessControlManager = await IAccessControlManagerV8__factory.connect(ACM, impersonatedTimelock);
  const tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(UNITROLLER, "setLiquidationManager(address)", NORMAL_TIMELOCK);
  await tx.wait();

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

  await comptroller.setLiquidationManager(liquidationManager.address);

  // const vBNB = await deployVBNB({ comptroller });
  const liquidatorNewFactory = await ethers.getContractFactory("Liquidator");
  const liquidatorNewImpl = await liquidatorNewFactory.deploy(UNITROLLER, VBNB, WBNB, comptrollerLens.address);

  const proxyAdmin = ProxyAdmin__factory.connect("0x2b40B43AC5F7949905b0d2Ed9D6154a8ce06084a", impersonatedTimelock);
  protocolShareReserve = await smock.fake<IProtocolShareReserve>("IProtocolShareReserve");

  await proxyAdmin.connect(impersonatedTimelock).upgrade(LIQUIDATOR, liquidatorNewImpl.address);

  liquidatorNew = Liquidator__factory.connect(LIQUIDATOR, impersonatedTimelock);
}

async function grantPermissions() {
  accessControlManager = await IAccessControlManagerV8__factory.connect(ACM, impersonatedTimelock);
  let tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(LIQUIDATOR, "setMinLiquidatableVAI(uint256)", NORMAL_TIMELOCK);
  await tx.wait();
  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(LIQUIDATOR, "pauseForceVAILiquidate()", NORMAL_TIMELOCK);
  await tx.wait();
  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(LIQUIDATOR, "resumeForceVAILiquidate()", NORMAL_TIMELOCK);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(UNITROLLER, "_setActionsPaused(address[],address[],bool),", NORMAL_TIMELOCK);
  await tx.wait();
  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(LIQUIDATOR, "setPendingRedeemChunkLength(uint256)", NORMAL_TIMELOCK);
  await tx.wait();
  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(UNITROLLER, "_setForcedLiquidation(address,bool)", NORMAL_TIMELOCK);
  await tx.wait();
}

async function configureOldliquidator() {
  /*
   *  Forking mainnet
   * */
  await impersonateAccount(NORMAL_TIMELOCK);
  impersonatedTimelock = await ethers.getSigner(NORMAL_TIMELOCK);
  await setBalance(NORMAL_TIMELOCK, ethers.utils.parseEther("2"));
  liquidatorOld = Liquidator__factory.connect(LIQUIDATOR, impersonatedTimelock);
}

async function configure() {
  await setForkBlock(58948164);
  await deployAndConfigureLiquidator();
  // await deployAndConfigureComptroller();
  await grantPermissions();
  vai = VAI__factory.connect("0x4bd17003473389a42daf6a0a729f6fdb328bbbd7", impersonatedTimelock);
  // comptroller = Comptroller__factory.connect(UNITROLLER, impersonatedTimelock);
  vaiController = VAIController__factory.connect(VAI_CONTROLLER, impersonatedTimelock);
  await liquidatorNew.connect(impersonatedTimelock).setPendingRedeemChunkLength(5);
  await liquidatorNew.connect(impersonatedTimelock).resumeForceVAILiquidate();
  await liquidatorNew.connect(impersonatedTimelock).setMinLiquidatableVAI(convertToUnit(1, 18));
}

if (FORK_MAINNET) {
  describe("FORCE VAI DEBT FIRST TEST", async () => {
    it("Should match storage slots", async () => {
      const blockNumber = 58948164;
      await setForkBlock(blockNumber);
      await configureOldliquidator();
      await configure();
      const treasuryPercentMantissaOld = await liquidatorOld.treasuryPercentMantissa();
      const treasuryPercentMantissaNew = await liquidatorNew.treasuryPercentMantissa();
      expect(treasuryPercentMantissaNew).to.equals(treasuryPercentMantissaOld);
    });

    it("Should not able to liquidate any token when VAI debt is greater than minLiquidatableVAI", async () => {
      const blockNumber = 31937695;
      const borowedToken = "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8"; // VUSDC
      const borrower = "0x016699fb47d0816d71ebed2f24473d57c762af51";
      await setForkBlock(blockNumber);
      await configure();

      const minLiquidatableVAI = await liquidatorNew.minLiquidatableVAI();
      const vaiDebt = await vaiController.getVAIRepayAmount(borrower);
      expect(vaiDebt).to.greaterThan(minLiquidatableVAI);

      await expect(liquidatorNew.liquidateBorrow(borowedToken, borrower, 10000, VBNB)).to.be.revertedWithCustomError(
        liquidatorNew,
        "VAIDebtTooHigh",
      );
    });

    it("Should be able to liquidate any token when VAI debt is less than minLiquidatableVAI", async () => {
      const borrower = "0x6B7a803BB85C7D1F67470C50358d11902d3169e0";
      const liquidator = "0x2237ca42fe3522848dcb5a2f13571f5a4e2c5c14";
      const blockNumber = 31937695;
      await setForkBlock(blockNumber);
      await configure();
      const liquidatorSigner = await initMainnetUser(liquidator, ethers.utils.parseEther("2"));
      await expect(
        liquidatorNew.connect(liquidatorSigner).liquidateBorrow(VBNB, borrower, 1000, VBNB, { value: 1000 }),
      ).to.be.emit(liquidatorNew, "LiquidateBorrowedTokens");
    });

    it("Should able to liquidate any token when VAI debt is greater than minLiquidatableVAI but force VAI liquidation is off", async () => {
      const blockNumber = 31937695;
      const borrower = "0x016699fb47d0816d71ebed2f24473d57c762af51";
      const liquidator = "0xce74a760b754f7717e7a62e389d4b153aa753e0e";
      await setForkBlock(blockNumber);
      await configure();
      const liquidatorSigner = await initMainnetUser(liquidator, ethers.utils.parseEther("2"));
      await liquidatorNew.connect(impersonatedTimelock).pauseForceVAILiquidate();
      await vai.connect(liquidatorSigner).approve(LIQUIDATOR, 10000000000000);

      // Manipulate price to decrease liquidity and introduce shortfall
      const priceOracle = await smock.fake<PriceOracle>("PriceOracle");
      priceOracle.getUnderlyingPrice.returns(1);
      await comptroller.connect(impersonatedTimelock)._setPriceOracle(priceOracle.address);

      const minLiquidatableVAI = await liquidatorNew.minLiquidatableVAI();
      const vaiDebt = await vaiController.getVAIRepayAmount(borrower);
      expect(vaiDebt).to.greaterThan(minLiquidatableVAI);

      await liquidatorNew.connect(liquidatorSigner).liquidateBorrow(VAI_CONTROLLER, borrower, 100, VBNB);
    });
  });

  it("Should able to liquidate any token when forced liquidation is enable and VAIdebt > minLiquidatableVAI, force VAI liquidation = true, liquidating assset ! VAI ", async () => {
    const blockNumber = 31937695;
    const borrowedVToken = "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8"; // VUSDC
    const borrowedUnderlying = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"; // USDC
    const borrower = "0x016699fb47d0816d71ebed2f24473d57c762af51";
    const liquidator = "0xB6F6D86a8f9879A9c87f643768d9efc38c1Da6E7";
    await setForkBlock(blockNumber);
    await configure();

    const vToken = VBep20Delegate__factory.connect(borrowedVToken, impersonatedTimelock);

    const borrowerSigner = await initMainnetUser(borrower, ethers.utils.parseEther("2"));
    await vToken.connect(borrowerSigner).borrow(1000);

    // Manipulate price to decrease liquidity and introduce shortfall
    const priceOracle = await smock.fake<PriceOracle>("PriceOracle");
    priceOracle.getUnderlyingPrice.returns(1);
    await comptroller.connect(impersonatedTimelock)._setPriceOracle(priceOracle.address);
    await comptroller.connect(impersonatedTimelock)._setForcedLiquidation(borrowedVToken, true);

    const liquidatorSigner = await initMainnetUser(liquidator, ethers.utils.parseEther("2"));
    const tokenBorrowedUnderlying = FaucetToken__factory.connect(borrowedUnderlying, impersonatedTimelock);
    await tokenBorrowedUnderlying.connect(liquidatorSigner).approve(LIQUIDATOR, 1000000000);

    await expect(
      liquidatorNew.connect(liquidatorSigner).liquidateBorrow(borrowedVToken, borrower, 1000, VBNB),
    ).to.be.emit(liquidatorNew, "LiquidateBorrowedTokens");
  });
}
