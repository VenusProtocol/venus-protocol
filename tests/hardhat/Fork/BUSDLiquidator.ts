import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish, Contract } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  BUSDLiquidator,
  ComptrollerMock,
  FaucetToken,
  IAccessControlManagerV8__factory,
  VBep20,
} from "../../../typechain";
import {
  deployComptrollerWithMarkets,
  deployJumpRateModel,
  deployLiquidatorContract,
} from "../fixtures/ComptrollerWithMarkets";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const TOTAL_LIQUIDATION_INCENTIVE = parseUnits("1.1", 18);
const TREASURY_PERCENT_IN_LIQUIDATOR_C = parseUnits("0.1", 18);
const LIQUIDATOR_PERCENT_IN_BUSDLIQUIDATOR_C = parseUnits("0.8", 18);
const MANTISSA_ONE = parseUnits("1", 18);

const addresses = {
  bscmainnet: {
    COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
    VBUSD: "0x95c78222B3D6e262426483D42CfA53685A67Ab9D",
    VUSDT: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
    USDT_HOLDER: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    BUSD_HOLDER: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
    ACCESS_CONTROL_MANAGER: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
  },
};

const deployBUSDLiquidator = async ({
  comptroller,
  vBUSD,
  treasuryAddress,
  liquidatorShareMantissa,
}: {
  comptroller: ComptrollerMock;
  vBUSD: VBep20;
  treasuryAddress: string;
  liquidatorShareMantissa: BigNumberish;
}) => {
  const busdLiquidatorFactory = await ethers.getContractFactory("BUSDLiquidator");
  const busdLiquidator = (await upgrades.deployProxy(busdLiquidatorFactory, [liquidatorShareMantissa], {
    constructorArgs: [comptroller.address, vBUSD.address, treasuryAddress],
  })) as BUSDLiquidator;
  await busdLiquidator.deployed();
  return busdLiquidator;
};

interface BUSDLiquidatorFixture {
  comptroller: ComptrollerMock;
  busdLiquidator: BUSDLiquidator;
  vCollateral: VBep20;
  vBUSD: VBep20;
  busd: FaucetToken;
  treasuryAddress: string;
  collateral: Contract;
}

const setupLocal = async (): Promise<BUSDLiquidatorFixture> => {
  const [, supplier, borrower, someone, treasury] = await ethers.getSigners();
  const { comptroller, vTokens, vBNB } = await deployComptrollerWithMarkets({ numBep20Tokens: 2 });
  const [vBUSD, vCollateral] = vTokens;
  const zeroRateModel = await deployJumpRateModel({
    baseRatePerYear: 0,
    multiplierPerYear: 0,
    jumpMultiplierPerYear: 0,
    kink: 0,
  });
  await zeroRateModel.deployed();
  await vBUSD._setInterestRateModel(zeroRateModel.address);
  await comptroller.setIsBorrowAllowed(0, vBUSD.address, true);
  await comptroller["setLiquidationIncentive(address,uint256)"](vCollateral.address, TOTAL_LIQUIDATION_INCENTIVE);
  await deployLiquidatorContract({
    comptroller,
    vBNB,
    treasuryAddress: treasury.address,
    treasuryPercentMantissa: TREASURY_PERCENT_IN_LIQUIDATOR_C,
  });
  const busdLiquidator = await deployBUSDLiquidator({
    comptroller,
    vBUSD,
    treasuryAddress: treasury.address,
    liquidatorShareMantissa: LIQUIDATOR_PERCENT_IN_BUSDLIQUIDATOR_C,
  });
  await comptroller["setCollateralFactor(address,uint256,uint256)"](
    vCollateral.address,
    parseUnits("0.5", 18),
    parseUnits("0.5", 18),
  );
  await comptroller._setMarketSupplyCaps(
    [vBUSD.address, vCollateral.address],
    [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
  );
  await comptroller._setMarketBorrowCaps(
    [vBUSD.address, vCollateral.address],
    [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
  );
  const busd = await ethers.getContractAt("FaucetToken", await vBUSD.underlying());
  const collateral = await ethers.getContractAt("FaucetToken", await vCollateral.underlying());

  await busd.allocateTo(supplier.address, parseUnits("5000", 18));
  await busd.connect(supplier).approve(vBUSD.address, parseUnits("5000", 18));
  await vBUSD.connect(supplier).mint(parseUnits("5000", 18));

  await collateral.allocateTo(borrower.address, parseUnits("10000", 18));
  await collateral.connect(borrower).approve(vCollateral.address, parseUnits("10000", 18));
  await vCollateral.connect(borrower).mint(parseUnits("10000", 18));
  await comptroller.connect(borrower).enterMarkets([vCollateral.address]);
  await vBUSD.connect(borrower).borrow(parseUnits("1000", 18));

  await busd.allocateTo(someone.address, parseUnits("10000", 18));
  await busd.connect(someone).approve(busdLiquidator.address, parseUnits("10000", 18));

  await comptroller._setForcedLiquidation(vBUSD.address, true);
  return { comptroller, busdLiquidator, vCollateral, vBUSD, busd, treasuryAddress: treasury.address, collateral };
};

const setupFork = async (): Promise<BUSDLiquidatorFixture> => {
  const [admin, , borrower, someone] = await ethers.getSigners();

  const zeroRateModel = await deployJumpRateModel({
    baseRatePerYear: 0,
    multiplierPerYear: 0,
    jumpMultiplierPerYear: 0,
  });

  const comptroller = await ethers.getContractAt("ComptrollerMock", addresses.bscmainnet.COMPTROLLER);
  const vBUSD = await ethers.getContractAt("VBep20", addresses.bscmainnet.VBUSD);
  const vCollateral = await ethers.getContractAt("VBep20", addresses.bscmainnet.VUSDT);
  const busd = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vBUSD.underlying());
  const collateral = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vCollateral.underlying());
  const treasuryAddress = await comptroller.treasuryAddress();
  const acm = IAccessControlManagerV8__factory.connect(addresses.bscmainnet.ACCESS_CONTROL_MANAGER, admin);

  const busdLiquidator = await deployBUSDLiquidator({
    comptroller,
    vBUSD,
    treasuryAddress: await comptroller.treasuryAddress(),
    liquidatorShareMantissa: LIQUIDATOR_PERCENT_IN_BUSDLIQUIDATOR_C,
  });

  const timelock = await initMainnetUser(addresses.bscmainnet.TIMELOCK, parseEther("1"));
  await acm
    .connect(timelock)
    .giveCallPermission(comptroller.address, "_setActionsPaused(address[],uint8[],bool)", busdLiquidator.address);
  await comptroller.connect(timelock)._setMarketSupplyCaps([vBUSD.address], [ethers.constants.MaxUint256]);
  await comptroller.connect(timelock)._setMarketBorrowCaps([vBUSD.address], [ethers.constants.MaxUint256]);
  await comptroller.connect(timelock)._setForcedLiquidation(vBUSD.address, true);
  const actions = {
    MINT: 0,
    BORROW: 2,
    ENTER_MARKETS: 7,
  };
  await comptroller
    .connect(timelock)
    ._setActionsPaused([vBUSD.address], [actions.MINT, actions.BORROW, actions.ENTER_MARKETS], false);
  await vBUSD.connect(timelock)._setInterestRateModel(zeroRateModel.address);
  await vCollateral.connect(timelock)._setInterestRateModel(zeroRateModel.address);

  const busdHolder = await initMainnetUser(addresses.bscmainnet.BUSD_HOLDER, parseEther("1"));
  await busd.connect(busdHolder).approve(vBUSD.address, parseUnits("10000000", 18));
  await vBUSD.connect(busdHolder).mint(parseUnits("10000000", 18)); // inject liquidity

  const usdtHolder = await initMainnetUser(addresses.bscmainnet.USDT_HOLDER, parseEther("1"));
  await collateral.connect(usdtHolder).transfer(borrower.address, parseUnits("10000", 18));
  await collateral.connect(borrower).approve(vCollateral.address, parseUnits("10000", 18));
  await vCollateral.connect(borrower).mint(parseUnits("10000", 18));
  await comptroller.connect(borrower).enterMarkets([vCollateral.address]);
  await vBUSD.connect(borrower).borrow(parseUnits("1000", 18));

  await busd.connect(busdHolder).transfer(someone.address, parseUnits("10000", 18));
  await busd.connect(someone).approve(busdLiquidator.address, parseUnits("10000", 18));

  return { comptroller, busdLiquidator, vCollateral, vBUSD, busd, treasuryAddress, collateral };
};

const test = (setup: () => Promise<BUSDLiquidatorFixture>) => () => {
  describe("BUSDLiquidator", () => {
    let comptroller: ComptrollerMock;
    let busdLiquidator: BUSDLiquidator;
    let vCollateral: VBep20;
    let vBUSD: VBep20;
    let busd: FaucetToken;
    let borrower: SignerWithAddress;
    let someone: SignerWithAddress;
    let treasuryAddress: string;

    beforeEach(async () => {
      ({ comptroller, busdLiquidator, vCollateral, vBUSD, busd, treasuryAddress } = await loadFixture(setup));
      [, , borrower, someone] = await ethers.getSigners();
    });

    describe("setLiquidatorShare", () => {
      it("should set liquidator share", async () => {
        const newLiquidatorShareMantissa = parseUnits("1.0", 18);
        await busdLiquidator.setLiquidatorShare(newLiquidatorShareMantissa);
        expect(await busdLiquidator.liquidatorShareMantissa()).to.equal(newLiquidatorShareMantissa);
      });

      it("should emit NewLiquidatorShare event", async () => {
        const oldLiquidatorShareMantissa = parseUnits("0.8", 18);
        const newLiquidatorShareMantissa = parseUnits("0.85", 18);
        const tx = await busdLiquidator.setLiquidatorShare(newLiquidatorShareMantissa);
        await expect(tx)
          .to.emit(busdLiquidator, "NewLiquidatorShare")
          .withArgs(oldLiquidatorShareMantissa, newLiquidatorShareMantissa);
      });

      it("should revert if caller is not owner", async () => {
        const newLiquidatorShareMantissa = parseUnits("1.02", 18);
        await expect(busdLiquidator.connect(someone).setLiquidatorShare(newLiquidatorShareMantissa)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("should revert if new liquidator share is > MANTISA_ONE", async () => {
        const newLiquidatorShareMantissa = parseUnits("1.1", 18);
        await expect(busdLiquidator.setLiquidatorShare(newLiquidatorShareMantissa))
          .to.be.revertedWithCustomError(busdLiquidator, "LiquidatorShareTooHigh")
          .withArgs(MANTISSA_ONE, newLiquidatorShareMantissa);
      });
    });

    describe("liquidateEntireBorrow", async () => {
      it("should repay entire borrow", async () => {
        const repayAmount = parseUnits("1000", 18);
        const tx = await busdLiquidator.connect(someone).liquidateEntireBorrow(borrower.address, vCollateral.address);
        await expect(tx).to.changeTokenBalances(busd, [someone, vBUSD], [repayAmount.mul(-1), repayAmount]);
        expect(await vBUSD.callStatic.borrowBalanceCurrent(borrower.address)).to.equal(0);
      });

      it("should seize collateral and split correctly between liquidator and treasury", async () => {
        const repayAmount = parseUnits("1000", 18);

        // Capture balances before liquidation
        const treasuryBalanceBefore = await vCollateral.callStatic.balanceOf(treasuryAddress);
        const liquidatorBalanceBefore = await vCollateral.callStatic.balanceOf(someone.address);

        // Perform liquidation
        const tx = await busdLiquidator.connect(someone).liquidateEntireBorrow(borrower.address, vCollateral.address);

        // Capture balances after liquidation
        const treasuryBalanceAfter = await vCollateral.callStatic.balanceOf(treasuryAddress);
        const liquidatorBalanceAfter = await vCollateral.callStatic.balanceOf(someone.address);

        // Get total collateral to seize from comptroller
        const [, totalSeizedCollateral] = await comptroller.callStatic[
          "liquidateCalculateSeizeTokens(address,address,uint256)"
        ](vBUSD.address, vCollateral.address, repayAmount); // e.g., 110% of repayAmount

        // Compute treasury share taken by the Liquidator contract
        const liquidatorContractTreasuryShare = totalSeizedCollateral
          .mul(TOTAL_LIQUIDATION_INCENTIVE.sub(MANTISSA_ONE))
          .mul(TREASURY_PERCENT_IN_LIQUIDATOR_C)
          .div(TOTAL_LIQUIDATION_INCENTIVE)
          .div(MANTISSA_ONE);
        expect(liquidatorContractTreasuryShare).to.be.closeTo(parseUnits("10", 18), 1);

        // Effective collateral after treasury cut at Liquidator contract
        const effectiveSeizedCollateral = totalSeizedCollateral.sub(liquidatorContractTreasuryShare);
        expect(effectiveSeizedCollateral).to.be.closeTo(parseUnits("1090", 18), 1);

        // Total received by BUSDLiquidator (liquidator + treasury)
        const busdLiquidatorReceived = treasuryBalanceAfter
          .sub(treasuryBalanceBefore)
          .add(liquidatorBalanceAfter.sub(liquidatorBalanceBefore));
        expect(busdLiquidatorReceived).to.closeTo(effectiveSeizedCollateral, 1);

        // Compute effective liquidation incentive for BUSDLiquidator
        // LI - treasury portion of bonus; e.g., if LI = 1.1 and treasury = 0.1, effective = 1.09
        const effectiveLiqIncentive = MANTISSA_ONE.add(
          TOTAL_LIQUIDATION_INCENTIVE.sub(MANTISSA_ONE)
            .mul(MANTISSA_ONE.sub(TREASURY_PERCENT_IN_LIQUIDATOR_C))
            .div(MANTISSA_ONE),
        );
        expect(effectiveLiqIncentive).to.closeTo(parseUnits("1.09", 18), 1);

        // Compute treasury and liquidator shares for BUSDLiquidator
        const treasuryPercent = MANTISSA_ONE.sub(LIQUIDATOR_PERCENT_IN_BUSDLIQUIDATOR_C); // Treasury share of bonus
        const bonusMantissa = effectiveLiqIncentive.sub(MANTISSA_ONE); // Extra over 100%
        const bonusAmount = effectiveSeizedCollateral.mul(bonusMantissa).div(effectiveLiqIncentive);
        const treasuryShare = bonusAmount.mul(treasuryPercent).div(MANTISSA_ONE);
        const liquidatorShare = effectiveSeizedCollateral.sub(treasuryShare);

        // Validate balances after liquidation
        await expect(tx).to.changeTokenBalance(vCollateral, borrower, totalSeizedCollateral.mul(-1));
        expect(treasuryBalanceAfter.sub(treasuryBalanceBefore)).to.be.closeTo(treasuryShare, 1);
        expect(liquidatorBalanceAfter.sub(liquidatorBalanceBefore)).to.be.closeTo(liquidatorShare, 1);
      });
    });

    describe("liquidateBorrow", async () => {
      it("should repay a part of the borrow", async () => {
        const repayAmount = parseUnits("100", 18);
        const tx = await busdLiquidator
          .connect(someone)
          .liquidateBorrow(borrower.address, repayAmount, vCollateral.address);
        await expect(tx).to.changeTokenBalances(busd, [someone, vBUSD], [repayAmount.mul(-1), repayAmount]);
        expect(await vBUSD.callStatic.borrowBalanceCurrent(borrower.address)).to.equal(parseUnits("900", 18));
      });

      it("should seize collateral correctly for partial repay and split between liquidator and treasury", async () => {
        const repayAmount = parseUnits("100", 18);

        const tx = await busdLiquidator
          .connect(someone)
          .liquidateBorrow(borrower.address, repayAmount, vCollateral.address);

        const [, totalSeizedCollateral] = await comptroller.callStatic[
          "liquidateCalculateSeizeTokens(address,address,uint256)"
        ](vBUSD.address, vCollateral.address, repayAmount); // e.g., 110% of repayAmount

        // Treasury share taken by the Liquidator contract
        const liquidatorContractTreasuryShare = totalSeizedCollateral
          .mul(TOTAL_LIQUIDATION_INCENTIVE.sub(MANTISSA_ONE))
          .mul(TREASURY_PERCENT_IN_LIQUIDATOR_C)
          .div(TOTAL_LIQUIDATION_INCENTIVE)
          .div(MANTISSA_ONE);

        // Effective collateral that BUSDLiquidator receives
        const effectiveSeizedCollateral = totalSeizedCollateral.sub(liquidatorContractTreasuryShare);

        // Effective liquidation incentive (bonus portion after treasury cut)
        // Example: LI = 1.1, treasury cut = 0.1 → effective = 1.09
        const effectiveLiqIncentive = MANTISSA_ONE.add(
          TOTAL_LIQUIDATION_INCENTIVE.sub(MANTISSA_ONE)
            .mul(MANTISSA_ONE.sub(TREASURY_PERCENT_IN_LIQUIDATOR_C))
            .div(MANTISSA_ONE),
        );

        // Treasury percent for BUSDLiquidator
        const BUSDLiquidatorTreasuryPercent = MANTISSA_ONE.sub(LIQUIDATOR_PERCENT_IN_BUSDLIQUIDATOR_C);

        // Bonus mantissa (extra over 100%)
        const bonusMantissa = effectiveLiqIncentive.sub(MANTISSA_ONE);

        // Bonus amount
        const bonusAmount = effectiveSeizedCollateral.mul(bonusMantissa).div(effectiveLiqIncentive);

        // Treasury and liquidator shares from effectiveSeizedCollateral
        const treasuryShare = bonusAmount.mul(BUSDLiquidatorTreasuryPercent).div(MANTISSA_ONE);
        const liquidatorShare = effectiveSeizedCollateral.sub(treasuryShare);

        await expect(tx).to.changeTokenBalances(
          vCollateral,
          [borrower, someone, treasuryAddress],
          [totalSeizedCollateral.mul(-1), liquidatorShare, treasuryShare],
        );
      });
    });
  });
};

if (FORK_MAINNET) {
  const blockNumber = 32275000;
  // For market-specific liquidations, the logic in the Liquidator contract has changed,
  // which will break the old fork test.
  forking(blockNumber, test(setupFork));
} else {
  test(setupLocal)();
}
