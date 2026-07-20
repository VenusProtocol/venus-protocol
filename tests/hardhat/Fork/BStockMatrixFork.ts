// ============================================================================================
// BStockLiquidator — scenario MATRIX fork suite
// ============================================================================================
//
// Completes BStockLiquidatorFork.ts across the full scenario matrix:
//
//   mode {inventory, flash} × hop-1 {native-style (router pulls), LM-style (split spender pulls)}
//                           × debt {USDT single-hop, CAKE two-hop real-PCS, BNB (WBNB unwrap), VAI (real PSM)}
//
// The main suite covers inv×native×{USDT,CAKE,BNB,VAI}, inv×LM×USDT and flash×native×USDT; this
// file adds the remaining positive cells — inv×LM×{CAKE,BNB,VAI}, flash×native×{CAKE,BNB},
// flash×LM×{USDT,CAKE,BNB} — plus an on-fork flash×VAI rejection check. The flash×two-hop and
// flash×split-spender combinations exist nowhere else: they are the ones where the flash
// principal+premium repay must be covered by the swap-chain proceeds, so they get their own cells.
//
// Mechanics mirror the main suite: real bStock market listed on the live diamond, real underwater
// positions (supply -> borrow -> oracle price gap), real gate / PancakeSwap / PSM; only the
// off-chain RFQ fill is mocked (MockNativeRouter = target-pulls, MockSplitRouter + MockSpender =
// split-spender pulls, i.e. the Liquid Mesh settlement shape).
//
// Hop-2 sizing mirrors atomic-liquidate.ts EXACTLY (borrower-aware 4-arg seize, gate treasury cut
// off the effective incentive, redeem treasuryPercent) instead of the main helper's blanket -10%,
// so the flash cells' principal+premium repay constraint is exercised at the REAL incentive margin
// (~4%: 10% per-market bonus, gate keeps 50%, redeem fee and flash fee both 0 live) — a -10%
// undershoot would starve the flash repay and could never settle.
//
// Run (recent block: flash-loan support + the whitelist setter are live there):
//   FORK_BSTOCK_BLOCK=110490000 FORKED_NETWORK=bscmainnet npx hardhat test \
//     tests/hardhat/Fork/BStockMatrixFork.ts
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { getPsmSwap } from "../../../scripts/bstock/lib/psm";
import {
  A,
  BStockMarket,
  BalanceSlot,
  ERC20_ABI,
  ONE,
  TOK,
  VTOKEN_ABI,
  ZERO,
  asTimelockWith,
  assertSettledFor,
  deployFundedMockNative,
  findBalanceSlot,
  listBStockMarket,
  makeUnderwaterBorrower,
  setTokenBalance,
} from "./helpers/bstock";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

const FORK_BLOCK = Number(process.env.FORK_BSTOCK_BLOCK || "110490000");

const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const VCAKE = "0x86aC3974e2BD0d60825230fa6F355fF11409df5c";
const VAI_CONTROLLER = "0x004065D34C6b18cE4370ced1CeBDE94865DbFAFE";
const VAI = "0x4BD17003473389A42DAF6a0a729f6Fdb328BbBd7";
const PSM_USDT = "0xC138aa4E424D1A8539e8F38Af5a754a2B7c3Cc36";

const ACM_GIVE_ABI = ["function giveCallPermission(address,string,address)"];
const PCS_ABI = [
  "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
  "function getAmountsOut(uint256,address[]) view returns (uint256[])",
];
const COMPTROLLER_ABI = [
  "function liquidateCalculateSeizeTokens(address,address,address,uint256) view returns (uint256,uint256)",
  "function liquidateVAICalculateSeizeTokens(address,uint256) view returns (uint256,uint256)",
  "function getEffectiveLiquidationIncentive(address,address) view returns (uint256)",
  "function treasuryPercent() view returns (uint256)",
  "function liquidatorContract() view returns (address)",
  "function setWhiteListFlashLoanAccount(address,bool)",
];
const VAI_CONTROLLER_ABI = [
  "function mintVAI(uint256) returns (uint256)",
  "function getVAIRepayAmount(address) view returns (uint256)",
  "function toggleOnlyPrimeHolderMint() returns (uint256)",
];
const GATE_ABI = ["function treasuryPercentMantissa() view returns (uint256)"];
const FLASH_VTOKEN_ABI = [
  "function isFlashLoanEnabled() view returns (bool)",
  "function setFlashLoanEnabled(bool) returns (uint256)",
];

const P_HEALTHY = parseUnits("250", 18);
const P_CRASH = parseUnits("50", 18);

// Codeless EOA borrowers, distinct from the original suite's 0xca11… range.
const M = {
  LM_CAKE: ethers.utils.getAddress("0x00000000000000000000000000000000ca140001"),
  LM_BNB: ethers.utils.getAddress("0x00000000000000000000000000000000ca140002"),
  LM_VAI: ethers.utils.getAddress("0x00000000000000000000000000000000ca140003"),
  FL_N_CAKE: ethers.utils.getAddress("0x00000000000000000000000000000000ca140004"),
  FL_N_BNB: ethers.utils.getAddress("0x00000000000000000000000000000000ca140005"),
  FL_LM_USDT: ethers.utils.getAddress("0x00000000000000000000000000000000ca140006"),
  FL_LM_CAKE: ethers.utils.getAddress("0x00000000000000000000000000000000ca140007"),
  FL_LM_BNB: ethers.utils.getAddress("0x00000000000000000000000000000000ca140008"),
  FL_VAI: ethers.utils.getAddress("0x00000000000000000000000000000000ca140009"),
};

const test = () => {
  describe("BStockLiquidator — scenario matrix (mode × hop-1 source × debt)", () => {
    let owner: any;
    let mkt: BStockMarket;
    let liq: Contract; // fresh proxy on the current impl (routerSpender + VAI support)
    let mock: Contract; // native-style hop-1: the router itself pulls
    let lmRouter: Contract; // LM-style hop-1: pulls via a separate spender contract
    let spender: Contract;
    const flashReady: Record<string, boolean> = {};
    let baseSnap: string;

    const slotCache: Record<string, BalanceSlot> = {};
    async function fund(token: string, to: string, amount: BigNumber) {
      if (slotCache[token] === undefined) {
        const s = await findBalanceSlot(token);
        if (s === null) throw new Error(`no balance slot for ${token}`);
        slotCache[token] = s;
      }
      await setTokenBalance(token, to, amount, slotCache[token]);
    }

    // Enable flash-loans on a market + whitelist the liquidator on the diamond, through the real
    // ACM + timelock (governance-reachable state). Returns false when the infra is absent at this
    // block (cells then log a skip, mirroring the original suite's documented-skip pattern).
    async function enableFlash(vDebt: string): Promise<boolean> {
      try {
        const tl = await initMainnetUser(A.TIMELOCK, parseEther("10"));
        const acm = new ethers.Contract(A.ACM, ACM_GIVE_ABI, tl);
        const v = new ethers.Contract(vDebt, FLASH_VTOKEN_ABI, owner);
        if (!(await v.isFlashLoanEnabled())) {
          await acm.giveCallPermission(vDebt, "setFlashLoanEnabled(bool)", owner.address);
          await v.setFlashLoanEnabled(true);
        }
        await acm.giveCallPermission(A.COMPTROLLER, "setWhiteListFlashLoanAccount(address,bool)", A.TIMELOCK);
        await new ethers.Contract(A.COMPTROLLER, COMPTROLLER_ABI, tl).setWhiteListFlashLoanAccount(liq.address, true);
        return true;
      } catch (e) {
        console.log(`      flash infra unavailable for ${vDebt} at this block: ${(e as Error).message.slice(0, 80)}`);
        return false;
      }
    }

    // Hop-1 calldata: both mocks share the swapAll(tokenIn, tokenOut, to) shape; the difference under
    // test is WHO pulls (router itself vs its spender — the latter requires routerSpender approval).
    function hop1(src: "native" | "lm"): { router: string; calldata: string } {
      const r = src === "native" ? mock : lmRouter;
      return {
        router: r.address,
        calldata: r.interface.encodeFunctionData("swapAll", [mkt.bStock.address, TOK.USDT, liq.address]),
      };
    }

    // Hop-2 (USDT -> debt) sizing, mirroring atomic-liquidate.ts exactly: borrower-aware 4-arg seize,
    // gate treasury cut off the EFFECTIVE incentive, redeem treasuryPercent, then the mock's rate.
    // x2 takes a 0.5% margin under the exact expected hop-1 delta so the fixed PCS/PSM pull always
    // fits the on-chain approval.
    async function hop1UsdtOut(borrower: string, vDebt: string, repay: BigNumber, isVai = false): Promise<BigNumber> {
      const c = new ethers.Contract(A.COMPTROLLER, COMPTROLLER_ABI, owner);
      const [err, seizeTokens] = isVai
        ? await c.liquidateVAICalculateSeizeTokens(mkt.vBStock.address, repay)
        : await c.liquidateCalculateSeizeTokens(borrower, vDebt, mkt.vBStock.address, repay);
      expect(err).to.equal(0);
      const gate = new ethers.Contract(await c.liquidatorContract(), GATE_ABI, owner);
      const tp: BigNumber = await gate.treasuryPercentMantissa();
      let vReceived: BigNumber = seizeTokens;
      if (!tp.isZero()) {
        const inc: BigNumber = await c.getEffectiveLiquidationIncentive(borrower, mkt.vBStock.address);
        const bonus = seizeTokens.mul(inc.sub(ONE)).div(inc);
        vReceived = seizeTokens.sub(bonus.mul(tp).div(ONE));
      }
      const xr: BigNumber = await mkt.vBStock.exchangeRateStored();
      const redeemFee: BigNumber = await c.treasuryPercent();
      const heldBStock = vReceived.mul(xr).div(ONE).mul(ONE.sub(redeemFee)).div(ONE);
      const usdtOut = heldBStock.mul(P_CRASH).div(ONE); // both mocks pay `rate` per unit pulled
      return usdtOut.mul(995).div(1000);
    }

    async function pcsHop2(x2: BigNumber, path: string[]): Promise<{ calldata: string; expectedOut: BigNumber }> {
      const pcs = new ethers.Contract(A.PCS_ROUTER, PCS_ABI, owner);
      const expectedOut: BigNumber = (await pcs.getAmountsOut(x2, path))[path.length - 1];
      return {
        calldata: pcs.interface.encodeFunctionData("swapExactTokensForTokens", [
          x2,
          0,
          path,
          liq.address,
          ethers.constants.MaxUint256,
        ]),
        expectedOut,
      };
    }

    // Real VAI debt: prime-holder mint gate toggled through the real ACM, VAI minted on the real
    // VAIController, then the bStock price gaps down (copy of the original suite's builder).
    async function makeUnderwaterVaiBorrower(borrowerAddr: string, vaiDebt: BigNumber): Promise<Contract> {
      const tl = await initMainnetUser(A.TIMELOCK, parseEther("5"));
      await new ethers.Contract(A.ACM, ACM_GIVE_ABI, tl).giveCallPermission(
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
      const mintCode: BigNumber = await vaiCtrl.connect(borrower).callStatic.mintVAI(vaiDebt);
      if (!mintCode.eq(0)) throw new Error(`mintVAI returned code ${mintCode.toString()}`);
      await vaiCtrl.connect(borrower).mintVAI(vaiDebt);
      await mkt.setPrice(P_CRASH);
      return vaiCtrl;
    }

    async function crash() {
      await mkt.setPrice(P_CRASH);
      await mock.setRate(P_CRASH);
      await lmRouter.setRate(P_CRASH);
    }

    before(async () => {
      [owner] = await ethers.getSigners();
      await setBalance(owner.address, parseEther("1000"));

      mkt = await listBStockMarket(owner, P_HEALTHY);
      ({ mock } = await deployFundedMockNative(owner, P_HEALTHY));

      spender = await (await ethers.getContractFactory("MockSpender")).deploy();
      lmRouter = await (await ethers.getContractFactory("MockSplitRouter")).deploy(spender.address);
      await lmRouter.setRate(P_HEALTHY);
      const usdtSlot = await findBalanceSlot(TOK.USDT);
      if (usdtSlot === null) throw new Error("no USDT slot");
      slotCache[TOK.USDT] = usdtSlot;
      await setTokenBalance(TOK.USDT, lmRouter.address, parseUnits("5000000", 18), usdtSlot);

      // Pin the BNB price as a DIRECT price on the live ChainlinkOracle (same pattern the suite uses
      // for bStock): the live BNB feed's staleness window is short (~30 min), so fork-time drift (every
      // simulated tx advances the clock) makes the untouched 3-oracle config revert "invalid resilient
      // oracle price" on any vBNB borrow/liquidity check. A direct price short-circuits the feed read
      // (ChainlinkOracle._getPriceInternal prefers `prices[asset]`), so it skips the staleness check.
      //
      // KEY: vBNB does NOT price under WBNB. ResilientOracle._getUnderlyingAsset maps the native market
      // to the sentinel NATIVE_TOKEN_ADDR (0xbBbB…BBbB) — deceptively similar to WBNB (0xbb4CdB…095c) —
      // because vBNB has no `underlying()`. Pinning WBNB alone leaves every vBNB read on the live feed,
      // which is why the BNB cells failed intermittently once a run advanced the clock far enough.
      // Both are pinned: the sentinel for vBNB, and WBNB itself for vWBNB (a normal market whose
      // `underlying()` IS WBNB — the flash source for the BNB cells). $564 ≈ the live price at the block.
      {
        const NATIVE_TOKEN_ADDR = ethers.utils.getAddress("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
        const tl = await asTimelockWith([
          [A.RESILIENT_ORACLE, "setTokenConfig(TokenConfig)"],
          [A.CHAINLINK_ORACLE, "setDirectPrice(address,uint256)"],
        ]);
        const resilient = new ethers.Contract(
          A.RESILIENT_ORACLE,
          [
            "function setTokenConfig(tuple(address asset, address[3] oracles, bool[3] enableFlagsForOracles, bool cachingEnabled))",
          ],
          tl,
        );
        const chainlink = new ethers.Contract(A.CHAINLINK_ORACLE, ["function setDirectPrice(address,uint256)"], tl);
        for (const asset of [NATIVE_TOKEN_ADDR, TOK.WBNB]) {
          await resilient.setTokenConfig({
            asset,
            oracles: [A.CHAINLINK_ORACLE, ZERO, ZERO],
            enableFlagsForOracles: [true, false, false],
            cachingEnabled: false,
          });
          await chainlink.setDirectPrice(asset, parseUnits("564", 18));
        }
      }

      // Fresh proxy on the current implementation: the deployed bscmainnet proxy predates both
      // routerSpender (LM cells) and the VAI branch, and prod requires a redeploy anyway (PR note).
      const Factory = await ethers.getContractFactory("BStockLiquidator");
      liq = await upgrades.deployProxy(Factory, [owner.address], {
        constructorArgs: [A.COMPTROLLER, A.VBNB, A.VWBNB, TOK.WBNB],
        unsafeAllow: ["constructor", "state-variable-immutable"],
      });
      await liq.connect(owner).setRouter(mock.address, true);
      await liq.connect(owner).setRouter(lmRouter.address, true);
      await liq.connect(owner).setRouterSpender(lmRouter.address, spender.address);
      await liq.connect(owner).setRouter(A.PCS_ROUTER, true);
      await liq.connect(owner).setRouter(PSM_USDT, true);

      // Flash infra once for every flash market used by the matrix.
      for (const v of [VUSDT, VCAKE, A.VWBNB]) flashReady[v] = await enableFlash(v);

      baseSnap = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await ethers.provider.send("evm_revert", [baseSnap]);
      baseSnap = await ethers.provider.send("evm_snapshot", []);
      await mock.setRate(P_HEALTHY);
      await lmRouter.setRate(P_HEALTHY);
    });

    /* ------------------------- inventory × LM split-spender ------------------------- */

    it("inv × LM × CAKE: split-spender hop-1, real-PCS hop-2, settles", async () => {
      await makeUnderwaterBorrower({
        mkt,
        vDebt: VCAKE,
        borrower: M.LM_CAKE,
        collateralBStock: parseUnits("100", 18),
        borrowAmount: parseUnits("4000", 18),
        crashPriceTo: P_CRASH,
      });
      await crash();
      const REPAY = parseUnits("1500", 18);
      await fund(TOK.CAKE, liq.address, REPAY);
      const x2 = await hop1UsdtOut(M.LM_CAKE, VCAKE, REPAY);
      const h2 = await pcsHop2(x2, [TOK.USDT, TOK.CAKE]);
      const h1 = hop1("lm");
      const params = {
        borrower: M.LM_CAKE,
        vDebt: VCAKE,
        vBStock: mkt.vBStock.address,
        repayAmount: REPAY,
        router: h1.router,
        swapCalldata: h1.calldata,
        minOut: h2.expectedOut.mul(95).div(100),
        router2: A.PCS_ROUTER,
        swapCalldata2: h2.calldata,
        intermediateToken: TOK.USDT,
        deadline: ethers.constants.MaxUint256,
      };
      const borrowBefore = await new ethers.Contract(VCAKE, VTOKEN_ABI, owner).borrowBalanceStored(M.LM_CAKE);
      expect(await liq.connect(owner).callStatic.liquidate(params)).to.be.gte(params.minOut);
      await liq.connect(owner).liquidate(params);
      await assertSettledFor(liq, mkt, VCAKE, M.LM_CAKE, borrowBefore);
      // No standing approval left for the split spender on either hop input.
      const alw = ["function allowance(address,address) view returns (uint256)"];
      expect(
        await new ethers.Contract(mkt.bStock.address, alw, owner).allowance(liq.address, spender.address),
      ).to.equal(0);
    });

    it("inv × LM × BNB: split-spender hop-1, WBNB unwrap repay, settles", async () => {
      await makeUnderwaterBorrower({
        mkt,
        vDebt: A.VBNB,
        borrower: M.LM_BNB,
        collateralBStock: parseUnits("100", 18),
        borrowAmount: parseEther("8"),
        crashPriceTo: P_CRASH,
      });
      await crash();
      const REPAY = parseEther("2");
      await fund(TOK.WBNB, liq.address, REPAY);
      const x2 = await hop1UsdtOut(M.LM_BNB, A.VBNB, REPAY);
      const h2 = await pcsHop2(x2, [TOK.USDT, TOK.WBNB]);
      const h1 = hop1("lm");
      const params = {
        borrower: M.LM_BNB,
        vDebt: A.VBNB,
        vBStock: mkt.vBStock.address,
        repayAmount: REPAY,
        router: h1.router,
        swapCalldata: h1.calldata,
        minOut: h2.expectedOut.mul(95).div(100),
        router2: A.PCS_ROUTER,
        swapCalldata2: h2.calldata,
        intermediateToken: TOK.USDT,
        deadline: ethers.constants.MaxUint256,
      };
      const vBnb = new ethers.Contract(A.VBNB, VTOKEN_ABI, owner);
      const borrowBefore = await vBnb.borrowBalanceStored(M.LM_BNB);
      expect(await liq.connect(owner).callStatic.liquidate(params)).to.be.gte(params.minOut);
      await liq.connect(owner).liquidate(params);
      expect(await vBnb.borrowBalanceStored(M.LM_BNB)).to.be.lt(borrowBefore);
      expect(await ethers.provider.getBalance(liq.address)).to.equal(0);
      expect(await mkt.bStock.balanceOf(liq.address)).to.equal(0);
    });

    // The main suite's inv×native×BNB cell is block-sensitive (BNB-feed staleness under fork clock
    // drift); re-proven here under the direct-price pin so the whole matrix row runs at any block.
    it("inv × native × BNB: router-pulls hop-1, WBNB unwrap repay, settles", async () => {
      const borrower = ethers.utils.getAddress("0x00000000000000000000000000000000ca14000a");
      await makeUnderwaterBorrower({
        mkt,
        vDebt: A.VBNB,
        borrower,
        collateralBStock: parseUnits("100", 18),
        borrowAmount: parseEther("8"),
        crashPriceTo: P_CRASH,
      });
      await crash();
      const REPAY = parseEther("2");
      await fund(TOK.WBNB, liq.address, REPAY);
      const x2 = await hop1UsdtOut(borrower, A.VBNB, REPAY);
      const h2 = await pcsHop2(x2, [TOK.USDT, TOK.WBNB]);
      const h1 = hop1("native");
      const params = {
        borrower,
        vDebt: A.VBNB,
        vBStock: mkt.vBStock.address,
        repayAmount: REPAY,
        router: h1.router,
        swapCalldata: h1.calldata,
        minOut: h2.expectedOut.mul(95).div(100),
        router2: A.PCS_ROUTER,
        swapCalldata2: h2.calldata,
        intermediateToken: TOK.USDT,
        deadline: ethers.constants.MaxUint256,
      };
      const vBnb = new ethers.Contract(A.VBNB, VTOKEN_ABI, owner);
      const borrowBefore = await vBnb.borrowBalanceStored(borrower);
      expect(await liq.connect(owner).callStatic.liquidate(params)).to.be.gte(params.minOut);
      await liq.connect(owner).liquidate(params);
      expect(await vBnb.borrowBalanceStored(borrower)).to.be.lt(borrowBefore);
      expect(await ethers.provider.getBalance(liq.address)).to.equal(0);
      expect(await mkt.bStock.balanceOf(liq.address)).to.equal(0);
    });

    it("inv × LM × VAI: split-spender hop-1, real PSM hop-2 (script-built calldata), settles", async () => {
      const vaiCtrl = await makeUnderwaterVaiBorrower(M.LM_VAI, parseUnits("4000", 18));
      await crash();
      const REPAY = parseUnits("1500", 18);
      await fund(VAI, liq.address, REPAY);
      const floor = await hop1UsdtOut(M.LM_VAI, VAI_CONTROLLER, REPAY, true);
      const psmSwap = await getPsmSwap({ amountIn: floor, recipient: liq.address }, ethers.provider);
      expect(psmSwap.router).to.equal(PSM_USDT);
      const expectedOut = BigNumber.from(psmSwap.expectedOut);
      const h1 = hop1("lm");
      const params = {
        borrower: M.LM_VAI,
        vDebt: VAI_CONTROLLER,
        vBStock: mkt.vBStock.address,
        repayAmount: REPAY,
        router: h1.router,
        swapCalldata: h1.calldata,
        minOut: expectedOut.mul(999).div(1000),
        router2: psmSwap.router,
        swapCalldata2: psmSwap.calldata,
        intermediateToken: TOK.USDT,
        deadline: ethers.constants.MaxUint256,
      };
      const debtBefore = await vaiCtrl.getVAIRepayAmount(M.LM_VAI);
      expect(await liq.connect(owner).callStatic.liquidate(params)).to.be.gte(params.minOut);
      await liq.connect(owner).liquidate(params);
      expect(await vaiCtrl.getVAIRepayAmount(M.LM_VAI)).to.be.lt(debtBefore);
      expect(await new ethers.Contract(VAI, ERC20_ABI, owner).balanceOf(liq.address)).to.equal(expectedOut);
      expect(await mkt.bStock.balanceOf(liq.address)).to.equal(0);
    });

    /* ------------------------------- flash cells ------------------------------- */

    interface FlashCell {
      title: string;
      src: "native" | "lm";
      vDebt: string;
      borrower: string;
      borrowAmount: BigNumber;
      repay: BigNumber;
      debtToken: string; // ERC20 the proceeds/premium settle in (WBNB for vBNB)
      path?: string[]; // hop-2 PCS path; undefined = single-hop USDT debt
    }

    const flashCells: FlashCell[] = [
      {
        title: "flash × LM × USDT: split-spender single hop, repays principal + premium",
        src: "lm",
        vDebt: VUSDT,
        borrower: M.FL_LM_USDT,
        borrowAmount: parseUnits("5000", 18),
        repay: parseUnits("2000", 18),
        debtToken: TOK.USDT,
      },
      {
        title: "flash × native × CAKE: two-hop real PCS, repays principal + premium",
        src: "native",
        vDebt: VCAKE,
        borrower: M.FL_N_CAKE,
        borrowAmount: parseUnits("4000", 18),
        repay: parseUnits("1500", 18),
        debtToken: TOK.CAKE,
        path: [TOK.USDT, TOK.CAKE],
      },
      {
        title: "flash × LM × CAKE: split-spender + two-hop real PCS, repays principal + premium",
        src: "lm",
        vDebt: VCAKE,
        borrower: M.FL_LM_CAKE,
        borrowAmount: parseUnits("4000", 18),
        repay: parseUnits("1500", 18),
        debtToken: TOK.CAKE,
        path: [TOK.USDT, TOK.CAKE],
      },
      {
        title: "flash × native × BNB: vWBNB flash + unwrap, two-hop to WBNB, repays principal + premium",
        src: "native",
        vDebt: A.VBNB,
        borrower: M.FL_N_BNB,
        borrowAmount: parseEther("8"),
        repay: parseEther("2"),
        debtToken: TOK.WBNB,
        path: [TOK.USDT, TOK.WBNB],
      },
      {
        title: "flash × LM × BNB: split-spender + vWBNB flash + unwrap, repays principal + premium",
        src: "lm",
        vDebt: A.VBNB,
        borrower: M.FL_LM_BNB,
        borrowAmount: parseEther("8"),
        repay: parseEther("2"),
        debtToken: TOK.WBNB,
        path: [TOK.USDT, TOK.WBNB],
      },
    ];

    for (const cell of flashCells) {
      it(cell.title, async () => {
        // vBNB debt is flash-funded from vWBNB (vBNB cannot be flash-repaid).
        const flashMarket = cell.vDebt === A.VBNB ? A.VWBNB : cell.vDebt;
        if (!flashReady[flashMarket]) {
          console.log(`      SKIP: flash infra unavailable for ${flashMarket} at block ${FORK_BLOCK}`);
          return;
        }
        await makeUnderwaterBorrower({
          mkt,
          vDebt: cell.vDebt,
          borrower: cell.borrower,
          collateralBStock: parseUnits("100", 18),
          borrowAmount: cell.borrowAmount,
          crashPriceTo: P_CRASH,
        });
        await crash();
        const h1 = hop1(cell.src);
        let swapCalldata2 = "0x";
        let router2 = ZERO;
        let intermediateToken = ZERO;
        let minOut: BigNumber;
        if (cell.path) {
          const x2 = await hop1UsdtOut(cell.borrower, cell.vDebt, cell.repay);
          const h2 = await pcsHop2(x2, cell.path);
          swapCalldata2 = h2.calldata;
          router2 = A.PCS_ROUTER;
          intermediateToken = TOK.USDT;
          minOut = h2.expectedOut.mul(95).div(100);
        } else {
          minOut = (await hop1UsdtOut(cell.borrower, cell.vDebt, cell.repay)).mul(99).div(100);
        }
        const params = {
          borrower: cell.borrower,
          vDebt: cell.vDebt,
          vBStock: mkt.vBStock.address,
          repayAmount: cell.repay,
          router: h1.router,
          swapCalldata: h1.calldata,
          minOut,
          router2,
          swapCalldata2,
          intermediateToken,
          deadline: ethers.constants.MaxUint256,
        };
        const vDebtC = new ethers.Contract(cell.vDebt, VTOKEN_ABI, owner);
        const borrowBefore = await vDebtC.borrowBalanceStored(cell.borrower);
        const debtErc20 = new ethers.Contract(cell.debtToken, ERC20_ABI, owner);
        const invBefore: BigNumber = await debtErc20.balanceOf(liq.address); // 0 — flash needs no inventory
        expect(invBefore).to.equal(0);
        await liq.connect(owner).flashLiquidate(params);
        expect(await vDebtC.borrowBalanceStored(cell.borrower)).to.be.lt(borrowBefore);
        // Flash principal (+ premium) was repaid from proceeds; the contract keeps a positive profit
        // in the debt-accounting token, holds no bStock, and strands no native BNB.
        expect(await debtErc20.balanceOf(liq.address)).to.be.gt(0);
        expect(await mkt.bStock.balanceOf(liq.address)).to.equal(0);
        expect(await ethers.provider.getBalance(liq.address)).to.equal(0);
      });
    }

    /* ------------------------------ negative: flash × VAI ------------------------------ */

    it("flash × VAI (either source): rejected with FlashNotSupportedForVai before any swap", async () => {
      const vaiCtrl = await makeUnderwaterVaiBorrower(M.FL_VAI, parseUnits("4000", 18));
      await crash();
      const h1 = hop1("lm");
      const params = {
        borrower: M.FL_VAI,
        vDebt: VAI_CONTROLLER,
        vBStock: mkt.vBStock.address,
        repayAmount: parseUnits("1500", 18),
        router: h1.router,
        swapCalldata: h1.calldata,
        minOut: 1,
        router2: PSM_USDT,
        swapCalldata2: "0x",
        intermediateToken: TOK.USDT,
        deadline: ethers.constants.MaxUint256,
      };
      await expect(liq.connect(owner).flashLiquidate(params)).to.be.revertedWithCustomError(
        liq,
        "FlashNotSupportedForVai",
      );
      // Debt untouched.
      expect(await vaiCtrl.getVAIRepayAmount(M.FL_VAI)).to.be.gte(parseUnits("4000", 18));
    });
  });
};

if (FORK_MAINNET) {
  forking(FORK_BLOCK, test);
}
