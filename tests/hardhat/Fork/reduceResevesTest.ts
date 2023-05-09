import { FakeContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Signer } from "ethers";

import { convertToUnit } from "../../../helpers/utils";
import {
  Comptroller,
  Comptroller__factory,
  IAccessControlManagerV8__factory,
  IProtocolShareReserve,
  Liquidator,
  Liquidator__factory,
  MockVBNB,
  MockVBNB__factory,
  PriceOracle,
  ProxyAdmin__factory,
  VAI,
  VAIController,
  VAIController__factory,
  VAI__factory,
  WBNB__factory,
} from "../../../typechain";
import { IAccessControlManager } from "../../../typechain/contracts/Governance";
import { initMainnetUser, setForkBlock } from "./utils";

const { ethers } = require("hardhat");

const FORK_MAINNET = process.env.FORK_MAINNET === "true";

// Address of the VAI_UNITROLLER
const VAI_CONTROLLER = "0x004065D34C6b18cE4370ced1CeBDE94865DbFAFE";
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
// VBNB token address
const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
// WBNB contrat Address
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

let impersonatedTimelock: Signer;
let liquidator: Liquidator;
let comptroller: Comptroller;
let vaiController: VAIController;
let vai: VAI;
let vBnb: MockVBNB
let protocolShareReserve: FakeContract<IProtocolShareReserve>;

async function deployAndConfigureLiquidator() {
  /*
   *  Forking mainnet
   * */
  await impersonateAccount(NORMAL_TIMELOCK);
  impersonatedTimelock = await ethers.getSigner(NORMAL_TIMELOCK);
  await setBalance(NORMAL_TIMELOCK, ethers.utils.parseEther("2"));

  const liquidatorNewFactory = await ethers.getContractFactory("Liquidator");
  const liquidatorNewImpl = await liquidatorNewFactory.deploy(UNITROLLER, VBNB, WBNB);
  protocolShareReserve = await smock.fake<IProtocolShareReserve>("IProtocolShareReserve");
  const proxyAdmin = ProxyAdmin__factory.connect("0x2b40B43AC5F7949905b0d2Ed9D6154a8ce06084a", impersonatedTimelock);
  const data = liquidatorNewImpl.interface.encodeFunctionData("initialize", [convertToUnit(5, 16), ACM, protocolShareReserve.address]);
  await proxyAdmin.connect(impersonatedTimelock).upgradeAndCall(LIQUIDATOR, liquidatorNewImpl.address, data),
    { value: "1000000000" };
  liquidator = Liquidator__factory.connect(LIQUIDATOR, impersonatedTimelock);
}

async function configure() {
  console.log("HEREEEEEEEE");
  await deployAndConfigureLiquidator();
  vai = VAI__factory.connect("0x4bd17003473389a42daf6a0a729f6fdb328bbbd7", impersonatedTimelock);
  vBnb = MockVBNB__factory.connect(VBNB, impersonatedTimelock);
  comptroller = Comptroller__factory.connect(UNITROLLER, impersonatedTimelock);
  vaiController = VAIController__factory.connect(VAI_CONTROLLER, impersonatedTimelock);
}

if (FORK_MAINNET) {
  describe("LIQUIDATOR REDUCE RESERVES FORK TEST", async () => {
    it("Should seize and split seized tokens between liquidator and protocol share reserve", async () => {
      const blockNumber = 27670044
      const repayAmount = 29220000000000000;
      const borrower = "0x6B7a803BB85C7D1F67470C50358d11902d3169e0";
      const liquidatorAccount ="0x2237ca42fe3522848dcb5a2f13571f5a4e2c5c14"
      console.log("YAA SE AAGE");
      await setForkBlock(blockNumber);
      console.log("HERE");
      await configure();
      console.log(await vBnb.balanceOf(liquidatorAccount));
      const liquidatorSigner = await initMainnetUser(liquidatorAccount, ethers.utils.parseEther("2"));
      await liquidator.connect(liquidatorSigner).liquidateBorrow(VBNB, borrower, repayAmount, VBNB, {value: repayAmount})
    });
  });
}
