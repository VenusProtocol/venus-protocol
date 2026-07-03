import { setStorageAt } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { ERC20__factory, VBep20Delegator__factory } from "../../../typechain";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

// BSC Mainnet addresses
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const ATTACK_BLOCK = 86731940;

// Listed VBep20 markets on BSC mainnet core pool (excluding vBNB which is native)
// Generated via: npx hardhat run scripts/listMarkets.ts --network bscmainnet
const LISTED_MARKETS: { name: string; proxy: string }[] = [
  { name: "vUSDC", proxy: "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8" },
  { name: "vUSDT", proxy: "0xfD5840Cd36d94D7229439859C0112a4185BC0255" },
  { name: "vBUSD", proxy: "0x95c78222B3D6e262426483D42CfA53685A67Ab9D" },
  { name: "vSXP", proxy: "0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0" },
  { name: "vXVS", proxy: "0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D" },
  { name: "vBTC", proxy: "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B" },
  { name: "vETH", proxy: "0xf508fCD89b8bd15579dc79A6827cB4686A3592c8" },
  { name: "vLTC", proxy: "0x57A5297F2cB2c0AaC9D554660acd6D385Ab50c6B" },
  { name: "vXRP", proxy: "0xB248a295732e0225acd3337607cc01068e3b9c10" },
  { name: "vBCH", proxy: "0x5F0388EBc2B94FA8E123F404b79cCF5f40b29176" },
  { name: "vDOT", proxy: "0x1610bc33319e9398de5f57B33a5b184c806aD217" },
  { name: "vLINK", proxy: "0x650b940a1033B8A1b1873f78730FcFC73ec11f1f" },
  { name: "vDAI", proxy: "0x334b3eCB4DCa3593BCCC3c7EBD1A1C1d1780FBF1" },
  { name: "vFIL", proxy: "0xf91d58b5aE142DAcC749f58A49FCBac340Cb0343" },
  { name: "vBETH", proxy: "0x972207A639CC1B374B893cc33Fa251b55CEB7c07" },
  { name: "vADA", proxy: "0x9A0AF7FDb2065Ce470D72664DE73cAE409dA28Ec" },
  { name: "vDOGE", proxy: "0xec3422Ef92B2fb59e84c8B02Ba73F1fE84Ed8D71" },
  { name: "vMATIC", proxy: "0x5c9476FcD6a4F9a3654139721c949c2233bBbBc8" },
  { name: "vCAKE", proxy: "0x86aC3974e2BD0d60825230fa6F355fF11409df5c" },
  { name: "vAAVE", proxy: "0x26DA28954763B92139ED49283625ceCAf52C6f94" },
  { name: "vTUSDOLD", proxy: "0x08CEB3F4a7ed3500cA0982bcd0FC7816688084c3" },
  { name: "vTRXOLD", proxy: "0x61eDcFe8Dd6bA3c891CB9bEc2dc7657B3B422E93" },
  { name: "vTRX", proxy: "0xC5D3466aA484B040eE977073fcF337f2c00071c1" },
  { name: "vWBETH", proxy: "0x6CFdEc747f37DAf3b87a35a1D9c8AD3063A1A8A0" },
  { name: "vTUSD", proxy: "0xBf762cd5991cA1DCdDaC9ae5C638F5B5Dc3Bee6E" },
  { name: "vUNI", proxy: "0x27FF564707786720C71A2e5c1490A63266683612" },
  { name: "vFDUSD", proxy: "0xC4eF4229FEc74Ccfe17B2bdeF7715fAC740BA0ba" },
  { name: "vTWT", proxy: "0x4d41a36D04D97785bcEA57b057C412b278e6Edcc" },
  { name: "vSolvBTC", proxy: "0xf841cb62c19fCd4fF5CD0AaB5939f3140BaaC3Ea" },
  { name: "vTHE", proxy: "0x86e06EAfa6A1eA631Eab51DE500E3D474933739f" },
  { name: "vSOL", proxy: "0xBf515bA4D1b52FFdCeaBF20d31D705Ce789F2cEC" },
  { name: "vlisUSD", proxy: "0x689E0daB47Ab16bcae87Ec18491692BF621Dc6Ab" },
  { name: "vPT-sUSDE-26JUN2025", proxy: "0x9e4E5fed5Ac5B9F732d0D850A615206330Bf1866" },
  { name: "vsUSDe", proxy: "0x699658323d58eE25c69F1a29d476946ab011bD18" },
  { name: "vUSDe", proxy: "0x74ca6930108F775CC667894EEa33843e691680d7" },
  { name: "vUSD1", proxy: "0x0C1DA220D301155b87318B90692Da8dc43B67340" },
  { name: "vxSolvBTC", proxy: "0xd804dE60aFD05EE6B89aab5D152258fD461B07D5" },
  { name: "vasBNB", proxy: "0xCC1dB43a06d97f736C7B045AedD03C6707c09BDF" },
  { name: "vWBNB", proxy: "0x6bCa74586218dB34cdB402295796b79663d816e9" },
  { name: "vslisBNB", proxy: "0x89c910Eb8c90df818b4649b508Ba22130Dc73Adc" },
  { name: "vU", proxy: "0x3d5E269787d562b74aCC55F18Bd26C5D09Fa245E" },
  { name: "vPT-clisBNB-25JUN2026", proxy: "0x6d3BD68E90B42615cb5abF4B8DE92b154ADc435e" },
  { name: "vXAUM", proxy: "0x92e6Ea74a1A3047DabF4186405a21c7D63a0612A" },
];

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

if (FORK_MAINNET) {
  describe("Donation Attack Prevention", () => {
    forking(ATTACK_BLOCK, () => {
      describe("Before upgrade: donation attack succeeds on all markets", () => {
        let topSnapshotId: string;

        before(async () => {
          topSnapshotId = await ethers.provider.send("evm_snapshot", []);
          // Advance the same number of blocks as the upgrade path so accrueInterest
          // produces identical rates: 3 blocks (initMainnetUser + deploy) + 1 per market
          await ethers.provider.send("hardhat_mine", ["0x" + (3 + LISTED_MARKETS.length).toString(16)]);
        });

        after(async () => {
          await ethers.provider.send("evm_revert", [topSnapshotId]);
        });

        it("direct token transfer inflates exchange rate on all markets", async () => {
          const [attacker] = await ethers.getSigners();
          let attacked = 0;

          for (const market of LISTED_MARKETS) {
            const snapshotId = await ethers.provider.send("evm_snapshot", []);

            try {
              const vToken = VBep20Delegator__factory.connect(market.proxy, attacker);
              const underlyingAddr = await vToken.underlying();
              const underlying = ERC20__factory.connect(underlyingAddr, ethers.provider);

              const totalSupply = await vToken.totalSupply();
              const cash = await underlying.balanceOf(market.proxy);
              if (totalSupply.isZero() || cash.isZero()) {
                await ethers.provider.send("evm_revert", [snapshotId]);
                continue;
              }

              const balanceSlot = await findBalanceSlot(underlyingAddr);
              if (balanceSlot === null) {
                await ethers.provider.send("evm_revert", [snapshotId]);
                continue;
              }

              // Checkpoint interest so exchangeRateStored is up-to-date
              await vToken.accrueInterest();

              const exchangeRateBefore = await vToken.exchangeRateStored();

              // Donate 50% of current cash directly to the vToken
              const donationAmount = cash.div(2);
              await setTokenBalance(underlyingAddr, attacker.address, donationAmount, balanceSlot);
              await underlying.connect(attacker).transfer(market.proxy, donationAmount);

              const exchangeRateAfter = await vToken.exchangeRateStored();

              // Before upgrade: getCash uses balanceOf, so donation inflates exchange rate
              expect(exchangeRateAfter).to.be.gt(
                exchangeRateBefore as any,
                `${market.name}: exchange rate should increase after donation (vulnerable)`,
              );

              console.log(
                `      \u2713 ${market.name}: donation attack succeeded — rate ${exchangeRateBefore} → ${exchangeRateAfter}`,
              );

              attacked++;
            } catch {
              // Skip markets whose underlying token reverts (e.g. non-standard ERC20)
              console.log(`      - ${market.name}: skipped (underlying reverts)`);
            }

            await ethers.provider.send("evm_revert", [snapshotId]);
          }

          expect(attacked).to.be.gt(0, "Should have attacked at least one market");
          console.log(`      Total markets attacked: ${attacked}/${LISTED_MARKETS.length}`);
        });
      });

      describe("After upgrade: donation attack fails on all markets", () => {
        let timelock: SignerWithAddress;
        let upgradedMarkets: { name: string; proxy: string; underlying: string; vToken: Contract }[];

        before(async () => {
          timelock = await initMainnetUser(NORMAL_TIMELOCK, parseUnits("10"));

          const VBep20DelegateFactory = await ethers.getContractFactory("VBep20Delegate");
          const newImpl = await VBep20DelegateFactory.deploy();
          await newImpl.deployed();

          // Batch each market's setImpl + sweepTokenAndSync into a single block
          // to minimise block advancement (accrueInterest uses block.number)
          await ethers.provider.send("evm_setAutomine", [false]);

          upgradedMarkets = [];
          for (const market of LISTED_MARKETS) {
            const proxy = VBep20Delegator__factory.connect(market.proxy, timelock);
            const underlyingAddr = await proxy.underlying();

            await proxy._setImplementation(newImpl.address, false, "0x");
            const vToken = await ethers.getContractAt("VBep20Delegate", market.proxy, timelock);
            await vToken.sweepTokenAndSync(0);

            // Mine both txs in one block
            await ethers.provider.send("evm_mine", []);

            upgradedMarkets.push({ name: market.name, proxy: market.proxy, underlying: underlyingAddr, vToken });
          }

          await ethers.provider.send("evm_setAutomine", [true]);

          expect(upgradedMarkets.length).to.equal(LISTED_MARKETS.length);
        });

        describe("sweepTokenAndSync", () => {
          it("internalCash matches actual balance for all markets", async () => {
            for (const market of upgradedMarkets) {
              const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
              const internalCash = await market.vToken.internalCash();
              const actualBalance = await underlying.balanceOf(market.proxy);

              expect(internalCash).to.equal(actualBalance, `${market.name}: internalCash should equal actual balance`);
            }
          });

          it("is idempotent when called again by admin", async () => {
            const market = upgradedMarkets[0];
            const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
            const balanceBefore = await underlying.balanceOf(market.proxy);

            await market.vToken.connect(timelock).sweepTokenAndSync(0);

            const internalCashAfter = await market.vToken.internalCash();
            expect(internalCashAfter).to.equal(balanceBefore);
          });

          it("reverts for non-admin callers", async () => {
            const [, randomUser] = await ethers.getSigners();
            const vToken = await ethers.getContractAt("VBep20Delegate", upgradedMarkets[0].proxy, randomUser);
            await expect(vToken.sweepTokenAndSync(0)).to.be.rejectedWith("");
          });
        });

        describe("exchange rates", () => {
          it("remain valid after upgrade + sweepTokenAndSync", async () => {
            for (const market of upgradedMarkets) {
              const vToken = VBep20Delegator__factory.connect(market.proxy, ethers.provider);
              const totalSupply = await vToken.totalSupply();
              if (totalSupply.isZero()) continue;

              const exchangeRate = await vToken.callStatic.exchangeRateCurrent();
              expect(exchangeRate).to.be.gt(0, `${market.name}: exchange rate should be positive`);
            }
          });
        });

        describe("donation attack", () => {
          it("exchange rate is immune to direct token transfer on all markets", async () => {
            const [attacker] = await ethers.getSigners();
            let tested = 0;

            for (const market of upgradedMarkets) {
              const snapshotId = await ethers.provider.send("evm_snapshot", []);

              const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
              const vToken = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

              const totalSupply = await vToken.totalSupply();
              const internalCash = await market.vToken.internalCash();
              if (totalSupply.isZero() || internalCash.isZero()) {
                await ethers.provider.send("evm_revert", [snapshotId]);
                continue;
              }

              const balanceSlot = await findBalanceSlot(market.underlying);
              if (balanceSlot === null) {
                await ethers.provider.send("evm_revert", [snapshotId]);
                continue;
              }

              // Checkpoint interest so exchangeRateStored is up-to-date
              await vToken.connect(attacker).accrueInterest();

              const exchangeRateBefore = await vToken.exchangeRateStored();
              const cashBefore = await vToken.getCash();
              const internalCashBefore = await market.vToken.internalCash();

              // Donate 50% of current cash directly to the vToken
              const donationAmount = internalCash.div(2);
              await setTokenBalance(market.underlying, attacker.address, donationAmount, balanceSlot);
              await underlying.connect(attacker).transfer(market.proxy, donationAmount);

              // Exchange rate, getCash, and internalCash must all be unchanged
              const exchangeRateAfter = await vToken.exchangeRateStored();
              expect(exchangeRateAfter).to.equal(exchangeRateBefore, `${market.name}: exchange rate changed`);
              expect(await vToken.getCash()).to.equal(cashBefore, `${market.name}: getCash changed`);
              expect(await market.vToken.internalCash()).to.equal(
                internalCashBefore,
                `${market.name}: internalCash changed`,
              );

              // Actual balance increased (tokens are there but ignored)
              const balanceAfter = await underlying.balanceOf(market.proxy);
              expect(balanceAfter).to.be.gt(internalCashBefore as any, `${market.name}: excess should exist`);

              console.log(
                `      \u2713 ${market.name}: donation attack blocked — expected: ${exchangeRateBefore}, got: ${exchangeRateAfter}`,
              );

              tested++;
              await ethers.provider.send("evm_revert", [snapshotId]);
            }

            expect(tested).to.be.gt(0, "Should have tested at least one market");
            console.log(`      Total markets protected: ${tested}/${upgradedMarkets.length}`);
          });
        });

        describe("normal operations", () => {
          let snapshotId: string;

          beforeEach(async () => {
            snapshotId = await ethers.provider.send("evm_snapshot", []);
          });

          afterEach(async () => {
            await ethers.provider.send("evm_revert", [snapshotId]);
          });

          it("mint increases internalCash", async () => {
            for (const market of upgradedMarkets) {
              const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
              const vToken = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

              const totalSupply = await vToken.totalSupply();
              if (totalSupply.isZero()) continue;

              const balanceSlot = await findBalanceSlot(market.underlying);
              if (balanceSlot === null) continue;

              const decimals = await underlying.decimals();
              const mintAmount = parseUnits("100", decimals);
              const [minter] = await ethers.getSigners();
              await setTokenBalance(market.underlying, minter.address, mintAmount, balanceSlot);

              const internalCashBefore = await market.vToken.internalCash();

              await underlying.connect(minter).approve(market.proxy, mintAmount);
              try {
                await vToken.connect(minter).mint(mintAmount);
              } catch {
                continue; // supply cap or paused
              }

              const internalCashAfter = await market.vToken.internalCash();
              expect(internalCashAfter).to.be.gt(
                internalCashBefore as any,
                `${market.name}: internalCash should increase`,
              );
              return;
            }
          });

          it("redeem decreases internalCash", async () => {
            for (const market of upgradedMarkets) {
              const underlying = ERC20__factory.connect(market.underlying, ethers.provider);
              const vToken = VBep20Delegator__factory.connect(market.proxy, ethers.provider);

              const totalSupply = await vToken.totalSupply();
              if (totalSupply.isZero()) continue;

              const balanceSlot = await findBalanceSlot(market.underlying);
              if (balanceSlot === null) continue;

              const decimals = await underlying.decimals();
              const mintAmount = parseUnits("100", decimals);
              const [minter] = await ethers.getSigners();
              await setTokenBalance(market.underlying, minter.address, mintAmount, balanceSlot);
              await underlying.connect(minter).approve(market.proxy, mintAmount);

              try {
                await vToken.connect(minter).mint(mintAmount);
              } catch {
                continue;
              }

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
                internalCashBefore as any,
                `${market.name}: internalCash should decrease`,
              );
              return;
            }
          });
        });
      });
    });
  });
}
