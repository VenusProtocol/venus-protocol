import { impersonateAccount, reset } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { XVSVaultProxy__factory, XVSVault__factory, XVS__factory } from "../../../typechain";

const hre = require("hardhat");
const FORK_MAINNET = process.env.FORK_MAINNET === "true";
let FORK_ENDPOINT;

const poolId = 0;
// Address of the vault proxy
const vaultProxy = "0x051100480289e704d20e9DB4804837068f3f9204";
// User who has multiple withdraw requests and affected because of afterUpgrade parameter in struct
const affectedUserAddress = "0xddbc1841BE23b2ab55501Deb4d6bc39E3f8AA2d7";
// User who has single withdraw request, partially affected.
const affectedUserAddress2 = "0x3c7ea3ae7c47bd817c63c47e9ecee89452471a9e";
// User who has single withdraw request, partially affected.
const affectedUserAddress3 = "0x37d768c8fc5a0f54754a6bdb8b8469e6ff8cad07";
// A fresh user picked from latest block to simulate transaction on new vault implementation
const vaultUser = "0xc09a9a0533a0b247c8bb672b2d37cd2c58394768";
// Address of vault owner
const Owner = "0x1c2cac6ec528c20800b2fe734820d87b581eaa6b";
// Address of reward token
const tokenAddress = "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63";
// Address of xvs token contract
const xvsAddress = "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63";
let admin: Signer;
let vaultUserSigner: Signer;
let signer: Signer;
let xvsVault;
let oldXVSVault;
let XVS;

function getForkingUrl() {
  FORK_ENDPOINT = hre.network.config.forking.url;
}

async function deployAndConfigureNewVault() {
  /*
   *  Forking mainnet
   * */
  await impersonateAccount(Owner);
  admin = await ethers.getSigner(Owner);

  const xvsVaultProxy = XVSVaultProxy__factory.connect(vaultProxy, admin);

  const xvsVaultFactory = await ethers.getContractFactory("contracts/XVSVault/XVSVault.sol:XVSVault");
  const xvsVaultImpl = await xvsVaultFactory.deploy();
  await xvsVaultImpl.deployed();

  await xvsVaultProxy.connect(admin)._setPendingImplementation(xvsVaultImpl.address);
  await xvsVaultImpl.connect(admin)._become(xvsVaultProxy.address);
  xvsVault = XVSVault__factory.connect(xvsVaultProxy.address, admin);

  XVS = XVS__factory.connect(xvsAddress, admin);
}

async function deployAndConfigureOldVault() {
  /*
   *  Forking mainnet
   * */
  await impersonateAccount(Owner);
  admin = await ethers.getSigner(Owner);

  const xvsVaultProxy = XVSVaultProxy__factory.connect(vaultProxy, admin);
  oldXVSVault = XVSVault__factory.connect(xvsVaultProxy.address, admin);
}

async function sendGasCost() {
  /**
   *  sending gas cost to owner
   * */
  [signer] = await ethers.getSigners();
  console.log("-- Sending gas cost to owner addr --");
  await signer.sendTransaction({
    to: Owner,
    value: ethers.BigNumber.from("900081987000000000"),
    data: undefined,
  });
}

describe("XVSVault", async () => {
  before(async () => {
    getForkingUrl();
  });
  if (FORK_MAINNET) {
    it("Verify Expected Result old withdraw requests for affectedUser1", async () => {
      await reset(`${FORK_ENDPOINT}`, 25458046);
      await sendGasCost();
      await deployAndConfigureNewVault();
      // Expected data of the withdrawalRequests array after upgrade i.e append 0 at the end of the each array feild.
      const beforeUpgrade = [
        ["1219905705900531585631", "1665230433", "0"],
        ["10250054759802389186707", "1662327363", "0"],
        ["9590000000000000000000", "1662286808", "0"],
        ["10000000000000000000000", "1661760746", "0"],
        ["30000039534293865031955", "1661751289", "0"],
      ];

      const result = await xvsVault.getWithdrawalRequests(tokenAddress, poolId, affectedUserAddress);

      expect(result[0][0].toString()).to.eql(beforeUpgrade[0][0].toString());
      expect(result[0][1].toString()).to.eql(beforeUpgrade[0][1].toString());
      expect(result[0][2].toString()).to.eql(beforeUpgrade[0][2].toString());

      expect(result[1][0].toString()).to.eql(beforeUpgrade[1][0].toString());
      expect(result[1][1].toString()).to.eql(beforeUpgrade[1][1].toString());
      expect(result[1][2].toString()).to.eql(beforeUpgrade[1][2].toString());

      expect(result[2][0].toString()).to.eql(beforeUpgrade[2][0].toString());
      expect(result[2][1].toString()).to.eql(beforeUpgrade[2][1].toString());
      expect(result[2][2].toString()).to.eql(beforeUpgrade[2][2].toString());

      expect(result[3][0].toString()).to.eql(beforeUpgrade[3][0].toString());
      expect(result[3][1].toString()).to.eql(beforeUpgrade[3][1].toString());
      expect(result[3][2].toString()).to.eql(beforeUpgrade[3][2].toString());

      expect(result[4][0].toString()).to.eql(beforeUpgrade[4][0].toString());
      expect(result[4][1].toString()).to.eql(beforeUpgrade[4][1].toString());
      expect(result[4][2].toString()).to.eql(beforeUpgrade[4][2].toString());
    });

    it("Execute withdrawal", async () => {
      await reset(`${FORK_ENDPOINT}`, 25458046);
      await sendGasCost();
      await deployAndConfigureNewVault();

      await impersonateAccount(affectedUserAddress);
      const affectedUser1Signer = await ethers.getSigner(affectedUserAddress);

      await xvsVault.updatePool(tokenAddress, 0);

      const balanceBefore = await XVS.balanceOf(affectedUserAddress);
      const beforeUpgradeResult = await xvsVault.getUserInfo(tokenAddress, poolId, affectedUserAddress);
      const poolInfo = await xvsVault.poolInfos(tokenAddress, 0);
      const poolShare = poolInfo[3];
      const reward = beforeUpgradeResult.amount
        .mul(poolShare)
        .div(BigNumber.from(1e12))
        .sub(beforeUpgradeResult.rewardDebt);
      const tx = await xvsVault.connect(affectedUser1Signer).executeWithdrawal(tokenAddress, poolId);

      const result = await xvsVault.getWithdrawalRequests(tokenAddress, poolId, affectedUserAddress);
      const balanceAfter = await XVS.balanceOf(affectedUserAddress);
      const afterUpgradeResult = await xvsVault.getUserInfo(tokenAddress, poolId, affectedUserAddress);
      const amountDifference = beforeUpgradeResult.amount.sub(afterUpgradeResult.amount);
      const withdrawalAmount = amountDifference.add(reward);
      const balanceDifference = balanceAfter.sub(balanceBefore);

      await expect(tx)
        .to.emit(xvsVault, "ExecutedWithdrawal")
        .withArgs(affectedUserAddress, tokenAddress, poolId, amountDifference);

      // We need some margin here because our reward calculation above is not precise
      expect(withdrawalAmount).to.be.closeTo(balanceDifference, parseUnits("0.001", 18));
      expect(result.length).equals(0);
    });

    it("Verify Pending rewards of the affectedUser1", async () => {
      await reset(`${FORK_ENDPOINT}`, 25458045);
      await sendGasCost();
      await deployAndConfigureOldVault();
      const beforeUpgradeResult = await oldXVSVault.getUserInfo(tokenAddress, poolId, affectedUserAddress);

      await reset(`${FORK_ENDPOINT}`, 25458046);
      await sendGasCost();
      await deployAndConfigureNewVault();
      const afterUpgradeResult = await xvsVault.getUserInfo(tokenAddress, poolId, affectedUserAddress);

      expect(beforeUpgradeResult[0].toString()).equals(afterUpgradeResult[0].toString());
      expect(beforeUpgradeResult[1].toString()).equals(afterUpgradeResult[1].toString());
      expect(beforeUpgradeResult[2].toString()).equals(afterUpgradeResult[2].toString());
    });

    it("Request Withdrawal Request for fresh user in new implementation", async () => {
      await reset(`${FORK_ENDPOINT}`, 25651479);
      await sendGasCost();
      await deployAndConfigureNewVault();
      await impersonateAccount(vaultUser);
      vaultUserSigner = await ethers.getSigner(vaultUser);

      const amount = "1000000000000000";
      await xvsVault.connect(vaultUserSigner).requestWithdrawal(tokenAddress, poolId, amount);

      const lockedPeriod = await xvsVault.poolInfos(tokenAddress, 0);
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const currentTimeStamp = blockBefore.timestamp;
      const lockedUntill = Number(lockedPeriod[4]) + Number(currentTimeStamp);

      const expectedResult = [amount, lockedUntill, 1];

      const result = await xvsVault.getWithdrawalRequests(tokenAddress, poolId, vaultUser);

      expect(result[0][0].toString()).to.eql(expectedResult[0].toString());
      expect(result[0][1].toString()).to.eql(expectedResult[1].toString());
      expect(result[0][2].toString()).to.eql(expectedResult[2].toString());
    });

    it("Verify Pool Infos", async () => {
      await reset(`${FORK_ENDPOINT}`, 25458045);
      await sendGasCost();
      await deployAndConfigureOldVault();
      const oldPoolInfo = await oldXVSVault.poolInfos(tokenAddress, 0);

      await reset(`${FORK_ENDPOINT}`, 25458046);
      await sendGasCost();
      await deployAndConfigureNewVault();
      const newPoolInfo = await xvsVault.poolInfos(tokenAddress, 0);

      expect(oldPoolInfo[0]).equals(newPoolInfo[0]);
      expect(oldPoolInfo[1]).equals(newPoolInfo[1]);
      expect(oldPoolInfo[2]).equals(newPoolInfo[2]);
      expect(oldPoolInfo[3]).equals(newPoolInfo[3]);
      expect(oldPoolInfo[4]).equals(newPoolInfo[4]);
    });

    it("Verify Reward Debt for affectedUser2", async () => {
      await reset(`${FORK_ENDPOINT}`, 25458045);
      await sendGasCost();
      await deployAndConfigureOldVault();
      const beforeUpgradeResult = await oldXVSVault.getUserInfo(tokenAddress, poolId, affectedUserAddress2);

      await reset(`${FORK_ENDPOINT}`, 25458046);
      await sendGasCost();
      await deployAndConfigureNewVault();
      const afterUpgradeResult = await xvsVault.getUserInfo(tokenAddress, poolId, affectedUserAddress2);

      expect(beforeUpgradeResult[0].toString()).equals(afterUpgradeResult[0].toString());
      expect(beforeUpgradeResult[1].toString()).equals(afterUpgradeResult[1].toString());
      expect(beforeUpgradeResult[2].toString()).equals(afterUpgradeResult[2].toString());
    });

    it("Verify Reward Debt for affectedUser3", async () => {
      await reset(`${FORK_ENDPOINT}`, 25458045);
      await sendGasCost();
      await deployAndConfigureOldVault();
      const beforeUpgradeResult = await oldXVSVault.getUserInfo(tokenAddress, poolId, affectedUserAddress3);

      await reset(`${FORK_ENDPOINT}`, 25458046);
      await sendGasCost();
      await deployAndConfigureNewVault();
      const afterUpgradeResult = await xvsVault.getUserInfo(tokenAddress, poolId, affectedUserAddress3);

      expect(beforeUpgradeResult[0].toString()).equals(afterUpgradeResult[0].toString());
      expect(beforeUpgradeResult[1].toString()).equals(afterUpgradeResult[1].toString());
      expect(beforeUpgradeResult[2].toString()).equals(afterUpgradeResult[2].toString());
    });
  }
});
