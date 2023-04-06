import { expect } from "chai";
import { ethers } from "hardhat";

import { IAccessControlManager, VAIVault, VRTVault, VRTVaultProxy, XVSVault, XVSVaultProxy } from "../../../typechain";
import { forking, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";
import { initMainnetUser } from "./vip-framework/utils";

const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
const XVS_VAULT_PROXY = "0x051100480289e704d20e9DB4804837068f3f9204";
const VAI_VAULT_PROXY = "0x0667Eed0a0aAb930af74a3dfeDD263A73994f216";
const VRT_VAULT_PROXY = "0x98bF4786D72AAEF6c714425126Dd92f149e3F334";
const XVS_OLD = "0xA0c958ca0FfA25253DE0a23f98aD3062F3987073";
const VAI_OLD = "0x7680C89Eb3e58dEc4D38093B4803be2b7f257360";
const VRT_OLD = "0xA3EEA5e491AD45caE30F6E0a315A275cc99EE147";
const XVS_NEW = "0x5F0A1E8941d6d0E3d220237FA326F0bfbbCC3E9F";
const VAI_NEW = "0x23D1F85ACDC301bA61D46Ab1c986B781a3776435";
const VRT_NEW = "0x023EEDd63947634854654b2607088EB12B2d185f";
const FAST_TRACK_TIMELOCK = "0x555ba73dB1b006F3f2C7dB7126d6e4343aDBce02";
const CRITICAL_TIMELOCK = "0x213c446ec11e45b15a6E29C1C1b402B8897f606d";
const MULTISIG = "0x1C2CAc6ec528c20800B2fe734820D87b581eAA6B";
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";

export const vip105 = () => {
  const meta = {
    version: "v2",
    title: "VIP-105 Vault Upgrades",
    description: `
    Accept the ownership of the XVSVault and VRTVault contracts (previously we had to execute a multisig TX to offer this change)
      the new owner will be the Normal timelock contract (0x939bd8d64c0a9583a7dcea9933f7b21697ab6396)

    Upgrade the implementations of the three vaults
      Address of the XVSVault proxy in main net: https://bscscan.com/address/0x051100480289e704d20e9db4804837068f3f9204
      Address of the VRTVault proxy in main net: https://bscscan.com/address/0x98bF4786D72AAEF6c714425126Dd92f149e3F334
      Address of the VAIVault proxy in main net: https://bscscan.com/address/0x0667eed0a0aab930af74a3dfedd263a73994f216

    Authorize the Fast-track and Critical timelock contracts to invoke the admin functions in the vaults, specifically for the following functions:
      XVSVault:
        pause
        resume
      VRTVault
        pause
        resume
      VAIVault
        pause
        resume
    `,
    forDescription: "I agree that Venus Protocol should proceed with the Vault Upgrades",
    againstDescription: "I do not think that Venus Protocol should proceed with the Vault Upgrades",
    abstainDescription: "I am indifferent to whether Venus Protocol proceeds with the Vault Upgrades or not",
  };

  return makeProposal(
    [
      {
        target: XVS_VAULT_PROXY,
        signature: "_acceptAdmin()",
        params: [],
      },

      {
        target: VRT_VAULT_PROXY,
        signature: "_acceptAdmin()",
        params: [],
      },

      {
        target: XVS_VAULT_PROXY,
        signature: "_setPendingImplementation(address)",
        params: [XVS_NEW],
      },

      {
        target: VRT_VAULT_PROXY,
        signature: "_setPendingImplementation(address)",
        params: [VRT_NEW],
      },

      {
        target: VAI_VAULT_PROXY,
        signature: "_setPendingImplementation(address)",
        params: [VAI_NEW],
      },

      {
        target: XVS_NEW,
        signature: "_become(address)",
        params: [XVS_VAULT_PROXY],
      },

      {
        target: VRT_NEW,
        signature: "_become(address)",
        params: [VRT_VAULT_PROXY],
      },

      {
        target: VAI_NEW,
        signature: "_become(address)",
        params: [VAI_VAULT_PROXY],
      },

      {
        target: VAI_VAULT_PROXY,
        signature: "_setAccessControl(address)",
        params: [ACM],
      },

      {
        target: XVS_VAULT_PROXY,
        signature: "_setAccessControl(address)",
        params: [ACM],
      },

      {
        target: VRT_VAULT_PROXY,
        signature: "_setAccessControl(address)",
        params: [ACM],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [XVS_VAULT_PROXY, "pause()", FAST_TRACK_TIMELOCK],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [XVS_VAULT_PROXY, "pause()", CRITICAL_TIMELOCK],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [XVS_VAULT_PROXY, "resume()", FAST_TRACK_TIMELOCK],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [XVS_VAULT_PROXY, "resume()", CRITICAL_TIMELOCK],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [VAI_VAULT_PROXY, "pause()", FAST_TRACK_TIMELOCK],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [VAI_VAULT_PROXY, "pause()", CRITICAL_TIMELOCK],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [VAI_VAULT_PROXY, "resume()", FAST_TRACK_TIMELOCK],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [VAI_VAULT_PROXY, "resume()", CRITICAL_TIMELOCK],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [VRT_VAULT_PROXY, "pause()", FAST_TRACK_TIMELOCK],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [VRT_VAULT_PROXY, "pause()", CRITICAL_TIMELOCK],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [VRT_VAULT_PROXY, "resume()", FAST_TRACK_TIMELOCK],
      },

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [VRT_VAULT_PROXY, "resume()", CRITICAL_TIMELOCK],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(27077371, async () => {
  let xvsVaultProxy: XVSVaultProxy;
  let vrtVaultProxy: VRTVaultProxy;
  let xvsVault: XVSVault;
  let vaiVault: VAIVault;
  let vrtVault: VRTVault;
  let accessControlManager: IAccessControlManager;
  let xvsVaultSigner;
  let vaiVaultSigner;
  let vrtVaultSigner;

  before(async () => {
    xvsVault = await ethers.getContractAt("XVSVault", XVS_VAULT_PROXY);
    vaiVault = await ethers.getContractAt("VAIVault", VAI_VAULT_PROXY);
    vrtVault = await ethers.getContractAt("VRTVault", VRT_VAULT_PROXY);

    xvsVaultProxy = await ethers.getContractAt("XVSVaultProxy", XVS_VAULT_PROXY);
    vrtVaultProxy = await ethers.getContractAt("VRTVaultProxy", VRT_VAULT_PROXY);
    const multiSigSigner = await initMainnetUser(MULTISIG, ethers.utils.parseEther("1.0"));

    await xvsVaultProxy.connect(multiSigSigner)._setPendingAdmin(NORMAL_TIMELOCK);
    await vrtVaultProxy.connect(multiSigSigner)._setPendingAdmin(NORMAL_TIMELOCK);

    xvsVaultSigner = await initMainnetUser(XVS_VAULT_PROXY, ethers.utils.parseEther("1"));
    vaiVaultSigner = await initMainnetUser(VAI_VAULT_PROXY, ethers.utils.parseEther("1"));
    vrtVaultSigner = await initMainnetUser(VRT_VAULT_PROXY, ethers.utils.parseEther("1"));
    accessControlManager = await ethers.getContractAt("IAccessControlManager", ACM);
  });

  describe("Pre-VIP behavior", async () => {
    it("Owner of XVSVault is Multisig", async () => {
      const owner = await xvsVault.admin();
      expect(owner).to.equal(MULTISIG);
    });

    it("Owner of VRTVault is Multisig", async () => {
      const owner = await vrtVault.admin();
      expect(owner).to.equal(MULTISIG);
    });

    it("Implementation of XVSVault", async () => {
      const impl = await xvsVault.implementation();
      expect(impl).to.equal(XVS_OLD);
    });

    it("Implementation of VAIVault", async () => {
      const impl = await vaiVault.vaiVaultImplementation();
      expect(impl).to.equal(VAI_OLD);
    });

    it("Implementation of VRTVault", async () => {
      const impl = await vrtVault.implementation();
      expect(impl).to.equal(VRT_OLD);
    });
  });

  testVip("VIP-105 Change Vault Implementation", vip105());

  describe("Post-VIP behavior", async () => {
    it("Owner of XVSVault is NORMAL TIMELOCK", async () => {
      const owner = await xvsVault.admin();
      expect(owner).to.equal(NORMAL_TIMELOCK);
    });

    it("Owner of VAIVault is NORMAL TIMELOCK", async () => {
      const owner = await vaiVault.admin();
      expect(owner).to.equal(NORMAL_TIMELOCK);
    });

    it("Owner of VRTVault is NORMAL TIMELOCK", async () => {
      const owner = await vrtVault.admin();
      expect(owner).to.equal(NORMAL_TIMELOCK);
    });

    it("Implementation of XVSVault", async () => {
      const impl = await xvsVault.implementation();
      expect(impl).to.equal(XVS_NEW);
    });

    it("Implementation of VAIVault", async () => {
      const impl = await vaiVault.vaiVaultImplementation();
      expect(impl).to.equal(VAI_NEW);
    });

    it("Implementation of VRTVault", async () => {
      const impl = await vrtVault.implementation();
      expect(impl).to.equal(VRT_NEW);
    });

    it("XVS VAULT Permissions", async () => {
      expect(await accessControlManager.connect(xvsVaultSigner).isAllowedToCall(CRITICAL_TIMELOCK, "pause()")).equals(
        true,
      );
      expect(await accessControlManager.connect(xvsVaultSigner).isAllowedToCall(CRITICAL_TIMELOCK, "resume()")).equals(
        true,
      );
      expect(await accessControlManager.connect(xvsVaultSigner).isAllowedToCall(FAST_TRACK_TIMELOCK, "pause()")).equals(
        true,
      );
      expect(
        await accessControlManager.connect(xvsVaultSigner).isAllowedToCall(FAST_TRACK_TIMELOCK, "resume()"),
      ).equals(true);
    });

    it("VAI VAULT Permissions", async () => {
      expect(await accessControlManager.connect(vaiVaultSigner).isAllowedToCall(CRITICAL_TIMELOCK, "pause()")).equals(
        true,
      );
      expect(await accessControlManager.connect(vaiVaultSigner).isAllowedToCall(CRITICAL_TIMELOCK, "resume()")).equals(
        true,
      );
      expect(await accessControlManager.connect(vaiVaultSigner).isAllowedToCall(FAST_TRACK_TIMELOCK, "pause()")).equals(
        true,
      );
      expect(
        await accessControlManager.connect(vaiVaultSigner).isAllowedToCall(FAST_TRACK_TIMELOCK, "resume()"),
      ).equals(true);
    });

    it("XVS VAULT Permissions", async () => {
      expect(await accessControlManager.connect(vrtVaultSigner).isAllowedToCall(CRITICAL_TIMELOCK, "pause()")).equals(
        true,
      );
      expect(await accessControlManager.connect(vrtVaultSigner).isAllowedToCall(CRITICAL_TIMELOCK, "resume()")).equals(
        true,
      );
      expect(await accessControlManager.connect(vrtVaultSigner).isAllowedToCall(FAST_TRACK_TIMELOCK, "pause()")).equals(
        true,
      );
      expect(
        await accessControlManager.connect(vrtVaultSigner).isAllowedToCall(FAST_TRACK_TIMELOCK, "resume()"),
      ).equals(true);
    });
  });
});
