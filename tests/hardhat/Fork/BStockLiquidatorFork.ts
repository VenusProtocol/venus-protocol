import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { IAccessControlManagerV8__factory } from "../../../typechain";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

/**
 * Real bscmainnet fork test for the atomic BStockLiquidator.
 *
 * The bStock markets (vTSLAB/vNVDAB) are DEPLOYED (PR #679) but NOT YET LISTED in Core on mainnet
 * (VIP #718 hasn't executed), so this exercises the contract's atomic pipeline against REAL Venus
 * Core mechanics (liquidateBorrow -> seize -> redeem) using liquid Core markets as stand-ins for the
 * bStock collateral: vUSDC (collateral) / vUSDT (debt). The contract is collateral-agnostic; retarget
 * to vTSLAB/vUSDT via FORK_VCOLLATERAL / FORK_VDEBT / FORK_COLLATERAL_WHALE once the market is listed.
 *
 * Setup, end to end:
 *   1. Build a genuine borrow position (supply collateral -> enterMarkets -> borrow).
 *   2. MANIPULATE it into a real shortfall by dropping the collateral's liquidation threshold via the
 *      timelock (a governance parameter change) — no balance is faked.
 *   3. Deploy the liquidator and run `liquidate`. Core's `liquidatorContract` is already set to the real
 *      Venus Liquidator on mainnet, so the repay is routed through it automatically (no gate config here).
 * The Native swap is mocked (a signed firm-quote can't be obtained for synthetic fork amounts), exactly
 * as it would be on any fork; everything else is real Core.
 */

const A = {
  COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
  VCOLLATERAL: process.env.FORK_VCOLLATERAL || "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8", // vUSDC
  VDEBT: process.env.FORK_VDEBT || "0xfD5840Cd36d94D7229439859C0112a4185BC0255", // vUSDT
  COLLATERAL_WHALE: process.env.FORK_COLLATERAL_WHALE || "0xF977814e90dA44bFA03b6295A0616a897441aceC",
  DEBT_WHALE: process.env.FORK_DEBT_WHALE || "0xF977814e90dA44bFA03b6295A0616a897441aceC",
  TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
  ACM: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
};

const VTOKEN_ABI = [
  "function underlying() view returns (address)",
  "function mint(uint256) returns (uint256)",
  "function borrow(uint256) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function borrowBalanceCurrent(address) returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
];
const COMPTROLLER_ABI = [
  "function enterMarkets(address[]) returns (uint256[])",
  "function getAccountLiquidity(address) view returns (uint256,uint256,uint256)",
  "function liquidateCalculateSeizeTokens(address,address,uint256) view returns (uint256,uint256)",
  "function setCollateralFactor(address,uint256,uint256) returns (uint256)",
];
const ERC20_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const test = () => {
  describe("BStockLiquidator — bscmainnet fork (real Venus Core)", () => {
    let owner: SignerWithAddress;
    let borrower: SignerWithAddress;
    let timelock: SignerWithAddress;
    let comptroller: Contract, vCol: Contract, vDebt: Contract, col: Contract, debt: Contract;
    let router: Contract, liq: Contract;
    let colDec: number, debtDec: number;

    const REPAY = parseUnits("1000", 18);

    before(async () => {
      [owner, borrower] = await ethers.getSigners();
      timelock = await initMainnetUser(A.TIMELOCK, parseEther("10"));

      comptroller = new ethers.Contract(A.COMPTROLLER, COMPTROLLER_ABI, owner);
      vCol = new ethers.Contract(A.VCOLLATERAL, VTOKEN_ABI, owner);
      vDebt = new ethers.Contract(A.VDEBT, VTOKEN_ABI, owner);
      col = new ethers.Contract(await vCol.underlying(), ERC20_ABI, owner);
      debt = new ethers.Contract(await vDebt.underlying(), ERC20_ABI, owner);
      colDec = await col.decimals();
      debtDec = await debt.decimals();

      // --- access: grant the timelock the ACM perm to drop the collateral factor (for shortfall) ---
      const acm = IAccessControlManagerV8__factory.connect(A.ACM, timelock);
      await acm.giveCallPermission(A.COMPTROLLER, "setCollateralFactor(address,uint256,uint256)", A.TIMELOCK);

      // --- build a real borrow position ---
      const colWhale = await initMainnetUser(A.COLLATERAL_WHALE, parseEther("10"));
      const supply = parseUnits("10000", colDec);
      await col.connect(colWhale).transfer(borrower.address, supply);
      await col.connect(borrower).approve(vCol.address, supply);
      expect(await vCol.connect(borrower).callStatic.mint(supply)).to.equal(0);
      await vCol.connect(borrower).mint(supply);
      await comptroller.connect(borrower).enterMarkets([vCol.address]);
      await vDebt.connect(borrower).borrow(parseUnits("8000", debtDec));

      // --- MANIPULATE: drop the liquidation threshold so the account is underwater ---
      // setCollateralFactor(vToken, CF, LT): LT 0.50 -> max borrow 5000 < 8000 borrowed => shortfall.
      await comptroller
        .connect(timelock)
        .setCollateralFactor(vCol.address, parseUnits("0.5", 18), parseUnits("0.5", 18));
      const [, , shortfall] = await comptroller.getAccountLiquidity(borrower.address);
      expect(shortfall).to.be.gt(0); // position manipulated into shortfall

      // --- deploy the liquidator (routes through Core's existing Venus Liquidator automatically) ---
      const Factory = await ethers.getContractFactory("BStockLiquidator");
      liq = await upgrades.deployProxy(Factory, [owner.address], {
        constructorArgs: [A.COMPTROLLER],
        unsafeAllow: ["constructor", "state-variable-immutable"],
      });

      // --- deploy + fund the mock Native router and the liquidator inventory ---
      router = await (await ethers.getContractFactory("MockNativeRouter")).deploy();
      await liq.connect(owner).setRouter(router.address, true);
      const debtWhale = await initMainnetUser(A.DEBT_WHALE, parseEther("10"));
      await debt.connect(debtWhale).transfer(router.address, parseUnits("2000", debtDec)); // USDT to pay the swap
      await debt.connect(debtWhale).transfer(liq.address, REPAY); // USDT inventory to fund the repay
    });

    it("atomically repays, seizes, redeems, sells, and books a profit", async () => {
      // Precompute the seized collateral -> raw underlying the contract will hold after redeem (for minOut).
      const [, seizeTokens]: BigNumber[] = await comptroller.liquidateCalculateSeizeTokens(
        vDebt.address,
        vCol.address,
        REPAY,
      );
      const rate: BigNumber = await vCol.exchangeRateStored();
      const redeemed = seizeTokens.mul(rate).div(parseUnits("1", 18));

      // swapAll sells whatever the contract actually holds post-redeem (no fixed-amount mismatch).
      const swapCalldata = router.interface.encodeFunctionData("swapAll", [col.address, debt.address, liq.address]);
      const params = {
        borrower: borrower.address,
        vDebt: vDebt.address,
        vBStock: vCol.address,
        repayAmount: REPAY,
        router: router.address,
        swapCalldata,
        // Loose floor: the real Venus Liquidator keeps a treasury cut of the seized collateral, so
        // proceeds land a few % under the full redeemed value. Profit is asserted strictly below.
        minOut: redeemed.mul(90).div(100),
        // Single hop (USDT debt): no second AMM leg.
        router2: ethers.constants.AddressZero,
        swapCalldata2: "0x",
        intermediateToken: ethers.constants.AddressZero,
        deadline: ethers.constants.MaxUint256,
      };

      const borrowBefore = await vDebt.connect(owner).callStatic.borrowBalanceCurrent(borrower.address);
      const debtBefore = await debt.balanceOf(liq.address); // = REPAY inventory
      const out = await liq.connect(owner).callStatic.liquidate(params);
      expect(out).to.be.gte(params.minOut);

      await expect(liq.connect(owner).liquidate(params))
        .to.emit(liq, "Liquidated")
        .withArgs(borrower.address, vCol.address, REPAY, anyValue, anyValue, false);

      // Proceeds match the simulated `out` (dust differs by one block of accrual).
      const debtAfter = await debt.balanceOf(liq.address);
      const proceeds = debtAfter.sub(debtBefore).add(REPAY);
      expect(proceeds).to.be.closeTo(out, parseUnits("1", 15));

      // Strict: a profit was booked, the borrow shrank by the repay, nothing is left stuck.
      expect(proceeds).to.be.gt(REPAY); // incentive captured (proceeds exceed the repay funded)
      expect(debtAfter).to.be.gt(debtBefore);
      const borrowAfter = await vDebt.connect(owner).callStatic.borrowBalanceCurrent(borrower.address);
      expect(borrowBefore.sub(borrowAfter)).to.be.closeTo(REPAY, parseUnits("1", 15));
      expect(await col.balanceOf(liq.address)).to.equal(0); // no collateral left stuck
    });
  });
};

if (FORK_MAINNET) {
  forking(104930000, test);
}
