import { expect } from "chai";
import { ethers } from "hardhat";

import { IAccessControlManager, VAIVault, VRTVault, XVSVault } from "../../../typechain";
import { forking, pretendExecutingVip, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";
const XVS_VAULT_PROXY = "0x051100480289e704d20e9DB4804837068f3f9204";
const VAI_VAULT_PROXY = "0x0667Eed0a0aAb930af74a3dfeDD263A73994f216";
const VRT_VAULT_PROXY = "0x98bF4786D72AAEF6c714425126Dd92f149e3F334";
const XVS_OLD = "0xA0c958ca0FfA25253DE0a23f98aD3062F3987073";
const VAI_OLD = "0x7680C89Eb3e58dEc4D38093B4803be2b7f257360";
const VRT_OLD = "0xA3EEA5e491AD45caE30F6E0a315A275cc99EE147";
const XVS_NEW = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"; // Fake Address
const VAI_NEW = "0x55d398326f99059fF775485246999027B3197955"; // Fake Address
const VRT_NEW = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"; // Fake Address
const FAST_TRACK_TIMELOCK = "0x555ba73dB1b006F3f2C7dB7126d6e4343aDBce02";
const CRITICAL_TIMELOCK = "0x213c446ec11e45b15a6E29C1C1b402B8897f606d";
const MULTISIG = "0x1C2CAc6ec528c20800B2fe734820D87b581eAA6B";
const NORMAL_TIMELOCK = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";

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

forking(26881099, () => {
  let xvsVault: XVSVault;
  let vaiVault: VAIVault;
  let vrtVault: VRTVault;

  before(async () => {
    xvsVault = await ethers.getContractAt("XVSVault", XVS_VAULT_PROXY);
    vaiVault = await ethers.getContractAt("VAIVault", VAI_VAULT_PROXY);
    vrtVault = await ethers.getContractAt("VRTVault", VRT_VAULT_PROXY);
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
});

forking(26881099, () => {
  testVip("VIP-104 Change VAIVault Implementation", vip105());
});

forking(26881099, () => {
  let xvsVault: XVSVault;
  let vaiVault: VAIVault;
  let vrtVault: VRTVault;
  let accessControlManager: IAccessControlManager;

  before(async () => {
    xvsVault = await ethers.getContractAt("XVSVault", XVS_VAULT_PROXY);
    vaiVault = await ethers.getContractAt("VAIVault", VAI_VAULT_PROXY);
    vrtVault = await ethers.getContractAt("VRTVault", VRT_VAULT_PROXY);
    accessControlManager = await ethers.getContractAt("IAccessControlManager", ACM);
    await pretendExecutingVip(vip105());
  });

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

    it("Permissions Granted", async () => {
      const criticalPause = await accessControlManager.isAllowedToCall(CRITICAL_TIMELOCK, "pause()");
      const criticalResume = await accessControlManager.isAllowedToCall(CRITICAL_TIMELOCK, "resume()");
      const fastTrackPause = await accessControlManager.isAllowedToCall(CRITICAL_TIMELOCK, "pause()");
      const fastTrackResume = await accessControlManager.isAllowedToCall(CRITICAL_TIMELOCK, "resume()");

      expect(criticalPause).to.equal(true);
      expect(criticalResume).to.equal(true);
      expect(fastTrackPause).to.equal(true);
      expect(fastTrackResume).to.equal(true);
    });
  });
});
