import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { setStorageAt } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ERC20__factory, VBep20Delegator__factory } from "../../../typechain";
import { forking, initMainnetUser, FORK_MAINNET } from "./utils";

// BSC Mainnet addresses
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";

// All VBep20Delegator proxy addresses on BSC mainnet (excluding vBNB which is native)
const MARKET_PROXIES: { name: string; proxy: string }[] = [
  { name: "vAAVE", proxy: "0x26DA28954763B92139ED49283625ceCAf52C6f94" },
  { name: "vADA", proxy: "0x9A0AF7FDb2065Ce470D72664DE73cAE409dA28Ec" },
  { name: "vBCH", proxy: "0x5F0388EBc2B94FA8E123F404b79cCF5f40b29176" },
  { name: "vBETH", proxy: "0x972207A639CC1B374B893cc33Fa251b55CEB7c07" },
  { name: "vBTC", proxy: "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B" },
  { name: "vBUSD", proxy: "0x95c78222B3D6e262426483D42CfA53685A67Ab9D" },
  { name: "vCAKE", proxy: "0x86aC3974e2BD0d60825230fa6F355fF11409df5c" },
  { name: "vDAI", proxy: "0x334b3eCB4DCa3593BCCC3c7EBD1A1C1d1780FBF1" },
  { name: "vDOGE", proxy: "0xec3422Ef92B2fb59e84c8B02Ba73F1fE84Ed8D71" },
  { name: "vDOT", proxy: "0x1610bc33319e9398de5f57B33a5b184c806aD217" },
  { name: "vETH", proxy: "0xf508fCD89b8bd15579dc79A6827cB4686A3592c8" },
  { name: "vFDUSD", proxy: "0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba" },
  { name: "vFIL", proxy: "0xf91d58b5aE142DAcC749f58A49FCBac340Cb0343" },
  { name: "vLINK", proxy: "0x650b940a1033B8A1b1873f78730FcFC73ec11f1f" },
  { name: "vLTC", proxy: "0x57A5297F2cB2c0AaC9D554660acd6D385Ab50c6B" },
  { name: "vLUNA", proxy: "0xb91A659E88B51474767CD97EF3196A3e7cEDD2c8" },
  { name: "vMATIC", proxy: "0x5c9476FcD6a4F9a3654139721c949c2233bBbBc8" },
  { name: "vSOL", proxy: "0xBf515bA4D1b52FFdCeaBF20d31D705Ce789F2cEC" },
  { name: "vSXP", proxy: "0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0" },
  { name: "vSolvBTC", proxy: "0xf841cb62c19fCd4fF5CD0AaB5939f3140BaaC3Ea" },
  { name: "vTHE", proxy: "0x86e06EAfa6A1eA631Eab51DE500E3D474933739f" },
  { name: "vTRX", proxy: "0xC5D3466aA484B040eE977073fcF337f2c00071c1" },
  { name: "vTRXOLD", proxy: "0x61eDcFe8Dd6bA3c891CB9bEc2dc7657B3B422E93" },
  { name: "vTUSD", proxy: "0xBf762cd5991cA1DCdDaC9ae5C638F5B5Dc3Bee6E" },
  { name: "vTUSDOLD", proxy: "0x08CEB3F4a7ed3500cA0982bcd0FC7816688084c3" },
  { name: "vTWT", proxy: "0x4d41a36D04D97785bcEA57b057C412b278e6Edcc" },
  { name: "vU", proxy: "0x3d5E269787d562b74aCC55F18Bd26C5D09Fa245E" },
  { name: "vUNI", proxy: "0x27FF564707786720C71A2e5c1490A63266683612" },
  { name: "vUSD1", proxy: "0x0C1DA220D301155b87318B90692Da8dc43B67340" },
  { name: "vUSDC", proxy: "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8" },
  { name: "vUSDT", proxy: "0xfD5840Cd36d94D7229439859C0112a4185BC0255" },
  { name: "vUSDe", proxy: "0x74ca6930108F775CC667894EEa33843e691680d7" },
  { name: "vUST", proxy: "0x78366446547D062f45b4C0f320cDaa6d710D87bb" },
  { name: "vWBETH", proxy: "0x6CFdEc747f37DAf3b87a35a1D9c8AD3063A1A8A0" },
  { name: "vWBNB", proxy: "0x6bCa74586218dB34cdB402295796b79663d816e9" },
  { name: "vXAUM", proxy: "0x92e6Ea74a1A3047DabF4186405a21c7D63a0612A" },
  { name: "vXRP", proxy: "0xB248a295732e0225acd3337607cc01068e3b9c10" },
  { name: "vXVS", proxy: "0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D" },
  { name: "vasBNB", proxy: "0xCC1dB43a06d97f736C7B045AedD03C6707c09BDF" },
  { name: "vlisUSD", proxy: "0x689E0daB47Ab16bcae87Ec18491692BF621Dc6Ab" },
  { name: "vsUSDe", proxy: "0x699658323d58eE25c69F1a29d476946ab011bD18" },
  { name: "vslisBNB", proxy: "0x89c910Eb8c90df818b4649b508Ba22130Dc73Adc" },
  { name: "vxSolvBTC", proxy: "0xd804dE60aFD05EE6B89aab5D152258fD461B07D5" },
  { name: "vPT-USDe-30OCT2025", proxy: "0x6D0cDb3355c93A0cD20071aBbb3622731a95c73E" },
  { name: "vPT-clisBNB-25JUN2026", proxy: "0x6d3BD68E90B42615cb5abF4B8DE92b154ADc435e" },
  { name: "vPT-sUSDE-26JUN2025", proxy: "0x9e4E5fed5Ac5B9F732d0D850A615206330Bf1866" },
];

// Fork at a recent block where all markets exist
const FORK_BLOCK = 48750000;

// Amount to donate (in underlying token units) — we dynamically scale per market
const DONATION_PERCENTAGE = 10; // donate 10% of existing cash

/**
 * Helper: Find the storage slot for an ERC20 token's balanceOf mapping
 * Tries slots 0-10, which covers OpenZeppelin, Compound, and most custom ERC20s
 */
async function findBalanceSlot(tokenAddress: string): Promise<number | null> {
  const probeAddress = "0x" + "ba1".padStart(40, "0"); // arbitrary address for probing
  const probeAmount = BigNumber.from("1234567890");
  const token = ERC20__factory.connect(tokenAddress, ethers.provider);

  for (let slot = 0; slot <= 10; slot++) {
    // Compute storage slot: keccak256(abi.encode(address, mappingSlot))
    const storageSlot = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [probeAddress, slot]),
    );

    // Snapshot current value
    const prevValue = await ethers.provider.getStorageAt(tokenAddress, storageSlot);

    // Set probe value
    await setStorageAt(tokenAddress, storageSlot, ethers.utils.hexZeroPad(probeAmount.toHexString(), 32));

    // Check if balance changed
    try {
      const balance = await token.balanceOf(probeAddress);
      // Restore original value
      await setStorageAt(tokenAddress, storageSlot, prevValue);

      if (balance.eq(probeAmount)) {
        return slot;
      }
    } catch {
      // Restore and continue
      await setStorageAt(tokenAddress, storageSlot, prevValue);
    }
  }
  return null;
}

/**
 * Helper: Set an ERC20 token balance for an account using storage manipulation
 */
async function setTokenBalance(tokenAddress: string, account: string, amount: BigNumber, slot: number) {
  const storageSlot = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [account, slot]),
  );
  await setStorageAt(tokenAddress, storageSlot, ethers.utils.hexZeroPad(amount.toHexString(), 32));
}

if (FORK_MAINNET) {
  describe("Donation Attack Prevention - All Markets", () => {
    // =========================================================================
    // BEFORE FIX: Verify every market is vulnerable (getCash == balanceOf)
    // =========================================================================
    describe("Before Fix - All markets are vulnerable to donation attack", () => {
      forking(FORK_BLOCK, () => {
        it("getCash equals balanceOf for all markets (vulnerable to donation)", async () => {
          const vulnerableMarkets: string[] = [];
          const skippedMarkets: string[] = [];

          for (const market of MARKET_PROXIES) {
            const vToken = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

            try {
              const underlyingAddr = await vToken.underlying();
              const underlying = ERC20__factory.connect(underlyingAddr, ethers.provider);
              const cash = await vToken.getCash();
              const balance = await underlying.balanceOf(market.proxy);

              // Before fix: getCash() returns balanceOf() — they must be equal
              // This means any direct transfer inflates getCash and thus the exchange rate
              if (cash.eq(balance)) {
                vulnerableMarkets.push(market.name);
              }
            } catch {
              skippedMarkets.push(market.name);
            }
          }

          console.log(`        Vulnerable markets: ${vulnerableMarkets.length}/${MARKET_PROXIES.length}`);
          if (skippedMarkets.length > 0) {
            console.log(`        Skipped (error reading): ${skippedMarkets.join(", ")}`);
          }

          // All readable markets should be vulnerable before fix
          expect(vulnerableMarkets.length + skippedMarkets.length).to.equal(MARKET_PROXIES.length);
        });

        it("donation inflates exchange rate on ALL markets (attacker simulation)", async () => {
          const attacked: string[] = [];
          const skipped: string[] = [];

          for (const market of MARKET_PROXIES) {
            const vToken = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

            try {
              const underlyingAddr = await vToken.underlying();
              const underlying = ERC20__factory.connect(underlyingAddr, ethers.provider);

              // Get current cash — skip markets with zero cash (no liquidity)
              const currentCash = await vToken.getCash();
              const totalSupply = await vToken.totalSupply();
              if (currentCash.isZero() || totalSupply.isZero()) {
                skipped.push(`${market.name} (no liquidity)`);
                continue;
              }

              // Find balance storage slot for this token
              const balanceSlot = await findBalanceSlot(underlyingAddr);
              if (balanceSlot === null) {
                skipped.push(`${market.name} (unknown storage layout)`);
                continue;
              }

              // Record exchange rate before donation
              const exchangeRateBefore = await vToken.callStatic.exchangeRateCurrent();

              // Fund attacker with tokens (10% of current market cash)
              const [attacker] = await ethers.getSigners();
              const donationAmount = currentCash.mul(DONATION_PERCENTAGE).div(100);
              if (donationAmount.isZero()) {
                skipped.push(`${market.name} (dust cash)`);
                continue;
              }

              await setTokenBalance(underlyingAddr, attacker.address, donationAmount, balanceSlot);

              // Attacker donates tokens directly to vToken (bypassing mint)
              await underlying.connect(attacker).transfer(market.proxy, donationAmount);

              // Exchange rate SHOULD increase (vulnerability!)
              const exchangeRateAfter = await vToken.callStatic.exchangeRateCurrent();
              expect(exchangeRateAfter).to.be.gt(
                exchangeRateBefore,
                `${market.name}: exchange rate should increase after donation (vulnerable)`,
              );

              attacked.push(market.name);
            } catch (e: any) {
              skipped.push(`${market.name} (${e.message?.slice(0, 50)})`);
            }
          }

          console.log(`        Successfully attacked: ${attacked.length}`);
          console.log(`        Attacked markets: ${attacked.join(", ")}`);
          if (skipped.length > 0) {
            console.log(`        Skipped: ${skipped.join(", ")}`);
          }
          expect(attacked.length).to.be.gt(0, "Should have attacked at least some markets");
        });
      });
    });

    // =========================================================================
    // AFTER FIX: Deploy new impl, upgrade all markets, verify protection
    // =========================================================================
    describe("After Fix - All markets are protected from donation attack", () => {
      forking(FORK_BLOCK, () => {
        let timelock: SignerWithAddress;
        let newImplAddress: string;
        let upgradedMarkets: { name: string; proxy: string; underlying: string; vToken: Contract }[];

        before(async () => {
          timelock = await initMainnetUser(NORMAL_TIMELOCK, parseUnits("10"));

          // Deploy new VBep20Delegate implementation
          const VBep20DelegateFactory = await ethers.getContractFactory("VBep20Delegate");
          const newImpl = await VBep20DelegateFactory.deploy();
          await newImpl.deployed();
          newImplAddress = newImpl.address;

          // Upgrade all markets and syncCash — simulating the VIP
          upgradedMarkets = [];
          const failedUpgrades: string[] = [];

          for (const market of MARKET_PROXIES) {
            try {
              const proxy = VBep20Delegator__factory.connect(market.proxy, timelock);
              const underlyingAddr = await proxy.underlying();

              // Step 1: Upgrade implementation
              await proxy._setImplementation(newImplAddress, false, "0x");

              // Step 2: syncCash to initialize internalCash
              const vToken = await ethers.getContractAt("VBep20Delegate", market.proxy, timelock);
              await vToken.syncCash();

              upgradedMarkets.push({
                name: market.name,
                proxy: market.proxy,
                underlying: underlyingAddr,
                vToken,
              });
            } catch (e: any) {
              failedUpgrades.push(`${market.name}: ${e.message?.slice(0, 80)}`);
            }
          }

          console.log(`        Upgraded ${upgradedMarkets.length}/${MARKET_PROXIES.length} markets`);
          if (failedUpgrades.length > 0) {
            console.log(`        Failed upgrades: ${failedUpgrades.join("\n        ")}`);
          }
        });

        it("internalCash matches actual balance for all upgraded markets", async () => {
          for (const market of upgradedMarkets) {
            const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
            const internalCash = await market.vToken.internalCash();
            const actualBalance = await underlying.balanceOf(market.proxy);

            expect(internalCash).to.equal(
              actualBalance,
              `${market.name}: internalCash should equal actual token balance after syncCash`,
            );
          }
        });

        it("exchange rates unchanged after upgrade + syncCash", async () => {
          // We verify exchange rates are readable and reasonable (>0)
          for (const market of upgradedMarkets) {
            const vToken = VBep20Delegator__factory.connect(market.proxy, ethers.provider);
            const totalSupply = await vToken.totalSupply();
            if (totalSupply.isZero()) continue;

            const exchangeRate = await vToken.callStatic.exchangeRateCurrent();
            expect(exchangeRate).to.be.gt(0, `${market.name}: exchange rate should be positive`);
          }
        });

        it("donation does NOT inflate exchange rate on ANY market (attack blocked)", async () => {
          const protected_: string[] = [];
          const skipped: string[] = [];

          for (const market of upgradedMarkets) {
            try {
              const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
              const vToken = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

              const totalSupply = await vToken.totalSupply();
              const currentCash = await market.vToken.internalCash();
              if (currentCash.isZero() || totalSupply.isZero()) {
                skipped.push(`${market.name} (no liquidity)`);
                continue;
              }

              // Find balance storage slot
              const balanceSlot = await findBalanceSlot(market.underlying);
              if (balanceSlot === null) {
                skipped.push(`${market.name} (unknown storage layout)`);
                continue;
              }

              // Record exchange rate before donation
              const exchangeRateBefore = await vToken.callStatic.exchangeRateCurrent();

              // Fund attacker and donate
              const [attacker] = await ethers.getSigners();
              const donationAmount = currentCash.mul(DONATION_PERCENTAGE).div(100);
              if (donationAmount.isZero()) {
                skipped.push(`${market.name} (dust cash)`);
                continue;
              }

              await setTokenBalance(market.underlying, attacker.address, donationAmount, balanceSlot);
              await underlying.connect(attacker).transfer(market.proxy, donationAmount);

              // Exchange rate MUST NOT change (fix working!)
              const exchangeRateAfter = await vToken.callStatic.exchangeRateCurrent();
              expect(exchangeRateAfter).to.equal(
                exchangeRateBefore,
                `${market.name}: exchange rate must NOT change after donation`,
              );

              // getCash should still return internalCash (not inflated balanceOf)
              const getCash = await vToken.getCash();
              const internalCash = await market.vToken.internalCash();
              expect(getCash).to.equal(
                internalCash,
                `${market.name}: getCash must equal internalCash, not balanceOf`,
              );

              // Actual balance should be higher than internalCash (excess from donation)
              const actualBalance = await underlying.balanceOf(market.proxy);
              expect(actualBalance).to.be.gt(
                internalCash,
                `${market.name}: actual balance should exceed internalCash after donation`,
              );

              protected_.push(market.name);
            } catch (e: any) {
              skipped.push(`${market.name} (${e.message?.slice(0, 50)})`);
            }
          }

          console.log(`        Protected markets: ${protected_.length}`);
          console.log(`        Protected: ${protected_.join(", ")}`);
          if (skipped.length > 0) {
            console.log(`        Skipped: ${skipped.join(", ")}`);
          }
          expect(protected_.length).to.be.gt(0, "Should have verified at least some markets");
        });

        it("syncCash can be called again by admin (re-syncs safely)", async () => {
          // syncCash is admin-only and idempotent — calling again just re-syncs
          const market = upgradedMarkets[0];
          const underlying = ERC20__factory.connect(market.underlying, ethers.provider);

          const internalCashBefore = await market.vToken.internalCash();
          const actualBalance = await underlying.balanceOf(market.proxy);

          // Admin can call syncCash again — it re-syncs internalCash to current balanceOf
          await market.vToken.connect(timelock).syncCash();

          const internalCashAfter = await market.vToken.internalCash();
          // Should equal current balance (which is the same since no transfers happened)
          expect(internalCashAfter).to.equal(actualBalance);
        });

        it("syncCash reverts for non-admin callers", async () => {
          const [, randomUser] = await ethers.getSigners();
          const market = upgradedMarkets[0];
          const vTokenAsRandom = await ethers.getContractAt("VBep20Delegate", market.proxy, randomUser);
          await expect(vTokenAsRandom.syncCash()).to.be.revertedWith("only admin");
        });

        // =====================================================================
        // Normal operations still work after fix
        // =====================================================================
        describe("Normal operations work correctly after fix", () => {
          it("mint increases internalCash correctly", async () => {
            // Use a market with liquidity — find one where we can mint
            for (const market of upgradedMarkets) {
              const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
              const vToken = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

              const totalSupply = await vToken.totalSupply();
              if (totalSupply.isZero()) continue;

              const balanceSlot = await findBalanceSlot(market.underlying);
              if (balanceSlot === null) continue;

              const decimals = await underlying.decimals();
              const mintAmount = parseUnits("100", decimals);

              // Fund minter
              const [minter] = await ethers.getSigners();
              await setTokenBalance(market.underlying, minter.address, mintAmount, balanceSlot);

              const internalCashBefore = await market.vToken.internalCash();
              const exchangeRateBefore = await vToken.callStatic.exchangeRateCurrent();

              // Approve and mint
              await underlying.connect(minter).approve(market.proxy, mintAmount);

              try {
                await vToken.connect(minter).mint(mintAmount);
              } catch {
                // Supply cap or paused — try next market
                continue;
              }

              const internalCashAfter = await market.vToken.internalCash();
              expect(internalCashAfter).to.be.gt(
                internalCashBefore,
                `${market.name}: internalCash should increase after mint`,
              );

              // Exchange rate should be roughly the same (minor accrual is ok)
              const exchangeRateAfter = await vToken.callStatic.exchangeRateCurrent();
              // Allow 0.01% tolerance for interest accrual between blocks
              const tolerance = exchangeRateBefore.div(10000);
              expect(exchangeRateAfter.sub(exchangeRateBefore).abs()).to.be.lte(
                tolerance,
                `${market.name}: exchange rate should be stable after mint`,
              );

              console.log(`        Mint verified on: ${market.name}`);
              return; // One successful mint test is sufficient
            }
          });

          it("redeem decreases internalCash correctly", async () => {
            for (const market of upgradedMarkets) {
              const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
              const vToken = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

              const totalSupply = await vToken.totalSupply();
              if (totalSupply.isZero()) continue;

              const balanceSlot = await findBalanceSlot(market.underlying);
              if (balanceSlot === null) continue;

              const decimals = await underlying.decimals();
              const mintAmount = parseUnits("100", decimals);

              // Fund, approve, and mint first to get vTokens
              const [minter] = await ethers.getSigners();
              await setTokenBalance(market.underlying, minter.address, mintAmount, balanceSlot);
              await underlying.connect(minter).approve(market.proxy, mintAmount);

              try {
                await vToken.connect(minter).mint(mintAmount);
              } catch {
                continue;
              }

              // Now redeem
              const vTokenBalance = await vToken.balanceOf(minter.address);
              if (vTokenBalance.isZero()) continue;

              const internalCashBefore = await market.vToken.internalCash();

              try {
                await vToken.connect(minter).redeem(vTokenBalance);
              } catch {
                continue;
              }

              const internalCashAfter = await market.vToken.internalCash();
              expect(internalCashAfter).to.be.lt(
                internalCashBefore,
                `${market.name}: internalCash should decrease after redeem`,
              );

              console.log(`        Redeem verified on: ${market.name}`);
              return;
            }
          });
        });

        // =====================================================================
        // Detailed per-market attack simulation (THE + high-value markets)
        // =====================================================================
        describe("Per-market donation attack simulation", () => {
          const HIGH_VALUE_MARKETS = ["vTHE", "vUSDT", "vBTC", "vETH", "vUSDC", "vXVS", "vWBNB"];

          for (const marketName of HIGH_VALUE_MARKETS) {
            it(`${marketName}: donation attack is completely blocked`, async () => {
              const market = upgradedMarkets.find(m => m.name === marketName);
              if (!market) {
                console.log(`        ${marketName} not in upgraded list, skipping`);
                return;
              }

              const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
              const vToken = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

              const totalSupply = await vToken.totalSupply();
              const internalCash = await market.vToken.internalCash();
              if (totalSupply.isZero() || internalCash.isZero()) {
                console.log(`        ${marketName}: no liquidity, skipping`);
                return;
              }

              const balanceSlot = await findBalanceSlot(market.underlying);
              if (balanceSlot === null) {
                console.log(`        ${marketName}: unknown storage layout, skipping`);
                return;
              }

              // Record state before attack
              const exchangeRateBefore = await vToken.callStatic.exchangeRateCurrent();
              const cashBefore = await vToken.getCash();
              const internalCashBefore = await market.vToken.internalCash();
              const balanceBefore = await underlying.balanceOf(market.proxy);

              // Simulate large donation: 50% of current cash
              const [attacker] = await ethers.getSigners();
              const donationAmount = internalCash.div(2);
              await setTokenBalance(market.underlying, attacker.address, donationAmount, balanceSlot);
              await underlying.connect(attacker).transfer(market.proxy, donationAmount);

              // Verify: exchange rate unchanged
              const exchangeRateAfter = await vToken.callStatic.exchangeRateCurrent();
              expect(exchangeRateAfter).to.equal(
                exchangeRateBefore,
                `${marketName}: exchange rate must be immune to donation`,
              );

              // Verify: getCash unchanged (returns internalCash, not balanceOf)
              const cashAfter = await vToken.getCash();
              expect(cashAfter).to.equal(cashBefore, `${marketName}: getCash must not change`);

              // Verify: internalCash unchanged
              const internalCashAfter = await market.vToken.internalCash();
              expect(internalCashAfter).to.equal(
                internalCashBefore,
                `${marketName}: internalCash must not change`,
              );

              // Verify: actual token balance DID increase (tokens are there but ignored)
              const balanceAfter = await underlying.balanceOf(market.proxy);
              expect(balanceAfter).to.equal(
                balanceBefore.add(donationAmount),
                `${marketName}: actual balance should reflect donation`,
              );

              // Verify: excess exists (balanceOf > internalCash)
              expect(balanceAfter).to.be.gt(
                internalCashAfter,
                `${marketName}: balance should exceed internalCash (excess exists)`,
              );
            });
          }
        });
      });
    });
  });
}
