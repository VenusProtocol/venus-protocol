import { expect } from "chai";
import { ethers } from "hardhat";

import { VAIVaultProxy } from "../../../typechain";
import { forking, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const OLD_VAIVAULT = "0x7680C89Eb3e58dEc4D38093B4803be2b7f257360";
const NEW_VAIVAULT = "0x7130ed0174B72c17623af46FBF4757c9efD42b00";
const VAIVAULT_PROXY = "0x0667Eed0a0aAb930af74a3dfeDD263A73994f216";

export const vip104 = () => {
  const meta = {
    version: "v2",
    title: "VIP-104 New VAIVault Implementation",
    description: `
    The goal of the VIP is to replace the implementation of the VAIVault, replacing the current one with a new one that includes the function claim(address account) developed in VEN-1099.
    The VAIVaultProxy is deployed at 0x0667eed0a0aab930af74a3dfedd263a73994f216
    New VAIVault implementation contract: 0x7130ed0174B72c17623af46FBF4757c9efD42b00 (already deployed to main net)
    The commands to include in the VIP should be:
    VAIVaultProxy._setPendingImplementation(New VAIVault implementation)
    New VAIVault implementation._become(VAIVaultProxy)
    `,
    forDescription: "I agree that Venus Protocol should proceed with the new Implementation of VAIVault",
    againstDescription: "I do not think that Venus Protocol should proceed with the new Implementation of VAIVault",
    abstainDescription:
      "I am indifferent to whether Venus Protocol proceeds with the new Implementation of VAIVault or not",
  };

  return makeProposal(
    [
      {
        target: VAIVAULT_PROXY,
        signature: "_setPendingImplementation(address)",
        params: [NEW_VAIVAULT],
      },

      {
        target: NEW_VAIVAULT,
        signature: "_become(address)",
        params: [VAIVAULT_PROXY],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(26683155, () => {
  let vaiVaultProxy: VAIVaultProxy;

  before(async () => {
    vaiVaultProxy = await ethers.getContractAt("VAIVaultProxy", VAIVAULT_PROXY);
  });

  describe("Pre-VIP behavior", async () => {
    it("Implementation of OLD VAIVault", async () => {
      const vaiVaultImplementation = await vaiVaultProxy.vaiVaultImplementation();
      expect(vaiVaultImplementation).to.equal(OLD_VAIVAULT);
    });
  });

  testVip("VIP-104 Change VAIVault Implementation", vip104());

  describe("Post-VIP behavior", async () => {
    it("Implementation of NEW VAIVault", async () => {
      const vaiVaultImplementation = await vaiVaultProxy.vaiVaultImplementation();
      expect(vaiVaultImplementation).to.equal(NEW_VAIVAULT);
    });
  });
});
