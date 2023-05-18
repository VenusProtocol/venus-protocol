import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  FaucetToken,
  FaucetToken__factory,
  IAccessControlManager,
  IProtocolShareReserve,
  VBep20Delegate,
  VBep20DelegateOld,
  VBep20DelegateOld__factory,
  VBep20Delegate__factory,
  VBep20Delegator__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_MAINNET = process.env.FORK_MAINNET === "true";

const vETH = "0xf508fcd89b8bd15579dc79a6827cb4686a3592c8";
const vXVS = "0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D";
const vBTC = "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B";
const vCAKE = "0x86aC3974e2BD0d60825230fa6F355fF11409df5c";
const vMATIC = "0x5c9476FcD6a4F9a3654139721c949c2233bBbBc8";

const ETH = "0x2170ed0880ac9a755fd29b2688956bd959f933f8";
const XVS = "0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63";
const BTC = "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c";
const CAKE = "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82";
const MATIC = "0xcc42724c6683b7e57334c4e856f4c9965ed682bd";

const vETH_MINT_USER = "0x389836609cb5518867c076480f0efb8a01a2cd6c";
const vXVS_MINT_USER = "0x34c186af43c0961c28ca8cfbca0c0784efadc936";
const vBTC_MINT_USER = "0xfad29c8b255011dc4dc0e87f879ab9032d8f085d";
const vCAKE_MINT_USER = "0x389836609cb5518867c076480f0efb8a01a2cd6c";
const vMATIC_MINT_USER = "0x11b0c209d5d7c525ae082738b4fbccbdc16696fa";

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
let protocolShareReserve: FakeContract<IProtocolShareReserve>;

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
  protocolShareReserve = await smock.fake<IProtocolShareReserve>("IProtocolShareReserve");
  await vToken.connect(impersonatedTimelock).setReduceReservesBlockDelta(10000);
  await vToken.connect(impersonatedTimelock).setProtcolShareReserve(protocolShareReserve.address);
  return vToken;
}

async function configureOld(vTokenAddress: string) {
  await configureTimelock();
  const vToken = VBep20DelegateOld__factory.connect(vTokenAddress, impersonatedTimelock);
  return vToken;
}

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
  const borrowBalance = await vToken.callStatic.borrowBalanceStored(borrowUser);

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

if (FORK_MAINNET) {
  describe("VToken Upgrades", async () => {
    describe("Storage verify", async () => {
      it("Verify states after upgrade", async () => {
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

    describe("Mint Operation", async () => {
      let vEthMintuser: Signer;
      let vXvsMintuser: Signer;
      let vBtcMintuser: Signer;
      let vCakeMintuser: Signer;
      let vMaticMintuser: Signer;

      let eth: FaucetToken;
      let xvs: FaucetToken;
      let btc: FaucetToken;
      let cake: FaucetToken;
      let matic: FaucetToken;
      async function configureUserAndTokens() {
        await configureTimelock();
        vEthMintuser = await initMainnetUser(vETH_MINT_USER, ethers.utils.parseUnits("2"));
        vXvsMintuser = await initMainnetUser(vXVS_MINT_USER, ethers.utils.parseUnits("2"));
        vBtcMintuser = await initMainnetUser(vBTC_MINT_USER, ethers.utils.parseUnits("2"));
        vCakeMintuser = await initMainnetUser(vCAKE_MINT_USER, ethers.utils.parseUnits("2"));
        vMaticMintuser = await initMainnetUser(vMATIC_MINT_USER, ethers.utils.parseUnits("2"));

        eth = FaucetToken__factory.connect(ETH, impersonatedTimelock);
        xvs = FaucetToken__factory.connect(XVS, impersonatedTimelock);
        btc = FaucetToken__factory.connect(BTC, impersonatedTimelock);
        cake = FaucetToken__factory.connect(CAKE, impersonatedTimelock);
        matic = FaucetToken__factory.connect(MATIC, impersonatedTimelock);

        await eth.connect(vEthMintuser).approve(vETH, "1995170631366002071");
        await xvs.connect(vXvsMintuser).approve(vXVS, "30269427141215371612");
        await xvs.connect(vXvsMintuser).approve(vBTC, "15000000000000000000");
        await cake.connect(vCakeMintuser).approve(vCAKE, "504724034600581282886");
        await matic.connect(vMaticMintuser).approve(vMATIC, "7297776682419663617007");
      }

      it("Should match mint operations in vETH", async () => {
        // txHash = 0x9da5697b0fecf99e24051267543f45c687b6c66a2ab841f2ba0f1c40ae26f039
        await setForkBlock(28288084);
        vEthOld = await configureOld(vETH);
        await configureUserAndTokens();
        await vEthOld.connect(vEthMintuser).mint("1995170631366002071");
        const oldVEthBalance = await vEthOld.balanceOf(vETH_MINT_USER);

        await setForkBlock(28288084);
        await configureUserAndTokens();
        vEthNew = await configureNew(vETH);
        await vEthNew.connect(vEthMintuser).mint("1995170631366002071");
        const newVEthBalance = await vEthNew.balanceOf(vETH_MINT_USER);
        expect(oldVEthBalance).to.be.closeTo(newVEthBalance, 51);
      });

      it("Should match mint operations in vXVS", async () => {
        // txHash = 0xf3c5bf0d356cd58a2f6974f70ab6260577baba26e9a761dd7f0d0051952aae07
        await setForkBlock(28274639);
        vXvsOld = await configureOld(vXVS);
        await configureUserAndTokens();
        await vXvsOld.connect(vXvsMintuser).mint("30269427141215371612");
        const oldVXvsBalance = await vXvsOld.balanceOf(vXVS_MINT_USER);

        await setForkBlock(28274639);
        await configureUserAndTokens();
        vXvsNew = await configureNew(vXVS);
        await vXvsNew.connect(vXvsMintuser).mint("30269427141215371612");
        const newVXvsBalance = await vXvsNew.balanceOf(vXVS_MINT_USER);
        expect(oldVXvsBalance).to.be.closeTo(newVXvsBalance, 0);
      });

      it("Should match mint operations in vBTC", async () => {
        // txHash = 0x36e3c54c3b7ec399a1e402fd2a66d225a684ac852c371c6fcacb66d069e5be57
        await setForkBlock(28288129);
        vBtcOld = await configureOld(vBTC);
        await configureUserAndTokens();
        await vBtcOld.connect(vBtcMintuser).mint("15000000000000000000");
        const oldVBtcBalance = await vBtcOld.balanceOf(vBTC_MINT_USER);

        await setForkBlock(28288129);
        await configureUserAndTokens();
        vBtcNew = await configureNew(vBTC);
        await vBtcNew.connect(vBtcMintuser).mint("15000000000000000000");
        const newVBtcBalance = await vBtcNew.balanceOf(vBTC_MINT_USER);

        expect(oldVBtcBalance).to.be.closeTo(newVBtcBalance, 95);
      });

      it("Should match mint operations in vCAKE", async () => {
        // txHash = 0x9b8a1ff142df57e48081d8ecadf4d023b267dad583841dcd518e2b6bdc361044
        await setForkBlock(28287186);
        vCakeOld = await configureOld(vCAKE);
        await configureUserAndTokens();
        await vCakeOld.connect(vCakeMintuser).mint("504724034600581282886");
        const oldVCakeBalance = await vCakeOld.balanceOf(vCAKE_MINT_USER);

        await setForkBlock(28287186);
        await configureUserAndTokens();
        vCakeNew = await configureNew(vCAKE);
        await vCakeNew.connect(vCakeMintuser).mint("504724034600581282886");
        const newVCakeBalance = await vCakeNew.balanceOf(vCAKE_MINT_USER);
        expect(oldVCakeBalance).to.be.closeTo(newVCakeBalance, 34172);
      });

      it("Should match mint operations in vMATIC", async () => {
        // txHash = 0xce1e4f6206451a10477e4b7680be91c72d8bd4224a56eb0f629a11a0ea37e6e9
        await setForkBlock(28238030);
        vMaticOld = await configureOld(vMATIC);
        await configureUserAndTokens();
        await vMaticOld.connect(vMaticMintuser).mint("7297776682419663617007");
        const oldVMaticBalance = await vMaticOld.balanceOf(vMATIC_MINT_USER);

        await setForkBlock(28238030);
        await configureUserAndTokens();
        vMaticNew = await configureNew(vMATIC);
        await vMaticNew.connect(vMaticMintuser).mint("7297776682419663617007");
        const newVMaticBalance = await vMaticNew.balanceOf(vMATIC_MINT_USER);
        expect(oldVMaticBalance).to.be.closeTo(newVMaticBalance, 41057);
      });
    });
  });
}
