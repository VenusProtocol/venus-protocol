import { smock } from "@defi-wonderland/smock";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers, network } from "hardhat";

import { XVSVault, XVSVaultProxy } from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const XVS_VAULT_PROXY = "0x9aB56bAD2D7631B2A857ccf36d998232A8b82280";
const TIMELOCK = "0xce10739590001705F7FF231611ba4A48B2820327";

export async function setForkBlock(blockNumber: number) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env[`ARCHIVE_NODE_${process.env.FORKED_NETWORK}`],
          blockNumber: blockNumber,
        },
      },
    ],
  });
}

const forking = (blockNumber: number, fn: () => void) => {
  describe(`Reward and Setter facet upgrade check At block #${blockNumber}`, () => {
    before(async () => {
      await setForkBlock(blockNumber);
    });
    fn();
  });
};

forking(36322844, () => {
  let xvsVault: XVSVault;
  let xvsVaultAsProxy: XVSVault;
  let xvsVaultProxy: XVSVaultProxy;
  let owner: SignerWithAddress;

  if (process.env.FORK === "true" && process.env.FORKED_NETWORK === "bsctestnet") {
    before(async () => {
      await impersonateAccount(TIMELOCK);
      owner = await ethers.getSigner(TIMELOCK);

      const xvsVaultFactory = await ethers.getContractFactory("XVSVault");
      xvsVault = await xvsVaultFactory.deploy();

      xvsVaultProxy = await ethers.getContractAt("XVSVaultProxy", XVS_VAULT_PROXY);
      xvsVaultAsProxy = await ethers.getContractAt("XVSVault", XVS_VAULT_PROXY);
    });

    it("upgrade checks", async () => {
      await xvsVaultProxy.connect(owner)._setPendingImplementation(xvsVault.address);
      await xvsVault.connect(owner)._become(XVS_VAULT_PROXY);
      await xvsVaultAsProxy.connect(owner).initializeTimeManager(false, 10512000);

      await expect(xvsVaultAsProxy.getBlockNumberOrTimestamp()).to.not.be.reverted;
    });
  }
});
