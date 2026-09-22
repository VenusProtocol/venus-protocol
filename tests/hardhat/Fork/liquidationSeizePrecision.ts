import { SnapshotRestorer, mine, setBalance, takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract, ContractReceipt, ContractTransaction, Signer } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  ComptrollerMock__factory,
  ERC20__factory,
  Liquidator,
  Liquidator__factory,
  VBNB__factory,
  VBep20__factory,
} from "../../../typechain";
import { ComptrollerErrorReporter } from "../util/Errors";
import { findBalanceSlot, setTokenBalance } from "./helpers/bstock";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

const FORK_BLOCK = 123190984;

const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const LIQUIDATOR = "0x0870793286aaDA55D39CE7f82fb2766e8004cF43";
const DEPLOYED_LENS = "0xd5DEb631cB6c6a667e926a482aadc95a471b120c";

const vvhUSDT = "0xc0768948e668B7BacFf8b4BD1BaBe0eD2b512d3c";
const vvhUSDC = "0xb1AB0399766997C5d66a30b2f2055277B7FA5D6C";
const vvhU = "0x80a5694441810d2b871BEeD644b6d16D113ce06E";
const vBTC = "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B";
const vBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
const vUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const vUSDC = "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8";
const VH_MARKETS = [vvhUSDT, vvhUSDC, vvhU];

const vhUSDT = "0x18AfDACF30F8671021dec4b78297E39d2FE87226";
const vhU = "0x0e5AA174d4F31b757a237eb1999DE151596788B0";
const BTCB = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

const BORROW_ACTION = 2;
const USE_COLLATERAL_FACTOR = 0;
const USE_LIQUIDATION_THRESHOLD = 1;
const EXP_SCALE = 10n ** 18n;
const { NO_ERROR, PRICE_ERROR } = ComptrollerErrorReporter.Error;

const ORACLE_ABI = ["function getUnderlyingPrice(address) view returns (uint256)"];

// floor(repay * incentive * borrowedPrice / (collateralPrice * exchangeRate)), truncated once
function exactSeizeTokens(
  repay: bigint,
  incentive: bigint,
  borrowedPrice: bigint,
  collateralPrice: bigint,
  er: bigint,
) {
  return (repay * incentive * borrowedPrice) / (collateralPrice * er);
}

// What the deployed lens computes: the ratio is truncated to an 18-decimal mantissa before the repay is applied
function truncatedSeizeTokens(
  repay: bigint,
  incentive: bigint,
  borrowedPrice: bigint,
  collateralPrice: bigint,
  er: bigint,
) {
  const numerator = (incentive * borrowedPrice) / EXP_SCALE;
  const denominator = (collateralPrice * er) / EXP_SCALE;
  return (((numerator * EXP_SCALE) / denominator) * repay) / EXP_SCALE;
}

type MarketInputs = {
  address: string;
  // undefined when the oracle reverts for the market
  price?: bigint;
  exchangeRate: bigint;
  liquidationIncentive: bigint;
};

type Scenario = {
  borrower: SignerWithAddress;
  vDebt: string;
  debtToken?: string; // undefined for BNB
  vCollateral: string;
  repayAmount: BigNumber;
};

type LiquidationResult = {
  seizeTokens: bigint;
  treasuryTokens: bigint;
  liquidatorTokens: bigint;
  exact: bigint;
  truncated: bigint;
};

if (FORK_MAINNET) {
  forking(FORK_BLOCK, () => {
    describe("ComptrollerLens seize amount on BSC mainnet", () => {
      let timelock: Signer;
      let comptroller: ComptrollerMock;
      let newLens: ComptrollerLens;
      let deployedLens: ComptrollerLens;
      let liquidator: Liquidator;
      let oracle: Contract;
      let markets: MarketInputs[];

      async function readMarket(address: string, blockTag?: number): Promise<MarketInputs> {
        const vToken = VBep20__factory.connect(address, ethers.provider);
        let price: bigint | undefined;
        try {
          price = (await oracle.getUnderlyingPrice(address, { blockTag })).toBigInt();
        } catch {
          price = undefined;
        }
        return {
          address,
          price,
          exchangeRate: (await vToken.exchangeRateStored({ blockTag })).toBigInt(),
          liquidationIncentive: (await comptroller.getLiquidationIncentive(address, { blockTag })).toBigInt(),
        };
      }

      async function seizeTokensFrom(lens: ComptrollerLens, borrowed: string, collateral: string, repay: bigint) {
        return lens["liquidateCalculateSeizeTokens(address,address,address,uint256)"](
          COMPTROLLER,
          borrowed,
          collateral,
          repay,
        );
      }

      // Checks both lenses for one pair and returns [new, deployed] seize amounts, or undefined when the
      // pair cannot be priced (both lenses must then fail the same way)
      async function compareLenses(borrowed: MarketInputs, collateral: MarketInputs, repay: bigint) {
        if (borrowed.price === undefined || collateral.price === undefined) {
          await expect(seizeTokensFrom(newLens, borrowed.address, collateral.address, repay)).to.be.reverted;
          await expect(seizeTokensFrom(deployedLens, borrowed.address, collateral.address, repay)).to.be.reverted;
          return undefined;
        }
        const [newErr, newSeizeTokens] = await seizeTokensFrom(newLens, borrowed.address, collateral.address, repay);
        const [oldErr, oldSeizeTokens] = await seizeTokensFrom(
          deployedLens,
          borrowed.address,
          collateral.address,
          repay,
        );
        if (borrowed.price === 0n || collateral.price === 0n) {
          expect([newErr, newSeizeTokens]).to.deep.equal([BigNumber.from(PRICE_ERROR), BigNumber.from(0)]);
          expect([oldErr, oldSeizeTokens]).to.deep.equal([BigNumber.from(PRICE_ERROR), BigNumber.from(0)]);
          return undefined;
        }

        const inputs = [
          repay,
          collateral.liquidationIncentive,
          borrowed.price,
          collateral.price,
          collateral.exchangeRate,
        ] as const;
        expect(newErr).to.equal(NO_ERROR);
        expect(oldErr).to.equal(NO_ERROR);
        expect(newSeizeTokens).to.equal(exactSeizeTokens(...inputs));
        expect(oldSeizeTokens).to.equal(truncatedSeizeTokens(...inputs));
        return [newSeizeTokens.toBigInt(), oldSeizeTokens.toBigInt()];
      }

      // Repay amount in raw borrowed units worth `usd` dollars
      function repayWorth(borrowed: MarketInputs, usd: bigint): bigint {
        return (usd * 10n ** 36n) / (borrowed.price as bigint);
      }

      // Automined blocks take their timestamp from the wall clock, and the oracle starts reverting for some
      // markets a few minutes after the fork block, well within the time the view tests take. Every block in
      // this file is mined one second after the previous one instead.
      async function pinNextBlockTimestamp() {
        await time.setNextBlockTimestamp((await time.latest()) + 1);
      }

      async function send(tx: () => Promise<ContractTransaction>): Promise<ContractReceipt> {
        await pinNextBlockTimestamp();
        return (await tx()).wait();
      }

      before(async () => {
        // Calls against the forked block itself run under the london rules from hardforkHistory, where the
        // PUSH0 opcode in the deployed Diamond is invalid. A local block runs under the configured hardfork.
        await pinNextBlockTimestamp();
        await mine(1);
        timelock = await initMainnetUser(NORMAL_TIMELOCK, parseEther("10"));
        comptroller = ComptrollerMock__factory.connect(COMPTROLLER, timelock);
        liquidator = Liquidator__factory.connect(LIQUIDATOR, timelock);
        oracle = new ethers.Contract(await comptroller.oracle(), ORACLE_ABI, ethers.provider);
        deployedLens = ComptrollerLens__factory.connect(DEPLOYED_LENS, ethers.provider);
        expect(await comptroller.comptrollerLens()).to.equal(DEPLOYED_LENS);

        const lensFactory = await ethers.getContractFactory("ComptrollerLens");
        await pinNextBlockTimestamp();
        newLens = (await lensFactory.deploy()) as ComptrollerLens;
        await newLens.deployed();

        markets = [];
        for (const address of await comptroller.getAllMarkets()) {
          markets.push(await readMarket(address));
        }
      });

      describe("view functions", () => {
        it("returns the exact amount for every pair with a 24-decimal market, where the deployed lens truncates", async () => {
          let pairs = 0;
          for (const borrowed of markets) {
            for (const collateral of markets) {
              if (borrowed.address === collateral.address) continue;
              if (!VH_MARKETS.includes(borrowed.address) && !VH_MARKETS.includes(collateral.address)) continue;
              if (borrowed.price === undefined || borrowed.price === 0n) {
                await compareLenses(borrowed, collateral, 10n ** 24n);
                continue;
              }
              for (const usd of [1n, 100n, 1_000_000n]) {
                const result = await compareLenses(borrowed, collateral, repayWorth(borrowed, usd));
                if (result) pairs++;
              }
            }
          }
          expect(pairs).to.be.greaterThan(250);
        });

        it("seizes nothing on vvhUSDT debt against vBTC collateral with the deployed lens, and the exact amount with the new one", async () => {
          const borrowed = markets.find(m => m.address === vvhUSDT) as MarketInputs;
          const collateral = markets.find(m => m.address === vBTC) as MarketInputs;
          const [newSeizeTokens, oldSeizeTokens] = (await compareLenses(
            borrowed,
            collateral,
            100n * 10n ** 24n,
          )) as bigint[];
          expect(oldSeizeTokens).to.equal(0n);
          // $100 * 1.1 of BTC at ~$85,000 is ~0.0636 vBTC
          expect(newSeizeTokens).to.be.greaterThan(6_000_000n);
        });

        it("returns the exact amount for every other live pair and never less than the deployed lens", async () => {
          let pairs = 0;
          for (const borrowed of markets) {
            for (const collateral of markets) {
              if (borrowed.address === collateral.address) continue;
              if (VH_MARKETS.includes(borrowed.address) || VH_MARKETS.includes(collateral.address)) continue;
              const repay =
                borrowed.price === undefined || borrowed.price === 0n ? 10n ** 18n : repayWorth(borrowed, 1_000n);
              const result = await compareLenses(borrowed, collateral, repay);
              if (!result) continue;
              expect(result[0]).to.be.gte(result[1]);
              pairs++;
            }
          }
          expect(pairs).to.be.greaterThan(1_000);
        });

        it("returns the exact amount from the VAI entry point for every collateral", async () => {
          const repay = 1_000n * 10n ** 18n;
          let collaterals = 0;
          for (const collateral of markets) {
            if (collateral.price === undefined) {
              await expect(newLens.liquidateVAICalculateSeizeTokens(COMPTROLLER, collateral.address, repay)).to.be
                .reverted;
              continue;
            }
            const [err, seizeTokens] = await newLens.liquidateVAICalculateSeizeTokens(
              COMPTROLLER,
              collateral.address,
              repay,
            );
            if (collateral.price === 0n) {
              expect(err).to.equal(PRICE_ERROR);
              continue;
            }
            const inputs = [
              repay,
              collateral.liquidationIncentive,
              EXP_SCALE,
              collateral.price,
              collateral.exchangeRate,
            ] as const;
            expect(err).to.equal(NO_ERROR);
            expect(seizeTokens).to.equal(exactSeizeTokens(...inputs));
            const [, oldSeizeTokens] = await deployedLens.liquidateVAICalculateSeizeTokens(
              COMPTROLLER,
              collateral.address,
              repay,
            );
            expect(oldSeizeTokens).to.equal(truncatedSeizeTokens(...inputs));
            collaterals++;
          }
          expect(collaterals).to.be.greaterThan(40);
        });

        it("computes the same account liquidity as the deployed lens", async () => {
          // Accounts that borrowed from the largest markets in the 20,000 blocks before the fork block,
          // queried in 5,000-block ranges because RPC nodes often cap the block range of a log query
          const accounts = new Set<string>();
          for (let to = FORK_BLOCK; to > FORK_BLOCK - 20_000; to -= 5_000) {
            for (const market of [vUSDT, vUSDC, vBNB, vBTC]) {
              const vToken = VBep20__factory.connect(market, ethers.provider);
              const events = await vToken.queryFilter(vToken.filters.Borrow(), to - 4_999, to);
              events.forEach(event => accounts.add(event.args.borrower));
            }
          }
          expect(accounts.size).to.be.greaterThan(10);

          for (const account of [...accounts].slice(0, 30)) {
            for (const strategy of [USE_COLLATERAL_FACTOR, USE_LIQUIDATION_THRESHOLD]) {
              const args = [COMPTROLLER, account, ethers.constants.AddressZero, 0, 0, strategy] as const;
              expect(await newLens.getHypotheticalAccountLiquidity(...args)).to.deep.equal(
                await deployedLens.getHypotheticalAccountLiquidity(...args),
              );
            }
          }
        });
      });

      describe("liquidation through the production Liquidator", () => {
        let snapshot: SnapshotRestorer;
        let liquidatorAccount: SignerWithAddress;
        let scenarios: Record<string, Scenario>;
        const balanceSlots = new Map<string, NonNullable<Awaited<ReturnType<typeof findBalanceSlot>>>>();

        async function fund(token: string, account: string, amount: BigNumber) {
          let slot = balanceSlots.get(token);
          if (!slot) {
            const found = await findBalanceSlot(token);
            if (!found) throw new Error(`balance slot not found for ${token}`);
            slot = found;
            balanceSlots.set(token, slot);
          }
          await setTokenBalance(token, account, amount, slot);
          expect(await ERC20__factory.connect(token, ethers.provider).balanceOf(account)).to.equal(amount);
        }

        async function supply(
          account: SignerWithAddress,
          vToken: string,
          token: string | undefined,
          amount: BigNumber,
        ) {
          if (token === undefined) {
            await send(() => VBNB__factory.connect(vToken, account).mint({ value: amount }));
          } else {
            await fund(token, account.address, amount);
            await send(() => ERC20__factory.connect(token, account).approve(vToken, amount));
            const market = VBep20__factory.connect(vToken, account);
            expect(await market.callStatic.mint(amount)).to.equal(NO_ERROR);
            await send(() => market.mint(amount));
          }
          expect(await comptroller.connect(account).callStatic.enterMarkets([vToken])).to.deep.equal([
            BigNumber.from(NO_ERROR),
          ]);
          await send(() => comptroller.connect(account).enterMarkets([vToken]));
        }

        async function borrow(account: SignerWithAddress, vToken: string, amount: BigNumber) {
          const market = VBep20__factory.connect(vToken, account);
          expect(await market.callStatic.borrow(amount)).to.equal(NO_ERROR);
          await send(() => market.borrow(amount));
        }

        async function liquidate(scenario: Scenario, lens: string): Promise<LiquidationResult> {
          // Both runs mine the same blocks, so the liquidation lands on the same block number and timestamp
          if ((await comptroller.comptrollerLens()) === lens) {
            await pinNextBlockTimestamp();
            await mine(1);
          } else {
            await send(() => comptroller._setComptrollerLens(lens));
          }

          const { borrower, vDebt, debtToken, vCollateral, repayAmount } = scenario;
          const collateral = VBep20__factory.connect(vCollateral, ethers.provider);
          const collateralBefore = await collateral.balanceOf(borrower.address);
          const receivedBefore = await collateral.balanceOf(liquidatorAccount.address);
          let debtTokenBefore = BigNumber.from(0);
          if (debtToken !== undefined) {
            await fund(debtToken, liquidatorAccount.address, repayAmount);
            await send(() => ERC20__factory.connect(debtToken, liquidatorAccount).approve(LIQUIDATOR, repayAmount));
            debtTokenBefore = repayAmount;
          }

          const receipt = await send(() =>
            liquidator.connect(liquidatorAccount).liquidateBorrow(vDebt, borrower.address, repayAmount, vCollateral, {
              value: debtToken === undefined ? repayAmount : 0,
            }),
          );

          const liquidateBorrow = receipt.logs
            .filter(log => log.address.toLowerCase() === vDebt.toLowerCase())
            .map(log => {
              try {
                return VBep20__factory.createInterface().parseLog(log);
              } catch {
                return undefined;
              }
            })
            .find(parsed => parsed?.name === "LiquidateBorrow");
          const split = receipt.logs
            .filter(log => log.address.toLowerCase() === LIQUIDATOR.toLowerCase())
            .map(log => {
              try {
                return liquidator.interface.parseLog(log);
              } catch {
                return undefined;
              }
            })
            .find(parsed => parsed?.name === "LiquidateBorrowedTokens");
          if (!liquidateBorrow || !split) throw new Error("liquidation events not found");
          expect(liquidateBorrow.args.repayAmount).to.equal(repayAmount);
          expect(liquidateBorrow.args.vTokenCollateral).to.equal(vCollateral);

          const seizeTokens = liquidateBorrow.args.seizeTokens.toBigInt();
          const treasuryTokens = split.args.seizeTokensForTreasury.toBigInt();
          const liquidatorTokens = split.args.seizeTokensForLiquidator.toBigInt();
          expect(treasuryTokens + liquidatorTokens).to.equal(seizeTokens);
          expect(await collateral.balanceOf(borrower.address)).to.equal(collateralBefore.sub(seizeTokens));
          expect(await collateral.balanceOf(liquidatorAccount.address)).to.equal(receivedBefore.add(liquidatorTokens));
          if (debtToken !== undefined) {
            const debtTokenAfter = await ERC20__factory.connect(debtToken, ethers.provider).balanceOf(
              liquidatorAccount.address,
            );
            expect(debtTokenBefore.sub(debtTokenAfter)).to.equal(repayAmount);
          }

          // Inputs as the lens saw them in the liquidation block. Seizing does not move the exchange rate,
          // and the treasury redeem that follows only rounds it by far less than one seized vToken.
          const blockTag = receipt.blockNumber;
          const borrowedPrice = (await oracle.getUnderlyingPrice(vDebt, { blockTag })).toBigInt();
          const { price: collateralPrice, exchangeRate } = await readMarket(vCollateral, blockTag);
          const incentive = (
            await comptroller.getEffectiveLiquidationIncentive(borrower.address, vCollateral, { blockTag })
          ).toBigInt();
          const inputs = [
            repayAmount.toBigInt(),
            incentive,
            borrowedPrice,
            collateralPrice as bigint,
            exchangeRate,
          ] as const;

          const treasuryPercent = (await liquidator.treasuryPercentMantissa({ blockTag })).toBigInt();
          const bonusTokens = (seizeTokens * (incentive - EXP_SCALE)) / incentive;
          expect(treasuryTokens).to.equal((bonusTokens * treasuryPercent) / EXP_SCALE);

          return {
            seizeTokens,
            treasuryTokens,
            liquidatorTokens,
            exact: exactSeizeTokens(...inputs),
            truncated: truncatedSeizeTokens(...inputs),
          };
        }

        async function liquidateWithBothLenses(scenario: Scenario) {
          await snapshot.restore();
          const deployed = await liquidate(scenario, DEPLOYED_LENS);
          await snapshot.restore();
          const fixed = await liquidate(scenario, newLens.address);
          await snapshot.restore();

          expect(deployed.seizeTokens).to.equal(deployed.truncated);
          expect(fixed.seizeTokens).to.equal(fixed.exact);
          return { deployed, fixed };
        }

        before(async () => {
          const signers = await ethers.getSigners();
          const [borrowerBtc, borrowerVh, borrowerBnb, borrowerOfBnb] = signers.slice(10, 14);
          liquidatorAccount = signers[14];
          for (const account of [borrowerBtc, borrowerVh, borrowerBnb, borrowerOfBnb, liquidatorAccount]) {
            // The default test accounts carry EIP-7702 delegation code on BSC mainnet, which makes them reject
            // the BNB that vBNB sends to a borrower on the fork. Clear it so they behave as plain accounts.
            await ethers.provider.send("hardhat_setCode", [account.address, "0x"]);
            await setBalance(account.address, parseEther("100"));
          }

          // Borrowing is disabled on the vh markets on mainnet; enable it on this fork only
          await send(() => comptroller._setActionsPaused([vvhUSDT, vvhU], [BORROW_ACTION], false));
          await send(() =>
            comptroller._setMarketBorrowCaps([vvhUSDT, vvhU], [parseUnits("1000000", 24), parseUnits("1000000", 24)]),
          );
          await send(() => comptroller.setIsBorrowAllowed(0, vvhUSDT, true));
          await send(() => comptroller.setIsBorrowAllowed(0, vvhU, true));

          // $1,700 of BTC against $1,003 of vhUSDT
          await supply(borrowerBtc, vBTC, BTCB, parseUnits("0.02", 18));
          await borrow(borrowerBtc, vvhUSDT, parseUnits("1000", 24));
          // $1,003 of vhUSDT against $702 of vhU
          await supply(borrowerVh, vvhUSDT, vhUSDT, parseUnits("1000", 24));
          await borrow(borrowerVh, vvhU, parseUnits("700", 24));
          // $1,574 of BNB against $1,000 of USDT
          await supply(borrowerBnb, vBNB, undefined, parseEther("2"));
          await borrow(borrowerBnb, vUSDT, parseUnits("1000", 18));
          // $2,005 of vhUSDT against $787 of BNB
          await supply(borrowerOfBnb, vvhUSDT, vhUSDT, parseUnits("2000", 24));
          await borrow(borrowerOfBnb, vBNB, parseEther("1"));

          // Lower the collateral weights so every position is under water
          for (const [market, weight] of [
            [vBTC, parseUnits("0.5", 18)],
            [vBNB, parseUnits("0.5", 18)],
            [vvhUSDT, parseUnits("0.35", 18)],
          ] as const) {
            await send(() => comptroller["setCollateralFactor(address,uint256,uint256)"](market, weight, weight));
          }
          for (const account of [borrowerBtc, borrowerVh, borrowerBnb, borrowerOfBnb]) {
            const [err, , shortfall] = await comptroller.getAccountLiquidity(account.address);
            expect(err).to.equal(NO_ERROR);
            expect(shortfall).to.be.gt(0);
          }

          // Repay 40% of each debt, under the 50% close factor
          scenarios = {
            btc: {
              borrower: borrowerBtc,
              vDebt: vvhUSDT,
              debtToken: vhUSDT,
              vCollateral: vBTC,
              repayAmount: parseUnits("400", 24),
            },
            vh: {
              borrower: borrowerVh,
              vDebt: vvhU,
              debtToken: vhU,
              vCollateral: vvhUSDT,
              repayAmount: parseUnits("280", 24),
            },
            bnb: {
              borrower: borrowerBnb,
              vDebt: vUSDT,
              debtToken: USDT,
              vCollateral: vBNB,
              repayAmount: parseUnits("400", 18),
            },
            bnbDebt: {
              borrower: borrowerOfBnb,
              vDebt: vBNB,
              debtToken: undefined,
              vCollateral: vvhUSDT,
              repayAmount: parseEther("0.4"),
            },
          };
          snapshot = await takeSnapshot();
        });

        it("vhUSDT debt against vBTC: the deployed lens seizes nothing, the new lens seizes the exact amount", async () => {
          const { deployed, fixed } = await liquidateWithBothLenses(scenarios.btc);
          // The liquidator paid 400 vhUSDT and received no collateral
          expect(deployed.seizeTokens).to.equal(0n);
          expect(deployed.liquidatorTokens).to.equal(0n);
          // $440 of BTC at ~$85,000 is ~0.254 vBTC
          expect(fixed.seizeTokens).to.be.greaterThan(20_000_000n);
        });

        it("vhU debt against vvhUSDT: the new lens restores the fraction the deployed lens drops", async () => {
          const { deployed, fixed } = await liquidateWithBothLenses(scenarios.vh);
          expect(fixed.seizeTokens).to.be.greaterThan(deployed.seizeTokens);
          // The deployed lens keeps 109 of ~109.95 vvhUSDT per vhU, losing ~0.87%
          const lostBasisPoints = Number(((fixed.seizeTokens - deployed.seizeTokens) * 10_000n) / fixed.seizeTokens);
          expect(lostBasisPoints).to.be.within(80, 90);
        });

        it("USDT debt against vBNB: the result matches the deployed lens up to the dropped fraction", async () => {
          const { deployed, fixed } = await liquidateWithBothLenses(scenarios.bnb);
          // The deployed lens drops under one ratio unit, i.e. at most one raw vBNB per whole USDT repaid
          expect(fixed.seizeTokens).to.be.gte(deployed.seizeTokens);
          expect(fixed.seizeTokens - deployed.seizeTokens).to.be.lte(
            scenarios.bnb.repayAmount.toBigInt() / EXP_SCALE + 1n,
          );
        });

        it("BNB debt against vvhUSDT: the legacy vBNB entry point also returns the exact amount", async () => {
          const { deployed, fixed } = await liquidateWithBothLenses(scenarios.bnbDebt);
          expect(fixed.seizeTokens).to.be.gte(deployed.seizeTokens);
          expect(fixed.seizeTokens - deployed.seizeTokens).to.be.lte(
            scenarios.bnbDebt.repayAmount.toBigInt() / EXP_SCALE + 1n,
          );
        });
      });
    });
  });
}
