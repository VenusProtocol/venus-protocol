import { MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Wallet } from "ethers";
import { ethers } from "hardhat";

import { Comptroller, ComptrollerLens__factory, Comptroller__factory, IAccessControlManager, VAIControllerHarness__factory } from "../../../typechain";
import { SimplePriceOracle } from "../../../typechain";
import { XVS } from "../../../typechain";
import { VAIScenario } from "../../../typechain";
import { VAIControllerHarness } from "../../../typechain";
import { BEP20Harness } from "../../../typechain";
import { VBep20Harness } from "../../../typechain";
import { InterestRateModelHarness } from "../../../typechain";

export const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18
export const bigNumber17 = BigNumber.from("100000000000000000"); //1e17
export const bigNumber16 = BigNumber.from("10000000000000000"); //1e16
export const bigNumber15 = BigNumber.from("1000000000000000"); //1e15
export const bigNumber8 = BigNumber.from("100000000"); // 1e8
export const dateNow = BigNumber.from("1636429275"); // 2021-11-09 11:41:15

const BLOCKS_PER_YEAR = 1000;

interface ComptrollerFixture {
  usdt: BEP20Harness;
  comptroller: MockContract<Comptroller>;
  priceOracle: SimplePriceOracle;
  vai: VAIScenario;
  vaiController: MockContract<VAIControllerHarness>;
  vusdt: VBep20Harness;
}

describe("Comptroller", async () => {
  let user1: Wallet;
  let user2: Wallet;
  let wallet: Wallet;
  let treasuryGuardian: Wallet;
  let treasuryAddress: Wallet;
  let comptroller: MockContract<Comptroller>;
  let priceOracle: SimplePriceOracle;
  let vai: VAIScenario;
  let vaiController: MockContract<VAIControllerHarness>;
  let usdt: BEP20Harness;
  let vusdt: VBep20Harness;

  before("get signers", async () => {
    [wallet, user1, user2, treasuryGuardian, treasuryAddress] = await (ethers as any).getSigners();
  });

  async function comptrollerFixture(): Promise<ComptrollerFixture> {
    const testTokenFactory = await ethers.getContractFactory("BEP20Harness");
    const usdt = (await testTokenFactory.deploy(
      bigNumber18.mul(100000000),
      "usdt",
      BigNumber.from(18),
      "BEP20 usdt",
    )) as BEP20Harness;

    const accessControl = await smock.fake<IAccessControlManager>("AccessControlManager");
    accessControl.isAllowedToCall.returns(true);

    const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
    const comptroller = await ComptrollerFactory.deploy();

    const priceOracleFactory = await ethers.getContractFactory("SimplePriceOracle");
    const priceOracle = (await priceOracleFactory.deploy()) as SimplePriceOracle;

    const closeFactor = bigNumber17.mul(6);
    const liquidationIncentive = bigNumber18;

    const xvsFactory = await ethers.getContractFactory("XVS");
    const xvs = (await xvsFactory.deploy(wallet.address)) as XVS;

    const vaiFactory = await ethers.getContractFactory("VAIScenario");
    const vai = (await vaiFactory.deploy(BigNumber.from(97))) as VAIScenario;

    const venusRate = bigNumber18;

    const vaiControllerFactory = await smock.mock<VAIControllerHarness__factory>("VAIControllerHarness"); 
    const vaiController = await vaiControllerFactory.deploy();

    const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
    const comptrollerLens = await ComptrollerLensFactory.deploy();

    await comptroller._setComptrollerLens(comptrollerLens.address);
    await comptroller._setAccessControl(accessControl.address);
    await comptroller._setVAIController(vaiController.address);
    await vaiController._setComptroller(comptroller.address);
    await vaiController.setBlocksPerYear(BLOCKS_PER_YEAR);
    await comptroller._setLiquidationIncentive(liquidationIncentive);
    await comptroller._setCloseFactor(closeFactor);
    await comptroller._setPriceOracle(priceOracle.address);
    comptroller.getXVSAddress.returns(xvs.address);
    await vaiController.setVAIAddress(vai.address);
    await vaiController.initVenusVAIInterestState();
    await comptroller.setVariable("venusRate", venusRate);
    await vai.rely(vaiController.address);
    await comptroller._setTreasuryData(
      treasuryGuardian.address,
      treasuryAddress.address,
      BigNumber.from("100000000000000"),
    );
    await comptroller._setVAIMintRate(BigNumber.from(10000));
    await vaiController._setReceiver(treasuryAddress.address);
    await vaiController.initialize();

    const interestRateModelHarnessFactory = await ethers.getContractFactory("InterestRateModelHarness");
    const InterestRateModelHarness = (await interestRateModelHarnessFactory.deploy(
      BigNumber.from(0),
    )) as InterestRateModelHarness;

    const vTokenFactory = await ethers.getContractFactory("VBep20Harness");
    const vusdt = (await vTokenFactory.deploy(
      usdt.address,
      comptroller.address,
      InterestRateModelHarness.address,
      bigNumber18,
      "VToken usdt",
      "vusdt",
      BigNumber.from(18),
      wallet.address,
    )) as VBep20Harness;
    await priceOracle.setUnderlyingPrice(vusdt.address, bigNumber18);
    await priceOracle.setDirectPrice(vai.address, bigNumber18);
    await comptroller._supportMarket(vusdt.address);

    return { usdt, comptroller, priceOracle, vai, vaiController, vusdt };
  }

  beforeEach("deploy Comptroller", async () => {
    ({ usdt, comptroller, priceOracle, vai, vaiController, vusdt } = await loadFixture(comptrollerFixture));
    await vusdt.harnessSetBalance(user1.address, bigNumber18.mul(100));
    await comptroller.connect(user1).enterMarkets([vusdt.address]);
  });

  it("check wallet usdt balance", async () => {
    expect(await usdt.balanceOf(wallet.address)).to.eq(bigNumber18.mul(100000000));
    expect(await vusdt.balanceOf(user1.address)).to.eq(bigNumber18.mul(100));
  });

  describe("#getMintableVAI", async () => {
    it("oracle", async () => {
      expect(await comptroller.oracle()).to.eq(priceOracle.address);
    });

    it("getAssetsIn", async () => {
      const enteredMarkets = await comptroller.getAssetsIn(user1.address);
      expect(enteredMarkets.length).to.eq(1);
    });

    it("getAccountSnapshot", async () => {
      const res = await vusdt.getAccountSnapshot(user1.address);
      expect(res[0]).to.eq(0);
      expect(res[1]).to.eq(bigNumber18.mul(100));
      expect(res[2]).to.eq(BigNumber.from(0));
      expect(res[3]).to.eq(bigNumber18);
    });

    it("getUnderlyingPrice", async () => {
      expect(await priceOracle.getUnderlyingPrice(vusdt.address)).to.eq(bigNumber18);
    });

    it("getComtroller", async () => {
      expect(await vaiController.admin()).to.eq(wallet.address);
      expect(await vaiController.comptroller()).to.eq(comptroller.address);
    });

    it("success", async () => {
      const res = await vaiController.getMintableVAI(user1.address);
      expect(res[1]).to.eq(bigNumber18.mul(100));
    });
  });

  describe("#mintVAI", async () => {
    it("success", async () => {
      await vaiController.connect(user1).mintVAI(bigNumber18.mul(100));
      expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100));
      expect(await comptroller.mintedVAIs(user1.address)).to.eq(bigNumber18.mul(100));
    });
  });

  describe("#repayVAI", async () => {
    beforeEach("mintVAI", async () => {
      await vaiController.connect(user1).mintVAI(bigNumber18.mul(100));
      expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100));
      await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
    });

    it("success for zero rate", async () => {
      await vaiController.connect(user1).repayVAI(bigNumber18.mul(100));
      expect(await vai.balanceOf(user1.address)).to.eq(BigNumber.from(0));
      expect(await comptroller.mintedVAIs(user1.address)).to.eq(BigNumber.from(0));
    });

    it("success for 1.2 rate repay all", async () => {
      await vai.allocateTo(user1.address, bigNumber18.mul(20));
      await vaiController._setBaseRate(bigNumber17.mul(2));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);

      await vaiController.connect(user1).repayVAI(bigNumber18.mul(120));
      expect(await vai.balanceOf(user1.address)).to.eq(BigNumber.from(0));
      expect(await comptroller.mintedVAIs(user1.address)).to.eq(BigNumber.from(0));
      expect(await vai.balanceOf(treasuryAddress.address)).to.eq(bigNumber18.mul(20));
    });

    it("success for 1.2 rate repay half", async () => {
      await vaiController._setBaseRate(bigNumber17.mul(2));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);

      await vaiController.connect(user1).repayVAI(bigNumber18.mul(60));
      expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(40));
      expect(await comptroller.mintedVAIs(user1.address)).to.eq(bigNumber18.mul(50));
      expect(await vai.balanceOf(treasuryAddress.address)).to.eq(bigNumber18.mul(10));
    });
  });

  describe("#getHypotheticalAccountLiquidity", async () => {
    beforeEach("user1 borrow", async () => {
      await vaiController.connect(user1).mintVAI(bigNumber18.mul(100));
      await vai.allocateTo(user2.address, bigNumber18.mul(100));
      expect(await comptroller.mintedVAIs(user1.address)).to.eq(bigNumber18.mul(100));
      expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100));
    });

    it("success for zero rate 0.9 vusdt collateralFactor", async () => {
      await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(9));
      const res = await comptroller.getHypotheticalAccountLiquidity(
        user1.address,
        ethers.constants.AddressZero,
        BigNumber.from(0),
        BigNumber.from(0),
      );
      expect(res[1]).to.eq(0);
      expect(res[2]).to.eq(bigNumber18.mul(10));
    });

    it("success for 1.2 rate 0.9 vusdt collateralFactor", async () => {
      await vaiController._setBaseRate(bigNumber17.mul(2));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(9));
      const res = await comptroller.getHypotheticalAccountLiquidity(
        user1.address,
        ethers.constants.AddressZero,
        BigNumber.from(0),
        BigNumber.from(0),
      );
      expect(res[1]).to.eq(0);
      expect(res[2]).to.eq(bigNumber18.mul(30));
    });
  });

  describe("#liquidateVAI", async () => {
    beforeEach("user1 borrow", async () => {
      await vaiController.connect(user1).mintVAI(bigNumber18.mul(100));
      await vai.allocateTo(user2.address, bigNumber18.mul(100));
      expect(await comptroller.mintedVAIs(user1.address)).to.eq(bigNumber18.mul(100));
      expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100));
      expect(await vai.balanceOf(user2.address)).to.eq(bigNumber18.mul(100));
    });

    it("liquidationIncentiveMantissa", async () => {
      expect(await comptroller.liquidationIncentiveMantissa()).to.eq(bigNumber18);
    });

    it("success for zero rate 0.9 vusdt collateralFactor", async () => {
      await vai.connect(user2).approve(vaiController.address, ethers.constants.MaxUint256);
      await vaiController.harnessSetBlockNumber(BigNumber.from(100000));
      await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(9));
      await vaiController.connect(user2).liquidateVAI(user1.address, bigNumber18.mul(60), vusdt.address);
      expect(await vai.balanceOf(user2.address)).to.eq(bigNumber18.mul(40));
      expect(await vusdt.balanceOf(user2.address)).to.eq(bigNumber18.mul(60));
    });

    it("success for 1.2 rate 0.9 vusdt collateralFactor", async () => {
      await vai.connect(user2).approve(vaiController.address, ethers.constants.MaxUint256);

      const TEMP_BLOCKS_PER_YEAR = 100000
      vaiController.setBlocksPerYear(TEMP_BLOCKS_PER_YEAR);
      
      await vaiController._setBaseRate(bigNumber17.mul(2));
      await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(9));
      await vaiController.connect(user2).liquidateVAI(user1.address, bigNumber18.mul(72), vusdt.address);
      expect(await vai.balanceOf(user2.address)).to.eq(bigNumber18.mul(28));
      expect(await vusdt.balanceOf(user2.address)).to.eq(bigNumber18.mul(60));
      expect(await vai.balanceOf(treasuryAddress.address)).to.eq(bigNumber18.mul(12));
      expect(await comptroller.mintedVAIs(user1.address)).to.eq(bigNumber18.mul(40));
    });
  });

  describe("#getVAIRepayRate", async () => {
    it("success for zero baseRate", async () => {
      const res = await vaiController.getVAIRepayRate();
      expect(res).to.eq(0);
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPirce 1e18", async () => {
      await vaiController._setBaseRate(bigNumber17);
      await vaiController._setFloatRate(bigNumber17);
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);

      expect(await vaiController.getVAIRepayRate()).to.eq(bigNumber17);
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPirce 0.5 * 1e18", async () => {
      await vaiController._setBaseRate(bigNumber17);
      await vaiController._setFloatRate(bigNumber17);
      
      await priceOracle.setDirectPrice(vai.address, bigNumber17.mul(5));
      expect(await vaiController.getVAIRepayRate()).to.eq(bigNumber16.mul(15));
    });
  });

  describe("#getVAIRepayAmount", async () => {
    beforeEach("mintVAI", async () => {
      await vaiController.connect(user1).mintVAI(bigNumber18.mul(100));
      expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100));
      await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
    });

    it("success for zero rate", async () => {
      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(bigNumber18.mul(100));
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPirce 1e18", async () => {
      await vaiController._setBaseRate(bigNumber17);
      await vaiController._setFloatRate(bigNumber17);
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();
      
      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(bigNumber18.mul(110));
    });


    it("success for baseRate 0.1 floatRate 0.1 vaiPirce 0.5 * 1e18", async () => {
      await vaiController._setBaseRate(bigNumber17);
      await vaiController._setFloatRate(bigNumber17);
      await priceOracle.setDirectPrice(vai.address, bigNumber17.mul(5));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(bigNumber18.mul(115));
    });
  });

  describe("#getVAICalculateRepayAmount", async () => {
    beforeEach("mintVAI", async () => {
      await vaiController.connect(user1).mintVAI(bigNumber18.mul(100));
      expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100));
      await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
    });

    it("success for zero rate", async () => {
      expect(await vaiController.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(50))).to.eq(
        bigNumber18.mul(50),
      );
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPirce 1e18", async () => {
      await vaiController._setBaseRate(bigNumber17);
      await vaiController._setFloatRate(bigNumber17);
      expect(await vaiController.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(110))).to.eq(
        bigNumber18.mul(100),
      );
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPirce 0.5 * 1e18", async () => {
      await vaiController._setBaseRate(bigNumber17);
      await vaiController._setFloatRate(bigNumber17);
      await priceOracle.setDirectPrice(vai.address, bigNumber17.mul(5));
      expect(await vaiController.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(115))).to.eq(
        bigNumber18.mul(100),
      );
    });
  });
});
