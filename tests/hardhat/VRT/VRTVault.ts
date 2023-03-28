import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, network } from "hardhat";

import { VRT, VRTVault, VRTVault__factory, VRT__factory } from "../../../typechain";

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

async function setAutoMine(autoMine: boolean): Promise<void> {
  await network.provider.send("evm_setAutomine", [autoMine]);
}

async function deployVaultFixture(): Promise<VaultFixture> {
  const [deployer, user1, user2] = await ethers.getSigners();

  const vrtFactory: VRT__factory = await ethers.getContractFactory("VRT");
  const vrt: VRT = await vrtFactory.deploy(deployer.address);
  const vrtVaultFactory: VRTVault__factory = await ethers.getContractFactory("VRTVault");
  const vrtVault: VRTVault = await vrtVaultFactory.deploy();
  await vrtVault.initialize(vrt.address, bigNumber18);
  //turn off automine
  await setAutoMine(false);
  const initialBlock = await getLastBlock();
  await vrtVault.setLastAccruingBlock(initialBlock + 1000);
  //setting last accruing block to be 1000 blocks after deployment
  const lastAccruingBlock = initialBlock + 1000;
  //turn back automine on
  await setAutoMine(true);
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

  it("claim reward", async function () {
    const { vrtVault, vrt, user1, user2 } = fixture;
    await mine(100);
    await vrtVault.connect(user2)["claim(address)"](user1.address);
    expect(await vrt.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(10100));
  });
});
