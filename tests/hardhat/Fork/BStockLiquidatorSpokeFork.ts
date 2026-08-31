// ============================================================================================
// BStockLiquidator — ISOLATED mode against a REAL spoke pool, inside a bscmainnet fork
// ============================================================================================
//
// The unit suite proves the isolated branch against mocks. This one removes the mocks: a real
// `SpokeComptroller` and real isolated `VToken`s are deployed into the fork (see helpers/spoke.ts),
// funded with a real underwater position, and liquidated through the live BStockLiquidator proxy
// after it has been upgraded in place. The Core pool is untouched except as the FLASH LENDER, which
// is the point of the design: the spoke has no flash lender of its own.
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { atomicLiquidate } from "../../../scripts/bstock/atomic-liquidate";
import { buildSafeFallbackBatch } from "../../../scripts/bstock/safe-fallback";
import {
  A,
  BStockMarket,
  BalanceSlot,
  ONE,
  TOK,
  ZERO,
  findBalanceSlot,
  listBStockMarket,
  setTokenBalance,
} from "./helpers/bstock";
import { CORE_VUSDT, SPOKE_COMPTROLLER_ABI, SpokeAction, SpokePool, deploySpokePool } from "./helpers/spoke";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

// Same block and same live proxy as the Core fork suite, so both upgrade the instance that is actually
// deployed. `FORK_BSTOCK_BLOCK` overrides both together.
const FORK_BLOCK = Number(process.env.FORK_BSTOCK_BLOCK || "111264600");
const DEPLOYED_LIQ = "0x5974Badab6911a78Ba15229045514C2C1bD42343";
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const PROXY_ADMIN_ABI = ["function upgrade(address,address)", "function owner() view returns (address)"];

const P_HEALTHY = parseUnits("250", 18);
const P_CRASH = parseUnits("50", 18);

const SUPPLIER = ethers.utils.getAddress("0x00000000000000000000000000000000ca5b0001");
const BORROWER = ethers.utils.getAddress("0x00000000000000000000000000000000ca5b0002");

const test = () => {
  describe("BStockLiquidator — spoke pool on a bscmainnet fork", () => {
    let owner: any;
    let mkt: BStockMarket;
    let spoke: SpokePool;
    let liq: Contract;
    let mock: Contract;
    let usdt: Contract;
    let baseSnap: string;
    let baseSnapTs: number;
    let coreFlashAvailable = false;
    const slotCache: Record<string, BalanceSlot> = {};

    async function fund(token: string, to: string, amount: BigNumber) {
      if (slotCache[token] === undefined) {
        const s = await findBalanceSlot(token);
        if (s === null) throw new Error(`no balance slot for ${token}`);
        slotCache[token] = s;
      }
      await setTokenBalance(token, to, amount, slotCache[token]);
    }

    before(async () => {
      [owner] = await ethers.getSigners();
      await setBalance(owner.address, parseEther("10000"));

      // The bStock token, priced on the live ResilientOracle. Listing it on Core as well is
      // incidental here — the spoke market below reuses the same underlying and therefore the
      // same oracle configuration.
      mkt = await listBStockMarket(owner, P_HEALTHY);

      spoke = await deploySpokePool(owner, [
        {
          underlying: TOK.USDT,
          name: "Spoke USDT",
          symbol: "svUSDT",
          collateralFactor: parseUnits("0.75", 18),
          liquidationThreshold: parseUnits("0.8", 18),
        },
        {
          underlying: mkt.bStock.address,
          name: "Spoke bStock",
          symbol: "svTSLAB",
          collateralFactor: parseUnits("0.5", 18),
          liquidationThreshold: parseUnits("0.6", 18),
        },
      ]);

      usdt = new ethers.Contract(
        TOK.USDT,
        [
          "function balanceOf(address) view returns (uint256)",
          "function allowance(address,address) view returns (uint256)",
          "function approve(address,uint256) returns (bool)",
          "function transfer(address,uint256) returns (bool)",
        ],
        owner,
      );

      // A supplier gives the spoke USDT market cash to lend.
      const supplier = await initMainnetUser(SUPPLIER, parseEther("100"));
      await fund(TOK.USDT, SUPPLIER, parseUnits("1000000", 18));
      await spoke.supply(supplier, "svUSDT", parseUnits("500000", 18));

      // The borrower posts bStock and borrows USDT against it.
      const borrower = await initMainnetUser(BORROWER, parseEther("100"));
      await mkt.bStock.mint(BORROWER, parseUnits("1000", 18));
      await spoke.enter(borrower, ["svTSLAB"]);
      await spoke.supply(borrower, "svTSLAB", parseUnits("1000", 18)); // $250k of collateral
      await spoke.borrow(borrower, "svUSDT", parseUnits("100000", 18));

      // Upgrade the LIVE liquidator proxy, exactly as the Core fork suite does.
      liq = await ethers.getContractAt("BStockLiquidator", DEPLOYED_LIQ);
      const liqOwner = await initMainnetUser(await liq.owner(), parseEther("10"));
      await liq.connect(liqOwner).transferOwnership(owner.address);
      await liq.connect(owner).acceptOwnership();

      const adminAddr = ethers.utils.getAddress(
        "0x" + (await ethers.provider.getStorageAt(DEPLOYED_LIQ, ADMIN_SLOT)).slice(26),
      );
      const admin = new ethers.Contract(adminAddr, PROXY_ADMIN_ABI, ethers.provider);
      const adminOwner = await initMainnetUser(await admin.owner(), parseEther("10"));
      const Factory = await ethers.getContractFactory("BStockLiquidator");
      const impl = await Factory.deploy(await liq.comptroller(), await liq.vBNB(), await liq.vWBNB(), await liq.wbnb());
      await impl.deployed();
      await admin.connect(adminOwner).upgrade(DEPLOYED_LIQ, impl.address);

      // Hop-1 stand-in: bStock has no on-chain AMM, so the RFQ leg is a funded mock, as in the Core suite.
      mock = await (await ethers.getContractFactory("MockNativeRouter")).deploy();
      await fund(TOK.USDT, mock.address, parseUnits("5000000", 18));
      await mock.setRate(P_CRASH);

      await liq.connect(owner).setRouter(mock.address, true);
      await liq.connect(owner).setAllowedComptroller(spoke.comptroller.address, true);
      await liq.connect(owner).setCoreFlashSource(TOK.USDT, CORE_VUSDT);

      // A non-zero protocol seize share makes the collateral market's withheld cut observable.
      await spoke.markets.svTSLAB.connect(spoke.timelock).setProtocolSeizeShare(parseUnits("0.05", 18));

      // Core is the flash LENDER for the spoke's USDT debt; the receiver has to be whitelisted there.
      coreFlashAvailable = await enableCoreFlash(owner, CORE_VUSDT, DEPLOYED_LIQ);

      // Crash the stock: the account falls into shortfall in the spoke pool.
      await mkt.setPrice(P_CRASH);

      baseSnap = await ethers.provider.send("evm_snapshot", []);
      baseSnapTs = (await ethers.provider.getBlock("latest")).timestamp;
    });

    afterEach(async () => {
      await ethers.provider.send("evm_revert", [baseSnap]);
      baseSnap = await ethers.provider.send("evm_snapshot", []);
      // Hardhat walks block.timestamp with WALL time and evm_revert does not rewind it, so without a
      // re-pin every test starts later on-chain than the previous one and feeds drift towards stale.
      await ethers.provider.send("evm_setNextBlockTimestamp", [baseSnapTs + 1]);
      await mock.setRate(P_CRASH);
    });

    const REPAY = parseUnits("10000", 18);
    const MIN_OUT = parseUnits("10000", 18);

    // swapAll pulls whatever the liquidator holds after redeem, so the calldata never has to encode
    // an amount the pool's own seize arithmetic decides.
    const swapAll = () => mock.interface.encodeFunctionData("swapAll", [mkt.bStock.address, TOK.USDT, liq.address]);

    function params(over: Partial<any> = {}) {
      return {
        borrower: BORROWER,
        vDebt: spoke.markets.svUSDT.address,
        vBStock: spoke.markets.svTSLAB.address,
        repayAmount: REPAY,
        router: mock.address,
        swapCalldata: swapAll(),
        minOut: MIN_OUT,
        router2: ZERO,
        swapCalldata2: "0x",
        intermediateToken: ZERO,
        deadline: ethers.constants.MaxUint256,
        ...over,
      };
    }

    /* ------------------------------------------------------------------ */
    /*                            the pool itself                         */
    /* ------------------------------------------------------------------ */

    describe("the spoke pool", () => {
      it("is a real pool with a real underwater position", async () => {
        const snap = await spoke.comptroller.getAccountLiquidity(BORROWER);
        expect(snap[2]).to.be.gt(0); // shortfall
        expect(await spoke.markets.svUSDT.borrowBalanceStored(BORROWER)).to.be.gt(0);
        expect(await spoke.markets.svTSLAB.balanceOf(BORROWER)).to.be.gt(0);
        expect(await spoke.comptroller.isMarketListed(spoke.markets.svTSLAB.address)).to.equal(true);
        expect(await spoke.comptroller.isMarketListed(spoke.markets.svUSDT.address)).to.equal(true);
        expect(await spoke.comptroller.isComptroller()).to.equal(true);
      });

      it("has no Core-style gate and no flash lender of its own", async () => {
        // The two facts the isolated branch is built around, asserted first against the pool's own ABI...
        const fns = new Set(SPOKE_COMPTROLLER_ABI.filter((e: any) => e.type === "function").map((e: any) => e.name));
        expect(fns.has("liquidatorContract")).to.equal(false);
        expect(fns.has("executeFlashLoan")).to.equal(false);
        expect(fns.has("vaiController")).to.equal(false);

        // ...and then on chain: the pool has no fallback, so both Core entry points are unusable.
        const probe = new ethers.Contract(
          spoke.comptroller.address,
          [
            "function liquidatorContract() view returns (address)",
            "function executeFlashLoan(address,address,address[],uint256[],bytes)",
          ],
          owner,
        );
        await expect(probe.liquidatorContract()).to.be.reverted;
        await expect(probe.executeFlashLoan(ZERO, ZERO, [], [], "0x", { gasLimit: 500_000 })).to.be.reverted;
      });

      it("is resolved from the COLLATERAL market, and both legs are listed in it", async () => {
        expect(await spoke.markets.svTSLAB.comptroller()).to.equal(spoke.comptroller.address);
        expect(await spoke.markets.svUSDT.comptroller()).to.equal(spoke.comptroller.address);
        expect(await liq.isAllowedComptroller(spoke.comptroller.address)).to.equal(true);
      });
    });

    /* ------------------------------------------------------------------ */
    /*                          INVENTORY mode                            */
    /* ------------------------------------------------------------------ */

    describe("inventory mode", () => {
      beforeEach(async () => {
        await fund(TOK.USDT, liq.address, REPAY);
      });

      it("settles a real spoke position end to end, with the pool's own numbers", async () => {
        const { svUSDT, svTSLAB } = spoke.markets;
        const psr = spoke.protocolShareReserve.address;

        // The pool's own seize arithmetic, read from the pool before the tx. svTSLAB carries no
        // borrows, so a block of accrual cannot move its exchange rate and these stay valid.
        const [err, seizeTokens] = await spoke.comptroller.liquidateCalculateSeizeTokens(
          svUSDT.address,
          svTSLAB.address,
          REPAY,
        );
        expect(err).to.equal(0);
        const share = await svTSLAB.protocolSeizeShareMantissa();
        const incentive = await spoke.comptroller.effectiveLiquidationIncentive(svTSLAB.address);
        const exchangeRate = await svTSLAB.exchangeRateStored();
        // VToken._seize: mul_ then div_, i.e. floor(floor(seizeTokens * share / 1e18) * 1e18 / incentive).
        // Both floors, in that order — a single combined division is not the same function.
        const protocolSeizeTokens = seizeTokens.mul(share).div(ONE).mul(ONE).div(incentive);
        const liquidatorSeizeTokens = seizeTokens.sub(protocolSeizeTokens);
        const protocolSeizeAmount = exchangeRate.mul(protocolSeizeTokens).div(ONE);
        expect(protocolSeizeTokens).to.be.gt(0); // the withheld cut has to be observable

        const collBefore = await svTSLAB.balanceOf(BORROWER);
        const supplyBefore = await svTSLAB.totalSupply();
        const psrBefore = await mkt.bStock.balanceOf(psr);
        const usdtBefore = await usdt.balanceOf(liq.address);

        const rc = await (await liq.connect(owner).liquidate(params())).wait();

        // The pool reported exactly the repay it was asked for, against exactly those seize tokens.
        const liqEvt = svUSDT.interface.parseLog(
          rc.logs.find(
            (l: any) =>
              l.address.toLowerCase() === svUSDT.address.toLowerCase() &&
              l.topics[0] === svUSDT.interface.getEventTopic("LiquidateBorrow"),
          )!,
        );
        expect(liqEvt.args.liquidator).to.equal(liq.address);
        expect(liqEvt.args.borrower).to.equal(BORROWER);
        expect(liqEvt.args.repayAmount).to.equal(REPAY);
        expect(liqEvt.args.seizeTokens).to.equal(seizeTokens);

        // The collateral market moved exactly `seizeTokens` off the borrower and burned the protocol cut.
        expect(collBefore.sub(await svTSLAB.balanceOf(BORROWER))).to.equal(seizeTokens);
        expect(supplyBefore.sub(await svTSLAB.totalSupply())).to.equal(
          protocolSeizeTokens.add(liquidatorSeizeTokens), // burn of the cut + the redeem of the rest
        );
        expect((await mkt.bStock.balanceOf(psr)).sub(psrBefore)).to.equal(protocolSeizeAmount);

        // Proceeds cleared minOut and nothing is stranded on the liquidator.
        expect(await usdt.balanceOf(liq.address)).to.be.gte(usdtBefore.sub(REPAY).add(MIN_OUT));
        expect(await mkt.bStock.balanceOf(liq.address)).to.equal(0);
        expect(await svTSLAB.balanceOf(liq.address)).to.equal(0);
        // No standing allowance on the debt market.
        expect(await usdt.allowance(liq.address, svUSDT.address)).to.equal(0);
      });

      it("rolls back completely when minOut is not met", async () => {
        const borrowBefore = await spoke.markets.svUSDT.borrowBalanceStored(BORROWER);
        const usdtBefore = await usdt.balanceOf(liq.address);
        await expect(
          liq.connect(owner).liquidate(params({ minOut: parseUnits("100000", 18) })),
        ).to.be.revertedWithCustomError(liq, "InsufficientOut");
        expect(await spoke.markets.svUSDT.borrowBalanceStored(BORROWER)).to.equal(borrowBefore);
        expect(await usdt.balanceOf(liq.address)).to.equal(usdtBefore);
      });

      it("is rejected once the pool is de-allowlisted", async () => {
        await liq.connect(owner).setAllowedComptroller(spoke.comptroller.address, false);
        await expect(liq.connect(owner).liquidate(params()))
          .to.be.revertedWithCustomError(liq, "ComptrollerNotAllowed")
          .withArgs(spoke.comptroller.address);
      });

      it("is rejected when a leg is not listed in the pool", async () => {
        // A real Core market is not a market of this pool.
        await expect(liq.connect(owner).liquidate(params({ vDebt: CORE_VUSDT })))
          .to.be.revertedWithCustomError(liq, "MarketNotInPool")
          .withArgs(spoke.comptroller.address, CORE_VUSDT);
      });

      it("obeys the pool's liquidation allowlist, which binds THIS CONTRACT", async () => {
        await spoke.comptroller.connect(spoke.timelock).setLiquidationAllowlistEnabled(true);
        // Allowlisting the operator EOA is not enough — the collateral lands on the contract.
        await spoke.comptroller.connect(spoke.timelock).setAllowedLiquidator(owner.address, true);
        await expect(liq.connect(owner).liquidate(params())).to.be.reverted;

        await spoke.comptroller.connect(spoke.timelock).setAllowedLiquidator(liq.address, true);
        await expect(liq.connect(owner).liquidate(params())).to.emit(liq, "Liquidated");
      });

      it("sells through TWO hops: bStock -> CAKE (mock RFQ) -> USDT (real PancakeSwap)", async () => {
        const { svUSDT, svTSLAB } = spoke.markets;
        const cake = new ethers.Contract(
          TOK.CAKE,
          ["function balanceOf(address) view returns (uint256)"],
          ethers.provider,
        );
        const pcs = new ethers.Contract(
          A.PCS_ROUTER,
          [
            "function getAmountsOut(uint256,address[]) view returns (uint256[])",
            "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
          ],
          owner,
        );
        await liq.connect(owner).setRouter(A.PCS_ROUTER, true);
        await fund(TOK.CAKE, mock.address, parseUnits("2000000", 18)); // the RFQ mock pays out CAKE here

        // What the liquidator will actually be holding after redeem, at the mock's CAKE rate.
        const [, seizeTokens] = await spoke.comptroller.liquidateCalculateSeizeTokens(
          svUSDT.address,
          svTSLAB.address,
          REPAY,
        );
        const share = await svTSLAB.protocolSeizeShareMantissa();
        const incentive = await spoke.comptroller.effectiveLiquidationIncentive(svTSLAB.address);
        const liquidatorSeizeTokens = seizeTokens.sub(seizeTokens.mul(share).div(ONE).mul(ONE).div(incentive));
        const bStockOut = liquidatorSeizeTokens.mul(await svTSLAB.exchangeRateStored()).div(ONE);

        const RATE = parseUnits("20", 18); // CAKE per bStock on the RFQ leg
        await mock.setRate(RATE);
        const cakeFromHop1 = bStockOut.mul(RATE).div(ONE);
        // Hop-2 calldata carries a fixed amountIn, so it under-shoots what hop 1 delivers; the remainder
        // stays as inventory rather than risking a pull larger than the approval.
        const x2 = cakeFromHop1.mul(90).div(100);
        const path = [TOK.CAKE, TOK.USDT];
        const expectedOut: BigNumber = (await pcs.getAmountsOut(x2, path))[1];
        const minOut = expectedOut.mul(98).div(100);

        const borrowBefore = await svUSDT.borrowBalanceStored(BORROWER);
        const usdtBefore = await usdt.balanceOf(liq.address);

        await expect(
          liq.connect(owner).liquidate(
            params({
              swapCalldata: mock.interface.encodeFunctionData("swapAll", [mkt.bStock.address, TOK.CAKE, liq.address]),
              router2: A.PCS_ROUTER,
              intermediateToken: TOK.CAKE,
              swapCalldata2: pcs.interface.encodeFunctionData("swapExactTokensForTokens", [
                x2,
                0,
                path,
                liq.address,
                ethers.constants.MaxUint256,
              ]),
              minOut,
            }),
          ),
        ).to.emit(liq, "Liquidated");

        expect(await svUSDT.borrowBalanceStored(BORROWER)).to.be.lt(borrowBefore);
        // minOut is measured in the DEBT asset across the whole chain.
        expect((await usdt.balanceOf(liq.address)).sub(usdtBefore.sub(REPAY))).to.be.gte(minOut);
        expect(await mkt.bStock.balanceOf(liq.address)).to.equal(0);
        expect(await svTSLAB.balanceOf(liq.address)).to.equal(0);
        // The under-shot remainder of hop 1 stays put; nothing is approved to either router afterwards.
        expect(await cake.balanceOf(liq.address)).to.equal(cakeFromHop1.sub(x2));
      });

      it("obeys a SEIZE pause on the collateral market", async () => {
        await spoke.comptroller
          .connect(spoke.timelock)
          .setActionsPaused([spoke.markets.svTSLAB.address], [SpokeAction.SEIZE], true);
        await expect(liq.connect(owner).liquidate(params())).to.be.reverted;
      });
    });

    /* ------------------------------------------------------------------ */
    /*                    gates that are the SPOKE's own                  */
    /* ------------------------------------------------------------------ */

    describe("pool-specific gates", () => {
      beforeEach(async () => {
        await fund(TOK.USDT, liq.address, REPAY);
      });

      it("sizes the seize off the per-market incentive, not the pool default", async () => {
        const { svUSDT, svTSLAB } = spoke.markets;
        const poolDefault = await spoke.comptroller.liquidationIncentiveMantissa();
        const [, atDefault] = await spoke.comptroller.liquidateCalculateSeizeTokens(
          svUSDT.address,
          svTSLAB.address,
          REPAY,
        );

        const marketIncentive = parseUnits("1.25", 18);
        await spoke.comptroller.connect(spoke.timelock).setMarketLiquidationIncentive(svTSLAB.address, marketIncentive);
        expect(await spoke.comptroller.effectiveLiquidationIncentive(svTSLAB.address)).to.equal(marketIncentive);

        const [, atMarket] = await spoke.comptroller.liquidateCalculateSeizeTokens(
          svUSDT.address,
          svTSLAB.address,
          REPAY,
        );
        // The pool scales the seize linearly in the incentive, so the market override is what binds.
        // Only up to rounding: the pool truncates inside its own fixed-point math, so compare with a
        // tolerance rather than pretending the scaled value is exact.
        const scaled = atDefault.mul(marketIncentive).div(poolDefault);
        expect(atMarket).to.be.gt(atDefault);
        expect(atMarket.sub(scaled).abs()).to.be.lte(scaled.div(1_000_000));

        const collBefore = await svTSLAB.balanceOf(BORROWER);
        await expect(liq.connect(owner).liquidate(params())).to.emit(liq, "Liquidated");
        expect(collBefore.sub(await svTSLAB.balanceOf(BORROWER))).to.equal(atMarket);
      });

      it("respects forced liquidation: a healthy account is untouchable until the pool allows it", async () => {
        await mkt.setPrice(P_HEALTHY);
        await mock.setRate(P_HEALTHY);
        await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(
          spoke.comptroller,
          "InsufficientShortfall",
        );

        await spoke.comptroller.connect(spoke.timelock).setForcedLiquidation(spoke.markets.svUSDT.address, true);
        await expect(liq.connect(owner).liquidate(params())).to.emit(liq, "Liquidated");
      });

      it("respects minLiquidatableCollateral: below it the pool refuses the single-market path", async () => {
        await spoke.comptroller.connect(spoke.timelock).setMinLiquidatableCollateral(parseUnits("100000000", 18));
        await expect(liq.connect(owner).liquidate(params())).to.be.revertedWithCustomError(
          spoke.comptroller,
          "MinimalCollateralViolated",
        );
      });

      it("does not need to be an allowed SUPPLIER of the collateral market", async () => {
        // The liquidator briefly holds seized vTokens and redeems them. A supply allowlist gates minting,
        // not that, so the liquidation settles either way — worth pinning so a pool config change is caught.
        await spoke.comptroller.connect(spoke.timelock).setSupplyAllowlistEnabled(spoke.markets.svTSLAB.address, true);
        expect(await liq.connect(owner).liquidate(params())).to.be.ok;
      });
    });

    /* ------------------------------------------------------------------ */
    /*                       cross-pool leg mixing                        */
    /* ------------------------------------------------------------------ */

    describe("cross-pool legs", () => {
      beforeEach(async () => {
        await fund(TOK.USDT, liq.address, REPAY);
      });

      it("spoke collateral + Core debt: rejected by this contract before any pool is called", async () => {
        await expect(liq.connect(owner).liquidate(params({ vDebt: CORE_VUSDT })))
          .to.be.revertedWithCustomError(liq, "MarketNotInPool")
          .withArgs(spoke.comptroller.address, CORE_VUSDT);
      });

      it("Core collateral + spoke debt: resolves to Core, and Core's own gate rejects the debt leg", async () => {
        // `_resolvePool` reads the COLLATERAL market's comptroller, so a Core bStock market routes this
        // through the Core gate. The gate then refuses a debt market that Core does not list.
        const core = new ethers.Contract(
          A.COMPTROLLER,
          ["function liquidatorContract() view returns (address)"],
          ethers.provider,
        );
        const gate = await ethers.getContractAt("Liquidator", await core.liquidatorContract());
        await expect(liq.connect(owner).liquidate(params({ vBStock: mkt.vBStock.address })))
          .to.be.revertedWithCustomError(gate, "MarketNotListed")
          .withArgs(spoke.markets.svUSDT.address);
      });
    });

    /* ------------------------------------------------------------------ */
    /*                             FLASH mode                             */
    /* ------------------------------------------------------------------ */

    describe("flash mode (principal borrowed from CORE)", () => {
      it("funds a spoke repay from the Core USDT market and returns it in the same tx", async function () {
        if (!coreFlashAvailable) {
          this.skip();
        }
        // No inventory: the principal can only come from the flash.
        expect(await usdt.balanceOf(liq.address)).to.equal(0);
        const coreCashBefore = await usdt.balanceOf(CORE_VUSDT);
        const borrowBefore = await spoke.markets.svUSDT.borrowBalanceStored(BORROWER);

        await expect(liq.connect(owner).flashLiquidate(params())).to.emit(liq, "Liquidated");

        expect(await spoke.markets.svUSDT.borrowBalanceStored(BORROWER)).to.be.lt(borrowBefore);
        // Core got its principal back (plus any premium), and the profit stayed with the liquidator.
        expect(await usdt.balanceOf(CORE_VUSDT)).to.be.gte(coreCashBefore);
        expect(await usdt.balanceOf(liq.address)).to.be.gt(0);
      });

      it("reverts when the debt token has no Core flash source configured", async () => {
        await liq.connect(owner).setCoreFlashSource(TOK.USDT, ZERO);
        await expect(liq.connect(owner).flashLiquidate(params()))
          .to.be.revertedWithCustomError(liq, "FlashSourceNotSet")
          .withArgs(TOK.USDT);
      });
    });

    /* ------------------------------------------------------------------ */
    /*                    the operator SCRIPT, end to end                 */
    /* ------------------------------------------------------------------ */

    describe("atomic-liquidate.ts", () => {
      const SCRIPT_ENV = [
        "LIQUIDATOR",
        "BORROWER",
        "VBSTOCK",
        "VDEBT",
        "REPAY_AMOUNT",
        "MODE",
        "MOCK_NATIVE",
        "MOCK_OUT",
        "SEIZE_BUFFER",
      ];

      // Run the script with `env` applied, capturing its stdout so the routing decision is assertable.
      async function runScript(env: Record<string, string>): Promise<string[]> {
        const lines: string[] = [];
        const realLog = console.log;
        console.log = (...a: unknown[]) => {
          lines.push(a.map(String).join(" "));
        };
        try {
          Object.assign(process.env, env);
          await atomicLiquidate(owner);
        } finally {
          console.log = realLog;
          for (const k of SCRIPT_ENV) delete process.env[k];
        }
        return lines;
      }

      function baseEnv() {
        return {
          LIQUIDATOR: liq.address,
          BORROWER,
          VBSTOCK: spoke.markets.svTSLAB.address,
          VDEBT: spoke.markets.svUSDT.address,
          REPAY_AMOUNT: "10000",
          MODE: "inventory",
          MOCK_NATIVE: `${mock.address}:${swapAll()}`,
          SEIZE_BUFFER: "0",
        };
      }

      it("routes to ISOLATED mode and settles with the pool's own seize numbers", async () => {
        const { svUSDT, svTSLAB } = spoke.markets;
        await fund(TOK.USDT, liq.address, REPAY);

        // What the collateral market will actually credit, by the pool's own arithmetic.
        const [, seizeTokens] = await spoke.comptroller.liquidateCalculateSeizeTokens(
          svUSDT.address,
          svTSLAB.address,
          REPAY,
        );
        const share = await svTSLAB.protocolSeizeShareMantissa();
        const incentive = await spoke.comptroller.effectiveLiquidationIncentive(svTSLAB.address);
        const credited = seizeTokens.sub(seizeTokens.mul(share).div(ONE).mul(ONE).div(incentive));
        const seizedRaw = credited.mul(await svTSLAB.exchangeRateStored()).div(ONE);
        const mockOut = seizedRaw.mul(P_CRASH).div(ONE); // what the RFQ mock pays at the crashed rate

        const borrowBefore = await svUSDT.borrowBalanceStored(BORROWER);
        const out = await runScript({ ...baseEnv(), MOCK_OUT: mockOut.toString() });

        expect(out.some(l => l.includes("pool: ISOLATED"))).to.equal(true);
        expect(out.some(l => l.includes("pool: CORE"))).to.equal(false);
        // The script's own precompute has to agree with the market, or its minOut is sized off fiction.
        expect(out.some(l => l.includes(`credited ${ethers.utils.formatUnits(credited, 8)}`))).to.equal(true);
        expect(await svUSDT.borrowBalanceStored(BORROWER)).to.be.lt(borrowBefore);
        expect(await mkt.bStock.balanceOf(liq.address)).to.equal(0);
      });

      it("aborts before quoting when the pool is not allowlisted", async () => {
        await liq.connect(owner).setAllowedComptroller(spoke.comptroller.address, false);
        await fund(TOK.USDT, liq.address, REPAY);
        await expect(runScript({ ...baseEnv(), MOCK_OUT: "1" })).to.be.rejectedWith(/not allowlisted/i);
      });

      it("aborts before quoting when MODE=flash has no Core flash source for the debt token", async () => {
        await liq.connect(owner).setCoreFlashSource(TOK.USDT, ZERO);
        await expect(runScript({ ...baseEnv(), MODE: "flash", MOCK_OUT: "1" })).to.be.rejectedWith(
          /Core flash source/i,
        );
      });
    });

    /* ------------------------------------------------------------------ */
    /*                   the Safe fallback batch builder                  */
    /* ------------------------------------------------------------------ */

    describe("safe-fallback.ts", () => {
      const KEYS = ["SAFE", "BORROWER", "VBSTOCK", "VDEBT", "REPAY_AMOUNT", "TARGET", "SEIZE_BUFFER"];

      afterEach(() => {
        for (const k of KEYS) delete process.env[k];
      });

      it("detects the pool as ISOLATED and drives the DEBT MARKET directly, with no gate", async () => {
        const { svUSDT, svTSLAB } = spoke.markets;
        Object.assign(process.env, {
          SAFE: owner.address,
          BORROWER,
          VBSTOCK: svTSLAB.address,
          VDEBT: svUSDT.address,
          REPAY_AMOUNT: "10000",
          TARGET: owner.address,
          SEIZE_BUFFER: "0",
        });

        const { txs, isCore, repaySpender, vReceived, seizedRaw } = await buildSafeFallbackBatch(ethers.provider);

        // The script probes for a pool-wide gate and takes the revert as the signal. Against the REAL
        // SpokeComptroller that probe has to come back "no gate", or the whole batch is built Core-shaped.
        expect(isCore).to.equal(false);
        expect(ethers.utils.getAddress(repaySpender)).to.equal(svUSDT.address);
        expect(txs).to.have.length(4);

        // 1. approve -> the DEBT MARKET is the spender, not a gate.
        expect(ethers.utils.getAddress(txs[0].to)).to.equal(TOK.USDT);
        const approve = ethers.utils.defaultAbiCoder.decode(["address", "uint256"], "0x" + txs[0].data.slice(10));
        expect(ethers.utils.getAddress(approve[0])).to.equal(svUSDT.address);
        expect(approve[1]).to.equal(REPAY);

        // 2. liquidateBorrow -> the market itself, 3-arg selector, zero value.
        expect(ethers.utils.getAddress(txs[1].to)).to.equal(svUSDT.address);
        expect(txs[1].data.slice(0, 10)).to.equal(
          ethers.utils.id("liquidateBorrow(address,uint256,address)").slice(0, 10),
        );
        expect(BigNumber.from(txs[1].value ?? 0)).to.equal(0);

        // 3./4. redeem the credited vTokens, ship the underlying. The credit has to match the pool's own
        // seize arithmetic, or the redeem asks for more than the Safe will hold.
        const [, seizeTokens] = await spoke.comptroller.liquidateCalculateSeizeTokens(
          svUSDT.address,
          svTSLAB.address,
          REPAY,
        );
        const share = await svTSLAB.protocolSeizeShareMantissa();
        const incentive = await spoke.comptroller.effectiveLiquidationIncentive(svTSLAB.address);
        const credited = seizeTokens.sub(seizeTokens.mul(share).div(ONE).mul(ONE).div(incentive));
        expect(vReceived).to.equal(credited);
        expect(seizedRaw).to.equal(credited.mul(await svTSLAB.exchangeRateStored()).div(ONE));
        expect(ethers.utils.getAddress(txs[2].to)).to.equal(svTSLAB.address);
        expect(ethers.utils.getAddress(txs[3].to)).to.equal(mkt.bStock.address);
      });
    });

    /* ------------------------------------------------------------------ */
    /*                        Core is left alone                          */
    /* ------------------------------------------------------------------ */

    describe("Core is unaffected", () => {
      it("a spoke liquidation does not touch the Core bStock market", async () => {
        await fund(TOK.USDT, liq.address, REPAY);
        const coreVb = new ethers.Contract(
          mkt.vBStock.address,
          ["function totalSupply() view returns (uint256)", "function getCash() view returns (uint256)"],
          ethers.provider,
        );
        const supplyBefore = await coreVb.totalSupply();
        const cashBefore = await coreVb.getCash();

        await liq.connect(owner).liquidate(params());

        expect(await coreVb.totalSupply()).to.equal(supplyBefore);
        expect(await coreVb.getCash()).to.equal(cashBefore);
      });

      it("the Core comptroller can still not be allowlisted", async () => {
        await expect(liq.connect(owner).setAllowedComptroller(A.COMPTROLLER, true)).to.be.revertedWithCustomError(
          liq,
          "CoreComptrollerNotConfigurable",
        );
      });
    });
  });
};

/// Core is the flash lender in isolated mode; the receiver must be whitelisted on the diamond.
async function enableCoreFlash(owner: any, vDebt: string, liqAddr: string): Promise<boolean> {
  try {
    const v = new ethers.Contract(vDebt, ["function isFlashLoanEnabled() view returns (bool)"], owner);
    if (!(await v.isFlashLoanEnabled())) return false;
    const tl = await initMainnetUser(A.TIMELOCK, parseEther("10"));
    const acm = new ethers.Contract(A.ACM, ["function giveCallPermission(address,string,address)"], tl);
    try {
      await acm.giveCallPermission(A.COMPTROLLER, "setWhiteListFlashLoanAccount(address,bool)", A.TIMELOCK);
      await new ethers.Contract(
        A.COMPTROLLER,
        ["function setWhiteListFlashLoanAccount(address,bool)"],
        tl,
      ).setWhiteListFlashLoanAccount(liqAddr, true);
    } catch {
      /* setter may be absent at this block */
    }
    return true;
  } catch {
    return false;
  }
}

if (FORK_MAINNET) {
  forking(FORK_BLOCK, test);
}
