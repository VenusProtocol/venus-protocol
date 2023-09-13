import { FakeContract, smock } from "@defi-wonderland/smock";
import { loadFixture, mineUpTo } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { IAccessControlManager, VRT, VRTVault, VRTVault__factory, VRT__factory } from "../../../typechain";

const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18

type VaultFixture = {
  accessControl: FakeContract<IAccessControlManager>;
  vrtVault: VRTVault;
  vrt: VRT;
  user1: SignerWithAddress;
  user2: SignerWithAddress;
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

  const accessControl: FakeContract<IAccessControlManager> = await smock.fake<IAccessControlManager>(
    "AccessControlManager",
  );
  accessControl.isAllowedToCall.returns(true);

  await vrtVault.setAccessControl(accessControl.address);
  return { accessControl, vrtVault, vrt, user1, user2 };
}

describe("VRTVault", async () => {
  let fixture: VaultFixture;

  describe("unit tests", async () => {
    beforeEach(async () => {
      fixture = await loadFixture(deployVaultFixture);
    });

    describe("setLastAccruingBlock", async () => {
      it("fails if ACM disallows the call", async () => {
        const { accessControl, vrtVault } = fixture;

        accessControl.isAllowedToCall.returns(false);
        await expect(vrtVault.setLastAccruingBlock((await getLastBlock()) + 1000)).to.be.revertedWith("Unauthorized");
        accessControl.isAllowedToCall.returns(true);
      });

      it("fails if trying to set lastAccuringBlock to some absurdly high value", async () => {
        const { vrtVault } = fixture;
        const blockNumberTooFar = 10000000000;
        await expect(vrtVault.setLastAccruingBlock(blockNumberTooFar)).to.be.revertedWith(
          "_lastAccruingBlock is absurdly high",
        );
      });

      it("fails if lastAccuringBlock has passed", async () => {
        const { vrtVault } = fixture;
        const lastAccruingBlock = (await getLastBlock()) + 10;
        await vrtVault.setLastAccruingBlock(lastAccruingBlock);
        await mineUpTo(lastAccruingBlock);
        await expect(vrtVault.setLastAccruingBlock(lastAccruingBlock + 100)).to.be.revertedWith(
          "Cannot change at this point",
        );
      });

      it("fails if trying to set lastAccuringBlock to some past block", async () => {
        const { vrtVault } = fixture;
        await expect(vrtVault.setLastAccruingBlock(await getLastBlock())).to.be.revertedWith(
          "Invalid _lastAccruingBlock interest have been accumulated",
        );
      });

      it("fails if trying to set lastAccuringBlock to the current block", async () => {
        const { vrtVault } = fixture;
        await expect(vrtVault.setLastAccruingBlock((await getLastBlock()) + 1)).to.be.revertedWith(
          "Invalid _lastAccruingBlock interest have been accumulated",
        );
      });

      it("correctly sets lastAccuringBlock to some future block", async () => {
        const { vrtVault } = fixture;
        const lastAccruingBlock = (await getLastBlock()) + 10;
        await vrtVault.setLastAccruingBlock(lastAccruingBlock);
        expect(await vrtVault.lastAccruingBlock()).to.equal(lastAccruingBlock);
      });

      it("can move lastAccuringBlock to a later block", async () => {
        const { vrtVault } = fixture;
        const currentBlock = await getLastBlock();
        await vrtVault.setLastAccruingBlock(currentBlock + 10);
        await vrtVault.setLastAccruingBlock(currentBlock + 100);
        expect(await vrtVault.lastAccruingBlock()).to.equal(currentBlock + 100);
      });

      it("can move lastAccuringBlock to an earlier block", async () => {
        const { vrtVault } = fixture;
        const currentBlock = await getLastBlock();
        await vrtVault.setLastAccruingBlock(currentBlock + 100);
        await vrtVault.setLastAccruingBlock(currentBlock + 10);
        expect(await vrtVault.lastAccruingBlock()).to.equal(currentBlock + 10);
      });

      it("fails if trying to move lastAccuringBlock to a block in the past", async () => {
        const { vrtVault } = fixture;
        const currentBlock = await getLastBlock();
        await vrtVault.setLastAccruingBlock(currentBlock + 100);
        await expect(vrtVault.setLastAccruingBlock(currentBlock)).to.be.revertedWith(
          "Invalid _lastAccruingBlock interest have been accumulated",
        );
      });
    });
  });

  describe("scenario", async () => {
    let lastAccruingBlock: number;

    before(async () => {
      fixture = await loadFixture(deployVaultFixture);
      const initialBlock = await getLastBlock();
      lastAccruingBlock = initialBlock + 106;
      await fixture.vrtVault.setLastAccruingBlock(lastAccruingBlock);
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
      const { vrtVault, vrt, user1, user2 } = fixture;
      await mineUpTo(lastAccruingBlock);
      await vrtVault.connect(user2)["claim(address)"](user1.address);
      expect(await vrt.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(10100));
    });

    it("should not claim reward after certain block", async function () {
      const { vrtVault, vrt, user1, user2 } = fixture;
      await vrtVault.connect(user2)["claim(address)"](user1.address);
      expect(await vrt.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(10100));
      await mineUpTo(lastAccruingBlock + 10);
      await vrtVault.connect(user2)["claim(address)"](user1.address);
      expect(await vrt.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(10100));
      await mineUpTo(lastAccruingBlock + 10000);
      await vrtVault.connect(user2)["claim(address)"](user1.address);
      expect(await vrt.balanceOf(user1.address)).to.be.equal(bigNumber18.mul(10100));
    });
  });
});
