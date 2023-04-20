import { impersonateAccount, loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import {
  IAccessControlManagerV5__factory,
  VRT,
  VRTVault,
  VRTVaultProxy__factory,
  VRTVault__factory,
} from "../../../typechain";
import { IAccessControlManager } from "../../../typechain/contracts/Governance";
import { forking } from "./utils";

const FORK_MAINNET = process.env.FORK_MAINNET === "true";
const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18

// Address of the vault proxy
const vaultProxy = "0x98bF4786D72AAEF6c714425126Dd92f149e3F334";
// User who has multiple withdraw requests and affected because of afterUpgrade parameter in struct
const vaultUser = "0x5340eb4dc06868acf25e3b3baceba9850dfc68a0";
// Address of vault owner
const Owner = "0x1c2cac6ec528c20800b2fe734820d87b581eaa6b";
// Address of already deployed access control manager
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
// Owner of the ACM
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";

let admin: SignerWithAddress;
let impersonatedTimelock: SignerWithAddress;
let signer: SignerWithAddress;
let deployer: SignerWithAddress;
let user1: SignerWithAddress;
let vrtVault: VRTVault;
let oldVRTVault: VRTVault;
let accessControlManager: IAccessControlManager;
let vrtVaultFresh: VRTVault;
let vrt: VRT;

async function deployAndConfigureNewVault() {
  /*
   *  Forking mainnet
   * */
  await impersonateAccount(Owner);
  admin = await ethers.getSigner(Owner);
  await impersonateAccount(NORMAL_TIMELOCK);
  impersonatedTimelock = await ethers.getSigner(NORMAL_TIMELOCK);
  await setBalance(NORMAL_TIMELOCK, ethers.utils.parseEther("2"));

  const vrtVaultProxy = VRTVaultProxy__factory.connect(vaultProxy, admin);

  const vrtVaultFactory = await ethers.getContractFactory("contracts/VRTVault/VRTVault.sol:VRTVault");
  const vrtVaultImpl = await vrtVaultFactory.deploy();
  await vrtVaultImpl.deployed();

  await vrtVaultProxy.connect(admin)._setPendingImplementation(vrtVaultImpl.address);
  await vrtVaultImpl.connect(admin)._become(vrtVaultProxy.address);
  vrtVault = VRTVault__factory.connect(vrtVaultProxy.address, admin);

  await vrtVault.setAccessControl(ACM);
  accessControlManager = IAccessControlManagerV5__factory.connect(ACM, admin);
}

async function grantPermissions() {
  let tx = await accessControlManager
    .connect(impersonatedTimelock)
    .giveCallPermission(vrtVault.address, "pause()", Owner);
  await tx.wait();

  tx = await accessControlManager.connect(impersonatedTimelock).giveCallPermission(vrtVault.address, "resume()", Owner);
  await tx.wait();
}

async function deployFreshVaultFixture() {
  [deployer, user1] = await ethers.getSigners();

  const vrtFactory = await ethers.getContractFactory("VRT");
  vrt = await vrtFactory.deploy(deployer.address);

  const vrtVaultFactory = await ethers.getContractFactory("VRTVault");
  vrtVaultFresh = await vrtVaultFactory.deploy();
  await vrtVaultFresh.initialize(vrt.address, bigNumber18);
  await vrtVaultFresh.setAccessControl(ACM);
}

async function deployAndConfigureOldVault() {
  /*
   *  Forking mainnet
   * */
  await impersonateAccount(Owner);
  admin = await ethers.getSigner(Owner);

  const vrtVaultProxy = VRTVaultProxy__factory.connect(vaultProxy, admin);
  oldVRTVault = VRTVault__factory.connect(vrtVaultProxy.address, admin);
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
  const blockNumber = 26834304;
  forking(blockNumber, () => {
    describe("VRTVault", async () => {
      before(async () => {
        await sendGasCost();
        await deployAndConfigureOldVault();
        await deployAndConfigureNewVault();
        await grantPermissions();
        await deployFreshVaultFixture();
      });

      it("Verify states after upgrade", async () => {
        // Save all states before upgrade
        const vrtV1 = await oldVRTVault.vrt();
        const interestRatePerBlockV1 = await oldVRTVault.interestRatePerBlock();
        const userInfoV1 = await oldVRTVault.userInfo(vaultUser);

        const vrtV2 = await oldVRTVault.vrt();
        const interestRatePerBlockV2 = await oldVRTVault.interestRatePerBlock();
        const userInfoV2 = await oldVRTVault.userInfo(vaultUser);

        expect(vrtV1).equals(vrtV2);
        expect(interestRatePerBlockV1).equals(interestRatePerBlockV2);
        expect(userInfoV1.userAddress).equals(userInfoV2.userAddress);
        expect(userInfoV1.accrualStartBlockNumber).equals(userInfoV2.accrualStartBlockNumber);
        expect(userInfoV1.totalPrincipalAmount).equals(userInfoV2.totalPrincipalAmount);
        expect(userInfoV1.lastWithdrawnBlockNumber).equals(userInfoV2.lastWithdrawnBlockNumber);
      });

      it("Revert when permission is not granted for pause and resume", async () => {
        await expect(vrtVault.connect(signer).pause()).to.be.reverted;
        await expect(vrtVault.connect(signer).resume()).to.be.reverted;
      });

      it("Success when permission is granted for pause and resume", async () => {
        await expect(vrtVault.connect(admin).pause()).to.emit(vrtVault, "VaultPaused");
        expect(await vrtVault.vaultPaused()).equals(true);

        await expect(vrtVault.connect(admin).resume()).to.emit(vrtVault, "VaultResumed");
        expect(await vrtVault.vaultPaused()).equals(false);
      });

      it("claim reward", async function () {
        await loadFixture(deployFreshVaultFixture);
        // grant permissions
        const tx = await accessControlManager
          .connect(impersonatedTimelock)
          .giveCallPermission(vrtVaultFresh.address, "withdrawBep20(address,address,uint256)", Owner);
        await tx.wait();

        await vrt.transfer(vrtVaultFresh.address, bigNumber18.mul(10000));
        await expect(vrtVaultFresh.connect(signer).withdrawBep20(vrt.address, user1.address, 100)).to.be.reverted;
        await vrtVaultFresh.connect(admin).withdrawBep20(vrt.address, user1.address, 100);
      });
    });
  });
}
