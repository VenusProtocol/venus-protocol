import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { IAccessControlManagerV8__factory } from "../../../typechain";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

/**
 * Real bscmainnet fork tests for the atomic BStockLiquidator — 100% on-chain, NO mock routers, NO mock gate.
 *
 * These are not happy-path demos. A bStock backstop liquidation fires during stress (volatile prices, thin
 * books, native-BNB debt), so the point is to prove the contract behaves correctly THEN: it settles when the
 * real liquidity can cover it, and it reverts CLEANLY (no loss, no half-liquidation, inventory intact) when it
 * cannot. Every swap hop is a real PancakeSwap V2 swap and every repay routes through the real Venus Liquidator
 * gate, so on-chain liquidity depth, the native-BNB repay, and the WBNB unwrap are all exercised for real. BTCB
 * (vBTC) stands in for the (not-yet-listed) bStock collateral; the contract is collateral-agnostic.
 *
 * Borrowers are impersonated REAL on-chain EOAs with no code. This is load-bearing for the native path: vBNB
 * disburses a borrow with a native `borrower.transfer`, i.e. a CALL into the borrower. hardhat's default
 * accounts carry an EIP-7702 delegation (`0xEF01…`) on mainnet, and under the fork's London rules the leading
 * `0xEF` is an invalid opcode, so a native disbursement into them reverts. Codeless EOAs sidestep that.
 *
 * Covered behavior:
 *   1. Native BNB debt (vBNB): WBNB is unwrapped for exactly the repay, the real gate accepts the payable
 *      native repay, seized BTCB is sold BTCB->USDT->WBNB on real PancakeSwap, proceeds are kept as WBNB, and
 *      no native BNB is stranded (the real WBNB.withdraw 2300-gas transfer survives the proxy receive()).
 *   2. Native BNB adverse move: when realized WBNB proceeds would breach minOut, the whole tx reverts
 *      (InsufficientOut) and rolls back — the borrow is untouched and the WBNB repay inventory is fully intact.
 *   3. Thin liquidity (CAKE): a genuinely thin USDT->CAKE route still settles when minOut tracks the live quote.
 */

const A = {
  COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
  TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
  ACM: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  BTCB_WHALE: process.env.FORK_BTCB_WHALE || "0xF977814e90dA44bFA03b6295A0616a897441aceC", // Binance hot wallet
  VBNB: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
  VWBNB: "0x6bCa74586218dB34cdB402295796b79663d816e9",
};

const TOK = {
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  CAKE: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
  BTCB: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
};

const MKT = {
  vBTC: "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B",
  vCAKE: "0x86aC3974e2BD0d60825230fa6F355fF11409df5c",
};

// Real on-chain EOAs (no 7702 delegation) used as liquidation targets. Impersonated, not signed for.
const BNB_BORROWER = "0x33C6476F88eeA28D7E7900F759B4597704Ef95B7";
const CAKE_BORROWER = ethers.utils.getAddress("0x000000000000000000000000000000000ca6e001");

const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const ONE = parseUnits("1", 18);

const VTOKEN_ABI = [
  "function underlying() view returns (address)",
  "function mint(uint256) returns (uint256)",
  "function borrow(uint256) returns (uint256)",
  "function borrowBalanceStored(address) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
];
const COMPTROLLER_ABI = [
  "function enterMarkets(address[]) returns (uint256[])",
  "function liquidateCalculateSeizeTokens(address,address,uint256) view returns (uint256,uint256)",
  "function setCollateralFactor(address,uint256,uint256) returns (uint256)",
];
const ERC20_ABI = [
  "function transfer(address,uint256) returns (bool)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];
const WBNB_ABI = ["function deposit() payable", "function transfer(address,uint256) returns (bool)"];
const PCS_ABI = [
  "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
  "function getAmountsOut(uint256,address[]) view returns (uint256[])",
];

const test = () => {
  describe("BStockLiquidator — bscmainnet fork, real PancakeSwap + real gate under stress", () => {
    let owner: SignerWithAddress;
    let comptroller: Contract, vBtc: Contract, btcb: Contract, cake: Contract, wbnb: Contract, pcs: Contract;

    const BTCB_COLLATERAL = parseEther("0.2"); // per borrower, ample for these borrows
    const BNB_BORROW = parseEther("2");
    const BNB_REPAY = parseEther("0.7"); // < closeFactor * borrow
    const CAKE_BORROW = parseEther("1000");
    const CAKE_REPAY = parseEther("300");

    before(async () => {
      [owner] = await ethers.getSigners();
      await setBalance(owner.address, parseEther("100")); // BNB to wrap for the native-debt WBNB inventory

      comptroller = new ethers.Contract(A.COMPTROLLER, COMPTROLLER_ABI, owner);
      vBtc = new ethers.Contract(MKT.vBTC, VTOKEN_ABI, owner);
      btcb = new ethers.Contract(TOK.BTCB, ERC20_ABI, owner);
      cake = new ethers.Contract(TOK.CAKE, ERC20_ABI, owner);
      wbnb = new ethers.Contract(TOK.WBNB, WBNB_ABI, owner);
      pcs = new ethers.Contract(PCS_ROUTER, PCS_ABI, owner);

      // Build both borrows at the still-normal BTCB collateral factor, BEFORE dropping it.
      const btcbWhale = await initMainnetUser(A.BTCB_WHALE, parseEther("100"));
      for (const [account, vDebt, amount] of [
        [BNB_BORROWER, A.VBNB, BNB_BORROW],
        [CAKE_BORROWER, MKT.vCAKE, CAKE_BORROW],
      ] as [string, string, BigNumber][]) {
        expect(await ethers.provider.getCode(account)).to.equal("0x"); // codeless: native disbursement is safe
        const borrower = await initMainnetUser(account, parseEther("10"));
        await btcb.connect(btcbWhale).transfer(account, BTCB_COLLATERAL);
        await btcb.connect(borrower).approve(vBtc.address, BTCB_COLLATERAL);
        await vBtc.connect(borrower).mint(BTCB_COLLATERAL);
        await comptroller.connect(borrower).enterMarkets([vBtc.address]);
        await new ethers.Contract(vDebt, VTOKEN_ABI, borrower).borrow(amount);
      }

      // Drop the BTCB threshold hard -> both borrows are underwater regardless of price.
      const timelock = await initMainnetUser(A.TIMELOCK, parseEther("10"));
      const acm = IAccessControlManagerV8__factory.connect(A.ACM, timelock);
      await acm.giveCallPermission(A.COMPTROLLER, "setCollateralFactor(address,uint256,uint256)", A.TIMELOCK);
      await comptroller.connect(timelock).setCollateralFactor(MKT.vBTC, parseUnits("0.02", 18), parseUnits("0.02", 18));
    });

    async function deployLiq() {
      const Factory = await ethers.getContractFactory("BStockLiquidator");
      const liq = await upgrades.deployProxy(Factory, [owner.address], {
        constructorArgs: [A.COMPTROLLER, A.VBNB, A.VWBNB, TOK.WBNB],
        unsafeAllow: ["constructor", "state-variable-immutable"],
      });
      await liq.connect(owner).setRouter(PCS_ROUTER, true);
      return liq;
    }

    // Real two-hop PancakeSwap calldata (BTCB -> USDT -> path2 tail) + the live expected final out.
    // hop-1 amountIn is under-shot 20% so the fixed-amount calldata always fits under the on-chain approval
    // (the gate hands the liquidator ~98% of the gross seize; 80% leaves margin).
    async function buildTwoHop(vDebt: string, repay: BigNumber, liq: string, path2: string[]) {
      const [, seizeTokens]: BigNumber[] = await comptroller.liquidateCalculateSeizeTokens(vDebt, MKT.vBTC, repay);
      const rate: BigNumber = await vBtc.exchangeRateStored();
      const x1 = seizeTokens.mul(rate).div(ONE).mul(80).div(100); // BTCB to sell on hop 1
      const mid: BigNumber = (await pcs.getAmountsOut(x1, [TOK.BTCB, TOK.USDT]))[1];
      const x2 = mid.mul(999).div(1000);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      return {
        swapCalldata: pcs.interface.encodeFunctionData("swapExactTokensForTokens", [
          x1,
          0,
          [TOK.BTCB, TOK.USDT],
          liq,
          deadline,
        ]),
        swapCalldata2: pcs.interface.encodeFunctionData("swapExactTokensForTokens", [x2, 0, path2, liq, deadline]),
        expectedOut: (await pcs.getAmountsOut(x2, path2))[path2.length - 1] as BigNumber,
      };
    }

    function bnbParams(liq: string, swapCalldata: string, swapCalldata2: string, minOut: BigNumber) {
      return {
        borrower: BNB_BORROWER,
        vDebt: A.VBNB,
        vBStock: MKT.vBTC,
        repayAmount: BNB_REPAY,
        router: PCS_ROUTER,
        swapCalldata,
        minOut,
        router2: PCS_ROUTER,
        swapCalldata2,
        intermediateToken: TOK.USDT,
        deadline: ethers.constants.MaxUint256,
      };
    }

    it("native BNB adverse: reverts InsufficientOut and rolls back, leaving the borrow and inventory intact", async () => {
      const liq = await deployLiq();
      await wbnb.deposit({ value: BNB_REPAY });
      await wbnb.transfer(liq.address, BNB_REPAY); // WBNB repay inventory

      const { swapCalldata, swapCalldata2, expectedOut } = await buildTwoHop(A.VBNB, BNB_REPAY, liq.address, [
        TOK.USDT,
        TOK.WBNB,
      ]);
      // Demand 5% MORE WBNB than the pool can deliver (as if quoted before the price moved against us).
      const params = bnbParams(liq.address, swapCalldata, swapCalldata2, expectedOut.mul(105).div(100));

      const vBnb = new ethers.Contract(A.VBNB, VTOKEN_ABI, owner);
      const borrowBefore: BigNumber = await vBnb.borrowBalanceStored(BNB_BORROWER);
      await expect(liq.connect(owner).liquidate(params)).to.be.revertedWithCustomError(liq, "InsufficientOut");

      // Full rollback: borrow not reduced, WBNB inventory untouched, no collateral seized, no BNB stranded.
      expect(await vBnb.borrowBalanceStored(BNB_BORROWER)).to.be.gte(borrowBefore);
      expect(await new ethers.Contract(TOK.WBNB, ERC20_ABI, owner).balanceOf(liq.address)).to.equal(BNB_REPAY);
      expect(await btcb.balanceOf(liq.address)).to.equal(0);
      expect(await ethers.provider.getBalance(liq.address)).to.equal(0);
    });

    it("native BNB: unwraps the repay, repays vBNB natively through the gate, sells to WBNB, strands nothing", async () => {
      const liq = await deployLiq();
      await wbnb.deposit({ value: BNB_REPAY });
      await wbnb.transfer(liq.address, BNB_REPAY);

      const { swapCalldata, swapCalldata2, expectedOut } = await buildTwoHop(A.VBNB, BNB_REPAY, liq.address, [
        TOK.USDT,
        TOK.WBNB,
      ]);
      const params = bnbParams(liq.address, swapCalldata, swapCalldata2, expectedOut.mul(97).div(100));

      const vBnb = new ethers.Contract(A.VBNB, VTOKEN_ABI, owner);
      const borrowBefore: BigNumber = await vBnb.borrowBalanceStored(BNB_BORROWER);
      const out: BigNumber = await liq.connect(owner).callStatic.liquidate(params);
      expect(out).to.be.gte(params.minOut);

      const tx = await liq.connect(owner).liquidate(params);
      const rcpt = await tx.wait();
      console.log(`      native BNB liquidation gas: ${rcpt.gasUsed.toString()}`);

      expect(borrowBefore.sub(await vBnb.borrowBalanceStored(BNB_BORROWER))).to.be.closeTo(
        BNB_REPAY,
        BNB_REPAY.div(50),
      );
      // Proceeds retained as WBNB (>= minOut), no native BNB stranded on the proxy.
      expect(await new ethers.Contract(TOK.WBNB, ERC20_ABI, owner).balanceOf(liq.address)).to.be.gte(params.minOut);
      expect(await ethers.provider.getBalance(liq.address)).to.equal(0);
    });

    it("thin liquidity: settles a real USDT->CAKE route at live slippage when minOut tracks the quote", async () => {
      const liq = await deployLiq();
      const borrower = await initMainnetUser(CAKE_BORROWER, parseEther("10"));
      await cake.connect(borrower).transfer(liq.address, CAKE_REPAY); // CAKE repay inventory

      const { swapCalldata, swapCalldata2, expectedOut } = await buildTwoHop(MKT.vCAKE, CAKE_REPAY, liq.address, [
        TOK.USDT,
        TOK.CAKE,
      ]);
      const params = {
        borrower: CAKE_BORROWER,
        vDebt: MKT.vCAKE,
        vBStock: MKT.vBTC,
        repayAmount: CAKE_REPAY,
        router: PCS_ROUTER,
        swapCalldata,
        minOut: expectedOut.mul(97).div(100),
        router2: PCS_ROUTER,
        swapCalldata2,
        intermediateToken: TOK.USDT,
        deadline: ethers.constants.MaxUint256,
      };

      const vCake = new ethers.Contract(MKT.vCAKE, VTOKEN_ABI, owner);
      const borrowBefore: BigNumber = await vCake.borrowBalanceStored(CAKE_BORROWER);
      const out: BigNumber = await liq.connect(owner).callStatic.liquidate(params);
      expect(out).to.be.gte(params.minOut);
      await liq.connect(owner).liquidate(params);

      expect(borrowBefore.sub(await vCake.borrowBalanceStored(CAKE_BORROWER))).to.be.closeTo(
        CAKE_REPAY,
        CAKE_REPAY.div(50),
      );
    });
  });
};

if (FORK_MAINNET) {
  forking(107565173, test);
}
