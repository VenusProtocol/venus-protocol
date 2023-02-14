import { impersonateAccount, reset } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";

import { XVSVaultProxy__factory, XVSVault__factory } from "../../../typechain";

const FORK_MAINNET = process.env.FORK_MAINNET === "true";
const QUICK_NODE_KEY = process.env.QUICK_NODE_KEY;
const poolId = 0;
const vaultProxy = "0x051100480289e704d20e9DB4804837068f3f9204";
const affectedUserAddress = "0xddbc1841be23b2ab55501deb4d6bc39e3f8aa2d7";
const vaultUser = "0xc09a9a0533a0b247c8bb672b2d37cd2c58394768";
const Owner = "0x1c2cac6ec528c20800b2fe734820d87b581eaa6b";
const tokenAddress = "0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63";
const tokenAddress1 = "0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63";
let admin: Signer;
let vaultUserSigner: Signer;
let signer: Signer;
let xvsVault;
let oldXVSVault;

const beforeUpgrade = [
  ["1219905705900531585631", "1665230433", "0"],
  ["10250054759802389186707", "1662327363", "0"],
  ["9590000000000000000000", "1662286808", "0"],
  ["10000000000000000000000", "1661760746", "0"],
  ["30000039534293865031955", "1661751289", "0"],
];

async function deployAndConfigureVault() {
  /*
   *  Forking mainnet
   * */
  await impersonateAccount(Owner);
  admin = await ethers.getSigner(Owner);

  const xvsVaultProxy = XVSVaultProxy__factory.connect(vaultProxy, admin);
  oldXVSVault = XVSVault__factory.connect(xvsVaultProxy.address, signer);

  const xvsVaultFactory = await ethers.getContractFactory("contracts/XVSVault/XVSVault.sol:XVSVault");
  const xvsVaultImpl = await xvsVaultFactory.deploy();
  await xvsVaultImpl.deployed();

  await xvsVaultProxy.connect(admin)._setPendingImplementation(xvsVaultImpl.address);
  await xvsVaultImpl.connect(admin)._become(xvsVaultProxy.address);
  xvsVault = XVSVault__factory.connect(xvsVaultProxy.address, signer);
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
  if (FORK_MAINNET) {
    it("Verify Expected Result old withdraw requests", async () => {
      await reset(`https://wild-blissful-dawn.bsc.discover.quiknode.pro/${QUICK_NODE_KEY}`, 25458046);
      await sendGasCost();
      await deployAndConfigureVault();

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

    it("Verify Pending rewards of the user", async () => {
      await reset(`https://wild-blissful-dawn.bsc.discover.quiknode.pro/${QUICK_NODE_KEY}`, 25458046);
      await sendGasCost();
      await deployAndConfigureVault();

      const beforeUpgradeResult = await oldXVSVault.getUserInfo(tokenAddress, poolId, affectedUserAddress);
      const afterUpgradeResult = await xvsVault.getUserInfo(tokenAddress, poolId, affectedUserAddress);

      expect(beforeUpgradeResult[0].toString()).equals(afterUpgradeResult[0].toString());
      expect(beforeUpgradeResult[1].toString()).equals(afterUpgradeResult[1].toString());
      expect(beforeUpgradeResult[2].toString()).equals(afterUpgradeResult[2].toString());
    });

    it("Request Withdrawal Request", async () => {
      await reset(`https://wild-blissful-dawn.bsc.discover.quiknode.pro/${QUICK_NODE_KEY}`, 25651479);
      await sendGasCost();
      await deployAndConfigureVault();
      await impersonateAccount(vaultUser);
      vaultUserSigner = await ethers.getSigner(vaultUser);

      const amount = "1000000000000000";
      await xvsVault.connect(vaultUserSigner).requestWithdrawal(tokenAddress1, poolId, amount);

      const lockedPeriod = await xvsVault.poolInfos(tokenAddress1, 0);
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const currentTimeStamp = blockBefore.timestamp;
      const lockedUntill = Number(lockedPeriod[4]) + Number(currentTimeStamp);

      const expectedResult = [amount, lockedUntill, 1];

      const result = await xvsVault.getWithdrawalRequests(tokenAddress1, poolId, vaultUser);

      expect(result[0][0].toString()).to.eql(expectedResult[0].toString());
      expect(result[0][1].toString()).to.eql(expectedResult[1].toString());
      expect(result[0][2].toString()).to.eql(expectedResult[2].toString());
    });
  }
});
