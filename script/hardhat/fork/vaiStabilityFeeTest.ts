import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { ComptrollerMock, Comptroller__factory, VAIController, VAIController__factory } from "../../../typechain";
import { forking, testVip } from "./vip-framework";
import GOVERNOR_V3_ABI from "./vip-framework/abi/governorV3Abi.json";
import { initMainnetUser } from "./vip-framework/utils";

const ACCESS_CONTROL = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
const COMPTROLLER_PROXY = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const UPDATED_COMPTROLLER_IMPL = "0x0E37A3a04e298ab8349864cb94b242FB4f860372";
const COMPTROLLER_IMPL = "0xf2721703d5429BeC86bD0eD86519E0859Dd88209";
const VAI_CONTROLLER_PROXY = "0x004065D34C6b18cE4370ced1CeBDE94865DbFAFE";
const VAI_CONTROLLER_IMPL = "0x8A1e5Db8f622B97f4bCceC4684697199C1B1D11b";
const COMPTROLLER_LENS = "0x50F618A2EAb0fB55e87682BbFd89e38acb2735cD";
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const FAST_TRACK_TIMELOCK = "0x555ba73dB1b006F3f2C7dB7126d6e4343aDBce02";
const TREASURY = "0xF322942f644A996A617BD29c16bd7d231d9F35E9";
const LIQUIDATOR_PROXY = "0x0870793286aada55d39ce7f82fb2766e8004cf43";
const LIQUIDATOR_PROXY_ADMIN = "0x2b40b43ac5f7949905b0d2ed9d6154a8ce06084a";
const LIQUIDATOR_IMPL = "0x0BE68b10dFB2e303D3D0a51Cd8368Fb439E46409";
const BASE_RATE_MANTISSA = parseUnits("0.01", 18);

const vip80 = () => {
  const signatures = [
    "_setPendingImplementation(address)",
    "_become(address)",
    "_setPendingImplementation(address)",
    "_become(address)",
    "_setComptrollerLens(address)",
    "_setPendingImplementation(address)",
    "_become(address)",
    "initialize()",
    "setAccessControl(address)",
    "giveCallPermission(address,string,address)", // base rate, fast-track
    "giveCallPermission(address,string,address)", // base rate, normal
    "giveCallPermission(address,string,address)", // float rate, fast-track
    "giveCallPermission(address,string,address)", // float rate, normal
    "giveCallPermission(address,string,address)", // mint cap, fast-track
    "giveCallPermission(address,string,address)", // mint cap, normal
    "setBaseRate(uint256)",
    "setReceiver(address)",
    "upgrade(address,address)",
  ];

  const targets = [
    COMPTROLLER_PROXY,
    UPDATED_COMPTROLLER_IMPL,
    COMPTROLLER_PROXY,
    COMPTROLLER_IMPL,
    COMPTROLLER_PROXY,
    VAI_CONTROLLER_PROXY,
    VAI_CONTROLLER_IMPL,
    VAI_CONTROLLER_PROXY,
    VAI_CONTROLLER_PROXY, // setAccessControl
    ACCESS_CONTROL,
    ACCESS_CONTROL,
    ACCESS_CONTROL,
    ACCESS_CONTROL,
    ACCESS_CONTROL,
    ACCESS_CONTROL,
    VAI_CONTROLLER_PROXY, // setBaseRate
    VAI_CONTROLLER_PROXY, // setReceiver
    LIQUIDATOR_PROXY_ADMIN,
  ];

  const params = [
    [UPDATED_COMPTROLLER_IMPL], // unitroller._setPendingImplementation(updatedComptrollerImpl)
    [COMPTROLLER_PROXY], // updatedComptrollerImpl._become(unitroller)
    [COMPTROLLER_IMPL], // unitroller._setPendingImplementation(comptrollerImpl)
    [COMPTROLLER_PROXY], // comptrollerImpl._become(unitroller)
    [COMPTROLLER_LENS], // comptroller._setComptrollerLens(lens)
    [VAI_CONTROLLER_IMPL], // vaiUnitroller._setPendingImplementation(vaiControllerImpl)
    [VAI_CONTROLLER_PROXY], // vaiControllerImpl._become(vaiControllerImpl)
    [], // vaiController.initialize()
    [ACCESS_CONTROL], // vaiController.setAccessControl(address)
    [VAI_CONTROLLER_PROXY, "setBaseRate(uint256)", FAST_TRACK_TIMELOCK], // accessControl.giveCallPermission(...)
    [VAI_CONTROLLER_PROXY, "setBaseRate(uint256)", NORMAL_TIMELOCK], // accessControl.giveCallPermission(...)
    [VAI_CONTROLLER_PROXY, "setFloatRate(uint256)", FAST_TRACK_TIMELOCK], // accessControl.giveCallPermission(...)
    [VAI_CONTROLLER_PROXY, "setFloatRate(uint256)", NORMAL_TIMELOCK], // accessControl.giveCallPermission(...)
    [VAI_CONTROLLER_PROXY, "setMintCap(uint256)", FAST_TRACK_TIMELOCK], // accessControl.giveCallPermission(...)
    [VAI_CONTROLLER_PROXY, "setMintCap(uint256)", NORMAL_TIMELOCK], // accessControl.giveCallPermission(...)
    [BASE_RATE_MANTISSA], // vaiController.setBaseRate(1%)
    [TREASURY], // vaiController.setReceiver(treasury)
    [LIQUIDATOR_PROXY, LIQUIDATOR_IMPL], // proxyAdmin.upgrade(liquidator, liquidatorImpl)
  ];

  const values = new Array(targets.length).fill("0");

  const meta = {
    version: "v2",
    title: "VIP-80 VAI Stability Fee",
    description: `### Summary

The VAI Stablecoin has been unpegged for numerous months, and we are prepared to deliver a solution that will bring VAI back to its $1 peg and keep it near that level going forward.

### Details
Venus will introduce a stability fee to keep VAI at or near its peg via market dynamics.

An interest rate, initially set at 1%, will be charged for minting VAI. The rate will set by governance going forward. This variable rate will encourage more minting when demand is high and VAI’s price is over $1.00 while discouraging minting when demand is low and VAI’s price is below $1.00.

The stability fee will be adjusted based on a base rate, the price of VAI, and a floating rate. The stability rate is an annual rate divided by the yearly number of blocks on the BNB  Chain, creating a stability rate per block.

A small stability fee for minting and burning VAI discourages users from buying and selling below or above the price of $1.00, reducing price volatility while creating value for Venus Protocol. Stability fee income will be used for handling extreme conditions such as bad debt, risk funds, and outlier events.

Before the VAI Stability Fee, a user's VAI mint limit was based on their total supplied funds without considering the collateral factor of those funds. If a user minted VAI up to the amount of their unused liquidity, they would put their account into immediate liquidation because they would have surpassed the collateral value of their supply. The VAI Stability Fee in Venus V4 allows users to only mint VAI based on their weighted supply rather than their total supply to reduce liquidations.`,
    forDescription: "I agree that Venus Protocol should proceed and introduce VAI Stability Fee",
    againstDescription: "I disagree and Venus should NOT proceed and introduce VAI Stability Fee",
    abstainDescription: "I am indifferent to whether Venus Protocol introduces VAI Stability Fee or not",
  };

  return { targets, signatures, params, values, meta };
};

forking(24265539, () => {
  testVip("VIP-80 Stability fee", vip80(), { governorAbi: GOVERNOR_V3_ABI });

  describe("VIP-80 Post-upgrade behavior", async () => {
    const BLOCKS_PER_YEAR = 10512000n;
    const interestPerBlock = parseUnits("0.01", 18).div(BLOCKS_PER_YEAR);
    let comptroller: ComptrollerMock;
    let vaiController: VAIController;
    let vaiUser: SignerWithAddress;

    // Computes simple interest taking rounding into account
    const simpleInterest = (amount: BigNumber, blocks: BigNumberish): BigNumber => {
      return amount.mul(interestPerBlock).mul(blocks).div(parseUnits("1", 18));
    };

    const postUpgradeFixture = async () => {
      comptroller = await ethers.getContractAt<Comptroller__factory>("ComptrollerMock", COMPTROLLER_PROXY);
      vaiController = await ethers.getContractAt<VAIController__factory>("VAIController", VAI_CONTROLLER_PROXY);
      const someVaiUserAddress = "0x5c062b3b0486f61789d680cae37909b92c0dacc5";
      vaiUser = await initMainnetUser(someVaiUserAddress, parseEther("1.0"));
    };

    beforeEach(async () => {
      await loadFixture(postUpgradeFixture);
    });

    it("sets Comptroller implementation and storage vars", async () => {
      expect(await comptroller.comptrollerImplementation()).to.equal(COMPTROLLER_IMPL);
      expect(await comptroller.comptrollerLens()).to.equal(COMPTROLLER_LENS);
    });

    it("migrates venusSpeeds to venusSupplySpeeds and venusBorrowSpeeds", async () => {
      const vCakeAddress = "0x86ac3974e2bd0d60825230fa6f355ff11409df5c";
      const speed = "434027777777778";
      expect(await comptroller.venusSpeeds(vCakeAddress)).to.equal(0);
      expect(await comptroller.venusSupplySpeeds(vCakeAddress)).to.equal(speed);
      expect(await comptroller.venusBorrowSpeeds(vCakeAddress)).to.equal(speed);
    });

    it("sets new VAIController implementation and storage vars", async () => {
      expect(await vaiController.vaiControllerImplementation()).to.equal(VAI_CONTROLLER_IMPL);
      expect(await vaiController.accessControl()).to.equal(ACCESS_CONTROL);
      expect(await vaiController.baseRateMantissa()).to.equal(BASE_RATE_MANTISSA);
      expect(await vaiController.receiver()).to.equal(TREASURY);
    });

    it("sets new Liquidator implementation", async () => {
      const ProxyAdminInterface = [`function getProxyImplementation(address) view returns (address)`];
      const proxyAdmin = await ethers.getContractAt(ProxyAdminInterface, LIQUIDATOR_PROXY_ADMIN);
      const result = await proxyAdmin.getProxyImplementation(LIQUIDATOR_PROXY);
      expect(result).to.equal(LIQUIDATOR_IMPL);
    });

    it("still does not allow to mint VAI", async () => {
      const REJECTION = 2;
      expect(await vaiController.connect(vaiUser).callStatic.mintVAI(parseUnits("1", 18))).to.equal(REJECTION);
    });

    it("should accrue zero interest immediately after the VIP is executed", async () => {
      const mintedVAIs = await comptroller.mintedVAIs(vaiUser.address);
      expect(await vaiController.getVAIRepayAmount(vaiUser.address)).to.equal(mintedVAIs);
    });

    it("should accrue 1% after a year", async () => {
      await network.provider.send("evm_setAutomine", [false]);
      const mintedVAIs = await comptroller.mintedVAIs(vaiUser.address);
      // We need to account for rounding errors since contracts work with rate per block
      const amountToRepayWithInterest = mintedVAIs.add(simpleInterest(mintedVAIs, BLOCKS_PER_YEAR));
      await mine(BLOCKS_PER_YEAR - 1n); // Accruing interest in the next block
      await vaiController.accrueVAIInterest();
      await mine();
      expect(await vaiController.getVAIRepayAmount(vaiUser.address)).to.equal(amountToRepayWithInterest);
    });

    it("should accrue 1% before new minting, and 1% of the new amount after the minting", async () => {
      await network.provider.send("evm_setAutomine", [false]);
      const receivedVaiT0 = await comptroller.mintedVAIs(vaiUser.address);
      const admin = await initMainnetUser(await comptroller.admin(), parseEther("1"));
      const receivedVaiT1 = parseUnits("50", 18);

      await mine(BLOCKS_PER_YEAR - 1n);
      await comptroller.connect(admin)._setVAIMintRate(parseUnits("1", 18));
      await vaiController.connect(vaiUser).mintVAI(receivedVaiT1);
      await mine();

      const interestT1 = simpleInterest(receivedVaiT0, BLOCKS_PER_YEAR);
      const interestT2 = simpleInterest(receivedVaiT0.add(receivedVaiT1), BLOCKS_PER_YEAR);

      await mine(BLOCKS_PER_YEAR - 1n);
      await vaiController.accrueVAIInterest();
      await mine();
      const amountToRepayWithInterest = receivedVaiT0.add(receivedVaiT1).add(interestT1).add(interestT2);
      expect(await vaiController.getVAIRepayAmount(vaiUser.address)).to.equal(amountToRepayWithInterest);
    });

    it("should accrue 1% before repayment, and 1% of the new amount after repayment", async () => {
      await network.provider.send("evm_setAutomine", [false]);

      const repaidVaiT1 = parseUnits("50", 18);
      const vai = await ethers.getContractAt("VAI", await vaiController.getVAIAddress());
      const impersonatedController = await initMainnetUser(vaiController.address, parseEther("1"));
      await vai.connect(impersonatedController).mint(vaiUser.address, repaidVaiT1);
      await vai.connect(vaiUser).approve(vaiController.address, repaidVaiT1);

      await mine(BLOCKS_PER_YEAR - 1n);
      await vaiController.connect(vaiUser).repayVAI(repaidVaiT1);
      await mine();

      const remainingPrincipalT1 = parseUnits("380.495049504686207630", 18);
      expect(await comptroller.mintedVAIs(vaiUser.address)).to.equal(remainingPrincipalT1);

      await mine(BLOCKS_PER_YEAR - 1n);
      await vaiController.accrueVAIInterest();
      await mine();
      const interestT2 = simpleInterest(remainingPrincipalT1, BLOCKS_PER_YEAR * 2n);
      const amountToRepayWithInterest = remainingPrincipalT1.add(interestT2);
      expect(await vaiController.getVAIRepayAmount(vaiUser.address)).to.equal(amountToRepayWithInterest);
    });
  });
});
