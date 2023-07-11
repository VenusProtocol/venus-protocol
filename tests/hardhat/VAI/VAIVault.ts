import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { ethers } from "hardhat";

import { VAI, VAIVault, VAIVault__factory, VAI__factory, XVS, XVS__factory } from "../../../typechain";

const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18

interface VAIVaultFixture {
  vaiVault: VAIVault;
  vai: VAI;
  xvs: XVS;
  user1: SignerWithAddress;
  user2: SignerWithAddress;
}

const deployVaultFixture = async (): Promise<VAIVaultFixture> => {
  const [deployer, user1, user2] = await ethers.getSigners();

  const VaiVaultFactory: VAIVault__factory = await ethers.getContractFactory("VAIVault");
  const vaiVault: VAIVault = await VaiVaultFactory.deploy();

  const vaiFactory: VAI__factory = await ethers.getContractFactory("contracts/Tokens/VAI/VAI.sol:VAI");
  const vai: VAI = await vaiFactory.deploy(1);

  const xvsFactory: XVS__factory = await ethers.getContractFactory("XVS");
  const xvs: XVS = await xvsFactory.deploy(deployer.address);

  return { vaiVault, vai, xvs, user1, user2 };
};

describe("VAIVault", async () => {
  let vaiVault: VAIVault;
  let vai: VAI;
  let xvs: XVS;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async () => {
    ({ vaiVault, vai, xvs, user1, user2 } = await loadFixture(deployVaultFixture));
  });

  describe("setVenusInfo", async () => {
    it("fails if called by a non-admin", async () => {
      await expect(vaiVault.connect(user1).setVenusInfo(xvs.address, vai.address)).to.be.revertedWith("only admin can");
    });

    it("fails if XVS address is zero", async () => {
      await expect(vaiVault.setVenusInfo(constants.AddressZero, vai.address)).to.be.revertedWith(
        "addresses must not be zero",
      );
    });

    it("fails if VAI address is zero", async () => {
      await expect(vaiVault.setVenusInfo(xvs.address, constants.AddressZero)).to.be.revertedWith(
        "addresses must not be zero",
      );
    });

    it("disallows configuring tokens twice", async () => {
      await vaiVault.setVenusInfo(xvs.address, vai.address);
      await expect(vaiVault.setVenusInfo(xvs.address, vai.address)).to.be.revertedWith("addresses already set");
    });
  });

  it("claim reward", async () => {
    await expect(vaiVault.setVenusInfo(constants.AddressZero, constants.AddressZero)).to.be.revertedWith(
      "addresses must not be zero",
    );
    await vaiVault.setVenusInfo(xvs.address, vai.address);
    await vai.mint(user1.address, bigNumber18.mul(100));
    await vai.mint(user2.address, bigNumber18.mul(100));

    expect(await vai.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(100));

    await vai.connect(user1).approve(vaiVault.address, bigNumber18.mul(100));
    await vaiVault.connect(user1).deposit(bigNumber18.mul(100));

    await vai.connect(user2).approve(vaiVault.address, bigNumber18.mul(100));
    await vaiVault.connect(user2).deposit(bigNumber18.mul(100));

    await xvs.transfer(vaiVault.address, bigNumber18.mul(50));
    await vaiVault.updatePendingRewards();

    await vaiVault.connect(user1).withdraw(1);

    expect(await xvs.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(25));
    expect(await xvs.balanceOf(user2.address)).to.be.equal(bigNumber18.mul(0));

    expect(await vaiVault.pendingXVS(user2.address)).to.be.equal(bigNumber18.mul(25));
    expect(await vaiVault.pendingXVS(user1.address)).to.be.equal(bigNumber18.mul(0));

    await vaiVault["claim(address)"](user2.address);
    expect(await xvs.balanceOf(user2.address)).to.be.equal(bigNumber18.mul(25));
  });
});
