import { impersonateAccount, loadFixture, mine, mineUpTo, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, use } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import { forking } from "../../../script/hardhat/fork/vip-framework";
import { VRT, VRTVault, VRTVaultProxy, VRTVault__factory } from "../../../typechain";
import { vrtVault } from "../../../typechain/contracts";

const FORK_MAINNET = process.env.FORK_MAINNET === "true";

// Address of the vault proxy
const vaultProxy = "0x98bF4786D72AAEF6c714425126Dd92f149e3F334";
// vrt vault user
const vaultUser = "0x3fec405f0d1e97b44482d7d4200d934818c57786";
// Address of vault owner (Multisig)
const vaultAdmin = "0x1c2cac6ec528c20800b2fe734820d87b581eaa6b";
// vrt token
const vrtAddress = "0x5f84ce30dc3cf7909101c69086c50de191895883";

const stopAccruingRewardsAtBlock = 26967000;

type VRTVaultFixture = {
  admin: SignerWithAddress;
  user: SignerWithAddress;
  vrtVault: VRTVault;
  vrt: VRT;
};

async function deployNewVaultImplementation(): Promise<VRTVaultFixture> {
  await impersonateAccount(vaultAdmin);
  const admin = await ethers.getSigner(vaultAdmin);
  await setBalance(vaultAdmin, ethers.utils.parseEther("2"));

  await impersonateAccount(vaultUser);
  const user = await ethers.getSigner(vaultUser);
  //await setBalance(user, ethers.utils.parseEther("1"));

  const vrtVaultProxy: VRTVaultProxy = await ethers.getContractAt("VRTVaultProxy", vaultProxy);

  const vrtVaultFactory: VRTVault__factory = await ethers.getContractFactory("VRTVault");
  const vrtVaultImpl = await vrtVaultFactory.deploy();
  await vrtVaultImpl.deployed();

  await vrtVaultProxy.connect(admin)._setPendingImplementation(vrtVaultImpl.address);
  await vrtVaultImpl.connect(admin)._become(vrtVaultProxy.address);

  const vrtVault: VRTVault = await ethers.getContractAt("VRTVault", vaultProxy);
  await vrtVault.connect(admin).setLastAccruingBlock(stopAccruingRewardsAtBlock);
  const vrt: VRT = await ethers.getContractAt("VRT", vrtAddress);

  return { admin, user, vrtVault, vrt };
}
if (FORK_MAINNET) {
  const blockNumber = 26900000;
  forking(blockNumber, () => {
    let fixture: VRTVaultFixture;
    describe("VRT Vault Stop Rewarding at future block", () => {
      before(async () => {
        fixture = await loadFixture(deployNewVaultImplementation);
      });
      it("New state variable should be correctly set", async () => {
        const { vrtVault } = fixture;
        expect(await vrtVault.callStatic.lastAccruingBlock()).to.equal(stopAccruingRewardsAtBlock);
      });
      it("Should accrue all the interest until the hard stop block", async () => {
        const { vrt, vrtVault, user } = fixture;
        const mantissaOne = BigNumber.from(convertToUnit(1, 18));
        //mine up to the last block that users can accrue rewards
        await mineUpTo(stopAccruingRewardsAtBlock);
        const userState = await vrtVault.userInfo(await user.getAddress());
        const interestRatePerBlock = await vrtVault.callStatic.interestRatePerBlock();

        const { accrualStartBlockNumber, totalPrincipalAmount } = userState;
        const currentBlockNumber = BigNumber.from((await ethers.provider.getBlock("latest")).number);
        //Calculate total interest accrued
        const blockDelta = currentBlockNumber.sub(accrualStartBlockNumber);
        const accruedInterest = totalPrincipalAmount.mul(interestRatePerBlock).mul(blockDelta).div(mantissaOne);
        //Get balance of user before claim
        const balanceBefore = await vrt.balanceOf(await user.getAddress());

        await vrtVault.connect(user)["claim()"]();
        expect(await vrt.balanceOf(await user.getAddress())).to.equal(balanceBefore.add(accruedInterest));
      });
      it("Should not accrue interest after the hard stop block", async () => {
        const { vrtVault, user } = fixture;
        await mine(100);
        expect(await vrtVault.getAccruedInterest(await user.getAddress())).to.equal(0);
      });
    });
  });
}
