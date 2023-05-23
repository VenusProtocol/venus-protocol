import { FakeContract, smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";

import {
  FaucetToken,
  FaucetToken__factory,
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

const vETH_BORROW_USER = "0x8ce285ea2bc58885f1862de14068cf7d6942ffb4";
const vXVS_BORROW_USER = "0x34c186af43c0961c28ca8cfbca0c0784efadc936";
const vBTC_BORROW_USER = "0x4754541109a3d8d7747d99dfc6125b3239355913";
const vCAKE_BORROW_USER = "0x3565e13189a603d4f49219617408d8f25cce0414";
const vMATIC_BORROW_USER = "0x443c0856c921d1eb92223f5e4a6e8a96511a2305";

const vETH_REDEEM_USER = "0xd116e519afc16dc3fe4333c7dd6a936584703446";
const vXVS_REDEEM_USER = "0xa2fb24202db6c0b120e91a1b2ff671dbbbe88e2d";
const vBTC_REDEEM_USER = "0x60087fc6e8c51a38944cb1775fb64e3d301fb6d1";
const vCAKE_REDEEM_USER = "0x335d6a2c3dd0c04a21f41d30c9ee75e640a87890";
const vMATIC_REDEEM_USER = "0x924e92c3e916e4fdae6c239c8489e1c97f56532a";

const vETH_REPAY_USER = "0xbc0b4983f6375b25ae7d0f8f56d029cc24f78d05";
const vBTC_REPAY_USER = "0x8fcc9c87e729f3085994acd05625f91ed6cfac2e";
const vCAKE_REPAY_USER = "0x02ce4b1b6b9306ab6dde392f91e03521737e3f3f";
const vMATIC_REPAY_USER = "0x1fa94952c77e02baa3c748b9e8d147784fe920fb";

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
  await vToken.connect(impersonatedTimelock).setReduceReservesBlockDelta(1000);
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

    describe("Mint Operations", async () => {
      let vTokenMintuser: Signer;
      async function configureUserAndTokens(
        vTokenAddress: string,
        userAddress: string,
        underlyingAddress: string,
        amount: string,
      ) {
        await configureTimelock();
        vTokenMintuser = await initMainnetUser(userAddress, ethers.utils.parseUnits("2"));
        const underlying = FaucetToken__factory.connect(underlyingAddress, impersonatedTimelock);
        await underlying.connect(vTokenMintuser).approve(vTokenAddress, amount);
      }

      async function simulateOldAndNewVToken(
        blockNumber: number,
        vTokenContract: string,
        underlyingAddress: string,
        userAddress: string,
        amount: string,
      ) {
        await setForkBlock(blockNumber);
        await mine(4);
        const vTokenOld = await configureOld(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        await vTokenOld.connect(vTokenMintuser).mint(amount);
        const oldVTokenBalance = await vTokenOld.balanceOf(userAddress);

        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        await vTokenNew.connect(vTokenMintuser).mint(amount);
        const newVTokenBalance = await vTokenNew.balanceOf(userAddress);

        return {
          oldVTokenBalance: oldVTokenBalance,
          newVTokenBalance: newVTokenBalance,
        };
      }

      it("Should match mint operations in vETH", async () => {
        // txHash = 0x9da5697b0fecf99e24051267543f45c687b6c66a2ab841f2ba0f1c40ae26f039
        const result = await simulateOldAndNewVToken(28288084, vETH, ETH, vETH_MINT_USER, "1995170631366002071");
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations in vXVS", async () => {
        // txHash = 0xf3c5bf0d356cd58a2f6974f70ab6260577baba26e9a761dd7f0d0051952aae07
        const result = await simulateOldAndNewVToken(28274639, vXVS, XVS, vXVS_MINT_USER, "30269427141215371612");
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations in vBTC", async () => {
        // txHash = 0x36e3c54c3b7ec399a1e402fd2a66d225a684ac852c371c6fcacb66d069e5be57
        const result = await simulateOldAndNewVToken(28288129, vBTC, BTC, vBTC_MINT_USER, "15000000000000000000");
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations in vCAKE", async () => {
        // txHash = 0x9b8a1ff142df57e48081d8ecadf4d023b267dad583841dcd518e2b6bdc361044
        const result = await simulateOldAndNewVToken(28287186, vCAKE, CAKE, vCAKE_MINT_USER, "504724034600581282886");
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations in vMATIC", async () => {
        // txHash = 0xce1e4f6206451a10477e4b7680be91c72d8bd4224a56eb0f629a11a0ea37e6e9
        const result = await simulateOldAndNewVToken(
          28238030,
          vMATIC,
          MATIC,
          vMATIC_MINT_USER,
          "7297776682419663617007",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });
    });

    describe("Borrow Operations", async () => {
      let vTokenBorrowUser: Signer;
      async function configureSigner(userAddress: string) {
        await configureTimelock();
        vTokenBorrowUser = await initMainnetUser(userAddress, ethers.utils.parseUnits("2"));
      }

      async function simulateOldAndNewVToken(
        blockNumber: number,
        vTokenContract: string,
        userAddress: string,
        amount: string,
      ) {
        await setForkBlock(blockNumber);
        await mine(4);
        const vTokenOld = await configureOld(vTokenContract);

        await configureSigner(userAddress);
        await vTokenOld.connect(vTokenBorrowUser).borrow(amount);
        const oldUnderlyingBal = await vTokenOld.borrowBalanceStored(userAddress);

        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureSigner(userAddress);
        await vTokenNew.connect(vTokenBorrowUser).borrow(amount);
        const newUnderlyingBal = await vTokenNew.borrowBalanceStored(userAddress);

        return {
          oldUnderlyingBal: oldUnderlyingBal,
          newUnderlyingBal: newUnderlyingBal,
        };
      }

      it("Should match borrow operations in vETH", async () => {
        // txHash 0x772fbf3e4b5f860b135bd5e897144b30f49538a62256b8cac640d428f9d89e9c
        const result = await simulateOldAndNewVToken(28310736, vETH, vETH_BORROW_USER, "10069060513008479");
        expect(result.oldUnderlyingBal).equals(result.newUnderlyingBal);
      });

      it("Should match borrow operations in vBTC", async () => {
        // txHash = 0x36e3c54c3b7ec399a1e402fd2a66d225a684ac852c371c6fcacb66d069e5be57
        const result = await simulateOldAndNewVToken(28314219, vBTC, vBTC_BORROW_USER, "6500000000000000");
        expect(result.oldUnderlyingBal).equals(result.newUnderlyingBal);
      });

      it("Should match borrow operations in vCAKE", async () => {
        // txHash = 0x9be37c0744f1105c203f1ecc2007b5b47992987b41a6f57eceac9004271f870f
        const result = await simulateOldAndNewVToken(28310476, vCAKE, vCAKE_BORROW_USER, "112673000000000000000000");
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });

      it("Should match borrow operations in vMATIC", async () => {
        // txHash = 0x632575e89de5275efff05861c4d8cce3a49cdb2d53b71bf68e72b9cdbc4a0aae
        const result = await simulateOldAndNewVToken(28294567, vMATIC, vMATIC_BORROW_USER, "265729340605496347043");
        expect(result.oldUnderlyingBal).equals(result.newUnderlyingBal);
      });
    });

    describe("Redeem Operations", async () => {
      let vTokenRedeemUser: Signer;
      let underlying: FaucetToken;
      async function configureSignerAndToken(userAddress: string, underlyingAddress: string) {
        await configureTimelock();
        vTokenRedeemUser = await initMainnetUser(userAddress, ethers.utils.parseUnits("2"));
        underlying = FaucetToken__factory.connect(underlyingAddress, impersonatedTimelock);
      }

      async function simulateOldAndNewVToken(
        blockNumber: number,
        vTokenContract: string,
        underlyingAddress: string,
        userAddress: string,
        amount: string,
      ) {
        await setForkBlock(blockNumber);
        await mine(4);
        const vTokenOld = await configureOld(vTokenContract);
        await configureSignerAndToken(userAddress, underlyingAddress);
        await vTokenOld.connect(vTokenRedeemUser).redeem(amount);
        const oldUnderlyingBal = await underlying.balanceOf(userAddress);

        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureSignerAndToken(userAddress, underlyingAddress);
        await vTokenNew.connect(vTokenRedeemUser).redeem(amount);
        const newUnderlyingBal = await underlying.balanceOf(userAddress);

        return {
          oldUnderlyingBal: oldUnderlyingBal,
          newUnderlyingBal: newUnderlyingBal,
        };
      }

      it("Should match redeem operations in vETH", async () => {
        // txHash 0xd37176f09ed5de929a796f6933c2c40befcc9f61dc9f8b3def26df7596ad69bb
        const result = await simulateOldAndNewVToken(28315289, vETH, ETH, vETH_REDEEM_USER, "33768973094");
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });

      it("Should match redeem operations in vXVS", async () => {
        // txHash = 0xeb754c57b39dedd0b8bacacfa9c2ec1d006b34d7e6adc14207c44fa19f8d5530
        const result = await simulateOldAndNewVToken(28306020, vXVS, XVS, vXVS_REDEEM_USER, "99073591812");
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });

      it("Should match redeem operations in vBTC", async () => {
        // txHash = 0x3a097f3494ceace00f752a690453946b4f11ac858c6d0bbe37d5fd766754287d
        const result = await simulateOldAndNewVToken(28314646, vBTC, BTC, vBTC_REDEEM_USER, "6136924144");
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });

      it("Should match redeem operations in vCAKE", async () => {
        // txHash = 0xe46a1d391b2bbae2536b36baf69aa3abc79a22fb9572352335dc545f768e61bb
        const result = await simulateOldAndNewVToken(28312626, vCAKE, CAKE, vCAKE_REDEEM_USER, "632306904357");
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });

      it("Should match redeem operations in vMATIC", async () => {
        // txHash = 0xcd69bc4f78039f9eb242841e372a2fe198a107d91560f0d98745907b43b96f51
        const result = await simulateOldAndNewVToken(28246996, vMATIC, MATIC, vMATIC_REDEEM_USER, "2400827094395");
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });
    });

    describe("Repay Operations", async () => {
      let vTokenRepayuser: Signer;
      async function configureUserAndTokens(
        vTokenAddress: string,
        userAddress: string,
        underlyingAddress: string,
        amount: string,
      ) {
        await configureTimelock();
        vTokenRepayuser = await initMainnetUser(userAddress, ethers.utils.parseUnits("2"));
        const underlying = FaucetToken__factory.connect(underlyingAddress, impersonatedTimelock);
        await underlying.connect(vTokenRepayuser).approve(vTokenAddress, amount);
      }

      async function simulateOldAndNewVToken(
        blockNumber: number,
        vTokenContract: string,
        underlyingAddress: string,
        userAddress: string,
        amount: string,
      ) {
        await setForkBlock(blockNumber);
        await mine(4);
        const vTokenOld = await configureOld(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        await vTokenOld.connect(vTokenRepayuser).repayBorrow(amount);
        const oldBorrowBalance = await vTokenOld.borrowBalanceStored(userAddress);

        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        await vTokenNew.connect(vTokenRepayuser).repayBorrow(amount);
        const newBorrowBalance = await vTokenNew.borrowBalanceStored(userAddress);

        return {
          oldBorrowBalance: oldBorrowBalance,
          newBorrowBalance: newBorrowBalance,
        };
      }

      it("Should match repay operations in vETH", async () => {
        // txHash = 0x1fcd907ee836ce7ba682c24e625e99df6ad864e260fa3ce2cea384204463a624
        const result = await simulateOldAndNewVToken(28314545, vETH, ETH, vETH_REPAY_USER, "555168819651190415");
        expect(result.oldBorrowBalance).equals(result.newBorrowBalance);
      });

      it("Should match repay operations in vBTC", async () => {
        // txHash = 0xed46b1c4824e66790fb79f30ddb8524973c2df87397532d7df9a7d62baf4057e
        const result = await simulateOldAndNewVToken(28312371, vBTC, BTC, vBTC_REPAY_USER, "14636312800657773");
        expect(result.oldBorrowBalance).equals(result.newBorrowBalance);
      });

      it("Should match repay operations in vCAKE", async () => {
        // txHash = 0xb962b2b067acccfadd87e2c5554d8dc745c34d67f6e64f3baf961b074ec8f803
        const result = await simulateOldAndNewVToken(28314251, vCAKE, CAKE, vCAKE_REPAY_USER, "46908112902328408569");
        expect(result.oldBorrowBalance).equals(result.newBorrowBalance);
      });

      it("Should match repay operations in vMATIC", async () => {
        // txHash = 0x21c186d5d6a725062ed7d5cd7dd1644f9830d49a67cacd0b546fcc29c6721e56
        const result = await simulateOldAndNewVToken(
          28306890,
          vMATIC,
          MATIC,
          vMATIC_REPAY_USER,
          "14400000000000000000",
        );
        expect(result.oldBorrowBalance).equals(result.newBorrowBalance);
      });
    });

    describe("Accrue Interest Operations", async () => {
      let eth: FaucetToken;
      let xvs: FaucetToken;
      let btc: FaucetToken;
      let cake: FaucetToken;
      let matic: FaucetToken;

      before(async () => {
        await setForkBlock(28319285);
        vEthNew = await configureNew(vETH);
        vXvsNew = await configureNew(vXVS);
        vBtcNew = await configureNew(vBTC);
        vCakeNew = await configureNew(vCAKE);
        vMaticNew = await configureNew(vMATIC);

        eth = FaucetToken__factory.connect(ETH, impersonatedTimelock);
        xvs = FaucetToken__factory.connect(XVS, impersonatedTimelock);
        btc = FaucetToken__factory.connect(BTC, impersonatedTimelock);
        cake = FaucetToken__factory.connect(CAKE, impersonatedTimelock);
        matic = FaucetToken__factory.connect(MATIC, impersonatedTimelock);
      });
      it("Should not reduce reserves if reduceReservesBlockDelta > lastReduceBlockDelta", async () => {
        const ethBalPre = await eth.balanceOf(protocolShareReserve.address);
        const xvsBalPre = await xvs.balanceOf(protocolShareReserve.address);
        const btcBalPre = await btc.balanceOf(protocolShareReserve.address);
        const cakeBalPre = await cake.balanceOf(protocolShareReserve.address);
        const maticBalPre = await matic.balanceOf(protocolShareReserve.address);

        await vEthNew.accrueInterest();
        await vXvsNew.accrueInterest();
        await vBtcNew.accrueInterest();
        await vCakeNew.accrueInterest();
        await vMaticNew.accrueInterest();

        const ethBalPost = await eth.balanceOf(protocolShareReserve.address);
        const xvsBalPost = await xvs.balanceOf(protocolShareReserve.address);
        const btcBalPost = await btc.balanceOf(protocolShareReserve.address);
        const cakeBalPost = await cake.balanceOf(protocolShareReserve.address);
        const maticBalPost = await matic.balanceOf(protocolShareReserve.address);

        expect(ethBalPost).greaterThanOrEqual(ethBalPre);
        expect(xvsBalPost).greaterThanOrEqual(xvsBalPre);
        expect(btcBalPost).greaterThanOrEqual(btcBalPre);
        expect(cakeBalPost).greaterThanOrEqual(cakeBalPre);
        expect(maticBalPost).greaterThanOrEqual(maticBalPre);
      });

      it("Should not reduce reserves if reduceReservesBlockDelta > currentBlock - lastReduceBlockDelta", async () => {
        const ethBalPre = await eth.balanceOf(protocolShareReserve.address);
        const xvsBalPre = await xvs.balanceOf(protocolShareReserve.address);
        const btcBalPre = await btc.balanceOf(protocolShareReserve.address);
        const cakeBalPre = await cake.balanceOf(protocolShareReserve.address);
        const maticBalPre = await matic.balanceOf(protocolShareReserve.address);

        await vEthNew.accrueInterest();
        await vXvsNew.accrueInterest();
        await vBtcNew.accrueInterest();
        await vCakeNew.accrueInterest();
        await vMaticNew.accrueInterest();

        const ethBalPost = await eth.balanceOf(protocolShareReserve.address);
        const xvsBalPost = await xvs.balanceOf(protocolShareReserve.address);
        const btcBalPost = await btc.balanceOf(protocolShareReserve.address);
        const cakeBalPost = await cake.balanceOf(protocolShareReserve.address);
        const maticBalPost = await matic.balanceOf(protocolShareReserve.address);

        expect(ethBalPost).equals(ethBalPre);
        expect(xvsBalPost).equals(xvsBalPre);
        expect(btcBalPost).equals(btcBalPre);
        expect(cakeBalPost).equals(cakeBalPre);
        expect(maticBalPost).equals(maticBalPre);
      });
    });
  });
}
