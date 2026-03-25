import { setStorageAt } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { ERC20__factory, VBep20Delegator__factory } from "../../../typechain";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

// ──────────────────────────────────────────────────────────
// Constants (must match BadDebtHelper.sol)
// ──────────────────────────────────────────────────────────
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const THE_TARGET_RECEIVER = "0x5e7BB1F600e42bc227755527895a282f782555ec";
const FORK_BLOCK = 88643545; // Update to a recent BSC mainnet block

// vTokens
const V_THE = "0x86e06EAfa6A1eA631Eab51DE500E3D474933739f";
const V_BNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";

// THE underlying
const THE = "0xF4C8E32EaDEC4BFe97E0F595AdD0f4450a863a11";

// ──────────────────────────────────────────────────────────
// Borrower accounts
// ──────────────────────────────────────────────────────────
const ACCOUNT_1 = "0x1A35bD28EFD46CfC46c2136f878777D69ae16231";
const ACCOUNT_3 = "0x489A8756C18C0b8B24EC2a2b9FF3D4d447F79BEc";
const ACCOUNT_4 = "0x448ca4Bc5e3407Ce67bC9D7185cEf5B34C3ADEf8";
const ACCOUNT_5 = "0x85ca0Dff027102ea3FBF1c077524eab21D1F7927";
const ACCOUNT_6 = "0xdDBF9868D960FD2433BA762FAf46024881cd9916";
const ACCOUNT_8 = "0x1dc0F176519Ec89adc2fa16d0fb1163AFD617C9C";
const ACCOUNT_14 = "0xd4842aD6e4B96DE9c250857f0822897C5B283D0D";
const ACCOUNT_15 = "0x73b6a7A6E39A2E405087164d7F407A0Bd2c86dcc";
const ACCOUNT_16 = "0x2ee9D239DF727454D2BdF76AeA18F1c51aA196Cc";
const ACCOUNT_17 = "0xd7b67276FC0ef1079331494139F40Fa3632d6125";
const ACCOUNT_18 = "0x10e086957b9a5c0073f582AeEaDAed7C37f8df9d";
const ACCOUNT_19 = "0x9454f17a6BcC36CFBC8A07011B33DaFCebE4050b";
const ACCOUNT_20 = "0x0cEEDe04b0350e5251BA8919E131d60e3e063618";
const ACCOUNT_21 = "0xbb81DA9040B0Ea33D56Cf29a688856b40A7B400c";
const ACCOUNT_22 = "0xF942e8436918163590ec858279233A6f7EfCCd94";
const ACCOUNT_23 = "0xe73d283293Efe2d9225825Bc7a382F7008244c2B";
const ACCOUNT_24 = "0xc234723994B035CE916e8A02878163046Bc0940c";
const ACCOUNT_25 = "0xB71D994B57594D9A61be011cFcf901E4aa36788F";
const ACCOUNT_26 = "0x716Bab7286bE25CcE2Deb36e892056F4b4Ad07c9";
const ACCOUNT_27 = "0x770F97E8562EB40a181151587C2e473A604a18F6";

// THE borrowers
const THE_BORROWERS = [
  "0x737bc98F1D34E19539C074B8Ad1169d5d45dA619",
  "0x85ca0Dff027102ea3FBF1c077524eab21D1F7927",
  "0xA72e1756426100c6207421471449E2Ba9A917e86",
  "0x9958Ed7f2441c208821Ea14643224812A006D221",
  "0x6Efee96287B5e1a2Ef966E25baE15a54BDE9b83E",
  "0x2C58D31559d65242cF7915A4Fd89fCAB9c96F7dF",
  "0xDff9E1B12dFb7103231128940A19c2896f049de8",
  "0xA87f0d31846211Ce417128a770C681fC342D3a74",
];

// ──────────────────────────────────────────────────────────
// BEP20 market data: { underlying, vToken, borrowers }
// ──────────────────────────────────────────────────────────
interface MarketData {
  name: string;
  underlying: string;
  vToken: string;
  borrowers: string[];
}

const BEP20_MARKETS: MarketData[] = [
  {
    name: "ETH",
    underlying: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    vToken: "0xf508fCD89b8bd15579dc79A6827cB4686A3592c8",
    borrowers: [ACCOUNT_3, ACCOUNT_6, ACCOUNT_15, ACCOUNT_23],
  },
  {
    name: "USDT",
    underlying: "0x55d398326f99059fF775485246999027B3197955",
    vToken: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
    borrowers: [ACCOUNT_3, ACCOUNT_5, ACCOUNT_8, ACCOUNT_14, ACCOUNT_18, ACCOUNT_26],
  },
  {
    name: "WBNB",
    underlying: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    vToken: "0x6bCa74586218dB34cdB402295796b79663d816e9",
    borrowers: [ACCOUNT_1],
  },
  {
    name: "BTCB",
    underlying: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    vToken: "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B",
    borrowers: [ACCOUNT_1, ACCOUNT_3, ACCOUNT_14, ACCOUNT_15],
  },
  {
    name: "CAKE",
    underlying: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    vToken: "0x86aC3974e2BD0d60825230fa6F355fF11409df5c",
    borrowers: [ACCOUNT_1],
  },
  {
    name: "DAI",
    underlying: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
    vToken: "0x334b3eCB4DCa3593BCCC3c7EBD1A1C1d1780FBF1",
    borrowers: [ACCOUNT_25, ACCOUNT_3],
  },
  {
    name: "XRP",
    underlying: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE",
    vToken: "0xB248a295732e0225acd3337607cc01068e3b9c10",
    borrowers: [
      ACCOUNT_15,
      ACCOUNT_16,
      ACCOUNT_17,
      ACCOUNT_19,
      ACCOUNT_20,
      ACCOUNT_21,
      ACCOUNT_22,
      ACCOUNT_23,
      ACCOUNT_24,
      ACCOUNT_25,
      ACCOUNT_26,
      ACCOUNT_27,
    ],
  },
  {
    name: "BCH",
    underlying: "0x8fF795a6F4D97E7887C79beA79aba5cc76444aDf",
    vToken: "0x5F0388EBc2B94FA8E123F404b79cCF5f40b29176",
    borrowers: [ACCOUNT_14, ACCOUNT_15],
  },
  {
    name: "LTC",
    underlying: "0x4338665CBB7B2485A8855A139b75D5e34AB0DB94",
    vToken: "0x57A5297F2cB2c0AaC9D554660acd6D385Ab50c6B",
    borrowers: [ACCOUNT_21, ACCOUNT_23],
  },
  {
    name: "LINK",
    underlying: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD",
    vToken: "0x650b940a1033B8A1b1873f78730FcFC73ec11f1f",
    borrowers: [ACCOUNT_14],
  },
  {
    name: "ADA",
    underlying: "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47",
    vToken: "0x9A0AF7FDb2065Ce470D72664DE73cAE409dA28Ec",
    borrowers: [ACCOUNT_19, ACCOUNT_21],
  },
  {
    name: "USDC",
    underlying: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    vToken: "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8",
    borrowers: [ACCOUNT_1, ACCOUNT_3, ACCOUNT_20],
  },
  {
    name: "AAVE",
    underlying: "0xfb6115445Bff7b52FeB98650C87f44907E58f802",
    vToken: "0x26DA28954763B92139ED49283625ceCAf52C6f94",
    borrowers: [ACCOUNT_14],
  },
  {
    name: "DOGE",
    underlying: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",
    vToken: "0xec3422Ef92B2fb59e84c8B02Ba73F1fE84Ed8D71",
    borrowers: [ACCOUNT_19],
  },
  {
    name: "SXP",
    underlying: "0x47BEAd2563dCBf3bF2c9407fEa4dC236fAbA485A",
    vToken: "0x2fF3d0F6990a40261c66E1ff2017aCBc282EB6d0",
    borrowers: [ACCOUNT_17, ACCOUNT_20, ACCOUNT_21, ACCOUNT_22],
  },
  {
    name: "FIL",
    underlying: "0x0D8Ce2A99Bb6e3B7Db580eD848240e4a0F9aE153",
    vToken: "0xf91d58b5aE142DAcC749f58A49FCBac340Cb0343",
    borrowers: [ACCOUNT_15],
  },
  {
    name: "TUSD",
    underlying: "0x40af3827F39D0EAcBF4A168f8D4ee67c121D11c9",
    vToken: "0xBf762cd5991cA1DCdDaC9ae5C638F5B5Dc3Bee6E",
    borrowers: [ACCOUNT_20],
  },
];

// BNB repayment data (fixed amounts from contract)
const BNB_REPAYMENTS = [
  { borrower: ACCOUNT_1, amount: parseEther("0.00926") },
  { borrower: ACCOUNT_4, amount: parseEther("15.1157") },
  { borrower: ACCOUNT_14, amount: parseEther("0.01397") },
  { borrower: ACCOUNT_20, amount: parseEther("0.00672") },
  { borrower: ACCOUNT_23, amount: parseEther("0.00558") },
];

const TOTAL_BNB = BNB_REPAYMENTS.reduce((sum, r) => sum.add(r.amount), BigNumber.from(0));

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

async function findBalanceSlot(tokenAddress: string): Promise<number | null> {
  const probeAddress = "0x" + "ba1".padStart(40, "0");
  const probeAmount = BigNumber.from("1234567890");
  const token = ERC20__factory.connect(tokenAddress, ethers.provider);

  for (let slot = 0; slot <= 30; slot++) {
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

// ──────────────────────────────────────────────────────────
// Fork test
// ──────────────────────────────────────────────────────────

if (FORK_MAINNET) {
  describe("BadDebtHelper", () => {
    forking(FORK_BLOCK, () => {
      let helper: Contract;
      let timelock: SignerWithAddress;

      // Pre-execution state
      const preDebts: Record<string, Record<string, BigNumber>> = {};
      let preTHEReceiverBalance: BigNumber;
      const preTimelockBalances: Record<string, BigNumber> = {};
      const preBNBDebts: Record<string, BigNumber> = {};

      before(async () => {
        // ─── 1. Setup accounts ───
        timelock = await initMainnetUser(NORMAL_TIMELOCK, parseEther("200"));

        // ─── 2. Upgrade vTHE to new implementation (needed for sweepTokenAndSync) ───
        const VBep20DelegateFactory = await ethers.getContractFactory("VBep20Delegate");
        const newImpl = await VBep20DelegateFactory.deploy();
        await newImpl.deployed();

        const vTHEProxy = VBep20Delegator__factory.connect(V_THE, timelock);
        await vTHEProxy._setImplementation(newImpl.address, false, "0x");

        // Initialize internalCash via sweepTokenAndSync(0)
        const vTHEDelegate = await ethers.getContractAt("VBep20Delegate", V_THE, timelock);
        await vTHEDelegate.sweepTokenAndSync(0);

        // ─── 3. Deploy BadDebtHelper as upgradeable proxy ───
        const BadDebtHelperFactory = await ethers.getContractFactory("BadDebtHelper");
        helper = await upgrades.deployProxy(BadDebtHelperFactory, []);
        await helper.deployed();

        // ─── 4. Record pre-execution state ───
        const theToken = ERC20__factory.connect(THE, ethers.provider);
        preTHEReceiverBalance = await theToken.balanceOf(THE_TARGET_RECEIVER);
        preTHEVTokenBalance = await theToken.balanceOf(V_THE);

        // Record THE borrower debts
        preDebts[V_THE] = {};
        for (const borrower of THE_BORROWERS) {
          preDebts[V_THE][borrower] = await vTHEProxy.borrowBalanceStored(borrower);
        }

        // Record BEP20 borrower debts
        for (const market of BEP20_MARKETS) {
          const vToken = VBep20Delegator__factory.connect(market.vToken, ethers.provider);
          preDebts[market.vToken] = {};
          for (const borrower of market.borrowers) {
            preDebts[market.vToken][borrower] = await vToken.borrowBalanceStored(borrower);
          }
        }

        // Record BNB borrower debts
        const vBNB = new ethers.Contract(
          V_BNB,
          ["function borrowBalanceStored(address) view returns (uint256)"],
          ethers.provider,
        );
        for (const { borrower } of BNB_REPAYMENTS) {
          preBNBDebts[borrower] = await vBNB.borrowBalanceStored(borrower);
        }

        // Record timelock balances
        for (const market of BEP20_MARKETS) {
          const token = ERC20__factory.connect(market.underlying, ethers.provider);
          preTimelockBalances[market.underlying] = await token.balanceOf(NORMAL_TIMELOCK);
        }

        // ─── 5. Fund helper with BEP20 tokens ───
        for (const market of BEP20_MARKETS) {
          const vToken = VBep20Delegator__factory.connect(market.vToken, ethers.provider);

          // Sum all debts for this market (with margin for interest accrual)
          let totalDebt = BigNumber.from(0);
          for (const borrower of market.borrowers) {
            const debt = await vToken.borrowBalanceStored(borrower);
            totalDebt = totalDebt.add(debt);
          }

          if (totalDebt.isZero()) continue;

          // Fund with 2x debt to ensure enough for interest accrual
          const fundAmount = totalDebt.mul(2);

          const slot = await findBalanceSlot(market.underlying);
          if (slot === null) {
            console.log(`      WARNING: Could not find balance slot for ${market.name}, skipping funding`);
            continue;
          }

          await setTokenBalance(market.underlying, helper.address, fundAmount, slot);

          const token = ERC20__factory.connect(market.underlying, ethers.provider);
          const actualBalance = await token.balanceOf(helper.address);
          console.log(
            `      Funded ${market.name}: debt=${ethers.utils.formatUnits(totalDebt, 18)} ` +
              `funded=${ethers.utils.formatUnits(actualBalance, 18)}`,
          );
        }

        // ─── 6. Set vTHE pending admin to helper ───
        await vTHEProxy._setPendingAdmin(helper.address);

        // ─── 7. Execute BadDebtHelper ───
        await helper.connect(timelock).execute({ value: TOTAL_BNB });

        // ─── 8. Timelock reclaims vTHE admin ───
        // After execute(), helper set pendingAdmin back to NORMAL_TIMELOCK
        await vTHEProxy._acceptAdmin();
      });

      // ════════════════════════════════════════════════════════════
      // THE market tests
      // ════════════════════════════════════════════════════════════

      describe("THE market recovery", () => {
        it("should clear all THE borrower debts", async () => {
          const vTHE = VBep20Delegator__factory.connect(V_THE, ethers.provider);
          for (const borrower of THE_BORROWERS) {
            const debt = await vTHE.borrowBalanceStored(borrower);
            expect(debt).to.equal(0, `THE borrower ${borrower} should have 0 debt, but has ${debt.toString()}`);
          }
        });

        it("should have had non-zero THE debts before execution", async () => {
          let totalPreDebt = BigNumber.from(0);
          for (const borrower of THE_BORROWERS) {
            totalPreDebt = totalPreDebt.add(preDebts[V_THE][borrower]);
          }
          expect(totalPreDebt).to.be.gt(0, "THE borrowers should have had non-zero debt before execution");
          console.log(`      Total THE debt repaid: ${ethers.utils.formatUnits(totalPreDebt, 18)}`);
        });

        it("should transfer remaining THE to target receiver", async () => {
          const theToken = ERC20__factory.connect(THE, ethers.provider);
          const postBalance = await theToken.balanceOf(THE_TARGET_RECEIVER);
          expect(postBalance).to.be.gt(preTHEReceiverBalance, "TARGET_RECEIVER should have received THE");
          console.log(
            `      THE transferred to receiver: ${ethers.utils.formatUnits(postBalance.sub(preTHEReceiverBalance), 18)}`,
          );
        });

        it("should hand vTHE admin back to timelock", async () => {
          const vTHE = new ethers.Contract(V_THE, ["function admin() view returns (address)"], ethers.provider);
          const admin = await vTHE.admin();
          expect(admin).to.equal(NORMAL_TIMELOCK, "vTHE admin should be back to Normal Timelock");
        });
      });

      // ════════════════════════════════════════════════════════════
      // BEP20 market tests
      // ════════════════════════════════════════════════════════════

      describe("BEP20 bad debt repayments", () => {
        for (const market of BEP20_MARKETS) {
          it(`should reduce/clear ${market.name} borrower debts`, async () => {
            const vToken = VBep20Delegator__factory.connect(market.vToken, ethers.provider);
            for (const borrower of market.borrowers) {
              const preDebt = preDebts[market.vToken][borrower];
              const postDebt = await vToken.borrowBalanceStored(borrower);

              if (preDebt.isZero()) continue;

              // Debt should be reduced (ideally to 0, but partial repayment is valid for some markets)
              expect(postDebt).to.be.lt(
                preDebt,
                `${market.name} borrower ${borrower}: debt not reduced (pre=${preDebt}, post=${postDebt})`,
              );
            }
          });
        }

        it("should leave no BEP20 tokens in the helper", async () => {
          for (const market of BEP20_MARKETS) {
            const token = ERC20__factory.connect(market.underlying, ethers.provider);
            const helperBalance = await token.balanceOf(helper.address);
            expect(helperBalance).to.equal(
              0,
              `Helper should have 0 ${market.name} balance, has ${helperBalance.toString()}`,
            );
          }
        });

        it("should return unused BEP20 tokens to timelock", async () => {
          // For each token, timelock should have gotten back any excess
          for (const market of BEP20_MARKETS) {
            const token = ERC20__factory.connect(market.underlying, ethers.provider);
            const postTimelockBalance = await token.balanceOf(NORMAL_TIMELOCK);
            const preTimelockBalance = preTimelockBalances[market.underlying];

            // Timelock balance should be >= pre-balance (got back unused tokens)
            expect(postTimelockBalance).to.be.gte(
              preTimelockBalance,
              `Timelock ${market.name} balance should not decrease`,
            );
          }
        });
      });

      // ════════════════════════════════════════════════════════════
      // BNB repayment tests
      // ════════════════════════════════════════════════════════════

      describe("BNB bad debt repayments", () => {
        it("should reduce BNB borrower debts", async () => {
          const vBNB = new ethers.Contract(
            V_BNB,
            ["function borrowBalanceStored(address) view returns (uint256)"],
            ethers.provider,
          );
          for (const { borrower } of BNB_REPAYMENTS) {
            const preDebt = preBNBDebts[borrower];
            const postDebt = await vBNB.borrowBalanceStored(borrower);

            if (preDebt.isZero()) continue;

            expect(postDebt).to.be.lt(
              preDebt,
              `BNB borrower ${borrower}: debt not reduced (pre=${preDebt}, post=${postDebt})`,
            );
            console.log(
              `      BNB borrower ${borrower}: ${ethers.utils.formatEther(preDebt)} → ${ethers.utils.formatEther(postDebt)}`,
            );
          }
        });

        it("should leave no BNB in the helper", async () => {
          const helperBNB = await ethers.provider.getBalance(helper.address);
          expect(helperBNB).to.equal(0, "Helper should have 0 BNB balance");
        });
      });

      // ════════════════════════════════════════════════════════════
      // General invariants
      // ════════════════════════════════════════════════════════════

      describe("general invariants", () => {
        it("should leave no THE in the helper", async () => {
          const theToken = ERC20__factory.connect(THE, ethers.provider);
          const helperBalance = await theToken.balanceOf(helper.address);
          expect(helperBalance).to.equal(0, "Helper should have 0 THE balance");
        });

        it("helper should not be admin of vTHE", async () => {
          const vTHE = new ethers.Contract(V_THE, ["function admin() view returns (address)"], ethers.provider);
          const admin = await vTHE.admin();
          expect(admin).to.not.equal(helper.address, "Helper should not remain vTHE admin");
        });

        it("should revert if called by non-timelock", async () => {
          const [randomSigner] = await ethers.getSigners();
          await expect(helper.connect(randomSigner).execute({ value: 0 })).to.be.revertedWith("only timelock");
        });
      });
    });
  });
}
