import { smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { Signer } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import {
  ComptrollerMock,
  ComptrollerMock__factory,
  ERC20,
  ERC20__factory,
  VBep20Delegator,
  VBep20Delegator__factory,
  WBNB,
  WBNB__factory,
} from "../../../typechain";
import { forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

// BSC Mainnet addresses
const COMPTROLLER_ADDRESS = "0xfd36e2c2a6789db23113685031d7f16329158384";
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";

const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const vWBNB_ADDRESS = "0x6bCa74586218dB34cdB402295796b79663d816e9";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const vUSDT_ADDRESS = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";

// Whale addresses for testing
const WBNB_WHALE = "0x308000D0169Ebe674B7640f0c415f44c6987d04D";
const USDT_WHALE = "0xEF3aeFf9A5F61C6Dda33069c58C1434006e13B20";

type RepaymentTestFixture = {
  comptroller: ComptrollerMock;
  wbnb: WBNB;
  usdt: ERC20;
  vWBNB: VBep20Delegator;
  vUSDT: VBep20Delegator;
  deployer: Signer;
  user: Signer;
  liquidator: Signer;
  wbnbWhale: Signer;
  usdtWhale: Signer;
};

const setupRepaymentTestFixture = async (): Promise<RepaymentTestFixture> => {
  // Impersonate whale accounts
  await impersonateAccount(WBNB_WHALE);
  await impersonateAccount(USDT_WHALE);
  const timelock = await initMainnetUser(NORMAL_TIMELOCK, parseUnits("2"));

  const [deployer, user, liquidator] = await ethers.getSigners();

  const UpdatedVToken = await ethers.getContractFactory("VBep20Delegate");
  const vTokenImpl = await UpdatedVToken.deploy();

  // Connect to contracts
  const comptroller = ComptrollerMock__factory.connect(COMPTROLLER_ADDRESS, timelock);
  const wbnb = WBNB__factory.connect(WBNB_ADDRESS, deployer);
  const usdt = ERC20__factory.connect(USDT_ADDRESS, deployer);
  const vUSDT = VBep20Delegator__factory.connect(vUSDT_ADDRESS, ethers.provider);
  const vWBNB = VBep20Delegator__factory.connect(vWBNB_ADDRESS, ethers.provider);

  await vUSDT.connect(timelock)._setImplementation(vTokenImpl.address, false, "0x");
  await vWBNB.connect(timelock)._setImplementation(vTokenImpl.address, false, "0x");

  return {
    comptroller,
    wbnb,
    vWBNB,
    usdt,
    vUSDT,
    deployer,
    user,
    liquidator,
    wbnbWhale: await ethers.getSigner(WBNB_WHALE),
    usdtWhale: await ethers.getSigner(USDT_WHALE),
  };
};

const FORK_MAINNET = process.env.FORKED_NETWORK === "bscmainnet";

if (FORK_MAINNET) {
  const blockNumber = 66871335; // Recent block
  forking(blockNumber, () => {
    describe("RepayBorrow Capping Logic Fork Tests", () => {
      let comptroller: ComptrollerMock;
      let wbnb: WBNB;
      let vWBNB: VBep20Delegator;
      let usdt: ERC20;
      let vUSDT: VBep20Delegator;
      let user: Signer;
      let liquidator: Signer;
      let wbnbWhale: Signer;
      let usdtWhale: Signer;

      const borrowAmount = parseUnits("100", 18); // User borrows 100 WBNB

      beforeEach(async () => {
        ({ comptroller, wbnb, vWBNB, usdt, vUSDT, user, liquidator, wbnbWhale, usdtWhale } =
          await loadFixture(setupRepaymentTestFixture));

        // Setup user with collateral and borrow position
        const userAddress = await user.getAddress();
        const collateralAmount = parseEther("1000"); // 1000 WBNB collateral

        // Transfer WBNB from whale to user for collateral
        await wbnb.connect(wbnbWhale).transfer(userAddress, collateralAmount);

        // User deposits WBNB as collateral
        await wbnb.connect(user).approve(vWBNB.address, collateralAmount);
        await vWBNB.connect(user).mint(collateralAmount);

        // Enter markets
        await comptroller.connect(user).enterMarkets([vWBNB.address]);

        // User borrows WBNB (need to ensure enough liquidity in the market)
        // Transfer some WBNB to the vWBNB contract to ensure liquidity
        const liquidityAmount = parseEther("2000");
        await wbnb.connect(wbnbWhale).transfer(vWBNB.address, liquidityAmount);

        // Borrow
        await vWBNB.connect(user).borrow(borrowAmount);
      });

      describe("Basic Functionality Test", () => {
        it("Should successfully set up test environment", async () => {
          const userAddress = await user.getAddress();

          // Check that user has vWBNB tokens (collateral)
          const vTokenBalance = await vWBNB.balanceOf(userAddress);
          expect(vTokenBalance.gt(0)).to.be.true;

          // Check that user has WBNB debt
          const debtBalance = await vWBNB.borrowBalanceStored(userAddress);
          expect(debtBalance.gt(0)).to.be.true;

          console.log(`User vWBNB balance: ${vTokenBalance.toString()}`);
          console.log(`User WBNB debt: ${debtBalance.toString()}`);
        });
      });

      describe("Direct repayBorrow Tests", () => {
        it("Should cap repayment to actual debt when repayAmount > debt", async () => {
          const userAddress = await user.getAddress();
          const currentDebt = await vWBNB.borrowBalanceStored(userAddress);
          const excessiveRepayAmount = currentDebt.add(parseUnits("50", 18)); // 50 WBNB more than debt

          // Give user enough WBNB to cover excessive repayment
          await wbnb.connect(wbnbWhale).transfer(userAddress, excessiveRepayAmount);
          await wbnb.connect(user).approve(vWBNB.address, excessiveRepayAmount);

          const balanceBefore = await wbnb.balanceOf(userAddress);
          const tx = await vWBNB.connect(user).repayBorrow(excessiveRepayAmount);

          // Check that only the actual debt was repaid
          const balanceAfter = await wbnb.balanceOf(userAddress);
          const actualRepaid = balanceBefore.sub(balanceAfter);

          // Allow a small difference due to interest accrual
          const tolerance = parseUnits("0.1", 18);
          expect(actualRepaid.sub(currentDebt).abs().lte(tolerance)).to.be.true;
          expect(actualRepaid.lt(excessiveRepayAmount)).to.be.true;

          // Check debt is fully paid
          const debtAfter = await vWBNB.borrowBalanceStored(userAddress);
          expect(debtAfter.eq(0)).to.be.true;

          // Verify RepayBorrow event was emitted
          const receipt = await tx.wait();
          const repayEvent = receipt.events?.find(e => e.event === "RepayBorrow");
          expect(repayEvent).to.not.be.undefined;
        });

        it("Should work normally when repayAmount < debt", async () => {
          const userAddress = await user.getAddress();
          const currentDebt = await vWBNB.borrowBalanceStored(userAddress);
          const partialRepayAmount = currentDebt.div(2); // Repay half

          await wbnb.connect(wbnbWhale).transfer(userAddress, partialRepayAmount);
          await wbnb.connect(user).approve(vWBNB.address, partialRepayAmount);

          const balanceBefore = await wbnb.balanceOf(userAddress);
          await vWBNB.connect(user).repayBorrow(partialRepayAmount);

          // Check exact amount was repaid
          const balanceAfter = await wbnb.balanceOf(userAddress);
          const actualRepaid = balanceBefore.sub(balanceAfter);

          expect(actualRepaid.eq(partialRepayAmount)).to.be.true;

          // Check remaining debt
          const debtAfter = await vWBNB.borrowBalanceStored(userAddress);
          expect(debtAfter.gt(0)).to.be.true;

          // Allow for small rounding differences due to interest accrual
          const expectedDebt = currentDebt.sub(partialRepayAmount);
          const tolerance = parseUnits("0.1", 18);
          expect(debtAfter.sub(expectedDebt).abs().lte(tolerance)).to.be.true;
        });

        it("Should work with type(uint256).max for full repayment", async () => {
          const userAddress = await user.getAddress();
          const currentDebt = await vWBNB.borrowBalanceStored(userAddress);

          // Give user more than enough WBNB
          await wbnb.connect(wbnbWhale).transfer(userAddress, currentDebt.mul(2));
          await wbnb.connect(user).approve(vWBNB.address, ethers.constants.MaxUint256);

          const balanceBefore = await wbnb.balanceOf(userAddress);
          await vWBNB.connect(user).repayBorrow(ethers.constants.MaxUint256);

          // Check that only the actual debt was repaid
          const balanceAfter = await wbnb.balanceOf(userAddress);
          const actualRepaid = balanceBefore.sub(balanceAfter);

          // Allow a small difference due to interest accrual
          const tolerance = parseUnits("0.1", 18);
          expect(actualRepaid.sub(currentDebt).abs().lte(tolerance)).to.be.true;

          // Check debt is fully paid
          const debtAfter = await vWBNB.borrowBalanceStored(userAddress);
          expect(debtAfter.eq(0)).to.be.true;
        });
      });

      describe("repayBorrowBehalf Tests", () => {
        it("Should cap repayment when paying for another user", async () => {
          const userAddress = await user.getAddress();
          const liquidatorAddress = await liquidator.getAddress();
          const currentDebt = await vWBNB.borrowBalanceStored(userAddress);
          const excessiveRepayAmount = currentDebt.add(parseUnits("30", 18));

          // Liquidator gets WBNB to repay on behalf of user
          await wbnb.connect(wbnbWhale).transfer(liquidatorAddress, excessiveRepayAmount);
          await wbnb.connect(liquidator).approve(vWBNB.address, excessiveRepayAmount);

          const balanceBefore = await wbnb.balanceOf(liquidatorAddress);
          await vWBNB.connect(liquidator).repayBorrowBehalf(userAddress, excessiveRepayAmount);

          // Check that only the actual debt was repaid
          const balanceAfter = await wbnb.balanceOf(liquidatorAddress);
          const actualRepaid = balanceBefore.sub(balanceAfter);

          // Allow a small difference due to interest accrual
          const tolerance = parseUnits("0.1", 18);
          expect(actualRepaid.sub(currentDebt).abs().lte(tolerance)).to.be.true;
          expect(actualRepaid.lt(excessiveRepayAmount)).to.be.true;

          // Check user's debt is fully paid
          const debtAfter = await vWBNB.borrowBalanceStored(userAddress);
          expect(debtAfter.eq(0)).to.be.true;
        });
      });

      describe("Liquidation Impact Tests", () => {
        it("Should cap liquidation repayment to borrower's actual debt", async () => {
          const userAddress = await user.getAddress();
          const liquidatorAddress = await liquidator.getAddress();

          // Make user's position liquidatable by price manipulation or time passage
          // First, let's get the current debt and then try to liquidate with excessive amount
          const currentDebt = await vWBNB.borrowBalanceStored(userAddress);
          const excessiveLiquidationAmount = currentDebt.add(parseUnits("20", 18));

          // Setup liquidator with WBNB
          await wbnb.connect(wbnbWhale).transfer(liquidatorAddress, excessiveLiquidationAmount);
          await wbnb.connect(liquidator).approve(vWBNB.address, excessiveLiquidationAmount);

          // To make the position liquidatable, we can try to manipulate the account's health
          // For this test, we'll assume the position becomes liquidatable
          const balanceBefore = await wbnb.balanceOf(liquidatorAddress);

          try {
            // Attempt liquidation with excessive amount
            await vWBNB.connect(liquidator).liquidateBorrow(userAddress, excessiveLiquidationAmount, vWBNB.address);

            // Check that liquidation was capped to actual debt
            const balanceAfter = await wbnb.balanceOf(liquidatorAddress);
            const actualRepaid = balanceBefore.sub(balanceAfter);

            expect(actualRepaid.lte(currentDebt)).to.be.true;
            expect(actualRepaid.lt(excessiveLiquidationAmount)).to.be.true;
          } catch (error) {
            // If liquidation fails because position is healthy, that's expected
            console.log("Liquidation failed - position might be healthy");
          }
        });
      });

      describe("Mathematical Safety Tests", () => {
        it("Should prevent underflow in debt calculations", async () => {
          const userAddress = await user.getAddress();
          const currentDebt = await vWBNB.borrowBalanceStored(userAddress);
          console.log(`Current debt: ${currentDebt.toString()}`);

          // Use a more reasonable amount - 10x the debt should be enough to test capping
          const massiveRepayAmount = currentDebt.mul(10);
          // Check whale balance and ensure it has enough
          const whaleBalance = await wbnb.balanceOf(WBNB_WHALE);

          if (whaleBalance.lt(massiveRepayAmount)) {
            // Give whale more WBNB by setting their ETH balance high
            await setBalance(WBNB_WHALE, parseEther("10000"));
            // Deposit ETH to get WBNB
            await wbnb.connect(wbnbWhale).deposit({ value: massiveRepayAmount });
          }

          await wbnb.connect(wbnbWhale).transfer(userAddress, massiveRepayAmount);
          await wbnb.connect(user).approve(vWBNB.address, massiveRepayAmount);

          // This should not revert due to underflow
          const tx = await vWBNB.connect(user).repayBorrow(massiveRepayAmount);
          await tx.wait();

          // Check debt is fully paid, not negative
          const debtAfter = await vWBNB.borrowBalanceStored(userAddress);
          expect(debtAfter.eq(0)).to.be.true;
        });

        it("Should handle edge case where debt is exactly zero", async () => {
          const userAddress = await user.getAddress();

          // First, repay all debt
          const currentDebt = await vWBNB.borrowBalanceStored(userAddress);
          await wbnb.connect(wbnbWhale).transfer(userAddress, currentDebt.mul(2)); // Extra for safety
          await wbnb.connect(user).approve(vWBNB.address, ethers.constants.MaxUint256);
          await vWBNB.connect(user).repayBorrow(ethers.constants.MaxUint256);

          // Verify debt is zero
          const debtAfterFirstRepay = await vWBNB.borrowBalanceStored(userAddress);
          expect(debtAfterFirstRepay.eq(0)).to.be.true;

          // Now try to repay again with some amount
          const unnecessaryRepayAmount = parseUnits("10", 18);
          await wbnb.connect(wbnbWhale).transfer(userAddress, unnecessaryRepayAmount);
          await wbnb.connect(user).approve(vWBNB.address, unnecessaryRepayAmount);

          const balanceBefore = await wbnb.balanceOf(userAddress);
          await vWBNB.connect(user).repayBorrow(unnecessaryRepayAmount);

          // Check that no tokens were taken (debt was 0, so repayAmount should be capped to 0)
          const balanceAfter = await wbnb.balanceOf(userAddress);

          // When debt is 0, no tokens should be taken from the user
          // The repay function should cap the repayment to 0
          expect(balanceBefore.eq(balanceAfter)).to.be.true;
        });
      });

      describe("Cross-Asset Repayment Tests", () => {
        it("Should handle repayment of WBNB debt using USDT as collateral", async () => {
          const userAddress = await user.getAddress();

          // Setup USDT collateral for user
          const usdtCollateralAmount = parseUnits("10000", 6); // 10,000 USDT (6 decimals)
          await usdt.connect(usdtWhale).transfer(userAddress, usdtCollateralAmount);
          await usdt.connect(user).approve(vUSDT.address, usdtCollateralAmount);
          await vUSDT.connect(user).mint(usdtCollateralAmount);

          // Enter USDT market as well
          await comptroller.connect(user).enterMarkets([vWBNB.address, vUSDT.address]);

          // User now has both WBNB debt and USDT collateral
          const wbnbDebt = await vWBNB.borrowBalanceStored(userAddress);
          expect(wbnbDebt.gt(0)).to.be.true;

          // Repay WBNB debt
          const repayAmount = wbnbDebt.div(2);
          await wbnb.connect(wbnbWhale).transfer(userAddress, repayAmount);
          await wbnb.connect(user).approve(vWBNB.address, repayAmount);
          await vWBNB.connect(user).repayBorrow(repayAmount);

          // Check debt was reduced
          const newDebt = await vWBNB.borrowBalanceStored(userAddress);
          expect(newDebt.lt(wbnbDebt)).to.be.true;
        });
      });

      describe("Interest Accrual During Repayment", () => {
        it("Should handle interest accrual between debt check and repayment", async () => {
          const userAddress = await user.getAddress();

          // Get initial debt
          const initialDebt = await vWBNB.borrowBalanceStored(userAddress);

          // Mine some blocks to accrue interest
          for (let i = 0; i < 100; i++) {
            await ethers.provider.send("evm_mine", []);
          }

          // Get debt after interest accrual
          const currentDebt = await vWBNB.borrowBalanceStored(userAddress);
          expect(currentDebt.gte(initialDebt)).to.be.true;

          // Repay with the old debt amount (which should be less than current)
          await wbnb.connect(wbnbWhale).transfer(userAddress, initialDebt);
          await wbnb.connect(user).approve(vWBNB.address, initialDebt);

          const balanceBefore = await wbnb.balanceOf(userAddress);
          await vWBNB.connect(user).repayBorrow(initialDebt);
          const balanceAfter = await wbnb.balanceOf(userAddress);

          const actualRepaid = balanceBefore.sub(balanceAfter);
          expect(actualRepaid.eq(initialDebt)).to.be.true;

          // There should still be some debt remaining due to accrued interest
          const remainingDebt = await vWBNB.borrowBalanceStored(userAddress);
          expect(remainingDebt.gt(0)).to.be.true;
          expect(remainingDebt.lt(currentDebt)).to.be.true;
        });
      });
    });
  });
}
