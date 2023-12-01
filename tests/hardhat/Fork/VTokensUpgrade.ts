import { FakeContract, smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";

import {
  FaucetToken__factory,
  IAccessControlManagerV5__factory,
  IProtocolShareReserve,
  VBep20Delegate,
  VBep20Delegate__factory,
  VBep20Delegator__factory,
} from "../../../typechain";
import { initMainnetUser, setForkBlock } from "./utils";
import {
  borrowAmounts,
  borrowBlocks,
  borrowUserAddresses,
  mintAmounts,
  mintBlocks,
  mintUserAddresses,
  redeemAmounts,
  redeemBlocks,
  redeemUserAddresses,
  repayAmounts,
  repayBlocks,
  repayUserAddresses,
  underlyingAddresses,
  vTokenAddresses,
} from "./vTokenUpgradeHelper";

const { expect } = chai;
chai.use(smock.matchers);

const FORK_MAINNET = process.env.FORK === "true" && process.env.FORKED_NETWORK === "bscmainnet";

const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";

let impersonatedTimelock: Signer;
let protocolShareReserve: FakeContract<IProtocolShareReserve>;

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(NORMAL_TIMELOCK, ethers.utils.parseUnits("2"));
}

async function configureNew(vTokenAddress: string) {
  await configureTimelock();
  const accessControlManager = IAccessControlManagerV5__factory.connect(ACM, impersonatedTimelock);
  const vTokenProxy = VBep20Delegator__factory.connect(vTokenAddress, impersonatedTimelock);
  const vTokenFactory = await ethers.getContractFactory("VBep20Delegate");
  const vTokenImpl = await vTokenFactory.deploy();
  await vTokenImpl.deployed();
  await vTokenProxy.connect(impersonatedTimelock)._setImplementation(vTokenImpl.address, true, "0x00");
  const vToken = VBep20Delegate__factory.connect(vTokenAddress, impersonatedTimelock);
  protocolShareReserve = await smock.fake<IProtocolShareReserve>("IProtocolShareReserve");
  await vToken.setAccessControlManager(ACM);
  await accessControlManager.giveCallPermission(
    vToken.address,
    "setReduceReservesBlockDelta(uint256)",
    NORMAL_TIMELOCK,
  );
  await vToken.connect(impersonatedTimelock).setReduceReservesBlockDelta(1000);
  await expect(
    vToken.connect(impersonatedTimelock).setProtocolShareReserve(ethers.constants.AddressZero),
  ).to.be.revertedWith("zero address");
  await vToken.connect(impersonatedTimelock).setProtocolShareReserve(protocolShareReserve.address);
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

    describe("User Operations", async () => {
      let signer: Signer;
      async function configureUserAndTokens(
        vTokenAddress: string,
        userAddress: string,
        underlyingAddress: string,
        amount: string,
      ) {
        await configureTimelock();
        signer = await initMainnetUser(userAddress, ethers.utils.parseUnits("2"));
        const underlying = FaucetToken__factory.connect(underlyingAddress, impersonatedTimelock);
        await underlying.connect(signer).approve(vTokenAddress, amount);
      }

      async function simulateOldAndNewMintOperations(
        blockNumber: number,
        vTokenContract: string,
        underlyingAddress: string,
        userAddress: string,
        amount: string,
      ) {
        await setForkBlock(blockNumber);
        await mine(6);
        const vTokenOld = await configureOld(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        await vTokenOld.connect(signer).mint(amount);
        const totalReservesAfterMint = await vTokenOld.totalReserves();
        const oldState = await fetchStorage(vTokenOld, userAddress, userAddress);

        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        const result = await vTokenNew.connect(signer).mint(amount);
        const totalReservesnew = await vTokenNew.totalReserves();
        expect(result)
          .to.be.emit(vTokenNew, "ReservesReduced")
          .withArgs(protocolShareReserve.address, totalReservesAfterMint, totalReservesnew);
        const newState = await fetchStorage(vTokenNew, userAddress, userAddress);

        return {
          oldState: oldState,
          newState: newState,
        };
      }

      async function simulateOldAndNewBorrowOperations(
        blockNumber: number,
        vTokenContract: string,
        underlyingAddress: string,
        userAddress: string,
        amount: string,
      ) {
        await setForkBlock(blockNumber);
        await mine(6);
        const vTokenOld = await configureOld(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        await vTokenOld.connect(signer).borrow(amount);
        const totalReservesAfterBorrow = await vTokenOld.totalReserves();
        const oldState = await fetchStorage(vTokenOld, userAddress, userAddress);

        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        const result = await vTokenNew.connect(signer).borrow(amount);
        const totalReservesnew = await vTokenNew.totalReserves();
        expect(result)
          .to.be.emit(vTokenNew, "ReservesReduced")
          .withArgs(protocolShareReserve.address, totalReservesAfterBorrow, totalReservesnew);
        const newState = await fetchStorage(vTokenNew, userAddress, userAddress);

        return {
          oldState: oldState,
          newState: newState,
        };
      }

      async function simulateOldAndNewRedeemOperations(
        blockNumber: number,
        vTokenContract: string,
        underlyingAddress: string,
        userAddress: string,
        amount: string,
      ) {
        await setForkBlock(blockNumber);
        await mine(6);
        const vTokenOld = await configureOld(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        await vTokenOld.connect(signer).redeem(amount);
        const totalReservesAfterRedeem = await vTokenOld.totalReserves();
        const oldState = await fetchStorage(vTokenOld, userAddress, userAddress);

        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        const result = await vTokenNew.connect(signer).redeem(amount);
        const totalReservesnew = await vTokenNew.totalReserves();
        expect(result)
          .to.be.emit(vTokenNew, "ReservesReduced")
          .withArgs(protocolShareReserve.address, totalReservesAfterRedeem, totalReservesnew);
        const newState = await fetchStorage(vTokenNew, userAddress, userAddress);

        return {
          oldState: oldState,
          newState: newState,
        };
      }

      async function simulateOldAndNewRepayOperations(
        blockNumber: number,
        vTokenContract: string,
        underlyingAddress: string,
        userAddress: string,
        amount: string,
      ) {
        await setForkBlock(blockNumber);
        await mine(6);
        const vTokenOld = await configureOld(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        await vTokenOld.connect(signer).repayBorrow(amount);
        const totalReservesAfterRepayBorrow = await vTokenOld.totalReserves();
        const oldState = await fetchStorage(vTokenOld, userAddress, userAddress);

        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        const result = await vTokenNew.connect(signer).repayBorrow(amount);
        const totalReservesnew = await vTokenNew.totalReserves();
        expect(result)
          .to.be.emit(vTokenNew, "ReservesReduced")
          .withArgs(protocolShareReserve.address, totalReservesAfterRepayBorrow, totalReservesnew);
        const newState = await fetchStorage(vTokenNew, userAddress, userAddress);

        return {
          oldState: oldState,
          newState: newState,
        };
      }

      it("Should match mint operations in all markets", async () => {
        const markets = Object.keys(vTokenAddresses);
        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          const mintUserAddress = mintUserAddresses[`${market}_MINT_USER`];
          const blockNumber = mintBlocks[`${market}_MINT_BLOCK`];
          const amount = mintAmounts[`${market}_MINT_AMOUNT`];
          const underlying = underlyingAddresses[`${market}_UNDERLYING`];

          const result = await simulateOldAndNewMintOperations(
            blockNumber,
            marketAddress,
            underlying,
            mintUserAddress,
            amount,
          );
          // Upgrades will reduce reserves in very first operation of accrue interest
          delete result.oldState["totalReserves"];
          delete result.newState["totalReserves"];

          expect(result.oldState).to.be.deep.equal(result.newState);
        }
      });

      it("Should match borrow operations in all markets", async () => {
        const markets = Object.keys(vTokenAddresses);
        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          if (market == "vXVS") {
            continue;
          }

          const borrowUserAddress = borrowUserAddresses[`${market}_BORROW_USER`];
          const blockNumber = borrowBlocks[`${market}_BORROW_BLOCK`];
          const amount = borrowAmounts[`${market}_BORROW_AMOUNT`];
          const underlying = underlyingAddresses[`${market}_UNDERLYING`];

          const result = await simulateOldAndNewBorrowOperations(
            blockNumber,
            marketAddress,
            underlying,
            borrowUserAddress,
            amount,
          );
          // Upgrades will reduce reserves in very first operation of accrue interest
          delete result.oldState["totalReserves"];
          delete result.newState["totalReserves"];

          expect(result.oldState).to.be.deep.equal(result.newState);
        }
      });

      it("Should match redeem operations in all markets", async () => {
        const markets = Object.keys(vTokenAddresses);
        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          const redeemUserAddress = redeemUserAddresses[`${market}_REDEEM_USER`];
          const blockNumber = redeemBlocks[`${market}_REDEEM_BLOCK`];
          const amount = redeemAmounts[`${market}_REDEEM_AMOUNT`];
          const underlying = underlyingAddresses[`${market}_UNDERLYING`];

          const result = await simulateOldAndNewRedeemOperations(
            blockNumber,
            marketAddress,
            underlying,
            redeemUserAddress,
            amount,
          );
          // Upgrades will reduce reserves in very first operation of accrue interest
          delete result.oldState["totalReserves"];
          delete result.newState["totalReserves"];

          expect(result.oldState).to.be.deep.equal(result.newState);
        }
      });

      it("Should match repay operations in all markets", async () => {
        const markets = Object.keys(vTokenAddresses);
        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          if (market == "vXVS") {
            continue;
          }

          const repayUserAddress = repayUserAddresses[`${market}_REPAY_USER`];
          const blockNumber = repayBlocks[`${market}_REPAY_BLOCK`];
          const amount = repayAmounts[`${market}_REPAY_AMOUNT`];
          const underlying = underlyingAddresses[`${market}_UNDERLYING`];

          const result = await simulateOldAndNewRepayOperations(
            blockNumber,
            marketAddress,
            underlying,
            repayUserAddress,
            amount,
          );
          // Upgrades will reduce reserves in very first operation of accrue interest
          delete result.oldState["totalReserves"];
          delete result.newState["totalReserves"];

          expect(result.oldState).to.be.deep.equal(result.newState);
        }
      });
    });

    describe("Accrue Interest Operations", async () => {
      async function checkTokenBalances(vTokenAddress: string, underlying: string) {
        const vToken = await configureNew(vTokenAddress);
        const underlyingToken = FaucetToken__factory.connect(underlying, impersonatedTimelock);
        const balancePre = await underlyingToken.balanceOf(protocolShareReserve.address);

        await vToken.accrueInterest();

        const balancePost = await underlyingToken.balanceOf(protocolShareReserve.address);
        return { balancePre: balancePre, balancePost: balancePost };
      }

      before(async () => {
        await setForkBlock(28950790);
        await configureTimelock();
      });

      it("Should reduce reserves if reduceReservesBlockDelta > lastReduceBlockDelta", async () => {
        const markets = Object.keys(vTokenAddresses);
        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          const underlying = underlyingAddresses[`${market}_UNDERLYING`];

          const result = await checkTokenBalances(marketAddress, underlying);

          expect(result.balancePost).greaterThan(result.balancePre);
        }
      });

      it("Should not reduce reserves if reduceReservesBlockDelta < currentBlock - lastReduceBlockDelta", async () => {
        const markets = Object.keys(vTokenAddresses);
        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          const underlying = underlyingAddresses[`${market}_UNDERLYING`];

          const result = await checkTokenBalances(marketAddress, underlying);

          expect(result.balancePre).equals(result.balancePost);
        }
      });
    });
  });
}
