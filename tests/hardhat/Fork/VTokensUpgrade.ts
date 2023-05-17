import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";

import {
  VBep20Delegate,
  VBep20DelegateOld,
  VBep20DelegateOld__factory,
  VBep20Delegate__factory,
  VBep20Delegator__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const FORK_MAINNET = process.env.FORK_MAINNET === "true";

const vETH = "0xf508fcd89b8bd15579dc79a6827cb4686a3592c8";
const vXVS = "0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D";
const vBTC = "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B";
const vCAKE = "0x86aC3974e2BD0d60825230fa6F355fF11409df5c";
const vMATIC = "0x5c9476FcD6a4F9a3654139721c949c2233bBbBc8";

const vETH_MINT_USER = "0x389836609cb5518867c076480f0efb8a01a2cd6c";
const vXVS_MINT_USER = "0x34c186af43c0961c28ca8cfbca0c0784efadc936";
const vBTC_MINT_USER = "0xfad29c8b255011dc4dc0e87f879ab9032d8f085d";
const vCAKE_MINT_USER = "0x389836609cb5518867c076480f0efb8a01a2cd6c";
const vMATIC_MINT_USER = "0x0deec730468d37e3fab51d52383b763c48c694b5";

const vETH_BORROW_USER = "0x044b4443eab3fb27b37ef1d4aefa52f19ab445a2";
const vXVS_BORROW_USER = "0x34c186af43c0961c28ca8cfbca0c0784efadc936";
const vBTC_BORROW_USER = "0x4754541109a3d8d7747d99dfc6125b3239355913";
const vCAKE_BORROW_USER = "0x54c5a25e276470c1da188c2ab9db8a82fdff370d";
const vMATIC_BORROW_USER = "0xff0f1e322f3fc61a817760c8432ffdd483d67841";

const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";

let vEthNew: VBep20Delegate;
let vXvsNew: VBep20Delegate;
let vBtcNew: VBep20Delegate;
let vCakeNew: VBep20Delegate;
let vMaticNew: VBep20Delegate;

let vEthOld: VBep20DelegateOld;
let vXvsOld: VBep20DelegateOld;
let vBtcOld: VBep20DelegateOld;
let vCakeOld: VBep20DelegateOld;
let vMaticOld: VBep20DelegateOld;
let impersonatedTimelock: Signer;

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(NORMAL_TIMELOCK, ethers.utils.parseUnits("2"));
}

async function configureNew(vTokenAddress: string) {
  await configureTimelock();
  const vTokenProxy = VBep20Delegator__factory.connect(vTokenAddress, impersonatedTimelock);
  const vTokenFactory = await ethers.getContractFactory("VBep20Delegate");
  const vTokenImpl = await vTokenFactory.deploy();
  await vTokenImpl.deployed();
  await vTokenProxy.connect(impersonatedTimelock)._setImplementation(vTokenImpl.address, true, "0x00");
  const vToken = VBep20Delegate__factory.connect(vTokenAddress, impersonatedTimelock);
  return vToken;
}

async function configureOld(vTokenAddress: string) {
  await configureTimelock();
  const vToken = VBep20DelegateOld__factory.connect(vTokenAddress, impersonatedTimelock);
  return vToken;
}

if (FORK_MAINNET) {
  describe("VToken Upgrades", async () => {
    describe("Storage verify", async () => {
      async function fetchStorage(vToken: VBep20Delegate | VBep20DelegateOld, mintUser: string, borrowUser: string) {
        const name = await vToken.name();
        const symbol = await vToken.symbol();
        const decimals = await vToken.decimals();
        const admin = await vToken.admin();
        const pendingAdmin = await vToken.pendingAdmin();
        const comptroller = await vToken.comptroller();
        const interestRateModel = await vToken.interestRateModel();
        const reserveFactorMantissa = await vToken.reserveFactorMantissa();
        const accrualBlockNumber = await vToken.accrualBlockNumber();
        const borrowIndex = await vToken.borrowIndex();
        const totalBorrows = await vToken.totalBorrows();
        const totalReserves = await vToken.totalReserves();
        const totalSupply = await vToken.totalSupply();
        const underlying = await vToken.underlying();
        const accountBalance = await vToken.callStatic.balanceOf(mintUser);
        const borrowBalance = await vToken.callStatic.balanceOf(borrowUser);

        return {
          name,
          symbol,
          decimals,
          admin,
          pendingAdmin,
          comptroller,
          interestRateModel,
          reserveFactorMantissa,
          accrualBlockNumber,
          borrowIndex,
          totalBorrows,
          totalReserves,
          totalSupply,
          underlying,
          accountBalance,
          borrowBalance,
        };
      }

      it.only("Verify states after upgrade", async () => {
        await setForkBlock(28288423);
        vEthOld = await configureOld(vETH);
        vXvsOld = await configureOld(vXVS);
        vBtcOld = await configureOld(vBTC);
        vCakeOld = await configureOld(vCAKE);
        vMaticOld = await configureOld(vMATIC);

        const vEthOldState = await fetchStorage(vEthOld, vETH_MINT_USER, vETH_BORROW_USER);
        const vXvsOldState = await fetchStorage(vXvsOld, vXVS_MINT_USER, vXVS_BORROW_USER);
        const vBtcOldState = await fetchStorage(vBtcOld, vBTC_MINT_USER, vBTC_BORROW_USER);
        const vCakeOldState = await fetchStorage(vCakeOld, vCAKE_MINT_USER, vCAKE_BORROW_USER);
        const vMaticOldState = await fetchStorage(vMaticOld, vMATIC_MINT_USER, vMATIC_BORROW_USER);

        await setForkBlock(28288423);
        vEthNew = await configureNew(vETH);
        vXvsNew = await configureNew(vXVS);
        vBtcNew = await configureNew(vBTC);
        vCakeNew = await configureNew(vCAKE);
        vMaticNew = await configureNew(vMATIC);

        const vEthNewState = await fetchStorage(vEthNew, vETH_MINT_USER, vETH_BORROW_USER);
        const vXvsNewState = await fetchStorage(vXvsNew, vXVS_MINT_USER, vXVS_BORROW_USER);
        const vBtcNewState = await fetchStorage(vBtcNew, vBTC_MINT_USER, vBTC_BORROW_USER);
        const vCakeNewState = await fetchStorage(vCakeNew, vCAKE_MINT_USER, vCAKE_BORROW_USER);
        const vMaticNewState = await fetchStorage(vMaticNew, vMATIC_MINT_USER, vMATIC_BORROW_USER);

        expect(vEthOldState).to.be.deep.equal(vEthNewState);
        expect(vXvsOldState).to.be.deep.equal(vXvsNewState);
        expect(vBtcOldState).to.be.deep.equal(vBtcNewState);
        expect(vCakeOldState).to.be.deep.equal(vCakeNewState);
        expect(vMaticOldState).to.be.deep.equal(vMaticNewState);
      });
    });
  });
}
