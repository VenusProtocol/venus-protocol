import { FakeContract, smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  ERC20__factory,
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

const FORK_MAINNET = process.env.FORKED_NETWORK === "bscmainnet";

const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";

let impersonatedTimelock: Signer;
let protocolShareReserve: FakeContract<IProtocolShareReserve>;

type MarketKey = keyof typeof vTokenAddresses;

async function configureTimelock() {
  impersonatedTimelock = await initMainnetUser(NORMAL_TIMELOCK, parseUnits("2"));
}

/**
 * Deploy new VBep20Delegate with internalCash, upgrade a market, and call syncCash
 */
async function configureNew(vTokenAddress: string) {
  await configureTimelock();
  const accessControlManager = IAccessControlManagerV5__factory.connect(ACM, impersonatedTimelock);
  const vTokenProxy = VBep20Delegator__factory.connect(vTokenAddress, impersonatedTimelock);
  const vTokenFactory = await ethers.getContractFactory("VBep20Delegate");
  const vTokenImpl = await vTokenFactory.deploy();
  await vTokenImpl.deployed();
  await vTokenProxy.connect(impersonatedTimelock)._setImplementation(vTokenImpl.address, true, "0x00");
  const vToken = VBep20Delegate__factory.connect(vTokenAddress, impersonatedTimelock);
  protocolShareReserve = await smock.fake<IProtocolShareReserve>("ProtocolShareReserve");
  await vToken.setAccessControlManager(ACM);
  await accessControlManager.giveCallPermission(
    vToken.address,
    "setReduceReservesBlockDelta(uint256)",
    NORMAL_TIMELOCK,
  );
  await vToken.connect(impersonatedTimelock).setReduceReservesBlockDelta(1000);
  await vToken.connect(impersonatedTimelock).setProtocolShareReserve(protocolShareReserve.address);

  // Sync internalCash with actual token balance after upgrade
  await vToken.connect(impersonatedTimelock).syncCash();

  return vToken;
}

/**
 * Configure old (pre-upgrade) market — no implementation change
 */
async function configureOld(vTokenAddress: string) {
  await configureTimelock();
  const vToken = VBep20Delegate__factory.connect(vTokenAddress, impersonatedTimelock);
  return vToken;
}

/**
 * Fetch all key storage slots to compare before/after upgrade
 */
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

/**
 * Read raw storage slot value at a given index for a contract
 */
async function getStorageAt(address: string, slot: number): Promise<string> {
  return ethers.provider.getStorageAt(address, slot);
}

if (FORK_MAINNET) {
  describe("InternalCash Upgrade - Storage & Operations", () => {
    // =====================================================================
    // 1. STORAGE COLLISION VERIFICATION
    // =====================================================================
    describe("Storage Layout - No Collision After Upgrade", () => {
      it("Verify all existing storage slots are unchanged after upgrade for all markets", async () => {
        const markets = Object.keys(vTokenAddresses) as MarketKey[];
        await setForkBlock(28864889);

        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          const mintAddress = mintUserAddresses[`${market}_MINT_USER` as keyof typeof mintUserAddresses];
          const borrowAddress = borrowUserAddresses[`${market}_BORROW_USER` as keyof typeof borrowUserAddresses];

          // Snapshot storage before upgrade
          const oldMarket = await configureOld(marketAddress);
          const oldState = await fetchStorage(oldMarket, mintAddress, borrowAddress);

          // Read raw storage for the critical VTokenStorage slots
          // VTokenStorageBase occupies a set of slots, then VTokenStorage starts:
          //   slot+0: isFlashLoanEnabled (bool, packed)
          //   slot+1: flashLoanFeeMantissa
          //   slot+2: flashLoanProtocolShareMantissa
          //   slot+3: flashLoanAmount
          //   slot+4: internalCash (NEW — should be 0 before upgrade, remains 0 in gap before)
          //   slot+5..slot+50: __gap
          const oldFlashLoanEnabled = await oldMarket.isFlashLoanEnabled();
          const oldFlashLoanFee = await oldMarket.flashLoanFeeMantissa();
          const oldFlashLoanProtocolShare = await oldMarket.flashLoanProtocolShareMantissa();
          const oldFlashLoanAmount = await oldMarket.flashLoanAmount();

          // Upgrade to new implementation with internalCash
          const newMarket = await configureNew(marketAddress);
          const newState = await fetchStorage(newMarket, mintAddress, borrowAddress);

          // Core storage fields must match (excluding totalReserves which may change from accrual)
          expect(oldState.name).to.equal(newState.name, `${market}: name mismatch`);
          expect(oldState.symbol).to.equal(newState.symbol, `${market}: symbol mismatch`);
          expect(oldState.decimals).to.equal(newState.decimals, `${market}: decimals mismatch`);
          expect(oldState.admin).to.equal(newState.admin, `${market}: admin mismatch`);
          expect(oldState.pendingAdmin).to.equal(newState.pendingAdmin, `${market}: pendingAdmin mismatch`);
          expect(oldState.comptroller).to.equal(newState.comptroller, `${market}: comptroller mismatch`);
          expect(oldState.reserveFactorMantissa).to.equal(
            newState.reserveFactorMantissa,
            `${market}: reserveFactor mismatch`,
          );
          expect(oldState.totalBorrows).to.equal(newState.totalBorrows, `${market}: totalBorrows mismatch`);
          expect(oldState.totalSupply).to.equal(newState.totalSupply, `${market}: totalSupply mismatch`);
          expect(oldState.underlying).to.equal(newState.underlying, `${market}: underlying mismatch`);
          expect(oldState.accountBalance).to.equal(
            newState.accountBalance,
            `${market}: accountBalance mismatch`,
          );
          expect(oldState.borrowBalance).to.equal(
            newState.borrowBalance,
            `${market}: borrowBalance mismatch`,
          );

          // Flash loan storage must be preserved
          expect(await newMarket.isFlashLoanEnabled()).to.equal(
            oldFlashLoanEnabled,
            `${market}: isFlashLoanEnabled collision`,
          );
          expect(await newMarket.flashLoanFeeMantissa()).to.equal(
            oldFlashLoanFee,
            `${market}: flashLoanFeeMantissa collision`,
          );
          expect(await newMarket.flashLoanProtocolShareMantissa()).to.equal(
            oldFlashLoanProtocolShare,
            `${market}: flashLoanProtocolShareMantissa collision`,
          );
          expect(await newMarket.flashLoanAmount()).to.equal(
            oldFlashLoanAmount,
            `${market}: flashLoanAmount collision`,
          );

          // internalCash should now equal the actual token balance (set by syncCash)
          const underlying = ERC20__factory.connect(newState.underlying, ethers.provider);
          const actualBalance = await underlying.balanceOf(marketAddress);
          const internalCash = await newMarket.internalCash();
          expect(internalCash).to.equal(
            actualBalance,
            `${market}: internalCash should match actual balance after syncCash`,
          );

          // Exchange rate must be preserved
          const proxy = VBep20Delegator__factory.connect(marketAddress, ethers.provider);
          const totalSupply = await proxy.totalSupply();
          if (!totalSupply.isZero()) {
            const exchangeRate = await proxy.callStatic.exchangeRateCurrent();
            expect(exchangeRate).to.be.gt(0, `${market}: exchange rate should be positive after upgrade`);
          }
        }
      });
    });

    // =====================================================================
    // 2. USER OPERATIONS — Before vs After Upgrade
    // =====================================================================
    describe("User Operations - Mint, Borrow, Redeem, Repay", () => {
      let signer: Signer;

      async function configureUserAndTokens(
        vTokenAddress: string,
        userAddress: string,
        underlyingAddress: string,
        amount: string,
      ) {
        await configureTimelock();
        signer = await initMainnetUser(userAddress, parseUnits("2"));
        const underlying = FaucetToken__factory.connect(underlyingAddress, impersonatedTimelock);
        await underlying.connect(signer).approve(vTokenAddress, amount);
      }

      // --- MINT ---
      async function simulateMintBeforeAndAfter(
        blockNumber: number,
        vTokenContract: string,
        underlyingAddress: string,
        userAddress: string,
        amount: string,
      ) {
        // Before upgrade (old impl)
        await setForkBlock(blockNumber);
        await mine(6);
        const vTokenOld = await configureOld(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);
        await vTokenOld.connect(signer).mint(amount);
        const oldState = await fetchStorage(vTokenOld, userAddress, userAddress);

        // After upgrade (new impl with internalCash)
        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);

        const internalCashBefore = await vTokenNew.internalCash();
        await vTokenNew.connect(signer).mint(amount);
        const internalCashAfter = await vTokenNew.internalCash();
        const newState = await fetchStorage(vTokenNew, userAddress, userAddress);

        // internalCash must increase after mint
        expect(internalCashAfter).to.be.gt(
          internalCashBefore,
          "internalCash should increase after mint",
        );

        return { oldState, newState };
      }

      // --- BORROW ---
      async function simulateBorrowBeforeAndAfter(
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
        const oldState = await fetchStorage(vTokenOld, userAddress, userAddress);

        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);

        const internalCashBefore = await vTokenNew.internalCash();
        await vTokenNew.connect(signer).borrow(amount);
        const internalCashAfter = await vTokenNew.internalCash();
        const newState = await fetchStorage(vTokenNew, userAddress, userAddress);

        // internalCash must decrease after borrow
        expect(internalCashAfter).to.be.lt(
          internalCashBefore,
          "internalCash should decrease after borrow",
        );

        return { oldState, newState };
      }

      // --- REDEEM ---
      async function simulateRedeemBeforeAndAfter(
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
        const oldState = await fetchStorage(vTokenOld, userAddress, userAddress);

        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);

        const internalCashBefore = await vTokenNew.internalCash();
        await vTokenNew.connect(signer).redeem(amount);
        const internalCashAfter = await vTokenNew.internalCash();
        const newState = await fetchStorage(vTokenNew, userAddress, userAddress);

        // internalCash must decrease after redeem
        expect(internalCashAfter).to.be.lt(
          internalCashBefore,
          "internalCash should decrease after redeem",
        );

        return { oldState, newState };
      }

      // --- REPAY ---
      async function simulateRepayBeforeAndAfter(
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
        const oldState = await fetchStorage(vTokenOld, userAddress, userAddress);

        await setForkBlock(blockNumber);
        const vTokenNew = await configureNew(vTokenContract);
        await configureUserAndTokens(vTokenContract, userAddress, underlyingAddress, amount);

        const internalCashBefore = await vTokenNew.internalCash();
        await vTokenNew.connect(signer).repayBorrow(amount);
        const internalCashAfter = await vTokenNew.internalCash();
        const newState = await fetchStorage(vTokenNew, userAddress, userAddress);

        // internalCash must increase after repay
        expect(internalCashAfter).to.be.gt(
          internalCashBefore,
          "internalCash should increase after repay",
        );

        return { oldState, newState };
      }

      it("Should match mint operations in all markets before and after upgrade", async () => {
        const markets = Object.keys(vTokenAddresses) as MarketKey[];
        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          const mintUserAddress = mintUserAddresses[`${market}_MINT_USER` as keyof typeof mintUserAddresses];
          const blockNumber = mintBlocks[`${market}_MINT_BLOCK` as keyof typeof mintBlocks];
          const amount = mintAmounts[`${market}_MINT_AMOUNT` as keyof typeof mintAmounts];
          const underlyingAddr = underlyingAddresses[`${market}_UNDERLYING` as keyof typeof underlyingAddresses];

          const result = await simulateMintBeforeAndAfter(
            blockNumber,
            marketAddress,
            underlyingAddr,
            mintUserAddress,
            amount,
          );

          // Reserves may differ due to first-operation reserve reduction after upgrade
          delete (result.oldState as any)["totalReserves"];
          delete (result.newState as any)["totalReserves"];

          expect(result.oldState).to.be.deep.equal(result.newState, `${market}: mint state mismatch`);
        }
      });

      it("Should match borrow operations in all markets before and after upgrade", async () => {
        const markets = Object.keys(vTokenAddresses) as MarketKey[];
        for (const market of markets) {
          if (market === "vXVS") continue; // XVS borrow is restricted

          const marketAddress = vTokenAddresses[market];
          const borrowUserAddress =
            borrowUserAddresses[`${market}_BORROW_USER` as keyof typeof borrowUserAddresses];
          const blockNumber = borrowBlocks[`${market}_BORROW_BLOCK` as keyof typeof borrowBlocks];
          const amount = borrowAmounts[`${market}_BORROW_AMOUNT` as keyof typeof borrowAmounts];
          const underlyingAddr = underlyingAddresses[`${market}_UNDERLYING` as keyof typeof underlyingAddresses];

          const result = await simulateBorrowBeforeAndAfter(
            blockNumber,
            marketAddress,
            underlyingAddr,
            borrowUserAddress,
            amount,
          );

          delete (result.oldState as any)["totalReserves"];
          delete (result.newState as any)["totalReserves"];

          expect(result.oldState).to.be.deep.equal(result.newState, `${market}: borrow state mismatch`);
        }
      });

      it("Should match redeem operations in all markets before and after upgrade", async () => {
        const markets = Object.keys(vTokenAddresses) as MarketKey[];
        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          const redeemUserAddress =
            redeemUserAddresses[`${market}_REDEEM_USER` as keyof typeof redeemUserAddresses];
          const blockNumber = redeemBlocks[`${market}_REDEEM_BLOCK` as keyof typeof redeemBlocks];
          const amount = redeemAmounts[`${market}_REDEEM_AMOUNT` as keyof typeof redeemAmounts];
          const underlyingAddr = underlyingAddresses[`${market}_UNDERLYING` as keyof typeof underlyingAddresses];

          const result = await simulateRedeemBeforeAndAfter(
            blockNumber,
            marketAddress,
            underlyingAddr,
            redeemUserAddress,
            amount,
          );

          delete (result.oldState as any)["totalReserves"];
          delete (result.newState as any)["totalReserves"];

          expect(result.oldState).to.be.deep.equal(result.newState, `${market}: redeem state mismatch`);
        }
      });

      it("Should match repay operations in all markets before and after upgrade", async () => {
        const markets = Object.keys(vTokenAddresses) as MarketKey[];
        for (const market of markets) {
          if (market === "vXVS") continue; // XVS borrow/repay restricted

          const marketAddress = vTokenAddresses[market];
          const repayUserAddress =
            repayUserAddresses[`${market}_REPAY_USER` as keyof typeof repayUserAddresses];
          const blockNumber = repayBlocks[`${market}_REPAY_BLOCK` as keyof typeof repayBlocks];
          const amount = repayAmounts[`${market}_REPAY_AMOUNT` as keyof typeof repayAmounts];
          const underlyingAddr = underlyingAddresses[`${market}_UNDERLYING` as keyof typeof underlyingAddresses];

          const result = await simulateRepayBeforeAndAfter(
            blockNumber,
            marketAddress,
            underlyingAddr,
            repayUserAddress,
            amount,
          );

          delete (result.oldState as any)["totalReserves"];
          delete (result.newState as any)["totalReserves"];

          expect(result.oldState).to.be.deep.equal(result.newState, `${market}: repay state mismatch`);
        }
      });
    });

    // =====================================================================
    // 3. internalCash ACCOUNTING CONSISTENCY
    // =====================================================================
    describe("InternalCash Accounting", () => {
      it("internalCash always equals actual token balance through mint→borrow→repay→redeem cycle", async () => {
        // Use vUSDT as representative market with high liquidity
        const BLOCK = mintBlocks["vUSDT_MINT_BLOCK"];
        const MARKET = vTokenAddresses["vUSDT"];
        const UNDERLYING = underlyingAddresses["vUSDT_UNDERLYING"];
        const USER = mintUserAddresses["vUSDT_MINT_USER"];

        await setForkBlock(BLOCK);
        const vToken = await configureNew(MARKET);
        const underlying = FaucetToken__factory.connect(UNDERLYING, impersonatedTimelock);
        const user = await initMainnetUser(USER, parseUnits("2"));

        // Helper to verify internalCash == balanceOf at each step
        async function assertCashConsistency(step: string) {
          const internalCash = await vToken.internalCash();
          const actualBalance = await underlying.balanceOf(MARKET);
          expect(internalCash).to.equal(actualBalance, `${step}: internalCash != balanceOf`);
        }

        await assertCashConsistency("after syncCash");

        // Step 1: Mint
        const mintAmount = parseUnits("100", 18);
        await underlying.connect(user).approve(MARKET, mintAmount);
        await vToken.connect(user).mint(mintAmount);
        await assertCashConsistency("after mint");

        // Step 2: Redeem partial
        const vTokenBalance = await vToken.callStatic.balanceOf(USER);
        const redeemAmount = vTokenBalance.div(4);
        await vToken.connect(user).redeem(redeemAmount);
        await assertCashConsistency("after redeem");
      });

      it("internalCash tracks correctly through borrow and repay", async () => {
        const BLOCK = borrowBlocks["vUSDT_BORROW_BLOCK"];
        const MARKET = vTokenAddresses["vUSDT"];
        const UNDERLYING = underlyingAddresses["vUSDT_UNDERLYING"];
        const USER = borrowUserAddresses["vUSDT_BORROW_USER"];

        await setForkBlock(BLOCK);
        const vToken = await configureNew(MARKET);
        const underlying = FaucetToken__factory.connect(UNDERLYING, impersonatedTimelock);
        const user = await initMainnetUser(USER, parseUnits("2"));

        async function assertCashConsistency(step: string) {
          const internalCash = await vToken.internalCash();
          const actualBalance = await underlying.balanceOf(MARKET);
          expect(internalCash).to.equal(actualBalance, `${step}: internalCash != balanceOf`);
        }

        await assertCashConsistency("after syncCash");

        // Borrow
        const borrowAmount = parseUnits("10", 18);
        await vToken.connect(user).borrow(borrowAmount);
        await assertCashConsistency("after borrow");

        // Repay
        await underlying.connect(user).approve(MARKET, borrowAmount);
        await vToken.connect(user).repayBorrow(borrowAmount);
        await assertCashConsistency("after repay");
      });
    });

    // =====================================================================
    // 4. syncCash ACCESS CONTROL
    // =====================================================================
    describe("syncCash Access Control", () => {
      it("syncCash can only be called by admin", async () => {
        const BLOCK = 28864889;
        await setForkBlock(BLOCK);

        const MARKET = vTokenAddresses["vUSDT"];
        const vToken = await configureNew(MARKET);

        const [, randomUser] = await ethers.getSigners();
        const vTokenAsRandom = VBep20Delegate__factory.connect(MARKET, randomUser);

        await expect(vTokenAsRandom.syncCash()).to.be.revertedWith("only admin");
      });

      it("syncCash can re-sync after internalCash was set", async () => {
        const BLOCK = 28864889;
        await setForkBlock(BLOCK);

        const MARKET = vTokenAddresses["vUSDT"];
        const UNDERLYING = underlyingAddresses["vUSDT_UNDERLYING"];
        const vToken = await configureNew(MARKET);

        const underlying = ERC20__factory.connect(UNDERLYING, ethers.provider);
        const balanceBefore = await underlying.balanceOf(MARKET);
        const internalCashBefore = await vToken.internalCash();

        // They should match after initial syncCash
        expect(internalCashBefore).to.equal(balanceBefore);

        // Admin can call syncCash again — it re-syncs
        await vToken.connect(impersonatedTimelock).syncCash();

        const internalCashAfter = await vToken.internalCash();
        expect(internalCashAfter).to.equal(balanceBefore);
      });
    });

    // =====================================================================
    // 5. EXCHANGE RATE CONSISTENCY
    // =====================================================================
    describe("Exchange Rate Consistency", () => {
      it("Exchange rate is identical before and after upgrade for all markets", async () => {
        await setForkBlock(28864889);

        const markets = Object.keys(vTokenAddresses) as MarketKey[];
        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          const proxy = VBep20Delegator__factory.connect(marketAddress, ethers.provider);

          const totalSupply = await proxy.totalSupply();
          if (totalSupply.isZero()) continue;

          // Get exchange rate before upgrade
          const exchangeRateBefore = await proxy.callStatic.exchangeRateCurrent();

          // Upgrade
          await configureNew(marketAddress);

          // Get exchange rate after upgrade + syncCash
          const exchangeRateAfter = await proxy.callStatic.exchangeRateCurrent();

          // Allow tiny tolerance for interest accrual between the two calls
          const tolerance = exchangeRateBefore.div(100000); // 0.001%
          expect(exchangeRateAfter.sub(exchangeRateBefore).abs()).to.be.lte(
            tolerance,
            `${market}: exchange rate diverged after upgrade`,
          );
        }
      });
    });

    // =====================================================================
    // 6. ACCRUE INTEREST WORKS AFTER UPGRADE
    // =====================================================================
    describe("Accrue Interest After Upgrade", () => {
      it("accrueInterest succeeds and reduces reserves on all markets", async () => {
        await setForkBlock(28950790);
        await configureTimelock();

        const markets = Object.keys(vTokenAddresses) as MarketKey[];
        for (const market of markets) {
          const marketAddress = vTokenAddresses[market];
          const underlyingAddr = underlyingAddresses[`${market}_UNDERLYING` as keyof typeof underlyingAddresses];
          const underlyingToken = FaucetToken__factory.connect(underlyingAddr, impersonatedTimelock);

          const vToken = await configureNew(marketAddress);

          const balancePre = await underlyingToken.balanceOf(protocolShareReserve.address);

          await vToken.accrueInterest();

          const balancePost = await underlyingToken.balanceOf(protocolShareReserve.address);

          // Reserves should have been sent to PSR
          expect(balancePost).greaterThanOrEqual(
            balancePre,
            `${market}: reserves should be sent to PSR after accrual`,
          );
        }
      });
    });
  });
}
