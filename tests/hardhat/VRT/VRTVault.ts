import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mine, mineUpTo } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { IAccessControlManager, VRT, VRTVault, VRTVault__factory, VRT__factory } from "../../../typechain";

const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18

type VaultFixture = {
  vrtVault: VRTVault;
  vrt: VRT;
  user1: SignerWithAddress;
  user2: SignerWithAddress;
  initialBlock: number;
  lastAccruingBlock: number;
};

async function getLastBlock(): Promise<number> {
  return (await ethers.provider.getBlock("latest")).number;
}

async function deployVaultFixture(): Promise<VaultFixture> {
  const [deployer, user1, user2] = await ethers.getSigners();
  const vrtFactory: VRT__factory = await ethers.getContractFactory("VRT");
  const vrt: VRT = await vrtFactory.deploy(deployer.address);
  const vrtVaultFactory: VRTVault__factory = await ethers.getContractFactory("VRTVault");
  const vrtVault: VRTVault = await vrtVaultFactory.deploy();
  await vrtVault.initialize(vrt.address, bigNumber18);

  const initialBlock = await getLastBlock();
  const lastAccruingBlock = initialBlock + 107;

  const accessControl: FakeContract<IAccessControlManager> = await smock.fake<IAccessControlManager>(
    "AccessControlManager",
  );
  accessControl.isAllowedToCall.returns(true);

  await vrtVault.setAccessControl(accessControl.address);
  await vrtVault.setLastAccruingBlock(lastAccruingBlock);
  return { vrtVault, vrt, user1, user2, initialBlock, lastAccruingBlock };
}

describe("VRTVault", async () => {
  let fixture: VaultFixture;
  before(async () => {
    fixture = await loadFixture(deployVaultFixture);
  });

  it("deposit", async function () {
    const { vrtVault, vrt, user1 } = fixture;
    await vrt.transfer(vrtVault.address, bigNumber18.mul(10000));
    await vrt.transfer(user1.address, bigNumber18.mul(100));
    await vrt.connect(user1).approve(vrtVault.address, bigNumber18.mul(100));
    await vrtVault.connect(user1).deposit(bigNumber18.mul(100));
    expect(await vrt.balanceOf(user1.address)).to.be.equal(0);
  });

  it("should claim reward", async function () {
    const { vrtVault, vrt, user1, user2, lastAccruingBlock } = fixture;
    await mineUpTo(lastAccruingBlock);
    await vrtVault.connect(user2)["claim(address)"](user1.address);
    expect(await vrt.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(10100));
  });

  it("should not claim reward after certain block", async function () {
    const { vrtVault, vrt, user1, user2, lastAccruingBlock } = fixture;
    await vrtVault.connect(user2)["claim(address)"](user1.address);
    expect(await vrt.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(10100));
    await mineUpTo(lastAccruingBlock + 10);
    await vrtVault.connect(user2)["claim(address)"](user1.address);
    expect(await vrt.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(10100));
    await mineUpTo(lastAccruingBlock + 10000);
    await vrtVault.connect(user2)["claim(address)"](user1.address);
    expect(await vrt.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(10100));
  });

  it("should not able to set lastAccuringBlock less than current block", async function () {
    const { vrtVault, lastAccruingBlock } = fixture;
    await mine(200);
    await expect(vrtVault.setLastAccruingBlock(lastAccruingBlock - 7)).to.be.revertedWith(
      "Invalid _lastAccruingBlock interest have been accumulated",
    );
  });
});
