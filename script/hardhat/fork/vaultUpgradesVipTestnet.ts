import { expect } from "chai";
import { ethers } from "hardhat";

import { VAIVault, VRTVault, XVSVault } from "../../../typechain";
import { forking, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const ACM = "0x45f8a08f534f34a97187626e05d4b6648eeaa9aa";
const XVS_VAULT_PROXY = "0x9aB56bAD2D7631B2A857ccf36d998232A8b82280";
const VAI_VAULT_PROXY = "0x7Db4f5cC3bBA3e12FF1F528D2e3417afb0a57118";
const VRT_VAULT_PROXY = "0x1ffD1b8B67A1AE0C189c734B0F58B0954522FF71";
const XVS_OLD = "0x34688aec16d920959387e276531954cae8821714";
const VAI_OLD = "0x34688Aec16d920959387e276531954CaE8821714";
const VRT_OLD = "0x6599158624a040491fb3e13a1e5a3b386aecff19";
const VRT_NEW = "0x009cdFB248e021f58A34B50dc2A7601EA72d14Ac";
const XVS_NEW = "0xD9d10f63d736dc2D5271Ce7E94C4B07E114D7c76";
const VAI_NEW = "0x6765202c3e6d3FdD05F0b26105d0C8DF59D3efaf";
const FAST_TRACK_TIMELOCK = "0x3CFf21b7AF8390fE68799D58727d3b4C25a83cb6";
const CRITICAL_TIMELOCK = "0x23B893a7C45a5Eb8c8C062b9F32d0D2e43eD286D";
const NORMAL_TIMELOCK = "0xce10739590001705F7FF231611ba4A48B2820327";

export const vip105 = () => {
  const meta = {
    version: "v2",
    title: "VIP-105 Vault Upgrades Testnet",
    description: `
    Accept the ownership of the XVSVault and VRTVault contracts (previously we had to execute a multisig TX to offer this change)
      the new owner will be the Normal timelock contract (0x939bd8d64c0a9583a7dcea9933f7b21697ab6396)

    Upgrade the implementations of the three vaults
      Address of the XVSVault proxy in main net: https://testnet.bscscan.com/address/0x9aB56bAD2D7631B2A857ccf36d998232A8b82280
      Address of the VRTVault proxy in main net: https://testnet.bscscan.com/address/0x1ffD1b8B67A1AE0C189c734B0F58B0954522FF71
      Address of the VAIVault proxy in main net: https://testnet.bscscan.com/address/0x7Db4f5cC3bBA3e12FF1F528D2e3417afb0a57118

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
    Set the lastAcrruingBlock in VRTVault to 27348741, so after this block no rewards will be accrued in the VRT Vault.
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

      {
        target: ACM,
        signature: "giveCallPermission(address,string,address)",
        params: [VRT_VAULT_PROXY, "setLastAccruingBlock(uint256)", NORMAL_TIMELOCK],
      },

      {
        target: VRT_VAULT_PROXY,
        signature: "setLastAccruingBlock(uint256)",
        params: [27348741],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(28839888, async () => {
  let xvsVault: XVSVault;
  let vaiVault: VAIVault;
  let vrtVault: VRTVault;

  before(async () => {
    xvsVault = await ethers.getContractAt("XVSVault", XVS_VAULT_PROXY);
    vaiVault = await ethers.getContractAt("VAIVault", VAI_VAULT_PROXY);
    vrtVault = await ethers.getContractAt("VRTVault", VRT_VAULT_PROXY);
  });

  describe("Pre-VIP behavior", async () => {
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

  testVip("VIP-105 Change Vault Implementation Testnet", vip105());
});
