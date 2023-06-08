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
import {
  borrowUserAddresses,
  mintUserAddresses,
  redeemUserAddresses,
  repayUserAddresses,
  underlyingAddresses,
  vTokenAddresses,
} from "./vTokenUpgradeHelper";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_MAINNET = process.env.FORK_MAINNET === "true";

const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";

let vEthNew: VBep20Delegate;
let vXvsNew: VBep20Delegate;
let vBtcNew: VBep20Delegate;
let vCakeNew: VBep20Delegate;
let vMaticNew: VBep20Delegate;

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
        const markets = Object.keys(vTokenAddresses);
        await setForkBlock(28864889); // (Jun-06-2023 11:18:47 AM +UTC)
        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          const mintAddress = mintUserAddresses[`${market}_MINT_USER`];
          const borrowAddress = borrowUserAddresses[`${market}_BORROW_USER`];

          const oldMarket = await configureOld(marketAddress);
          const newMarket = await configureNew(marketAddress);

          const oldState = await fetchStorage(oldMarket, mintAddress, borrowAddress);
          const newState = await fetchStorage(newMarket, mintAddress, borrowAddress);

          expect(oldState).to.be.deep.equal(newState);
        }
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

      it("Should match mint operations in vTokenAddresses.vETH", async () => {
        // txHash = 0x9da5697b0fecf99e24051267543f45c687b6c66a2ab841f2ba0f1c40ae26f039
        const result = await simulateOldAndNewVToken(
          28288084,
          vTokenAddresses.vETH,
          underlyingAddresses.ETH,
          mintUserAddresses.vETH_MINT_USER,
          "1995170631366002071",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations in vTokenAddresses.vXVS", async () => {
        // txHash = 0xf3c5bf0d356cd58a2f6974f70ab6260577baba26e9a761dd7f0d0051952aae07
        const result = await simulateOldAndNewVToken(
          28274639,
          vTokenAddresses.vXVS,
          underlyingAddresses.XVS,
          mintUserAddresses.vXVS_MINT_USER,
          "30269427141215371612",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations in vTokenAddresses.vBTC", async () => {
        // txHash = 0x36e3c54c3b7ec399a1e402fd2a66d225a684ac852c371c6fcacb66d069e5be57
        const result = await simulateOldAndNewVToken(
          28288129,
          vTokenAddresses.vBTC,
          underlyingAddresses.BTCB,
          mintUserAddresses.vBTC_MINT_USER,
          "15000000000000000000",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations in vTokenAddresses.vCAKE", async () => {
        // txHash = 0x9b8a1ff142df57e48081d8ecadf4d023b267dad583841dcd518e2b6bdc361044
        const result = await simulateOldAndNewVToken(
          28287186,
          vTokenAddresses.vCAKE,
          underlyingAddresses.CAKE,
          mintUserAddresses.vCAKE_MINT_USER,
          "504724034600581282886",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations in vTokenAddresses.vMATIC", async () => {
        // txHash = 0xce1e4f6206451a10477e4b7680be91c72d8bd4224a56eb0f629a11a0ea37e6e9
        const result = await simulateOldAndNewVToken(
          28238030,
          vTokenAddresses.vMATIC,
          underlyingAddresses.MATIC,
          mintUserAddresses.vMATIC_MINT_USER,
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

      it("Should match borrow operations in vTokenAddresses.vETH", async () => {
        // txHash 0x772fbf3e4b5f860b135bd5e897144b30f49538a62256b8cac640d428f9d89e9c
        const result = await simulateOldAndNewVToken(
          28310736,
          vTokenAddresses.vETH,
          borrowUserAddresses.vETH_BORROW_USER,
          "10069060513008479",
        );
        expect(result.oldUnderlyingBal).equals(result.newUnderlyingBal);
      });

      it("Should match borrow operations in vTokenAddresses.vBTC", async () => {
        // txHash = 0x36e3c54c3b7ec399a1e402fd2a66d225a684ac852c371c6fcacb66d069e5be57
        const result = await simulateOldAndNewVToken(
          28314219,
          vTokenAddresses.vBTC,
          borrowUserAddresses.vBTC_BORROW_USER,
          "6500000000000000",
        );
        expect(result.oldUnderlyingBal).equals(result.newUnderlyingBal);
      });

      it("Should match borrow operations in vTokenAddresses.vCAKE", async () => {
        // txHash = 0x9be37c0744f1105c203f1ecc2007b5b47992987b41a6f57eceac9004271f870f
        const result = await simulateOldAndNewVToken(
          28310476,
          vTokenAddresses.vCAKE,
          borrowUserAddresses.vCAKE_BORROW_USER,
          "112673000000000000000000",
        );
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });

      it("Should match borrow operations in vTokenAddresses.vMATIC", async () => {
        // txHash = 0x632575e89de5275efff05861c4d8cce3a49cdb2d53b71bf68e72b9cdbc4a0aae
        const result = await simulateOldAndNewVToken(
          28294567,
          vTokenAddresses.vMATIC,
          borrowUserAddresses.vMATIC_BORROW_USER,
          "265729340605496347043",
        );
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

      it("Should match redeem operations in vTokenAddresses.vETH", async () => {
        // txHash 0xd37176f09ed5de929a796f6933c2c40befcc9f61dc9f8b3def26df7596ad69bb
        const result = await simulateOldAndNewVToken(
          28315289,
          vTokenAddresses.vETH,
          underlyingAddresses.ETH,
          redeemUserAddresses.vETH_REDEEM_USER,
          "33768973094",
        );
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });

      it("Should match redeem operations in vTokenAddresses.vXVS", async () => {
        // txHash = 0xeb754c57b39dedd0b8bacacfa9c2ec1d006b34d7e6adc14207c44fa19f8d5530
        const result = await simulateOldAndNewVToken(
          28306020,
          vTokenAddresses.vXVS,
          underlyingAddresses.XVS,
          redeemUserAddresses.vXVS_REDEEM_USER,
          "99073591812",
        );
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });

      it("Should match redeem operations in vTokenAddresses.vBTC", async () => {
        // txHash = 0x3a097f3494ceace00f752a690453946b4f11ac858c6d0bbe37d5fd766754287d
        const result = await simulateOldAndNewVToken(
          28314646,
          vTokenAddresses.vBTC,
          underlyingAddresses.BTCB,
          redeemUserAddresses.vBTC_REDEEM_USER,
          "6136924144",
        );
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });

      it("Should match redeem operations in vTokenAddresses.vCAKE", async () => {
        // txHash = 0xe46a1d391b2bbae2536b36baf69aa3abc79a22fb9572352335dc545f768e61bb
        const result = await simulateOldAndNewVToken(
          28312626,
          vTokenAddresses.vCAKE,
          underlyingAddresses.CAKE,
          redeemUserAddresses.vCAKE_REDEEM_USER,
          "632306904357",
        );
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });

      it("Should match redeem operations in vTokenAddresses.vMATIC", async () => {
        // txHash = 0xcd69bc4f78039f9eb242841e372a2fe198a107d91560f0d98745907b43b96f51
        const result = await simulateOldAndNewVToken(
          28246996,
          vTokenAddresses.vMATIC,
          underlyingAddresses.MATIC,
          redeemUserAddresses.vMATIC_REDEEM_USER,
          "2400827094395",
        );
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

      it("Should match repay operations in vTokenAddresses.vETH", async () => {
        // txHash = 0x1fcd907ee836ce7ba682c24e625e99df6ad864e260fa3ce2cea384204463a624
        const result = await simulateOldAndNewVToken(
          28314545,
          vTokenAddresses.vETH,
          underlyingAddresses.ETH,
          repayUserAddresses.vETH_REPAY_USER,
          "555168819651190415",
        );
        expect(result.oldBorrowBalance).equals(result.newBorrowBalance);
      });

      it("Should match repay operations in vTokenAddresses.vBTC", async () => {
        // txHash = 0xed46b1c4824e66790fb79f30ddb8524973c2df87397532d7df9a7d62baf4057e
        const result = await simulateOldAndNewVToken(
          28312371,
          vTokenAddresses.vBTC,
          underlyingAddresses.BTCB,
          repayUserAddresses.vBTC_REPAY_USER,
          "14636312800657773",
        );
        expect(result.oldBorrowBalance).equals(result.newBorrowBalance);
      });

      it("Should match repay operations in vTokenAddresses.vCAKE", async () => {
        // txHash = 0xb962b2b067acccfadd87e2c5554d8dc745c34d67f6e64f3baf961b074ec8f803
        const result = await simulateOldAndNewVToken(
          28314251,
          vTokenAddresses.vCAKE,
          underlyingAddresses.CAKE,
          repayUserAddresses.vCAKE_REPAY_USER,
          "46908112902328408569",
        );
        expect(result.oldBorrowBalance).equals(result.newBorrowBalance);
      });

      it("Should match repay operations in vTokenAddresses.vMATIC", async () => {
        // txHash = 0x21c186d5d6a725062ed7d5cd7dd1644f9830d49a67cacd0b546fcc29c6721e56
        const result = await simulateOldAndNewVToken(
          28306890,
          vTokenAddresses.vMATIC,
          underlyingAddresses.MATIC,
          repayUserAddresses.vMATIC_REPAY_USER,
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
        vEthNew = await configureNew(vTokenAddresses.vETH);
        vXvsNew = await configureNew(vTokenAddresses.vXVS);
        vBtcNew = await configureNew(vTokenAddresses.vBTC);
        vCakeNew = await configureNew(vTokenAddresses.vCAKE);
        vMaticNew = await configureNew(vTokenAddresses.vMATIC);

        eth = FaucetToken__factory.connect(underlyingAddresses.ETH, impersonatedTimelock);
        xvs = FaucetToken__factory.connect(underlyingAddresses.XVS, impersonatedTimelock);
        btc = FaucetToken__factory.connect(underlyingAddresses.BTCB, impersonatedTimelock);
        cake = FaucetToken__factory.connect(underlyingAddresses.CAKE, impersonatedTimelock);
        matic = FaucetToken__factory.connect(underlyingAddresses.MATIC, impersonatedTimelock);
      });
      it("Should reduce reserves if reduceReservesBlockDelta > lastReduceBlockDelta", async () => {
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

      it("Should not reduce reserves if reduceReservesBlockDelta < currentBlock - lastReduceBlockDelta", async () => {
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
