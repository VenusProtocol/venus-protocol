import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { VRT, VRTVault, VRTVault__factory, VRT__factory } from "../../../typechain";

const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18

describe("VRTVault", async () => {
  async function deployVaultFixture() {
    const [deployer, user1, user2] = await ethers.getSigners();

    const vrtFactory: VRT__factory = await ethers.getContractFactory("VRT");
    const vrt: VRT = await vrtFactory.deploy(deployer.address);

    const vrtVaultFactory: VRTVault__factory = await ethers.getContractFactory("VRTVault");
    const vrtVault: VRTVault = await vrtVaultFactory.deploy();
    await vrtVault.initialize(vrt.address, bigNumber18);

    return { vrtVault, vrt, user1, user2 };
  }

  it("claim reward", async function () {
    const { vrtVault, vrt, user1, user2 } = await loadFixture(deployVaultFixture);

    await vrt.transfer(vrtVault.address, bigNumber18.mul(10000));
    await vrt.transfer(user1.address, bigNumber18.mul(100));

    await vrt.connect(user1).approve(vrtVault.address, bigNumber18.mul(100));
    await vrtVault.connect(user1).deposit(bigNumber18.mul(100));

    await mine(100);

    expect(await vrt.balanceOf(user1.address)).to.be.equal(0);
    await vrtVault.connect(user2)["claim(address)"](user1.address);
    expect(await vrt.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(10100));
  });
});
