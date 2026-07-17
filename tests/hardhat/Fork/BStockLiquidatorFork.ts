// ============================================================================================
// BStockLiquidator — bscmainnet FORK suite (real bStock collateral market, real gate, RFQ-mocked hop-1)
// ============================================================================================
//
// WHAT THIS PROVES
// ----------------
// The bStock backstop liquidator settles a real, underwater bStock position end-to-end against the LIVE
// Core Pool: it repays the borrow through the real pool-wide Venus Liquidator gate, seizes + redeems the
// bStock collateral, sells it to the debt asset, and enforces `minOut` — across every debt-market shape
// (single-hop USDT, two-hop non-USDT, native BNB), in both funding modes (inventory + flash), and it
// rolls back cleanly when the sale under-delivers.
//
// WHY bStock IS LISTED FRESH, AND WHY HOP-1 IS A MOCK
// ---------------------------------------------------
// bStock (an ERC-8056 tokenized stock) is not yet on Core Pool, so `helpers/bstock.ts::listBStockMarket`
// stands up a genuine bStock collateral market on the live diamond exactly as governance would (deploy a
// vToken, wire a ResilientOracle price, set collateral factor / supply cap / per-market liquidation
// incentive, unpause). A freshly listed stock token has NO on-chain AMM liquidity — which is precisely
// why the production design sells the bStock->USDT leg through an off-chain Native RFQ (an MM-signed firm
// quote), not a DEX. A fork cannot reproduce an off-chain MM, so hop-1 is a `MockNativeRouter` pre-funded
// with USDT whose `rate` models the firm quote; hop-2 (USDT->debt) uses REAL PancakeSwap, where liquidity
// genuinely exists. The contract is collateral- and route-agnostic, so this faithfully exercises it.
//
// The realistic trigger modeled throughout is a PRICE GAP: the stock drops (bStock oracle price crashed
// via setDirectPrice), the account falls into shortfall, and the backstop fires. Borrowers are codeless
// EOAs because vBNB disburses native BNB with a CALL into the borrower and hardhat's default accounts
// carry an EIP-7702 delegation that reverts under the fork's rules.
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import fc from "fast-check";
import { ethers, upgrades } from "hardhat";

import { atomicLiquidate } from "../../../scripts/bstock/atomic-liquidate";
import { getPsmSwap } from "../../../scripts/bstock/lib/psm";
import {
  A,
  Action,
  BStockMarket,
  BalanceSlot,
  ERC20_ABI,
  ONE,
  TOK,
  VTOKEN_ABI,
  ZERO,
  assertRolledBack,
  assertSettledFor,
  buildSingleHopMock,
  buildTwoHopMockThenPcs,
  deployFundedMockNative,
  findBalanceSlot,
  listBStockMarket,
  makeUnderwaterBorrower,
  mulberry32,
  randBn,
  setTokenBalance,
} from "./helpers/bstock";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

const FORK_BLOCK = Number(process.env.FORK_BSTOCK_BLOCK || "107820000");

// Live BStockLiquidator proxy on bscmainnet (deployments/bscmainnet/BStockLiquidator.json, deployed at block 107817335).
const DEPLOYED_LIQ = "0xF03C90e6BF66b43411189Ad848F17723f8B4A3c1";

const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const VCAKE = "0x86aC3974e2BD0d60825230fa6F355fF11409df5c";

// VAI debt leg: the real VAIController (the "market" a VAI debt is keyed on), the VAI ERC20, and the
// real Peg Stability Module that lib/psm.ts targets as hop 2.
const VAI_CONTROLLER = "0x004065D34C6b18cE4370ced1CeBDE94865DbFAFE";
const VAI = "0x4BD17003473389A42DAF6a0a729f6Fdb328BbBd7";
const PSM_USDT = "0xC138aa4E424D1A8539e8F38Af5a754a2B7c3Cc36";
const VAI_CONTROLLER_ABI = [
  "function mintVAI(uint256) returns (uint256)",
  "function getVAIRepayAmount(address) view returns (uint256)",
  "function toggleOnlyPrimeHolderMint() returns (uint256)",
];
const ACM_GIVE_ABI = ["function giveCallPermission(address,string,address)"];
const PSM_FORK_ABI = [
  "function vaiMinted() view returns (uint256)",
  "function isPaused() view returns (bool)",
  "function pause()",
];
// e-mode pool admin surface used to stand up a NON-CORE pool that lists vBStock at a divergent
// liquidation incentive — the only reachable state where getEffectiveLiquidationIncentive differs
// from the core-pool getLiquidationIncentive (impossible for VAI, which is core-pool-locked).
const POOL_ADMIN_ABI = [
  "function createPool(string) returns (uint96)",
  "function addPoolMarkets(uint96[],address[])",
  "function setCollateralFactor(uint96,address,uint256,uint256) returns (uint256)",
  "function setLiquidationIncentive(uint96,address,uint256) returns (uint256)",
  "function setIsBorrowAllowed(uint96,address,bool)",
  "function enterPool(uint96)",
  "function enterMarkets(address[]) returns (uint256[])",
  "function getLiquidationIncentive(address) view returns (uint256)",
  "function getEffectiveLiquidationIncentive(address,address) view returns (uint256)",
  "function treasuryPercent() view returns (uint256)",
  "function liquidatorContract() view returns (address)",
];
const VENUS_LIQUIDATOR_ABI = ["function treasuryPercentMantissa() view returns (uint256)"];

// bStock USD prices: healthy vs post-crash (the stock gapped down ~80%).
const P_HEALTHY = parseUnits("250", 18);
const P_CRASH = parseUnits("50", 18);

// Distinct codeless EOA borrowers (no bytecode on the fork -> native disbursement is safe).
const B = {
  USDT: ethers.utils.getAddress("0x00000000000000000000000000000000ca110001"),
  CAKE: ethers.utils.getAddress("0x00000000000000000000000000000000ca110002"),
  BNB: ethers.utils.getAddress("0x00000000000000000000000000000000ca110003"),
  VAI: ethers.utils.getAddress("0x00000000000000000000000000000000ca11000a"),
  VAI_SCRIPT: ethers.utils.getAddress("0x00000000000000000000000000000000ca11000b"),
  EMODE: ethers.utils.getAddress("0x00000000000000000000000000000000ca11000d"),
  FLASH: ethers.utils.getAddress("0x00000000000000000000000000000000ca110004"),
  FORCED: ethers.utils.getAddress("0x00000000000000000000000000000000ca110005"),
  FORCED_SCRIPT: ethers.utils.getAddress("0x00000000000000000000000000000000ca11000c"),
  DEADLINE: ethers.utils.getAddress("0x00000000000000000000000000000000ca110006"),
  REENTRANCY: ethers.utils.getAddress("0x00000000000000000000000000000000ca110007"),
  ROLLBACK: ethers.utils.getAddress("0x00000000000000000000000000000000ca110008"),
  SWEEP: (i: number) => ethers.utils.getAddress("0x" + (0xca120000 + i).toString(16).padStart(40, "0")),
  FUZZ: (i: number) => ethers.utils.getAddress("0x" + (0xca130000 + i).toString(16).padStart(40, "0")),
};

const test = () => {
  describe("BStockLiquidator — bscmainnet fork: real bStock market, real gate, RFQ-mocked hop-1", () => {
    let owner: any;
    let mkt: BStockMarket;
    let liq: Contract;
    let mock: Contract; // Native RFQ stand-in for hop-1 (bStock -> USDT)
    let usdtSlot: number;
    let baseSnap: string;

    const slotCache: Record<string, BalanceSlot> = {};

    // Seed `amount` of `token` directly into `to` by writing the ERC20 balances slot (no whale needed).
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
      await setBalance(owner.address, parseEther("1000"));

      // Stand up the real bStock market once; every test reverts back to this state.
      mkt = await listBStockMarket(owner, P_HEALTHY);
      ({ mock, usdtSlot } = await deployFundedMockNative(owner, P_HEALTHY));
      slotCache[TOK.USDT] = usdtSlot;

      // Attach to the deployed bscmainnet proxy and take ownership on the fork (Ownable2Step)
      // so the suite exercises the real on-chain instance instead of a fresh deployment.
      liq = await ethers.getContractAt("BStockLiquidator", DEPLOYED_LIQ);
      const liqOwner = await initMainnetUser(await liq.owner(), parseEther("10"));
      await liq.connect(liqOwner).transferOwnership(owner.address);
      await liq.connect(owner).acceptOwnership();
      await liq.connect(owner).setRouter(mock.address, true); // hop-1 (Native RFQ mock)
      await liq.connect(owner).setRouter(A.PCS_ROUTER, true); // hop-2 (real PancakeSwap)

      baseSnap = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      // evm_revert consumes the snapshot id, so re-take it for the next test.
      await ethers.provider.send("evm_revert", [baseSnap]);
      baseSnap = await ethers.provider.send("evm_snapshot", []);
      await mock.setRate(P_HEALTHY); // reset the quote the mock models
    });

    /* ---------------------------------------------------------------- */
    /*                       curated scenarios                          */
    /* ---------------------------------------------------------------- */

    describe("curated scenarios", () => {
      it("single-hop USDT debt, inventory mode: price-gap shortfall settles, borrow drops", async () => {
        // Borrower supplies 100 bStock ($25k), borrows 5k USDT; the stock then gaps to $50 -> shortfall.
        await makeUnderwaterBorrower({
          mkt,
          vDebt: VUSDT,
          borrower: B.USDT,
          collateralBStock: parseUnits("100", 18),
          borrowAmount: parseUnits("5000", 18),
          crashPriceTo: P_CRASH,
        });
        await mock.setRate(P_CRASH); // MM quotes the gapped-down price

        const REPAY = parseUnits("2000", 18);
        await fund(TOK.USDT, liq.address, REPAY); // inventory
        const params = {
          borrower: B.USDT,
          vDebt: VUSDT,
          vBStock: mkt.vBStock.address,
          repayAmount: REPAY,
          router: mock.address,
          swapCalldata: buildSingleHopMock(mkt, mock, liq.address),
          minOut: parseUnits("1900", 18),
          router2: ZERO,
          swapCalldata2: "0x",
          intermediateToken: ZERO,
          deadline: ethers.constants.MaxUint256,
        };

        const borrowBefore = await new ethers.Contract(VUSDT, VTOKEN_ABI, owner).borrowBalanceStored(B.USDT);
        const out = await liq.connect(owner).callStatic.liquidate(params);
        expect(out).to.be.gte(params.minOut);
        await liq.connect(owner).liquidate(params);
        await assertSettledFor(liq, mkt, VUSDT, B.USDT, borrowBefore);
        expect(await new ethers.Contract(TOK.USDT, ERC20_ABI, owner).balanceOf(liq.address)).to.be.gte(params.minOut);
      });

      it("single-hop USDT debt via a Liquid-Mesh-style split router (separate spender): settles atomically", async () => {
        // Liquid Mesh pulls the input token through a SEPARATE spender, distinct from the call target, so
        // the contract must approve the spender (not the router) via `setRouterSpender`. The DEPLOYED proxy
        // (`DEPLOYED_LIQ`) predates `routerSpender`, so this scenario deploys a FRESH proxy on the current
        // implementation and drives it against the SAME real gate + bStock market to prove the split path
        // settles a real underwater position and leaves no standing approval.
        const Factory = await ethers.getContractFactory("BStockLiquidator");
        const liqLm = await upgrades.deployProxy(Factory, [owner.address], {
          constructorArgs: [A.COMPTROLLER, A.VBNB, A.VWBNB, TOK.WBNB],
          unsafeAllow: ["constructor", "state-variable-immutable"],
        });

        const spender = await (await ethers.getContractFactory("MockSpender")).deploy();
        const lmRouter = await (await ethers.getContractFactory("MockSplitRouter")).deploy(spender.address);
        await lmRouter.setRate(P_CRASH); // models the crashed-price bStock->USDT quote
        await fund(TOK.USDT, lmRouter.address, parseUnits("1000000", 18)); // the LM router pays USDT
        await liqLm.connect(owner).setRouter(lmRouter.address, true);
        await liqLm.connect(owner).setRouterSpender(lmRouter.address, spender.address);

        const borrower = ethers.utils.getAddress("0x00000000000000000000000000000000ca110009");
        await makeUnderwaterBorrower({
          mkt,
          vDebt: VUSDT,
          borrower,
          collateralBStock: parseUnits("100", 18),
          borrowAmount: parseUnits("5000", 18),
          crashPriceTo: P_CRASH,
        });

        const REPAY = parseUnits("2000", 18);
        await fund(TOK.USDT, liqLm.address, REPAY); // inventory
        const params = {
          borrower,
          vDebt: VUSDT,
          vBStock: mkt.vBStock.address,
          repayAmount: REPAY,
          router: lmRouter.address,
          swapCalldata: lmRouter.interface.encodeFunctionData("swapAll", [mkt.bStock.address, TOK.USDT, liqLm.address]),
          minOut: parseUnits("1900", 18),
          router2: ZERO,
          swapCalldata2: "0x",
          intermediateToken: ZERO,
          deadline: ethers.constants.MaxUint256,
        };

        const borrowBefore = await new ethers.Contract(VUSDT, VTOKEN_ABI, owner).borrowBalanceStored(borrower);
        const out = await liqLm.connect(owner).callStatic.liquidate(params);
        expect(out).to.be.gte(params.minOut);
        await liqLm.connect(owner).liquidate(params);
        await assertSettledFor(liqLm, mkt, VUSDT, borrower, borrowBefore);
        // The split router pulled the bStock via its spender, and no standing allowance is left behind.
        const bStock = new ethers.Contract(
          mkt.bStock.address,
          [...ERC20_ABI, "function allowance(address,address) view returns (uint256)"],
          owner,
        );
        expect(await bStock.balanceOf(lmRouter.address)).to.be.gt(0);
        expect(await bStock.allowance(liqLm.address, spender.address)).to.equal(0);
      });

      it("two-hop CAKE debt, inventory mode: bStock->USDT (mock) -> CAKE (real PCS) at live slippage", async () => {
        await makeUnderwaterBorrower({
          mkt,
          vDebt: VCAKE,
          borrower: B.CAKE,
          collateralBStock: parseUnits("100", 18),
          borrowAmount: parseUnits("4000", 18), // ~4000 CAKE; must exceed post-crash collateral power ($3k)
          crashPriceTo: P_CRASH,
        });
        await mock.setRate(P_CRASH);

        const REPAY = parseUnits("1500", 18); // CAKE (< closeFactor * borrow = 2000)
        await fund(TOK.CAKE, liq.address, REPAY);
        const { swapCalldata, swapCalldata2, expectedOut } = await buildTwoHopMockThenPcs(
          owner,
          mkt,
          mock,
          VCAKE,
          REPAY,
          [TOK.USDT, TOK.CAKE],
          liq.address,
          P_CRASH,
          B.CAKE,
        );
        const params = {
          borrower: B.CAKE,
          vDebt: VCAKE,
          vBStock: mkt.vBStock.address,
          repayAmount: REPAY,
          router: mock.address,
          swapCalldata,
          minOut: expectedOut.mul(90).div(100),
          router2: A.PCS_ROUTER,
          swapCalldata2,
          intermediateToken: TOK.USDT,
          deadline: ethers.constants.MaxUint256,
        };

        const borrowBefore = await new ethers.Contract(VCAKE, VTOKEN_ABI, owner).borrowBalanceStored(B.CAKE);
        const out = await liq.connect(owner).callStatic.liquidate(params);
        expect(out).to.be.gte(params.minOut);
        await liq.connect(owner).liquidate(params);
        await assertSettledFor(liq, mkt, VCAKE, B.CAKE, borrowBefore);
      });

      it("native BNB debt (vBNB): WBNB unwrap of the repay, two-hop to WBNB, nothing stranded", async () => {
        await makeUnderwaterBorrower({
          mkt,
          vDebt: A.VBNB,
          borrower: B.BNB,
          collateralBStock: parseUnits("100", 18),
          borrowAmount: parseEther("8"), // ~8 BNB; post-crash collateral power ($3k) is well under this
          crashPriceTo: P_CRASH,
        });
        await mock.setRate(P_CRASH);

        const REPAY = parseEther("2"); // WBNB repay inventory (contract unwraps to native for the gate)
        await fund(TOK.WBNB, liq.address, REPAY);
        const { swapCalldata, swapCalldata2, expectedOut } = await buildTwoHopMockThenPcs(
          owner,
          mkt,
          mock,
          A.VBNB,
          REPAY,
          [TOK.USDT, TOK.WBNB],
          liq.address,
          P_CRASH,
          B.BNB,
        );
        const params = {
          borrower: B.BNB,
          vDebt: A.VBNB,
          vBStock: mkt.vBStock.address,
          repayAmount: REPAY,
          router: mock.address,
          swapCalldata,
          minOut: expectedOut.mul(90).div(100),
          router2: A.PCS_ROUTER,
          swapCalldata2,
          intermediateToken: TOK.USDT,
          deadline: ethers.constants.MaxUint256,
        };

        const vBnb = new ethers.Contract(A.VBNB, VTOKEN_ABI, owner);
        const borrowBefore = await vBnb.borrowBalanceStored(B.BNB);
        const out = await liq.connect(owner).callStatic.liquidate(params);
        expect(out).to.be.gte(params.minOut);
        await liq.connect(owner).liquidate(params);
        expect(await vBnb.borrowBalanceStored(B.BNB)).to.be.lt(borrowBefore);
        // Proceeds retained as WBNB, no native BNB stranded on the proxy.
        expect(await new ethers.Contract(TOK.WBNB, ERC20_ABI, owner).balanceOf(liq.address)).to.be.gte(params.minOut);
        expect(await ethers.provider.getBalance(liq.address)).to.equal(0);
      });

      // Shared VAI scaffolding. VAI minting is prime-holder-gated at the fork block, so the flag is
      // flipped through the real ACM + timelock (a governance-reachable state, not a hack); the
      // borrower is then constructed for real — supply bStock, enter the market, mint VAI on the real
      // VAIController, and gap the stock down into shortfall. (makeUnderwaterBorrower borrows from a
      // vToken; VAI debt is minted on the VAIController instead, hence the dedicated builder.)
      async function makeUnderwaterVaiBorrower(borrowerAddr: string, vaiDebt: BigNumber): Promise<Contract> {
        const timelock = await initMainnetUser(A.TIMELOCK, parseEther("5"));
        await new ethers.Contract(A.ACM, ACM_GIVE_ABI, timelock).giveCallPermission(
          VAI_CONTROLLER,
          "toggleOnlyPrimeHolderMint()",
          owner.address,
        );
        const vaiCtrl = new ethers.Contract(VAI_CONTROLLER, VAI_CONTROLLER_ABI, owner);
        await vaiCtrl.toggleOnlyPrimeHolderMint();

        const borrower = await initMainnetUser(borrowerAddr, parseUnits("10", 18));
        const COLLATERAL = parseUnits("100", 18);
        await mkt.bStock.mint(borrowerAddr, COLLATERAL);
        await mkt.bStock.connect(borrower).approve(mkt.vBStock.address, COLLATERAL);
        await new ethers.Contract(mkt.vBStock.address, VTOKEN_ABI, borrower).mint(COLLATERAL);
        await new ethers.Contract(
          A.COMPTROLLER,
          ["function enterMarkets(address[]) returns (uint256[])"],
          borrower,
        ).enterMarkets([mkt.vBStock.address]);
        // mintVAI returns an error CODE (legacy style) — probe first so a cap/pause surfaces loudly.
        const mintCode: BigNumber = await vaiCtrl.connect(borrower).callStatic.mintVAI(vaiDebt);
        if (!mintCode.eq(0)) throw new Error(`mintVAI returned code ${mintCode.toString()}`);
        await vaiCtrl.connect(borrower).mintVAI(vaiDebt);
        expect(await vaiCtrl.getVAIRepayAmount(borrowerAddr)).to.be.gte(vaiDebt);
        await mkt.setPrice(P_CRASH);
        await mock.setRate(P_CRASH);
        return vaiCtrl;
      }

      // The DEPLOYED proxy predates VAI support (it reads `underlying()` on every vDebt, which the
      // VAIController lacks), so the VAI scenarios deploy a FRESH proxy on the current implementation
      // and drive it against the same real gate, real VAIController, and real PSM.
      async function deployVaiLiquidator(): Promise<Contract> {
        const Factory = await ethers.getContractFactory("BStockLiquidator");
        const liqVai = await upgrades.deployProxy(Factory, [owner.address], {
          constructorArgs: [A.COMPTROLLER, A.VBNB, A.VWBNB, TOK.WBNB],
          unsafeAllow: ["constructor", "state-variable-immutable"],
        });
        await liqVai.connect(owner).setRouter(mock.address, true); // hop-1 (Native RFQ mock)
        await liqVai.connect(owner).setRouter(PSM_USDT, true); // hop-2 router: the real PSM
        return liqVai;
      }

      // Hop-1 USDT output at the crashed price for a given VAI repay, undershot 10% like the PCS leg,
      // so a fixed hop-2 amountIn always fits under the contract's approval of the actual hop-1 delta.
      async function vaiHop1Floor(repay: BigNumber): Promise<BigNumber> {
        const comptroller = new ethers.Contract(
          A.COMPTROLLER,
          ["function liquidateVAICalculateSeizeTokens(address,uint256) view returns (uint256,uint256)"],
          owner,
        );
        const [, seizeTokens] = await comptroller.liquidateVAICalculateSeizeTokens(mkt.vBStock.address, repay);
        const xr: BigNumber = await mkt.vBStock.exchangeRateStored();
        return seizeTokens.mul(xr).div(ONE).mul(P_CRASH).div(ONE).mul(90).div(100);
      }

      // Stand up a NON-CORE e-mode pool that lists vBStock at a liquidation incentive DIFFERENT from
      // core, put the borrower in it with an ERC20 (USDT) debt, and gap the stock into shortfall. This is
      // the only state where getEffectiveLiquidationIncentive (pool-resolved) diverges from the core
      // getLiquidationIncentive — VAI can never reach it (VAIController.mintVAI requires the core pool and
      // hasValidPoolBorrows bars leaving it while VAI debt is open), so the treasury-cut divergence is
      // proven here on a real ERC20 debt against the live diamond.
      async function makeUnderwaterEmodeBorrower(
        borrowerAddr: string,
        poolIncentive: BigNumber,
        borrowUsdt: BigNumber,
      ): Promise<BigNumber> {
        const tl = await initMainnetUser(A.TIMELOCK, parseEther("10"));
        const acm = new ethers.Contract(A.ACM, ACM_GIVE_ABI, tl);
        for (const sig of [
          "createPool(string)",
          "addPoolMarkets(uint96[],address[])",
          "setCollateralFactor(uint96,address,uint256,uint256)",
          "setLiquidationIncentive(uint96,address,uint256)",
          "setIsBorrowAllowed(uint96,address,bool)",
        ]) {
          await acm.giveCallPermission(A.COMPTROLLER, sig, A.TIMELOCK);
        }
        const cTl = new ethers.Contract(A.COMPTROLLER, POOL_ADMIN_ABI, tl);
        const poolId: BigNumber = await cTl.callStatic.createPool("bstock-emode-divergence");
        await cTl.createPool("bstock-emode-divergence");
        // vBStock is the collateral in the pool at a DIVERGENT incentive; VUSDT is the borrowable debt.
        await cTl.addPoolMarkets([poolId, poolId], [mkt.vBStock.address, VUSDT]);
        await cTl.setCollateralFactor(poolId, mkt.vBStock.address, parseUnits("0.6", 18), parseUnits("0.6", 18));
        await cTl.setLiquidationIncentive(poolId, mkt.vBStock.address, poolIncentive);
        await cTl.setIsBorrowAllowed(poolId, VUSDT, true);

        const borrower = await initMainnetUser(borrowerAddr, parseUnits("10", 18));
        const COLLATERAL = parseUnits("100", 18);
        await mkt.bStock.mint(borrowerAddr, COLLATERAL);
        await mkt.bStock.connect(borrower).approve(mkt.vBStock.address, COLLATERAL);
        await new ethers.Contract(mkt.vBStock.address, VTOKEN_ABI, borrower).mint(COLLATERAL);
        const cAsBorrower = new ethers.Contract(A.COMPTROLLER, POOL_ADMIN_ABI, borrower);
        await cAsBorrower.enterMarkets([mkt.vBStock.address]);
        // Switch pools BEFORE borrowing: with no open debt the enterPool liquidity check passes trivially.
        await cAsBorrower.enterPool(poolId);
        // Borrow USDT while in the non-core pool. Legacy vTokens return an error CODE — probe, then assert.
        const vUsdt = new ethers.Contract(VUSDT, VTOKEN_ABI, borrower);
        const code: BigNumber = await vUsdt.callStatic.borrow(borrowUsdt);
        if (!code.eq(0)) throw new Error(`borrow(VUSDT) in pool ${poolId.toString()} returned code ${code.toString()}`);
        await vUsdt.borrow(borrowUsdt);
        if ((await vUsdt.borrowBalanceStored(borrowerAddr)).eq(0)) throw new Error("borrow produced no debt");
        await mkt.setPrice(P_CRASH);
        await mock.setRate(P_CRASH);
        return poolId;
      }

      it("two-hop VAI debt, inventory mode: bStock->USDT (mock) -> VAI through the REAL PSM, script-built calldata", async () => {
        const vaiCtrl = await makeUnderwaterVaiBorrower(B.VAI, parseUnits("4000", 18));
        const liqVai = await deployVaiLiquidator();

        const REPAY = parseUnits("1500", 18); // VAI (< closeFactor * debt = 2000)
        await fund(VAI, liqVai.address, REPAY); // pre-funded VAI inventory (flash is not supported for VAI)

        // Size hop 2 exactly as the script does, then let the SCRIPT's builder (lib/psm.ts) produce the
        // calldata: what settles on the fork is the blob it constructs against the real PSM, expected
        // out from the real previewSwapStableForVAI.
        const floor = await vaiHop1Floor(REPAY);
        const psmSwap = await getPsmSwap({ amountIn: floor, recipient: liqVai.address }, ethers.provider);
        expect(psmSwap.router).to.equal(PSM_USDT);
        const expectedOut = BigNumber.from(psmSwap.expectedOut);

        const params = {
          borrower: B.VAI,
          vDebt: VAI_CONTROLLER,
          vBStock: mkt.vBStock.address,
          repayAmount: REPAY,
          router: mock.address,
          swapCalldata: buildSingleHopMock(mkt, mock, liqVai.address),
          minOut: expectedOut.mul(999).div(1000),
          router2: psmSwap.router,
          swapCalldata2: psmSwap.calldata,
          intermediateToken: TOK.USDT,
          deadline: ethers.constants.MaxUint256,
        };

        const psm = new ethers.Contract(PSM_USDT, PSM_FORK_ABI, owner);
        const debtBefore = await vaiCtrl.getVAIRepayAmount(B.VAI);
        const mintedBefore: BigNumber = await psm.vaiMinted();
        const out = await liqVai.connect(owner).callStatic.liquidate(params);
        expect(out).to.be.gte(params.minOut);
        await liqVai.connect(owner).liquidate(params);

        // Debt shrank through the real gate's VAI branch; the real PSM minted exactly its preview to the
        // contract; the inventory repay was consumed; no bStock or native BNB stranded.
        expect(await vaiCtrl.getVAIRepayAmount(B.VAI)).to.be.lt(debtBefore);
        const vai = new ethers.Contract(VAI, ERC20_ABI, owner);
        expect(await vai.balanceOf(liqVai.address)).to.equal(expectedOut);
        expect((await psm.vaiMinted()).sub(mintedBefore)).to.equal(expectedOut);
        expect(await mkt.bStock.balanceOf(liqVai.address)).to.equal(0);
        expect(await ethers.provider.getBalance(liqVai.address)).to.equal(0);
      });

      // The SCRIPT end-to-end for a VAI debt: atomicLiquidate() itself must detect the VAIController
      // debt, size the seize with the VAI-specific overload, build the PSM hop-2 calldata via lib/psm.ts
      // against its REAL default PSM address (PSM_ADDR deliberately unset), derive minOut from the real
      // preview, and submit the settle. Hop-1 is a fetch-stubbed firm Native quote against the funded
      // mock router — NOT the MOCK_NATIVE env path, which would bypass the hop-2 build under test.
      it("script-driven VAI liquidation: atomicLiquidate() builds and settles the real PSM hop 2", async () => {
        const vaiCtrl = await makeUnderwaterVaiBorrower(B.VAI_SCRIPT, parseUnits("4000", 18));
        const liqVai = await deployVaiLiquidator();

        const REPAY = parseUnits("1500", 18);
        await fund(VAI, liqVai.address, REPAY); // inventory (the script rejects flash for VAI)

        // The firm quote the stub serves; for a firm source the script's floor == this out, so the PSM
        // pull is exactly `quoteOut` and the delivered VAI is exactly its preview.
        const quoteOut = await vaiHop1Floor(REPAY);
        const psm = new ethers.Contract(
          PSM_USDT,
          [...PSM_FORK_ABI, "function previewSwapStableForVAI(uint256) view returns (uint256)"],
          owner,
        );
        const expectedOut: BigNumber = await psm.previewSwapStableForVAI(quoteOut);

        const SCRIPT_ENV = [
          "LIQUIDATOR",
          "BORROWER",
          "VBSTOCK",
          "VDEBT",
          "REPAY_AMOUNT",
          "MODE",
          "SOURCE",
          "NATIVE_API_KEY",
          "MOCK_NATIVE",
          "MOCK_OUT",
          "PSM_ADDR",
        ];
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async () => ({
          json: async () => ({
            success: true,
            recipient: liqVai.address,
            amountIn: "0",
            amountOut: quoteOut.toString(),
            orders: [{ deadlineTimestamp: Math.floor(Date.now() / 1000) + 3600 }],
            txRequest: { target: mock.address, calldata: buildSingleHopMock(mkt, mock, liqVai.address), value: "0" },
          }),
        })) as unknown as typeof fetch;

        const debtBefore = await vaiCtrl.getVAIRepayAmount(B.VAI_SCRIPT);
        const mintedBefore: BigNumber = await psm.vaiMinted();
        try {
          Object.assign(process.env, {
            LIQUIDATOR: liqVai.address,
            BORROWER: B.VAI_SCRIPT,
            VBSTOCK: mkt.vBStock.address,
            VDEBT: VAI_CONTROLLER, // the real VAIController — the script must key its VAI path off it
            REPAY_AMOUNT: "1500",
            MODE: "inventory",
            SOURCE: "native",
            NATIVE_API_KEY: "test-key",
          });
          await atomicLiquidate(owner);

          // And the script refuses flash for VAI before any quote (mirrors FlashNotSupportedForVai).
          process.env.MODE = "flash";
          await expect(atomicLiquidate(owner)).to.be.rejectedWith(/flash.*VAI/i);
        } finally {
          globalThis.fetch = realFetch;
          for (const k of SCRIPT_ENV) delete process.env[k];
        }

        // Debt shrank through the real gate; the real PSM minted exactly the preview of the script's
        // floor; the hop-1 surplus over the undershot floor stayed behind as sweepable USDT inventory.
        expect(await vaiCtrl.getVAIRepayAmount(B.VAI_SCRIPT)).to.be.lt(debtBefore);
        const vai = new ethers.Contract(VAI, ERC20_ABI, owner);
        expect(await vai.balanceOf(liqVai.address)).to.equal(expectedOut);
        expect((await psm.vaiMinted()).sub(mintedBefore)).to.equal(expectedOut);
        expect(await new ethers.Contract(TOK.USDT, ERC20_ABI, owner).balanceOf(liqVai.address)).to.be.gt(0);
        expect(await mkt.bStock.balanceOf(liqVai.address)).to.equal(0);
      });

      it("getPsmSwap aborts legibly when the real PSM is paused on the fork", async () => {
        // Pause the real PSM through the real ACM + timelock, then the script's pre-flight must refuse
        // to build the VAI hop instead of producing calldata that reverts on-chain.
        const timelock = await initMainnetUser(A.TIMELOCK, parseEther("5"));
        await new ethers.Contract(A.ACM, ACM_GIVE_ABI, timelock).giveCallPermission(PSM_USDT, "pause()", owner.address);
        const psm = new ethers.Contract(PSM_USDT, PSM_FORK_ABI, owner);
        await psm.pause();
        expect(await psm.isPaused()).to.equal(true);

        await expect(getPsmSwap({ amountIn: ONE, recipient: liq.address }, ethers.provider)).to.be.rejectedWith(
          /paused/i,
        );
      });

      it("effective-incentive divergence (ERC20 debt, non-core pool): script sizes the cut off effective and settles", async () => {
        // The divergence the VAI unit test can only MODEL is REAL here. A non-core e-mode pool lists
        // vBStock at 1.25x while core stays 1.1x, and the USDT borrower sits in that pool — so on the live
        // diamond getEffectiveLiquidationIncentive(borrower, vBStock) (1.25) differs from the core
        // getLiquidationIncentive(vBStock) (1.1). The gate sizes its treasury cut off the effective one for
        // EVERY debt (Liquidator._splitLiquidationIncentive), so the script must too; a core-based cut
        // would overstate the credited seize and missize the hop-1 sell. We prove (a) the two getters
        // actually diverge on real contracts, (b) the script quotes hop-1 off the EFFECTIVE-derived seize,
        // and (c) it settles end-to-end through the real gate.
        const POOL_INCENTIVE = parseUnits("1.25", 18);
        await makeUnderwaterEmodeBorrower(B.EMODE, POOL_INCENTIVE, parseUnits("5000", 18));

        const comptroller = new ethers.Contract(A.COMPTROLLER, POOL_ADMIN_ABI, owner);
        const coreInc: BigNumber = await comptroller.getLiquidationIncentive(mkt.vBStock.address);
        const effInc: BigNumber = await comptroller.getEffectiveLiquidationIncentive(B.EMODE, mkt.vBStock.address);
        // (a) real, reachable divergence — not a mock.
        expect(coreInc).to.equal(parseUnits("1.1", 18));
        expect(effInc).to.equal(POOL_INCENTIVE);
        expect(effInc.eq(coreInc)).to.equal(false);

        const REPAY = parseUnits("2000", 18);
        // Reproduce the script's cut math for BOTH incentives so the assertion is discriminating.
        const seizeLens = new ethers.Contract(
          A.COMPTROLLER,
          ["function liquidateCalculateSeizeTokens(address,address,address,uint256) view returns (uint256,uint256)"],
          owner,
        );
        const [, seizeTokens]: BigNumber[] = await seizeLens.liquidateCalculateSeizeTokens(
          B.EMODE,
          VUSDT,
          mkt.vBStock.address,
          REPAY,
        );
        const xr: BigNumber = await mkt.vBStock.exchangeRateStored();
        const treasuryPercent: BigNumber = await comptroller.treasuryPercent();
        const gate: string = await comptroller.liquidatorContract();
        const treasuryPct: BigNumber = await new ethers.Contract(
          gate,
          VENUS_LIQUIDATOR_ABI,
          owner,
        ).treasuryPercentMantissa();
        // Mirrors atomic-liquidate.ts exactly (SEIZE_BUFFER=0 -> seizedForQuote == seizedRaw), so the
        // human string below equals the script's quoted `amount` bit-for-bit.
        const sellFor = (inc: BigNumber): BigNumber => {
          const bonus = seizeTokens.mul(inc.sub(ONE)).div(inc);
          const cut = bonus.mul(treasuryPct).div(ONE);
          const vRecv = seizeTokens.sub(cut);
          return vRecv.mul(xr).div(ONE).mul(ONE.sub(treasuryPercent)).div(ONE);
        };
        const sellEff = sellFor(effInc);
        const sellCore = sellFor(coreInc);
        expect(sellEff.eq(sellCore)).to.equal(false); // the incentive choice materially moves the sell size

        // Run the SCRIPT and capture the hop-1 quote `amount` (bStock, human units) it asks Native for.
        await fund(TOK.USDT, liq.address, REPAY); // inventory
        const usdtDelivered = P_CRASH.mul(sellEff).div(ONE); // mock router pays this for the seized bStock
        let quotedAmount: string | null = null;
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (url: unknown) => {
          quotedAmount = new URL(String(url)).searchParams.get("amount");
          return {
            json: async () => ({
              success: true,
              recipient: liq.address,
              amountIn: "0",
              amountOut: usdtDelivered.toString(),
              orders: [{ deadlineTimestamp: Math.floor(Date.now() / 1000) + 3600 }],
              txRequest: { target: mock.address, calldata: buildSingleHopMock(mkt, mock, liq.address), value: "0" },
            }),
          };
        }) as unknown as typeof fetch;

        const SCRIPT_ENV = [
          "LIQUIDATOR",
          "BORROWER",
          "VBSTOCK",
          "VDEBT",
          "REPAY_AMOUNT",
          "MODE",
          "SOURCE",
          "NATIVE_API_KEY",
          "SEIZE_BUFFER",
        ];
        const borrowBefore = await new ethers.Contract(VUSDT, VTOKEN_ABI, owner).borrowBalanceStored(B.EMODE);
        try {
          Object.assign(process.env, {
            LIQUIDATOR: liq.address,
            BORROWER: B.EMODE,
            VBSTOCK: mkt.vBStock.address,
            VDEBT: VUSDT,
            REPAY_AMOUNT: "2000",
            MODE: "inventory",
            SOURCE: "native",
            NATIVE_API_KEY: "test-key",
            SEIZE_BUFFER: "0", // no haircut -> the quoted amount equals the effective-cut seizedRaw exactly
          });
          await atomicLiquidate(owner);
        } finally {
          globalThis.fetch = realFetch;
          for (const k of SCRIPT_ENV) delete process.env[k];
        }

        // (b) the script quoted the EFFECTIVE-derived sell size — and it is NOT the core-derived one.
        expect(quotedAmount).to.equal(ethers.utils.formatUnits(sellEff, 18));
        expect(quotedAmount).to.not.equal(ethers.utils.formatUnits(sellCore, 18));
        // (c) settled through the real gate.
        await assertSettledFor(liq, mkt, VUSDT, B.EMODE, borrowBefore);
      });

      it("minOut breach -> InsufficientOut, FULL rollback: borrow + inventory intact, nothing stranded", async () => {
        await makeUnderwaterBorrower({
          mkt,
          vDebt: VUSDT,
          borrower: B.ROLLBACK,
          collateralBStock: parseUnits("100", 18),
          borrowAmount: parseUnits("5000", 18),
          crashPriceTo: P_CRASH,
        });
        await mock.setRate(P_CRASH);

        const REPAY = parseUnits("2000", 18);
        await fund(TOK.USDT, liq.address, REPAY);
        const params = {
          borrower: B.ROLLBACK,
          vDebt: VUSDT,
          vBStock: mkt.vBStock.address,
          repayAmount: REPAY,
          router: mock.address,
          swapCalldata: buildSingleHopMock(mkt, mock, liq.address),
          minOut: parseUnits("100000", 18), // impossibly high -> must revert
          router2: ZERO,
          swapCalldata2: "0x",
          intermediateToken: ZERO,
          deadline: ethers.constants.MaxUint256,
        };

        const borrowBefore = await new ethers.Contract(VUSDT, VTOKEN_ABI, owner).borrowBalanceStored(B.ROLLBACK);
        await expect(liq.connect(owner).liquidate(params)).to.be.revertedWithCustomError(liq, "InsufficientOut");
        await assertRolledBack(liq, mkt, VUSDT, B.ROLLBACK, borrowBefore, TOK.USDT, REPAY);
      });

      it("forced liquidation: a healthy account with forced-liquidation enabled is liquidatable", async () => {
        // Supply + borrow but DO NOT crash the price -> the account is healthy (no shortfall).
        await makeUnderwaterBorrower({
          mkt,
          vDebt: VUSDT,
          borrower: B.FORCED,
          collateralBStock: parseUnits("100", 18),
          borrowAmount: parseUnits("5000", 18),
        });
        // The MM still quotes the (uncrashed) price.
        await mock.setRate(P_HEALTHY);

        const cAsTl = new ethers.Contract(
          A.COMPTROLLER,
          ["function _setForcedLiquidation(address,bool)"],
          await initMainnetUser(A.TIMELOCK, parseEther("10")),
        );
        const acm = new ethers.Contract(
          A.ACM,
          ["function giveCallPermission(address,string,address)"],
          await initMainnetUser(A.TIMELOCK, parseEther("10")),
        );
        await acm.giveCallPermission(A.COMPTROLLER, "_setForcedLiquidation(address,bool)", A.TIMELOCK);
        await cAsTl._setForcedLiquidation(VUSDT, true);

        const REPAY = parseUnits("2000", 18);
        await fund(TOK.USDT, liq.address, REPAY);
        const params = {
          borrower: B.FORCED,
          vDebt: VUSDT,
          vBStock: mkt.vBStock.address,
          repayAmount: REPAY,
          router: mock.address,
          swapCalldata: buildSingleHopMock(mkt, mock, liq.address),
          minOut: parseUnits("9000", 18), // healthy price -> ~2200*(250/50)... generous, see below
          router2: ZERO,
          swapCalldata2: "0x",
          intermediateToken: ZERO,
          deadline: ethers.constants.MaxUint256,
        };
        // At the healthy $250 quote the seized bStock is worth far more; set minOut against the live math.
        const out = await liq.connect(owner).callStatic.liquidate({ ...params, minOut: 1 });
        const borrowBefore = await new ethers.Contract(VUSDT, VTOKEN_ABI, owner).borrowBalanceStored(B.FORCED);
        await liq.connect(owner).liquidate({ ...params, minOut: out.mul(95).div(100) });
        await assertSettledFor(liq, mkt, VUSDT, B.FORCED, borrowBefore);
      });

      it("script-driven forced liquidation: atomicLiquidate under ALLOW_NO_SHORTFALL settles a healthy account", async () => {
        // The SCRIPT counterpart of the contract-level forced test above: a HEALTHY (no-shortfall)
        // account with forced-liquidation enabled. atomicLiquidate aborts such an account by default (a
        // fat-finger guard), and ALLOW_NO_SHORTFALL=1 lets the forced path through. It must then settle
        // end-to-end against the real gate — proving the guard downgrade did not break the forced flow.
        await makeUnderwaterBorrower({
          mkt,
          vDebt: VUSDT,
          borrower: B.FORCED_SCRIPT,
          collateralBStock: parseUnits("100", 18),
          borrowAmount: parseUnits("5000", 18),
        });
        await mock.setRate(P_HEALTHY); // MM quotes the uncrashed price

        const acm = new ethers.Contract(A.ACM, ACM_GIVE_ABI, await initMainnetUser(A.TIMELOCK, parseEther("10")));
        await acm.giveCallPermission(A.COMPTROLLER, "_setForcedLiquidation(address,bool)", A.TIMELOCK);
        const cAsTl = new ethers.Contract(
          A.COMPTROLLER,
          ["function _setForcedLiquidation(address,bool)"],
          await initMainnetUser(A.TIMELOCK, parseEther("10")),
        );
        await cAsTl._setForcedLiquidation(VUSDT, true);

        await fund(TOK.USDT, liq.address, parseUnits("2000", 18)); // inventory for the repay
        // Firm Native quote stubbed LOW so minOut (derived from its floor) is trivially cleared by the
        // real hop-1 delivery — the assertion under test is the ALLOW_NO_SHORTFALL gate, not quote size.
        const SCRIPT_ENV = [
          "LIQUIDATOR",
          "BORROWER",
          "VBSTOCK",
          "VDEBT",
          "REPAY_AMOUNT",
          "MODE",
          "SOURCE",
          "NATIVE_API_KEY",
          "ALLOW_NO_SHORTFALL",
        ];
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async () => ({
          json: async () => ({
            success: true,
            recipient: liq.address,
            amountIn: "0",
            amountOut: parseUnits("500", 18).toString(),
            orders: [{ deadlineTimestamp: Math.floor(Date.now() / 1000) + 3600 }],
            txRequest: { target: mock.address, calldata: buildSingleHopMock(mkt, mock, liq.address), value: "0" },
          }),
        })) as unknown as typeof fetch;

        const borrowBefore = await new ethers.Contract(VUSDT, VTOKEN_ABI, owner).borrowBalanceStored(B.FORCED_SCRIPT);
        try {
          Object.assign(process.env, {
            LIQUIDATOR: liq.address,
            BORROWER: B.FORCED_SCRIPT,
            VBSTOCK: mkt.vBStock.address,
            VDEBT: VUSDT,
            REPAY_AMOUNT: "2000",
            MODE: "inventory",
            SOURCE: "native",
            NATIVE_API_KEY: "test-key",
          });
          // Default (no override) must refuse the healthy account before any settle.
          await expect(atomicLiquidate(owner)).to.be.rejectedWith(/no shortfall/i);
          // With the forced-liquidation override it proceeds and settles.
          process.env.ALLOW_NO_SHORTFALL = "1";
          await atomicLiquidate(owner);
        } finally {
          globalThis.fetch = realFetch;
          for (const k of SCRIPT_ENV) delete process.env[k];
        }
        await assertSettledFor(liq, mkt, VUSDT, B.FORCED_SCRIPT, borrowBefore);
      });

      it("expired deadline -> DeadlineExpired, no state change", async () => {
        await makeUnderwaterBorrower({
          mkt,
          vDebt: VUSDT,
          borrower: B.DEADLINE,
          collateralBStock: parseUnits("100", 18),
          borrowAmount: parseUnits("5000", 18),
          crashPriceTo: P_CRASH,
        });
        await mock.setRate(P_CRASH);
        const REPAY = parseUnits("2000", 18);
        await fund(TOK.USDT, liq.address, REPAY);
        const params = {
          borrower: B.DEADLINE,
          vDebt: VUSDT,
          vBStock: mkt.vBStock.address,
          repayAmount: REPAY,
          router: mock.address,
          swapCalldata: buildSingleHopMock(mkt, mock, liq.address),
          minOut: parseUnits("1900", 18),
          router2: ZERO,
          swapCalldata2: "0x",
          intermediateToken: ZERO,
          deadline: 1, // in the past
        };
        const borrowBefore = await new ethers.Contract(VUSDT, VTOKEN_ABI, owner).borrowBalanceStored(B.DEADLINE);
        await expect(liq.connect(owner).liquidate(params)).to.be.revertedWithCustomError(liq, "DeadlineExpired");
        await assertRolledBack(liq, mkt, VUSDT, B.DEADLINE, borrowBefore, TOK.USDT, REPAY);
      });

      it("reentrancy: an allowlisted+operator malicious router cannot re-enter liquidate", async () => {
        await makeUnderwaterBorrower({
          mkt,
          vDebt: VUSDT,
          borrower: B.REENTRANCY,
          collateralBStock: parseUnits("100", 18),
          borrowAmount: parseUnits("5000", 18),
          crashPriceTo: P_CRASH,
        });

        // Deploy the malicious router, fund it with USDT so its own swap can pay out, and configure the
        // re-entry to call liquidate again. Allowlist + operator-grant it so the re-entry reaches the guard.
        const evil = await (await ethers.getContractFactory("MockReentrantRouter")).deploy();
        await evil.setRate(P_CRASH); // pays USDT for the seized bStock at the crashed quote
        await fund(TOK.USDT, evil.address, parseUnits("1000000", 18));
        await liq.connect(owner).setRouter(evil.address, true);
        await liq.connect(owner).setOperator(evil.address, true);

        const REPAY = parseUnits("2000", 18);
        await fund(TOK.USDT, liq.address, REPAY);
        // Use swapAll so the hop actually delivers USDT and the OUTER liquidation SETTLES — that is what
        // lets us observe the re-entry was blocked (a reverted outer tx would roll back evil's flags too).
        const params = {
          borrower: B.REENTRANCY,
          vDebt: VUSDT,
          vBStock: mkt.vBStock.address,
          repayAmount: REPAY,
          router: evil.address,
          swapCalldata: evil.interface.encodeFunctionData("swapAll", [mkt.bStock.address, TOK.USDT, liq.address]),
          minOut: parseUnits("1", 18),
          router2: ZERO,
          swapCalldata2: "0x",
          intermediateToken: ZERO,
          deadline: ethers.constants.MaxUint256,
        };
        // The re-entry payload attempts a nested liquidate; it must be rejected by nonReentrant.
        await evil.configure(liq.address, liq.interface.encodeFunctionData("liquidate", [params]));

        const borrowBefore = await new ethers.Contract(VUSDT, VTOKEN_ABI, owner).borrowBalanceStored(B.REENTRANCY);
        await liq.connect(owner).liquidate(params); // outer settles
        await assertSettledFor(liq, mkt, VUSDT, B.REENTRANCY, borrowBefore);
        expect(await evil.reentryAttempted()).to.equal(true); // the router did run
        expect(await evil.reentrySucceeded()).to.equal(false); // but the nested liquidate was blocked
      });

      it("flash mode: flash-borrows the debt from Venus, settles, repays principal + premium", async () => {
        // Flash mode borrows the DEBT asset (USDT) from its vToken; the contract must be flash-authorized.
        const flashOk = await enableFlashIfNeeded(owner, VUSDT, liq.address);
        if (!flashOk) {
          console.log("      flash: vUSDT flash-loan not enabled at this block — skipping (documented)");
          return;
        }
        await makeUnderwaterBorrower({
          mkt,
          vDebt: VUSDT,
          borrower: B.FLASH,
          collateralBStock: parseUnits("100", 18),
          borrowAmount: parseUnits("5000", 18),
          crashPriceTo: P_CRASH,
        });
        await mock.setRate(P_CRASH);
        const REPAY = parseUnits("2000", 18);
        const params = {
          borrower: B.FLASH,
          vDebt: VUSDT,
          vBStock: mkt.vBStock.address,
          repayAmount: REPAY,
          router: mock.address,
          swapCalldata: buildSingleHopMock(mkt, mock, liq.address),
          minOut: parseUnits("1900", 18),
          router2: ZERO,
          swapCalldata2: "0x",
          intermediateToken: ZERO,
          deadline: ethers.constants.MaxUint256,
        };
        const borrowBefore = await new ethers.Contract(VUSDT, VTOKEN_ABI, owner).borrowBalanceStored(B.FLASH);
        await liq.connect(owner).flashLiquidate(params);
        await assertSettledFor(liq, mkt, VUSDT, B.FLASH, borrowBefore);
        // Profit retained as USDT (proceeds - principal - premium).
        expect(await new ethers.Contract(TOK.USDT, ERC20_ABI, owner).balanceOf(liq.address)).to.be.gt(0);
      });
    });

    /* ---------------------------------------------------------------- */
    /*                     dynamic all-market sweep                     */
    /* ---------------------------------------------------------------- */

    describe("dynamic debt-market sweep", () => {
      it("liquidates every eligible Core market against seized bStock; classifies skips", async () => {
        const c = new ethers.Contract(
          A.COMPTROLLER,
          [
            "function getAllMarkets() view returns (address[])",
            "function actionPaused(address,uint8) view returns (bool)",
          ],
          owner,
        );
        const pcs = new ethers.Contract(
          A.PCS_ROUTER,
          ["function getAmountsOut(uint256,address[]) view returns (uint256[])"],
          owner,
        );
        const markets: string[] = await c.getAllMarkets();
        let liquidated = 0;
        const rows: { sym: string; addr: string; status: string; reason: string }[] = [];
        const tally: Record<string, number> = {}; // reason bucket -> count

        for (const vDebt of markets) {
          if (ethers.utils.getAddress(vDebt) === ethers.utils.getAddress(mkt.vBStock.address)) continue;
          // Skip markets whose BORROW action is paused: we cannot open a fresh test position there, so
          // there is nothing meaningful to liquidate — drop them entirely rather than list them as skips.
          if (await c.actionPaused(vDebt, Action.BORROW)) continue;
          const sym = await marketSymbol(vDebt);
          const snap = await ethers.provider.send("evm_snapshot", []);
          try {
            const reason = await sweepOne(owner, c, pcs, mkt, mock, liq, vDebt, fund);
            if (reason === "OK") {
              liquidated++;
              rows.push({ sym, addr: vDebt, status: "LIQUIDATED", reason: "" });
              tally["liquidated"] = (tally["liquidated"] || 0) + 1;
            } else {
              // Normalize the reason head for the table + tally (e.g. "BorrowNotAllowedInPool").
              const clean = reason
                .replace(/^borrow \(/, "")
                .replace(/\)$/, "")
                .split("(")[0]
                .trim();
              rows.push({ sym, addr: vDebt, status: "skipped", reason: clean });
              tally[clean] = (tally[clean] || 0) + 1;
            }
          } catch (e: any) {
            // A skip reason is acceptable; any OTHER revert is a genuine failure.
            rows.push({ sym, addr: vDebt, status: "ERROR", reason: (e.message || "").slice(0, 60) });
            await ethers.provider.send("evm_revert", [snap]);
            throw e;
          }
          await ethers.provider.send("evm_revert", [snap]);
        }

        // Render an aligned table: MARKET | ADDRESS | STATUS | REASON.
        const w = (s: string, n: number) => s.padEnd(n);
        const cSym = Math.max(6, ...rows.map(r => r.sym.length));
        const cStatus = Math.max(6, ...rows.map(r => r.status.length));
        const bar = `  ${"-".repeat(cSym)}  ${"-".repeat(42)}  ${"-".repeat(cStatus)}  ------`;
        const lines = [
          `  ${w("MARKET", cSym)}  ${w("ADDRESS", 42)}  ${w("STATUS", cStatus)}  REASON`,
          bar,
          ...rows.map(r => `  ${w(r.sym, cSym)}  ${w(r.addr, 42)}  ${w(r.status, cStatus)}  ${r.reason}`),
        ];
        const summary = Object.entries(tally)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${v} ${k}`)
          .join(", ");
        console.log("\n      dynamic sweep — one liquidation attempt per eligible Core market:\n");
        console.log(lines.join("\n"));
        console.log(`\n      SUMMARY: ${summary}\n`);
        expect(liquidated).to.be.gt(0); // at least the USDT/CAKE/BNB markets must liquidate
      });
    });

    /* ---------------------------------------------------------------- */
    /*                    fuzz — seeded Hardhat loop                    */
    /* ---------------------------------------------------------------- */

    describe("fuzz — seeded property loops", () => {
      it("randomized repay/minOut over USDT debt: invariants hold or clean InsufficientOut", async () => {
        const seed = Number(process.env.FUZZ_SEED || "1337");
        const rnd = mulberry32(seed);
        console.log(`      seed=${seed}`);
        const ITER = Number(process.env.FUZZ_ITERS || "8");

        for (let i = 0; i < ITER; i++) {
          const snap = await ethers.provider.send("evm_snapshot", []);
          await makeUnderwaterBorrower({
            mkt,
            vDebt: VUSDT,
            borrower: B.FUZZ(i),
            collateralBStock: parseUnits("100", 18),
            borrowAmount: parseUnits("5000", 18),
            crashPriceTo: P_CRASH,
          });
          await mock.setRate(P_CRASH);

          // repay in [500, 2500] USDT (<= closeFactor*borrow), minOut margin in [-8%, +8%] of the live out.
          const repay = randBn(rnd, parseUnits("500", 18), parseUnits("2500", 18));
          await fund(TOK.USDT, liq.address, repay);
          const base = {
            borrower: B.FUZZ(i),
            vDebt: VUSDT,
            vBStock: mkt.vBStock.address,
            repayAmount: repay,
            router: mock.address,
            swapCalldata: buildSingleHopMock(mkt, mock, liq.address),
            minOut: BigNumber.from(1),
            router2: ZERO,
            swapCalldata2: "0x",
            intermediateToken: ZERO,
            deadline: ethers.constants.MaxUint256,
          };
          const liveOut = await liq.connect(owner).callStatic.liquidate(base);
          const marginBps = 9200 + Math.floor(rnd() * 1600); // 92%..108%
          const minOut = liveOut.mul(marginBps).div(10000);
          const borrowBefore = await new ethers.Contract(VUSDT, VTOKEN_ABI, owner).borrowBalanceStored(B.FUZZ(i));

          if (minOut.lte(liveOut)) {
            await liq.connect(owner).liquidate({ ...base, minOut });
            await assertSettledFor(liq, mkt, VUSDT, B.FUZZ(i), borrowBefore);
          } else {
            await expect(liq.connect(owner).liquidate({ ...base, minOut })).to.be.revertedWithCustomError(
              liq,
              "InsufficientOut",
            );
            await assertRolledBack(liq, mkt, VUSDT, B.FUZZ(i), borrowBefore, TOK.USDT, repay);
          }
          await ethers.provider.send("evm_revert", [snap]);
        }
      });
    });

    /* ---------------------------------------------------------------- */
    /*                     fuzz — fast-check property                   */
    /* ---------------------------------------------------------------- */

    describe("fuzz — fast-check property", () => {
      it("generated (repayFraction, minOutBps): invariants hold or clean revert", async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.record({
              repayPct: fc.integer({ min: 10, max: 50 }), // % of borrow (<= closeFactor)
              minOutBps: fc.integer({ min: 9000, max: 11000 }), // 90%..110% of live out
            }),
            async ({ repayPct, minOutBps }) => {
              const snap = await ethers.provider.send("evm_snapshot", []);
              try {
                await makeUnderwaterBorrower({
                  mkt,
                  vDebt: VUSDT,
                  borrower: B.FUZZ(9000),
                  collateralBStock: parseUnits("100", 18),
                  borrowAmount: parseUnits("5000", 18),
                  crashPriceTo: P_CRASH,
                });
                await mock.setRate(P_CRASH);
                const repay = parseUnits("5000", 18).mul(repayPct).div(100);
                await fund(TOK.USDT, liq.address, repay);
                const base = {
                  borrower: B.FUZZ(9000),
                  vDebt: VUSDT,
                  vBStock: mkt.vBStock.address,
                  repayAmount: repay,
                  router: mock.address,
                  swapCalldata: buildSingleHopMock(mkt, mock, liq.address),
                  minOut: BigNumber.from(1),
                  router2: ZERO,
                  swapCalldata2: "0x",
                  intermediateToken: ZERO,
                  deadline: ethers.constants.MaxUint256,
                };
                const liveOut = await liq.connect(owner).callStatic.liquidate(base);
                const minOut = liveOut.mul(minOutBps).div(10000);
                const borrowBefore = await new ethers.Contract(VUSDT, VTOKEN_ABI, owner).borrowBalanceStored(
                  B.FUZZ(9000),
                );
                if (minOut.lte(liveOut)) {
                  await liq.connect(owner).liquidate({ ...base, minOut });
                  await assertSettledFor(liq, mkt, VUSDT, B.FUZZ(9000), borrowBefore);
                } else {
                  await expect(liq.connect(owner).liquidate({ ...base, minOut })).to.be.revertedWithCustomError(
                    liq,
                    "InsufficientOut",
                  );
                  await assertRolledBack(liq, mkt, VUSDT, B.FUZZ(9000), borrowBefore, TOK.USDT, repay);
                }
              } finally {
                await ethers.provider.send("evm_revert", [snap]);
              }
            },
          ),
          { numRuns: Number(process.env.FC_RUNS || "10"), seed: 42, endOnFailure: true },
        );
      });
    });
  });
};

/* ------------------------------------------------------------------ */
/*                       sweep + flash helpers                        */
/* ------------------------------------------------------------------ */

// Enable flash loans for `vDebt` + authorize `liqAddr` as timelock, returning false if not feasible.
async function enableFlashIfNeeded(owner: any, vDebt: string, liqAddr: string): Promise<boolean> {
  try {
    const v = new ethers.Contract(vDebt, ["function isFlashLoanEnabled() view returns (bool)"], owner);
    const enabled: boolean = await v.isFlashLoanEnabled();
    if (!enabled) return false;
    // Whitelist the receiver on the diamond (best-effort; if the setter is absent, skip flash).
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
      /* setter may not exist / not required at this block */
    }
    return true;
  } catch {
    return false;
  }
}

// Best-effort vToken symbol (e.g. "vUSDT", "vBNB") for readable sweep logs.
async function marketSymbol(vToken: string): Promise<string> {
  try {
    return await new ethers.Contract(vToken, ["function symbol() view returns (string)"], ethers.provider).symbol();
  } catch {
    return "v???";
  }
}

// Try to liquidate one debt market against the seized bStock. Returns "OK" or a skip reason.
async function sweepOne(
  owner: any,
  c: Contract,
  pcs: Contract,
  mkt: BStockMarket,
  mock: Contract,
  liq: Contract,
  vDebt: string,
  fund: (t: string, to: string, a: BigNumber) => Promise<void>,
): Promise<string> {
  // (BORROW-paused markets are filtered out by the caller before we get here.)
  if (await c.actionPaused(vDebt, Action.LIQUIDATE)) return "liquidate paused";

  const v = new ethers.Contract(vDebt, VTOKEN_ABI, owner);
  let underlying: string;
  let isBnb = false;
  try {
    underlying = await v.underlying();
  } catch {
    underlying = TOK.WBNB;
    isBnb = true; // vBNB exposes no underlying()
  }

  const cash: BigNumber = isBnb
    ? await ethers.provider.getBalance(vDebt)
    : await new ethers.Contract(underlying, ERC20_ABI, owner).balanceOf(vDebt);
  if (cash.eq(0)) return "zero cash";

  // Non-USDT, non-BNB markets need a live USDT->debt PCS route; probe it.
  const isUsdt = !isBnb && ethers.utils.getAddress(underlying) === ethers.utils.getAddress(TOK.USDT);
  const twoHop = !isUsdt;
  const path = isBnb ? [TOK.USDT, TOK.WBNB] : [TOK.USDT, underlying];
  if (twoHop) {
    try {
      const q = await pcs.getAmountsOut(parseUnits("100", 18), path);
      if (q[q.length - 1].eq(0)) return "no PCS route";
    } catch {
      return "no PCS route";
    }
  }

  // Size the borrow from the borrower's collateral POWER (100 bStock @ $250, CF 0.6 = ~$15k), targeting
  // ~$8k of debt — above the post-crash power (~$3k) so a shortfall is guaranteed — and capped at 20%
  // of market cash so we never exhaust liquidity. Uses the live debt oracle price (USD * 1e(36-decimals)).
  const resilient = new ethers.Contract(
    A.RESILIENT_ORACLE,
    ["function getUnderlyingPrice(address) view returns (uint256)"],
    owner,
  );
  let debtBorrow: BigNumber;
  try {
    const price: BigNumber = await resilient.getUnderlyingPrice(vDebt);
    if (price.eq(0)) return "dead oracle";
    debtBorrow = parseUnits("8000", 18).mul(ONE).div(price); // 8000 / priceUsd, in the debt's own decimals
  } catch {
    return "dead oracle";
  }
  if (debtBorrow.eq(0)) return "unpriceable/dust";

  // Thin markets don't hold enough cash for an $8k borrow, which would leave the account not-underwater
  // (gate LiquidationFailed code=3). Seed the vToken's underlying cash directly so the full borrow fits;
  // native BNB cash is the vToken's native balance. If the underlying can't be seeded, classify as skip.
  try {
    const need = debtBorrow.mul(3);
    if (cash.lt(need)) {
      if (isBnb) await setBalance(vDebt, need);
      else await fund(underlying, vDebt, need);
    }
  } catch {
    return "cannot seed market cash";
  }

  // Build the underwater borrower defensively — quirky markets revert borrow ("math error"), hit caps,
  // or leave the account not-underwater; classify any of these as a skip rather than failing the sweep.
  const borrower = ethers.utils.getAddress(
    "0x" + (0xca120000 + (parseInt(vDebt.slice(-4), 16) % 60000)).toString(16).padStart(40, "0"),
  );
  try {
    await makeUnderwaterBorrower({
      mkt,
      vDebt,
      borrower,
      collateralBStock: parseUnits("100", 18),
      borrowAmount: debtBorrow,
      crashPriceTo: P_CRASH,
    });
  } catch (e: any) {
    const data = e.error?.data?.data || e.error?.data || e.data || "";
    const sel = typeof data === "string" && data.length >= 10 ? data.slice(0, 10) : "";
    // Map the common Venus revert selectors to names so the sweep log reads clearly.
    const known: Record<string, string> = {
      "0x5b80c790": "BorrowNotAllowedInPool", // market is scoped to a non-core e-mode pool
      "0x2e649eed": "BorrowCapExceeded",
      "0x48c25881": "BorrowCashNotAvailable",
    };
    return `borrow (${e.reason || known[sel] || sel || (e.message || "").slice(0, 24)})`;
  }
  await mock.setRate(P_CRASH);
  const repay = debtBorrow.div(4);
  try {
    await fund(underlying, liq.address, repay); // seed inventory; some tokens hide their balances slot
  } catch {
    return "cannot seed inventory";
  }

  let params: any;
  if (twoHop) {
    const { swapCalldata, swapCalldata2, expectedOut } = await buildTwoHopMockThenPcs(
      owner,
      mkt,
      mock,
      vDebt,
      repay,
      path,
      liq.address,
      P_CRASH,
      borrower,
    );
    params = {
      borrower,
      vDebt,
      vBStock: mkt.vBStock.address,
      repayAmount: repay,
      router: mock.address,
      swapCalldata,
      minOut: expectedOut.mul(85).div(100),
      router2: A.PCS_ROUTER,
      swapCalldata2,
      intermediateToken: TOK.USDT,
      deadline: ethers.constants.MaxUint256,
    };
  } else {
    params = {
      borrower,
      vDebt,
      vBStock: mkt.vBStock.address,
      repayAmount: repay,
      router: mock.address,
      swapCalldata: buildSingleHopMock(mkt, mock, liq.address),
      minOut: BigNumber.from(1),
      router2: ZERO,
      swapCalldata2: "0x",
      intermediateToken: ZERO,
      deadline: ethers.constants.MaxUint256,
    };
  }

  const borrowBefore = await v.borrowBalanceStored(borrower);
  try {
    const out = await liq.connect(owner).callStatic.liquidate({ ...params, minOut: 1 });
    await liq.connect(owner).liquidate({ ...params, minOut: out.mul(80).div(100) });
  } catch (e: any) {
    return `liquidation (${decodeLiqRevert(liq, e)})`;
  }
  expect(await v.borrowBalanceStored(borrower)).to.be.lt(borrowBefore);
  return "OK";
}

// Decode a liquidation revert into a readable reason: the contract's own custom errors (InsufficientOut,
// SwapFailed, RedeemFailed, …) via its ABI, the gate's LiquidationFailed(code), or a plain Error string.
function decodeLiqRevert(liq: Contract, e: any): string {
  if (e.reason) return e.reason;
  const data = e.error?.data?.data || e.error?.data || e.data || "";
  if (typeof data !== "string" || data.length < 10) return (e.message || "").slice(0, 32);
  try {
    const parsed = liq.interface.parseError(data);
    const args = parsed.args?.length ? `(${parsed.args.map((a: any) => a.toString()).join(",")})` : "";
    return `${parsed.name}${args}`;
  } catch {
    // Gate error LiquidationFailed(uint256) — the uint is the underlying vToken error code
    // (Venus ComptrollerErrorReporter.Error: 3 = INSUFFICIENT_SHORTFALL, 4 = INSUFFICIENT_LIQUIDITY, …).
    if (data.slice(0, 10) === "0x125a96ab") {
      const code = BigNumber.from("0x" + data.slice(10, 74));
      return `gate LiquidationFailed(code=${code.toString()})`;
    }
    return data.slice(0, 10);
  }
}

if (FORK_MAINNET) {
  forking(FORK_BLOCK, test);
}
