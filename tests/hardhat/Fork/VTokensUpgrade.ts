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
  const vToken = VBep20Delegate__factory.connect(vTokenAddress, impersonatedTimelock);
  return vToken;
}

async function fetchStorage(vToken: VBep20Delegate, mintUser: string, borrowUser: string) {
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

      it("Should match mint operations vETH", async () => {
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

      it("Should match mint operations vXVS", async () => {
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

      it("Should match mint operations vBTC", async () => {
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

      it("Should match mint operations vCAKE", async () => {
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

      it("Should match mint operations vMATIC", async () => {
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

      it("Should match mint operations vUSDC", async () => {
        // txHash = 0xce1cef93a9532473613ff08c18f498f8f906cb01e935d9a4d48b3cecf876a7ad
        const result = await simulateOldAndNewVToken(
          28862143,
          vTokenAddresses.vUSDC,
          underlyingAddresses.USDC,
          mintUserAddresses.vUSDC_MINT_USER,
          "185269000000000000000000",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vUSDT", async () => {
        // txHash = 0xc48a8bf848545c01a4e16b14c7d722461887ccc393dc18c56e012b4698fd11e0
        const result = await simulateOldAndNewVToken(
          28862313,
          vTokenAddresses.vUSDT,
          underlyingAddresses.USDT,
          mintUserAddresses.vUSDT_MINT_USER,
          "3564102652542115585213",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vBUSD", async () => {
        // txHash = 0x8beaf2ce29019ccf69d51c14d8ac5233596d639f748507d40278b748e357a157
        const result = await simulateOldAndNewVToken(
          28861605,
          vTokenAddresses.vBUSD,
          underlyingAddresses.BUSD,
          mintUserAddresses.vBUSD_MINT_USER,
          "150116755100514265056034",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vSXP", async () => {
        // txHash = 0xa021526e19e7a50033bebfca0eb41d60fb51d2b6aecf8e1843e5e31218f33edf
        const result = await simulateOldAndNewVToken(
          25491507,
          vTokenAddresses.vSXP,
          underlyingAddresses.SXP,
          mintUserAddresses.vSXP_MINT_USER,
          "631261366600000000000",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vLTC", async () => {
        // txHash = 0x6acd7cb94545c438919d73c5ba752e44f2a657ad53f5471775c031ee6fa7103e
        const result = await simulateOldAndNewVToken(
          28861083,
          vTokenAddresses.vLTC,
          underlyingAddresses.LTC,
          mintUserAddresses.vLTC_MINT_USER,
          "2531207127434988340",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vXRP", async () => {
        // txHash = 0x22bd1adc5096017664fc74a62c4de43f82697ded207a937cd33e4adf3ad63bbd
        const result = await simulateOldAndNewVToken(
          28859483,
          vTokenAddresses.vXRP,
          underlyingAddresses.XRP,
          mintUserAddresses.vXRP_MINT_USER,
          "32105996528311261106",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vTRX", async () => {
        // txHash = 0xcdfbc0948db95daaf077c0d04f8648667e4c6c5846b129af2d0fa1b8f7b07bc5
        const result = await simulateOldAndNewVToken(
          28851154,
          vTokenAddresses.vTRX,
          underlyingAddresses.TRX,
          mintUserAddresses.vTRX_MINT_USER,
          "198501072",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vTRXOLD", async () => {
        // txHash = 0x4247173d095156dbb49d03685fb54f22301b68acd236679eb8b3ded6b3a020e5
        const result = await simulateOldAndNewVToken(
          25978263,
          vTokenAddresses.vTRXOLD,
          underlyingAddresses.TRXOLD,
          mintUserAddresses.vTRXOLD_MINT_USER,
          "351446489299990000000000",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vBCH", async () => {
        // txHash = 0x6d5ab81f576e972198082e8ad43bcb8dda3176f80adcd1feee07987ae8516c32
        const result = await simulateOldAndNewVToken(
          28858258,
          vTokenAddresses.vBCH,
          underlyingAddresses.BCH,
          mintUserAddresses.vBCH_MINT_USER,
          "1798618263428792528",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vDOT", async () => {
        // txHash = 0xd0a02f1783d954d0a59c0ae1ea5d97901c38ec67202c911c17ad3ddea35b3392
        const result = await simulateOldAndNewVToken(
          28861317,
          vTokenAddresses.vDOT,
          underlyingAddresses.DOT,
          mintUserAddresses.vDOT_MINT_USER,
          "26446390309000000000",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vLINK", async () => {
        // txHash = 0x85e6ade791560293ab1aafbfa61e579ce23704f2d805d51faeff327c9b7dd067
        const result = await simulateOldAndNewVToken(
          28863770,
          vTokenAddresses.vLINK,
          underlyingAddresses.LINK,
          mintUserAddresses.vLINK_MINT_USER,
          "118156087000000000000",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vDAI", async () => {
        // txHash = 0x61e0083960ffc78bf1075e4eeacdc420e490e5183be289b751fd630e3bf6d6a4
        const result = await simulateOldAndNewVToken(
          28862866,
          vTokenAddresses.vDAI,
          underlyingAddresses.DAI,
          mintUserAddresses.vDAI_MINT_USER,
          "95305700899464838020",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vFIL", async () => {
        // txHash = 0xddd8986f2e3d77ab0d7b39d3efd42db516d647ee66cd0a348cd88936583245c0
        const result = await simulateOldAndNewVToken(
          28844468,
          vTokenAddresses.vFIL,
          underlyingAddresses.FIL,
          mintUserAddresses.vFIL_MINT_USER,
          "5867617290477094445",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vBETH", async () => {
        // txHash = 0xe34318c8a6dcbd7806cdc7e6037002c87708ee9c3de3238bc0e7f573ec86db60
        const result = await simulateOldAndNewVToken(
          28847293,
          vTokenAddresses.vBETH,
          underlyingAddresses.BETH,
          mintUserAddresses.vBETH_MINT_USER,
          "1275700000000000",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it("Should match mint operations vADA", async () => {
        // txHash = 0x873a926f2c18192e8eb7e43f6cf6603ab01737598f5c24bb3391fc5cba673108
        const result = await simulateOldAndNewVToken(
          28862166,
          vTokenAddresses.vADA,
          underlyingAddresses.ADA,
          mintUserAddresses.vADA_MINT_USER,
          "199941113730000000000",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it.only("Should match mint operations vDOGE", async () => {
        // txHash = 0xfa0f2b3a77c8be678deee863327cc6d66190ab535c305807789c67eedae52573
        const result = await simulateOldAndNewVToken(
          28860690,
          vTokenAddresses.vDOGE,
          underlyingAddresses.DOGE,
          mintUserAddresses.vDOGE_MINT_USER,
          "149578782454",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it.only("Should match mint operations vAAVE", async () => {
        // txHash = 0x3b32241195820ad89f095d7c6b179e55670d88a68ea08c54898f5052d759ccb5
        const result = await simulateOldAndNewVToken(
          28853051,
          vTokenAddresses.vAAVE,
          underlyingAddresses.AAVE,
          mintUserAddresses.vAAVE_MINT_USER,
          "7129334050885325208",
        );
        expect(result.newVTokenBalance).equals(result.oldVTokenBalance);
      });

      it.only("Should match mint operations vTUSD", async () => {
        // txHash = 0x3b32241195820ad89f095d7c6b179e55670d88a68ea08c54898f5052d759ccb5
        const result = await simulateOldAndNewVToken(
          28854387,
          vTokenAddresses.vTUSD,
          underlyingAddresses.TUSD,
          mintUserAddresses.vTUSD_MINT_USER,
          "1000000000000000000000",
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

      it("Should match borrow operations vETH", async () => {
        // txHash 0x772fbf3e4b5f860b135bd5e897144b30f49538a62256b8cac640d428f9d89e9c
        const result = await simulateOldAndNewVToken(
          28310736,
          vTokenAddresses.vETH,
          borrowUserAddresses.vETH_BORROW_USER,
          "10069060513008479",
        );
        expect(result.oldUnderlyingBal).equals(result.newUnderlyingBal);
      });

      it("Should match borrow operations vBTC", async () => {
        // txHash = 0x36e3c54c3b7ec399a1e402fd2a66d225a684ac852c371c6fcacb66d069e5be57
        const result = await simulateOldAndNewVToken(
          28314219,
          vTokenAddresses.vBTC,
          borrowUserAddresses.vBTC_BORROW_USER,
          "6500000000000000",
        );
        expect(result.oldUnderlyingBal).equals(result.newUnderlyingBal);
      });

      it("Should match borrow operations vCAKE", async () => {
        // txHash = 0x9be37c0744f1105c203f1ecc2007b5b47992987b41a6f57eceac9004271f870f
        const result = await simulateOldAndNewVToken(
          28310476,
          vTokenAddresses.vCAKE,
          borrowUserAddresses.vCAKE_BORROW_USER,
          "112673000000000000000000",
        );
        expect(result.newUnderlyingBal).equals(result.oldUnderlyingBal);
      });

      it("Should match borrow operations vMATIC", async () => {
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

      it("Should match redeem operations vETH", async () => {
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

      it("Should match redeem operations vXVS", async () => {
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

      it("Should match redeem operations vBTC", async () => {
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

      it("Should match redeem operations vCAKE", async () => {
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

      it("Should match redeem operations vMATIC", async () => {
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

      it("Should match repay operations vETH", async () => {
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

      it("Should match repay operations vBTC", async () => {
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

      it("Should match repay operations vCAKE", async () => {
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

      it("Should match repay operations vMATIC", async () => {
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
