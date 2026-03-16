import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { BigNumber, Contract, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { setStorageAt } from "@nomicfoundation/hardhat-network-helpers";

import {
  ERC20__factory,
  IAccessControlManagerV5__factory,
  IProtocolShareReserve,
  VBep20Delegate__factory,
  VBep20Delegator__factory,
} from "../../../typechain";
import { forking, initMainnetUser, FORK_MAINNET } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";

// All VBep20Delegator core pool markets on BSC mainnet (excluding vBNB which is native)
const MARKET_PROXIES: { name: string; proxy: string }[] = [
  { name: "vAAVE", proxy: "0x26DA28954763B92139ED49283625ceCAf52C6f94" },
  { name: "vADA", proxy: "0x9A0AF7FDb2065Ce470D72664DE73cAE409dA28Ec" },
  { name: "vAsBNB", proxy: "0xCC1dB43a06d97f736C7B045AedD03C6707c09BDF" },
  { name: "vBCH", proxy: "0x5F0388EBc2B94FA8E123F404b79cCF5f40b29176" },
  { name: "vBETH", proxy: "0x972207A639CC1B374B893cc33Fa251b55CEB7c07" },
  { name: "vBTCB", proxy: "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B" },
  { name: "vBUSD", proxy: "0x95c78222B3D6e262426483D42CfA53685A67Ab9D" },
  { name: "vCAKE", proxy: "0x86aC3974e2BD0d60825230fa6F355fF11409df5c" },
  { name: "vDAI", proxy: "0x334b3eCB4DCa3593BCCC3c7EBD1A1C1d1780FBF1" },
  { name: "vDOGE", proxy: "0xec3422Ef92B2fb59e84c8B02Ba73F1fE84Ed8D71" },
  { name: "vDOT", proxy: "0x1610bc33319e9398de5f57B33a5b184c806aD217" },
  { name: "vETH", proxy: "0xf508fCD89b8bd15579dc79A6827cB4686A3592c8" },
  { name: "vFDUSD", proxy: "0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba" },
  { name: "vFIL", proxy: "0xf91d58b5aE142DAcC749f58A49FCBac340Cb0343" },
  { name: "vLINK", proxy: "0x650b940a1033B8A1b1873f78730FcFC73ec11f1f" },
  { name: "vLisUSD", proxy: "0x689E0daB47Ab16bcae87Ec18491692BF621Dc6Ab" },
  { name: "vLTC", proxy: "0x57A5297F2cB2c0AaC9D554660acd6D385Ab50c6B" },
  { name: "vMATIC", proxy: "0x5c9476FcD6a4F9a3654139721c949c2233bBbBc8" },
  { name: "vPT-sUSDE-26JUN2025", proxy: "0x9e4E5fed5Ac5B9F732d0D850A615206330Bf1866" },
  { name: "vPT-USDe-30OCT2025", proxy: "0x6D0cDb3355c93A0cD20071aBbb3622731a95c73E" },
  { name: "vPT-clisBNB-25JUN2026", proxy: "0x6d3BD68E90B42615cb5abF4B8DE92b154ADc435e" },
  { name: "vSlisBNB", proxy: "0x89c910Eb8c90df818b4649b508Ba22130Dc73Adc" },
  { name: "vSOL", proxy: "0xBf515bA4D1b52FFdCeaBF20d31D705Ce789F2cEC" },
  { name: "vSolvBTC", proxy: "0xf841cb62c19fCd4fF5CD0AaB5939f3140BaaC3Ea" },
  { name: "vSUSDe", proxy: "0x699658323d58eE25c69F1a29d476946ab011bD18" },
  { name: "vSXP", proxy: "0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0" },
  { name: "vTHE", proxy: "0x86e06EAfa6A1eA631Eab51DE500E3D474933739f" },
  { name: "vTRX", proxy: "0xC5D3466aA484B040eE977073fcF337f2c00071c1" },
  { name: "vTRXOLD", proxy: "0x61eDcFe8Dd6bA3c891CB9bEc2dc7657B3B422E93" },
  { name: "vTUSD", proxy: "0xBf762cd5991cA1DCdDaC9ae5C638F5B5Dc3Bee6E" },
  { name: "vTUSDOLD", proxy: "0x08CEB3F4a7ed3500cA0982bcd0FC7816688084c3" },
  { name: "vTWT", proxy: "0x4d41a36D04D97785bcEA57b057C412b278e6Edcc" },
  { name: "vU", proxy: "0x3d5E269787d562b74aCC55F18Bd26C5D09Fa245E" },
  { name: "vUNI", proxy: "0x27FF564707786720C71A2e5c1490A63266683612" },
  { name: "vUSDC", proxy: "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8" },
  { name: "vUSDe", proxy: "0x74ca6930108F775CC667894EEa33843e691680d7" },
  { name: "vUSDT", proxy: "0xfD5840Cd36d94D7229439859C0112a4185BC0255" },
  { name: "vUSD1", proxy: "0x0C1DA220D301155b87318B90692Da8dc43B67340" },
  { name: "vWBETH", proxy: "0x6CFdEc747f37DAf3b87a35a1D9c8AD3063A1A8A0" },
  { name: "vWBNB", proxy: "0x6bCa74586218dB34cdB402295796b79663d816e9" },
  { name: "vXRP", proxy: "0xB248a295732e0225acd3337607cc01068e3b9c10" },
  { name: "vXSolvBTC", proxy: "0xd804dE60aFD05EE6B89aab5D152258fD461B07D5" },
  { name: "vXVS", proxy: "0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D" },
];

/**
 * Helper: Find the storage slot for an ERC20 token's balanceOf mapping
 */
async function findBalanceSlot(tokenAddress: string): Promise<number | null> {
  const probeAddress = "0x" + "ba1".padStart(40, "0");
  const probeAmount = BigNumber.from("1234567890");
  const token = ERC20__factory.connect(tokenAddress, ethers.provider);

  for (let slot = 0; slot <= 10; slot++) {
    const storageSlot = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [probeAddress, slot]),
    );
    const prevValue = await ethers.provider.getStorageAt(tokenAddress, storageSlot);
    await setStorageAt(tokenAddress, storageSlot, ethers.utils.hexZeroPad(probeAmount.toHexString(), 32));
    try {
      const balance = await token.balanceOf(probeAddress);
      await setStorageAt(tokenAddress, storageSlot, prevValue);
      if (balance.eq(probeAmount)) return slot;
    } catch {
      await setStorageAt(tokenAddress, storageSlot, prevValue);
    }
  }
  return null;
}

async function setTokenBalance(tokenAddress: string, account: string, amount: BigNumber, slot: number) {
  const storageSlot = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [account, slot]),
  );
  await setStorageAt(tokenAddress, storageSlot, ethers.utils.hexZeroPad(amount.toHexString(), 32));
}

const FORK_BLOCK = 86892606;

if (FORK_MAINNET) {
  describe("InternalCash Upgrade - Storage & Operations", () => {
    forking(FORK_BLOCK, () => {
    let timelock: Signer;
    let newImplAddress: string;
    let upgradedMarkets: { name: string; proxy: string; underlying: string; vToken: Contract }[];
    let protocolShareReserve: FakeContract<IProtocolShareReserve>;

    // Snapshot storage from the delegator proxy BEFORE upgrade
    type StorageSnapshot = {
      name: string;
      symbol: string;
      decimals: number;
      admin: string;
      pendingAdmin: string;
      comptroller: string;
      interestRateModel: string;
      reserveFactorMantissa: BigNumber;
      borrowIndex: BigNumber;
      totalBorrows: BigNumber;
      totalReserves: BigNumber;
      totalSupply: BigNumber;
      underlying: string;
      exchangeRate: BigNumber;
    };

    async function snapshotViaProxy(proxyAddr: string): Promise<StorageSnapshot> {
      const proxy = VBep20Delegator__factory.connect(proxyAddr, ethers.provider);
      const totalSupply = await proxy.totalSupply();
      return {
        name: await proxy.name(),
        symbol: await proxy.symbol(),
        decimals: await proxy.decimals(),
        admin: await proxy.admin(),
        pendingAdmin: await proxy.pendingAdmin(),
        comptroller: await proxy.comptroller(),
        interestRateModel: await proxy.interestRateModel(),
        reserveFactorMantissa: await proxy.reserveFactorMantissa(),
        borrowIndex: await proxy.borrowIndex(),
        totalBorrows: await proxy.totalBorrows(),
        totalReserves: await proxy.totalReserves(),
        totalSupply,
        underlying: await proxy.underlying(),
        exchangeRate: totalSupply.isZero()
          ? BigNumber.from(0)
          : await proxy.callStatic.exchangeRateCurrent(),
      };
    }

    // Store pre-upgrade snapshots for comparison
    const preUpgradeSnapshots: Record<string, StorageSnapshot> = {};

    before(async () => {
      timelock = await initMainnetUser(NORMAL_TIMELOCK, parseUnits("10"));

      // Deploy new VBep20Delegate implementation
      const VBep20DelegateFactory = await ethers.getContractFactory("VBep20Delegate");
      const newImpl = await VBep20DelegateFactory.deploy();
      await newImpl.deployed();
      newImplAddress = newImpl.address;

      // Snapshot, upgrade, and syncCash all markets
      upgradedMarkets = [];
      for (const market of MARKET_PROXIES) {
        try {
          // Snapshot BEFORE upgrade
          preUpgradeSnapshots[market.name] = await snapshotViaProxy(market.proxy);

          // Upgrade implementation
          const proxy = VBep20Delegator__factory.connect(market.proxy, timelock);
          await proxy._setImplementation(newImplAddress, false, "0x");

          // syncCash
          const vToken = await ethers.getContractAt("VBep20Delegate", market.proxy, timelock);
          await vToken.syncCash();

          upgradedMarkets.push({
            name: market.name,
            proxy: market.proxy,
            underlying: preUpgradeSnapshots[market.name].underlying,
            vToken,
          });
        } catch (e: any) {
          console.log(`        Failed to upgrade ${market.name}: ${e.message?.slice(0, 80)}`);
        }
      }
      console.log(`        Upgraded ${upgradedMarkets.length}/${MARKET_PROXIES.length} markets`);
    });

    // =====================================================================
    // 1. STORAGE COLLISION VERIFICATION
    // =====================================================================
    describe("Storage Layout - No Collision After Upgrade", () => {
      it("All existing storage slots preserved after upgrade + syncCash for all markets", async () => {
        expect(upgradedMarkets.length).to.be.gt(
          0,
          "No markets were upgraded — all upgrades failed during before() hook",
        );

        for (const market of upgradedMarkets) {
          const before = preUpgradeSnapshots[market.name];
          const after = await snapshotViaProxy(market.proxy);

          expect(after.name).to.equal(before.name, `${market.name}: name`);
          expect(after.symbol).to.equal(before.symbol, `${market.name}: symbol`);
          expect(after.decimals).to.equal(before.decimals, `${market.name}: decimals`);
          expect(after.admin).to.equal(before.admin, `${market.name}: admin`);
          expect(after.pendingAdmin).to.equal(before.pendingAdmin, `${market.name}: pendingAdmin`);
          expect(after.comptroller).to.equal(before.comptroller, `${market.name}: comptroller`);
          expect(after.reserveFactorMantissa).to.equal(
            before.reserveFactorMantissa,
            `${market.name}: reserveFactorMantissa`,
          );
          expect(after.totalBorrows).to.equal(before.totalBorrows, `${market.name}: totalBorrows`);
          expect(after.totalSupply).to.equal(before.totalSupply, `${market.name}: totalSupply`);
          expect(after.underlying).to.equal(before.underlying, `${market.name}: underlying`);

          // Exchange rate must be stable (allow tiny tolerance for accrual)
          if (!before.exchangeRate.isZero()) {
            const tolerance = before.exchangeRate.div(10000); // 0.01%
            expect(after.exchangeRate.sub(before.exchangeRate).abs()).to.be.lte(
              tolerance,
              `${market.name}: exchange rate diverged`,
            );
          }

          // internalCash must match actual balance
          const underlying = ERC20__factory.connect(after.underlying, ethers.provider);
          const actualBalance = await underlying.balanceOf(market.proxy);
          const internalCash = await market.vToken.internalCash();
          expect(internalCash).to.equal(
            actualBalance,
            `${market.name}: internalCash != balanceOf after syncCash`,
          );
        }
      });
    });

    // =====================================================================
    // 2. syncCash ACCESS CONTROL
    // =====================================================================
    describe("syncCash Access Control", () => {
      it("syncCash reverts for non-admin callers", async () => {
        const market = upgradedMarkets[0];
        const [, randomUser] = await ethers.getSigners();
        const vTokenAsRandom = await ethers.getContractAt("VBep20Delegate", market.proxy, randomUser);
        await expect(vTokenAsRandom.syncCash()).to.be.revertedWith("only admin");
      });

      it("syncCash can be called again by admin (re-syncs)", async () => {
        const market = upgradedMarkets[0];
        const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
        const balanceBefore = await underlying.balanceOf(market.proxy);

        await market.vToken.connect(timelock).syncCash();

        const internalCash = await market.vToken.internalCash();
        expect(internalCash).to.equal(
          balanceBefore,
          `${market.name}: internalCash should match underlying balance after re-sync`,
        );
      });
    });

    // =====================================================================
    // 3. MINT — internalCash increases, exchange rate stable
    // =====================================================================
    describe("Mint after upgrade", () => {
      it("mint increases internalCash correctly on all upgraded markets", async () => {
        let verified = 0;
        for (const market of upgradedMarkets) {
          const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
          const proxy = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

          const totalSupply = await proxy.totalSupply();
          if (totalSupply.isZero()) continue;

          const balanceSlot = await findBalanceSlot(market.underlying);
          if (balanceSlot === null) continue;

          const decimals = await underlying.decimals();
          const mintAmount = parseUnits("1", decimals);

          const [minter] = await ethers.getSigners();
          await setTokenBalance(market.underlying, minter.address, mintAmount, balanceSlot);
          await underlying.connect(minter).approve(market.proxy, mintAmount);

          const internalCashBefore = await market.vToken.internalCash();
          const exchangeRateBefore = await proxy.callStatic.exchangeRateCurrent();

          try {
            await proxy.connect(minter).mint(mintAmount);
          } catch {
            continue; // supply cap or paused
          }

          // The critical invariant: internalCash == actual balanceOf after every operation
          const internalCashAfter = await market.vToken.internalCash();
          const actualBalance = await underlying.balanceOf(market.proxy);
          expect(internalCashAfter).to.equal(actualBalance, `${market.name}: internalCash != balanceOf after mint`);

          // Exchange rate stable (within 0.01%)
          const exchangeRateAfter = await proxy.callStatic.exchangeRateCurrent();
          const tolerance = exchangeRateBefore.div(10000);
          expect(exchangeRateAfter.sub(exchangeRateBefore).abs()).to.be.lte(
            tolerance,
            `${market.name}: exchange rate diverged after mint`,
          );

          verified++;
        }
        console.log(`        Mint verified on ${verified} markets`);
        expect(verified).to.be.gt(0, "Mint could not be verified on any market — all skipped due to supply caps, pauses, or missing balance slots");
      });
    });

    // =====================================================================
    // 4. REDEEM — internalCash decreases
    // =====================================================================
    describe("Redeem after upgrade", () => {
      it("redeem decreases internalCash correctly", async () => {
        let verified = 0;
        for (const market of upgradedMarkets) {
          const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
          const proxy = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

          const totalSupply = await proxy.totalSupply();
          if (totalSupply.isZero()) continue;

          const balanceSlot = await findBalanceSlot(market.underlying);
          if (balanceSlot === null) continue;

          const decimals = await underlying.decimals();
          const mintAmount = parseUnits("1", decimals);

          // Mint first to get vTokens
          const [minter] = await ethers.getSigners();
          await setTokenBalance(market.underlying, minter.address, mintAmount, balanceSlot);
          await underlying.connect(minter).approve(market.proxy, mintAmount);

          try {
            await proxy.connect(minter).mint(mintAmount);
          } catch {
            continue;
          }

          const vTokenBalance = await proxy.balanceOf(minter.address);
          if (vTokenBalance.isZero()) continue;

          const internalCashBefore = await market.vToken.internalCash();

          try {
            await proxy.connect(minter).redeem(vTokenBalance);
          } catch {
            continue;
          }

          const internalCashAfter = await market.vToken.internalCash();
          expect(internalCashAfter).to.be.lt(internalCashBefore, `${market.name}: internalCash should decrease`);

          const actualBalance = await underlying.balanceOf(market.proxy);
          expect(internalCashAfter).to.equal(
            actualBalance,
            `${market.name}: internalCash != balanceOf after redeem`,
          );

          verified++;
        }
        console.log(`        Redeem verified on ${verified} markets`);
        expect(verified).to.be.gt(0, "Redeem could not be verified on any market — all skipped due to caps, pauses, or missing balance slots");
      });
    });

    // =====================================================================
    // 5. BORROW — internalCash decreases
    // =====================================================================
    describe("Borrow after upgrade", () => {
      it("borrow decreases internalCash correctly", async () => {
        // Use a market where we can find a user with collateral to borrow
        // We'll verify internalCash tracking after configureNew already set up the market
        let verified = 0;
        for (const market of upgradedMarkets) {
          if (market.name === "vXVS") continue; // restricted

          const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
          const proxy = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

          const cash = await market.vToken.internalCash();
          if (cash.isZero()) continue;

          const balanceSlot = await findBalanceSlot(market.underlying);
          if (balanceSlot === null) continue;

          // Find a borrower — use the largest depositor approach: mint first then borrow
          const decimals = await underlying.decimals();
          const mintAmount = parseUnits("10", decimals);
          const borrowAmount = parseUnits("1", decimals);

          const [user] = await ethers.getSigners();
          await setTokenBalance(market.underlying, user.address, mintAmount, balanceSlot);
          await underlying.connect(user).approve(market.proxy, mintAmount);

          try {
            await proxy.connect(user).mint(mintAmount);
          } catch {
            continue;
          }

          const internalCashBefore = await market.vToken.internalCash();

          try {
            await proxy.connect(user).borrow(borrowAmount);
          } catch {
            continue; // borrow paused or shortfall
          }

          const internalCashAfter = await market.vToken.internalCash();
          expect(internalCashAfter).to.be.lt(internalCashBefore, `${market.name}: internalCash should decrease`);

          const actualBalance = await underlying.balanceOf(market.proxy);
          expect(internalCashAfter).to.equal(
            actualBalance,
            `${market.name}: internalCash != balanceOf after borrow`,
          );

          verified++;
          if (verified >= 3) break; // borrow tests are slow, 3 markets is enough
        }
        console.log(`        Borrow verified on ${verified} markets`);
        expect(verified).to.be.gt(0, "Borrow could not be verified on any market — all skipped due to borrow pauses, shortfall, or missing balance slots");
      });
    });

    // =====================================================================
    // 6. REPAY — internalCash increases
    // =====================================================================
    describe("Repay after upgrade", () => {
      it("repay increases internalCash correctly", async () => {
        let verified = 0;
        for (const market of upgradedMarkets) {
          if (market.name === "vXVS") continue;

          const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
          const proxy = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

          const cash = await market.vToken.internalCash();
          if (cash.isZero()) continue;

          const balanceSlot = await findBalanceSlot(market.underlying);
          if (balanceSlot === null) continue;

          const decimals = await underlying.decimals();
          const mintAmount = parseUnits("10", decimals);
          const borrowAmount = parseUnits("1", decimals);

          const [user] = await ethers.getSigners();
          await setTokenBalance(market.underlying, user.address, mintAmount, balanceSlot);
          await underlying.connect(user).approve(market.proxy, mintAmount);

          try {
            await proxy.connect(user).mint(mintAmount);
            await proxy.connect(user).borrow(borrowAmount);
          } catch {
            continue;
          }

          // Now repay
          await setTokenBalance(market.underlying, user.address, borrowAmount.mul(2), balanceSlot);
          await underlying.connect(user).approve(market.proxy, borrowAmount.mul(2));

          const internalCashBefore = await market.vToken.internalCash();

          try {
            await proxy.connect(user).repayBorrow(borrowAmount);
          } catch {
            continue;
          }

          const internalCashAfter = await market.vToken.internalCash();
          expect(internalCashAfter).to.be.gt(internalCashBefore, `${market.name}: internalCash should increase`);

          const actualBalance = await underlying.balanceOf(market.proxy);
          expect(internalCashAfter).to.equal(
            actualBalance,
            `${market.name}: internalCash != balanceOf after repay`,
          );

          verified++;
          if (verified >= 3) break;
        }
        console.log(`        Repay verified on ${verified} markets`);
        expect(verified).to.be.gt(0, "Repay could not be verified on any market — all skipped due to borrow/repay failures or missing balance slots");
      });
    });

    // =====================================================================
    // 7. DONATION ATTACK BLOCKED — exchange rate immune
    // =====================================================================
    describe("Donation attack blocked after upgrade", () => {
      it("direct token transfer does NOT change exchange rate or getCash", async () => {
        let verified = 0;
        for (const market of upgradedMarkets) {
          const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
          const proxy = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

          const totalSupply = await proxy.totalSupply();
          const internalCash = await market.vToken.internalCash();
          if (totalSupply.isZero() || internalCash.isZero()) continue;

          const balanceSlot = await findBalanceSlot(market.underlying);
          if (balanceSlot === null) continue;

          const donationAmount = internalCash.div(10); // 10% of cash
          if (donationAmount.isZero()) continue;

          const internalCashPre = await market.vToken.internalCash();
          const getCashBefore = await proxy.getCash();

          // Attacker donates tokens directly (bypassing mint)
          const [attacker] = await ethers.getSigners();
          await setTokenBalance(market.underlying, attacker.address, donationAmount, balanceSlot);
          await underlying.connect(attacker).transfer(market.proxy, donationAmount);

          // getCash must NOT change — this is the core proof donation is blocked
          const getCashAfter = await proxy.getCash();
          expect(getCashAfter).to.equal(getCashBefore, `${market.name}: getCash changed after donation!`);

          // internalCash must NOT change
          const internalCashAfter = await market.vToken.internalCash();
          expect(internalCashAfter).to.equal(internalCashPre, `${market.name}: internalCash changed!`);

          // But actual balance did increase
          const actualBalance = await underlying.balanceOf(market.proxy);
          expect(actualBalance).to.be.gt(internalCashAfter, `${market.name}: no excess after donation`);

          verified++;
        }
        console.log(`        Donation blocked on ${verified} markets`);
        expect(verified).to.be.gt(0, "Donation attack could not be verified on any market — all skipped due to zero supply/cash or missing balance slots");
      });
    });

    // =====================================================================
    // 8. ACCRUE INTEREST WORKS
    // =====================================================================
    describe("Accrue Interest after upgrade", () => {
      it("accrueInterest succeeds on all upgraded markets", async () => {
        for (const market of upgradedMarkets) {
          const proxy = VBep20Delegator__factory.connect(market.proxy, timelock);
          await expect(proxy.accrueInterest()).to.not.be.reverted;
        }
      });
    });
    });
  });
}
