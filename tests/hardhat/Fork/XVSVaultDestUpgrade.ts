import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

import {
  XVSVault,
  XVSVaultDest,
  XVSVaultDest__factory,
  XVSVaultProxy,
  XVSVaultProxy__factory,
  XVSVault__factory,
} from "../../../typechain";
import { forking, initMainnetUser } from "./utils";

const FORK_MAINNET = process.env.FORK === "true" && process.env.FORKED_NETWORK === "ethereum";

// Address of the vault proxy
const vaultProxy = "0xA0882C2D5DF29233A092d2887A258C2b90e9b994";
// User who has multiple withdraw requests and affected because of afterUpgrade parameter in struct
const vaultUser = "0xddbc1841be23b2ab55501deb4d6bc39e3f8aa2d7";
// Address of vault owner
const Owner = "0x285960C5B22fD66A736C7136967A3eB15e93CC67";
// Address of xvs token contract
const xvsAddress = "0xd3CC9d8f3689B83c91b7B59cAB4946B063EB894A";

let impersonatedOwner: Signer;
let xvsVault: XVSVault;
let xvsVaultDest: XVSVaultDest;
let xvsVaultProxy: XVSVaultProxy;
let xvsStore: string;
let xvsAdd: string;
let rewardTokenAmountsPerBlock: BigNumber;
let admin: string;
let pendingAdmin: string;
let pendingXVSVaultImplementation: string;
let totalAllocPoints: BigNumber;
let nonce: BigNumber;
let delegates: string;
let nCheckpoint: number;
let isPaused: boolean;
let isStakedToken: boolean;
let pendingRewards: BigNumber;
let primeToken: string;
let implementation: string;

async function deployAndConfigureOldVault() {
  xvsVaultProxy = XVSVaultProxy__factory.connect(vaultProxy, impersonatedOwner);
  xvsVault = XVSVault__factory.connect(vaultProxy, impersonatedOwner);
}

if (FORK_MAINNET) {
  const blockNumber = 19182700;
  forking(blockNumber, async () => {
    describe("XVSVault", async () => {
      before(async () => {
        impersonatedOwner = await initMainnetUser(Owner, ethers.utils.parseEther("3"));
        await deployAndConfigureOldVault();
        const [signer] = await ethers.getSigners();

        // Save all states before upgrade
        xvsStore = await xvsVault.xvsStore();
        xvsAdd = await xvsVault.xvsAddress();
        rewardTokenAmountsPerBlock = await xvsVault.rewardTokenAmountsPerBlock(vaultUser);
        admin = await xvsVault.admin();
        pendingAdmin = await xvsVault.pendingAdmin();
        pendingXVSVaultImplementation = await xvsVault.pendingXVSVaultImplementation();
        totalAllocPoints = await xvsVault.totalAllocPoints(xvsAddress);
        nonce = await xvsVault.nonces(signer.address);
        delegates = await xvsVault.delegates(signer.address);
        nCheckpoint = await xvsVault.numCheckpoints(signer.address);
        isPaused = await xvsVault.vaultPaused();
        isStakedToken = await xvsVault.isStakedToken(xvsAddress);
        pendingRewards = await xvsVault.pendingRewardTransfers(xvsAddress, signer.address);
        primeToken = await xvsVault.primeToken();
        implementation = await xvsVault.implementation();
      });

      it("Verify states after upgrade", async () => {
        const [signer] = await ethers.getSigners();

        const xvsVaultFactory = await ethers.getContractFactory("XVSVaultDest");
        xvsVaultDest = await xvsVaultFactory.deploy();
        await xvsVaultDest.deployed();

        await xvsVaultProxy.connect(impersonatedOwner)._setPendingImplementation(xvsVaultDest.address);
        await xvsVaultDest.connect(impersonatedOwner)._become(xvsVaultProxy.address);
        xvsVaultDest = XVSVaultDest__factory.connect(xvsVaultProxy.address, impersonatedOwner);

        expect(xvsStore).equals(await xvsVaultDest.xvsStore());
        expect(xvsAdd).equals(await xvsVaultDest.xvsAddress());
        expect(rewardTokenAmountsPerBlock).equals(await xvsVaultDest.rewardTokenAmountsPerBlock(vaultUser));
        expect(admin).equals(await xvsVaultDest.admin());
        expect(pendingAdmin).equals(await xvsVaultDest.pendingAdmin());
        expect(implementation).not.equals(await xvsVaultDest.implementation());
        expect(pendingXVSVaultImplementation).equals(await xvsVaultDest.pendingXVSVaultImplementation());
        expect(totalAllocPoints).equals(await xvsVaultDest.totalAllocPoints(xvsAddress));
        expect(nonce).equals(await xvsVaultDest.nonces(signer.address));
        expect(delegates).equals(await xvsVaultDest.delegates(signer.address));
        expect(nCheckpoint).equals(await xvsVaultDest.numCheckpoints(signer.address));
        expect(isPaused).equals(await xvsVaultDest.vaultPaused());
        expect(isStakedToken).equals(await xvsVaultDest.isStakedToken(xvsAddress));
        expect(pendingRewards).equals(await xvsVaultDest.pendingRewardTransfers(xvsAddress, signer.address));
        expect(primeToken).equals(await xvsVaultDest.primeToken());
      });
    });
  });
}
