import { smock } from "@defi-wonderland/smock";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";

import { convertToUnit } from "../../../helpers/utils";
import {
  Comptroller,
  Comptroller__factory,
  IAccessControlManagerV8__factory,
  Liquidator,
  Liquidator__factory,
  PriceOracle,
  ProxyAdmin__factory,
  VAI,
  VAIController,
  VAIController__factory,
  VAI__factory,
} from "../../../typechain";
import { IAccessControlManager } from "../../../typechain/contracts/Governance";
import { initMainnetUser, setForkBlock } from "./utils";

const { ethers } = require("hardhat");

const FORK_MAINNET = process.env.FORK_MAINNET === "true";

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
// Vtoken treasury
const VTREASURY = "0xF322942f644A996A617BD29c16bd7d231d9F35E9";
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";

let impersonatedTimelock: Signer;
let accessControlManager: IAccessControlManager;
let liquidatorOld: Liquidator;
let liquidatorNew: Liquidator;
let comptroller: Comptroller;
let vaiController: VAIController;
let vai: VAI;

async function deployAndConfigureLiquidator() {
  /*
   *  Forking mainnet
   * */
  await impersonateAccount(NORMAL_TIMELOCK);
  impersonatedTimelock = await ethers.getSigner(NORMAL_TIMELOCK);
  await setBalance(NORMAL_TIMELOCK, ethers.utils.parseEther("2"));

  const liquidatorNewFactory = await ethers.getContractFactory("Liquidator");
  const liquidatorNewImpl = await liquidatorNewFactory.deploy(UNITROLLER, VBNB, VTREASURY);

  const proxyAdmin = ProxyAdmin__factory.connect("0x2b40B43AC5F7949905b0d2Ed9D6154a8ce06084a", impersonatedTimelock);
  const data = liquidatorNewImpl.interface.encodeFunctionData("initialize", [convertToUnit(5, 16), ACM]);
  await proxyAdmin.connect(impersonatedTimelock).upgradeAndCall(LIQUIDATOR, liquidatorNewImpl.address, data),
    { value: "1000000000" };

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
  await deployAndConfigureLiquidator();
  await grantPermissions();
  vai = VAI__factory.connect("0x4bd17003473389a42daf6a0a729f6fdb328bbbd7", impersonatedTimelock);
  comptroller = Comptroller__factory.connect(UNITROLLER, impersonatedTimelock);
  vaiController = VAIController__factory.connect(VAI_CONTROLLER, impersonatedTimelock);
  await liquidatorNew.connect(impersonatedTimelock).resumeForceVAILiquidate();
  await liquidatorNew.connect(impersonatedTimelock).setMinLiquidatableVAI(convertToUnit(1, 18));
}

if (FORK_MAINNET) {
  describe.only("LIQUIDATOR FORK TEST", async () => {
    it("Should match storage slots", async () => {
      const blockNumber = 27670044;
      await setForkBlock(blockNumber);
      await configureOldliquidator();
      await configure();
      const treasuryPercentMantissaOld = await liquidatorOld.treasuryPercentMantissa();
      const treasuryPercentMantissaNew = await liquidatorNew.treasuryPercentMantissa();
      expect(treasuryPercentMantissaNew).to.equals(treasuryPercentMantissaOld);
    });

    it("Should not able to liquidate any token when VAI debt is greater than minLiquidatableVAI", async () => {
      const blockNumber = 27884587;
      const borowedToken = "0x95c78222B3D6e262426483D42CfA53685A67Ab9D"; // VBUSD
      const borrower = "0xcdc4757ff570dcd6933f8d384293789907db6791";
      await setForkBlock(blockNumber);
      await configure();
      await expect(liquidatorNew.liquidateBorrow(borowedToken, borrower, 10000, VBNB)).to.be.revertedWithCustomError(
        liquidatorNew,
        "VAIDebtTooHigh",
      );
    });

    it("Should be able to liquidate any token when VAI debt is less than minLiquidatableVAI", async () => {
      const borrower = "0x6B7a803BB85C7D1F67470C50358d11902d3169e0";
      const liquidator = "0x2237ca42fe3522848dcb5a2f13571f5a4e2c5c14";
      const blockNumber = 27670044;
      await setForkBlock(blockNumber);
      await configure();
      const liquidatorSigner = await initMainnetUser(liquidator, ethers.utils.parseEther("2"));
      await expect(
        liquidatorNew.connect(liquidatorSigner).liquidateBorrow(VBNB, borrower, 1000, VBNB, { value: 1000 }),
      ).to.be.emit(liquidatorNew, "LiquidateBorrowedTokens");
    });

    it("Should able to liquidate any token when VAI debt is greater than minLiquidatableVAI but force VAI liquidation is off", async () => {
      const blockNumber = 27939619;
      const borrower = "0x016699fb47d0816d71ebed2f24473d57c762af51";
      const liquidator = "0xce74a760b754f7717e7a62e389d4b153aa753e0e";
      await setForkBlock(blockNumber);
      await configure();
      const liquidatorSigner = await initMainnetUser(liquidator, ethers.utils.parseEther("2"));
      await liquidatorNew.connect(impersonatedTimelock).pauseForceVAILiquidate();
      await vai.connect(liquidatorSigner).approve(LIQUIDATOR, 10000000000000);

      // Manipulate price to decrease liquidity and introdue shortfall
      const priceOracle = await smock.fake<PriceOracle>("PriceOracle");
      priceOracle.getUnderlyingPrice.returns(1);
      await comptroller.connect(impersonatedTimelock)._setPriceOracle(priceOracle.address);

      const minLiquidatableVAI = await liquidatorNew.minLiquidatableVAI();
      const vaiDebt = await vaiController.getVAIRepayAmount(borrower);
      expect(vaiDebt).to.greaterThan(minLiquidatableVAI);

      await liquidatorNew.connect(liquidatorSigner).liquidateBorrow(VAI_CONTROLLER, borrower, 100, VBNB);
    });
  });
}
