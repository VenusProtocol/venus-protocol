import { smock } from "@defi-wonderland/smock";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers } from "hardhat";

import { XVSVault, XVSVaultProxy } from "../../../typechain";
import { forking } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const XVS_VAULT_PROXY = "0x9aB56bAD2D7631B2A857ccf36d998232A8b82280";
const TIMELOCK = "0xce10739590001705F7FF231611ba4A48B2820327";

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
