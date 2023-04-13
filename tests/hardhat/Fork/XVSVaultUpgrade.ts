import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

import {
  IAccessControlManagerV5__factory,
  XVSVault,
  XVSVaultProxy__factory,
  XVSVault__factory,
} from "../../../typechain";
import { IAccessControlManager } from "../../../typechain/contracts/Governance";
import { forking } from "./utils";

const FORK_MAINNET = process.env.FORK_MAINNET === "true";

const poolId = 0;
// Address of the vault proxy
const vaultProxy = "0x051100480289e704d20e9DB4804837068f3f9204";
// User who has multiple withdraw requests and affected because of afterUpgrade parameter in struct
const vaultUser = "0xddbc1841be23b2ab55501deb4d6bc39e3f8aa2d7";
// Address of vault owner
const Owner = "0x1c2cac6ec528c20800b2fe734820d87b581eaa6b";
// Address of xvs token contract
const xvsAddress = "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63";
// Address of already deployed access control manager
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
// Owner of the ACM
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";

let admin: Signer;
let impersonatedTimelock: Signer;
let signer: Signer;
let xvsVault: XVSVault;
let oldXVSVault: XVSVault;
let accessControlManager: IAccessControlManager;

async function deployAndConfigureNewVault() {
  /*
   *  Forking mainnet
   * */
  await impersonateAccount(Owner);
  admin = await ethers.getSigner(Owner);
  await impersonateAccount(NORMAL_TIMELOCK);
  impersonatedTimelock = await ethers.getSigner(NORMAL_TIMELOCK);
  await setBalance(NORMAL_TIMELOCK, ethers.utils.parseEther("2"));

  const xvsVaultProxy = XVSVaultProxy__factory.connect(vaultProxy, admin);

  const xvsVaultFactory = await ethers.getContractFactory("contracts/XVSVault/XVSVault.sol:XVSVault");
  const xvsVaultImpl = await xvsVaultFactory.deploy();
  await xvsVaultImpl.deployed();

  await xvsVaultProxy.connect(admin)._setPendingImplementation(xvsVaultImpl.address);
  await xvsVaultImpl.connect(admin)._become(xvsVaultProxy.address);
  xvsVault = XVSVault__factory.connect(xvsVaultProxy.address, admin);

  await xvsVault.setAccessControl(ACM);
  accessControlManager = IAccessControlManagerV5__factory.connect(ACM, admin);
}

async function grantPermissions() {
  let tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(xvsVault.address, "pause()", Owner);
  await tx.wait();

  tx = await accessControlManager.connect(impersonatedTimelock).giveCallPermission(xvsVault.address, "resume()", Owner);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(xvsVault.address, "add(address,uint256,address,uint256,uint256)", Owner);
  await tx.wait();

  tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(xvsVault.address, "set(address,uint256,uint256)", Owner);
  await tx.wait();
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

if (FORK_MAINNET) {
  const blockNumber = 26848882;
  forking(blockNumber, () => {
    describe("XVSVault", async () => {
      before(async () => {
        await sendGasCost();
        await deployAndConfigureOldVault();
        await deployAndConfigureNewVault();
        await grantPermissions();
      });

      it("Verify states after upgrade", async () => {
        // Save all states before upgrade
        // Note : More states are covered in another test case `hardhat/XVS/XVSVaultFix.ts`
        const xvsStoreV1 = await oldXVSVault.xvsStore();
        const xvsAddressV1 = await oldXVSVault.xvsAddress();
        const rewardTokenAmountsPerBlockV1 = await oldXVSVault.rewardTokenAmountsPerBlock(vaultUser);

        const xvsStoreV2 = await xvsVault.xvsStore();
        const xvsAddressV2 = await xvsVault.xvsAddress();
        const rewardTokenAmountsPerBlockV2 = await xvsVault.rewardTokenAmountsPerBlock(vaultUser);

        expect(xvsStoreV1).equals(xvsStoreV2);
        expect(xvsAddressV1).equals(xvsAddressV2);
        expect(rewardTokenAmountsPerBlockV1).equals(rewardTokenAmountsPerBlockV2);
      });

      it("Revert when permission is not granted for pause and resume", async () => {
        await expect(xvsVault.connect(signer).pause()).to.be.reverted;
        await expect(xvsVault.connect(signer).resume()).to.be.reverted;
      });

      it("Success when permission is granted for pause and resume", async () => {
        await expect(xvsVault.connect(admin).pause()).to.emit(xvsVault, "VaultPaused");
        expect(await xvsVault.vaultPaused()).equals(true);

        await expect(xvsVault.connect(admin).resume()).to.emit(xvsVault, "VaultResumed");
        expect(await xvsVault.vaultPaused()).equals(false);
      });

      it("Revert when permission is not granted for add a new token pool", async () => {
        const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18
        const rewardPerBlock = bigNumber18.mul(1);
        const lockPeriod = 300;
        const allocPoint = 100;
        const dummyToken = "0x2170Ed0880ac9A755fd29B2688956BD959F933F8";

        await expect(xvsVault.connect(signer).add(xvsAddress, allocPoint, dummyToken, rewardPerBlock, lockPeriod)).to.be
          .reverted;
      });

      it("Success when permission is granted for add a new token pool", async () => {
        const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18
        const rewardPerBlock = bigNumber18.mul(1);
        const lockPeriod = 300;
        const allocPoint = 100;
        const dummyToken = "0x2170Ed0880ac9A755fd29B2688956BD959F933F8";

        await expect(
          xvsVault.connect(admin).add(xvsAddress, allocPoint, dummyToken, rewardPerBlock, lockPeriod),
        ).to.emit(xvsVault, "PoolAdded");
      });

      it("Revert when permission is not granted for add a new token pool", async () => {
        const allocPoint = 100;
        await expect(xvsVault.connect(signer).set(xvsAddress, poolId, allocPoint)).to.be.reverted;
      });

      it("Success when permission is granted for add a new token pool", async () => {
        const allocPoint = 100;
        await expect(xvsVault.connect(admin).set(xvsAddress, poolId, allocPoint)).to.emit(xvsVault, "PoolUpdated");
      });
    });
  });
}
