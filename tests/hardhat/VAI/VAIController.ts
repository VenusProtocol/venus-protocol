import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Wallet, constants } from "ethers";
import { ethers } from "hardhat";

import {
  ComptrollerLens__factory,
  ComptrollerMock,
  ComptrollerMock__factory,
  IAccessControlManager,
  VAIControllerHarness__factory,
} from "../../../typechain";
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
  accessControl: FakeContract<IAccessControlManager>;
  comptroller: MockContract<ComptrollerMock>;
  priceOracle: SimplePriceOracle;
  vai: VAIScenario;
  vaiController: MockContract<VAIControllerHarness>;
  vusdt: VBep20Harness;
}

describe("VAIController", async () => {
  let user1: Wallet;
  let user2: Wallet;
  let wallet: Wallet;
  let treasuryGuardian: Wallet;
  let treasuryAddress: Wallet;
  let accessControl: FakeContract<IAccessControlManager>;
  let comptroller: MockContract<ComptrollerMock>;
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

    const accessControl = await smock.fake<IAccessControlManager>(
      "contracts/Governance/IAccessControlManager.sol:IAccessControlManager",
    );
    accessControl.isAllowedToCall.returns(true);

    const ComptrollerFactory = await smock.mock<ComptrollerMock__factory>("ComptrollerMock");
    const comptroller = await ComptrollerFactory.deploy();

    const priceOracleFactory = await ethers.getContractFactory("SimplePriceOracle");
    const priceOracle = (await priceOracleFactory.deploy()) as SimplePriceOracle;

    const closeFactor = bigNumber17.mul(6);
    const liquidationIncentive = bigNumber18;

    const xvsFactory = await ethers.getContractFactory("XVS");
    const xvs = (await xvsFactory.deploy(wallet.address)) as XVS;

    const vaiFactory = await ethers.getContractFactory("VAIScenario");
    const vai = (await vaiFactory.deploy(BigNumber.from(97))) as VAIScenario;

    const vaiControllerFactory = await smock.mock<VAIControllerHarness__factory>("VAIControllerHarness");
    const vaiController = await vaiControllerFactory.deploy();

    const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
    const comptrollerLens = await ComptrollerLensFactory.deploy();
    await comptroller._setComptrollerLens(comptrollerLens.address);
    await comptroller._setAccessControl(accessControl.address);
    await comptroller._setVAIController(vaiController.address);
    await vaiController._setComptroller(comptroller.address);
    await vaiController.setAccessControl(accessControl.address);
    await vaiController.setBlocksPerYear(BLOCKS_PER_YEAR);
    await comptroller._setLiquidationIncentive(liquidationIncentive);
    await comptroller._setCloseFactor(closeFactor);
    await comptroller._setPriceOracle(priceOracle.address);
    comptroller.getXVSAddress.returns(xvs.address);
    await vaiController.setVAIAddress(vai.address);
    await vai.rely(vaiController.address);
    await comptroller._setTreasuryData(
      treasuryGuardian.address,
      treasuryAddress.address,
      BigNumber.from("100000000000000"),
    );
    await comptroller._setVAIMintRate(BigNumber.from(10000));
    await vaiController.setReceiver(treasuryAddress.address);
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
    await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(5));

    return { usdt, accessControl, comptroller, priceOracle, vai, vaiController, vusdt };
  }

  beforeEach("deploy Comptroller", async () => {
    ({ usdt, accessControl, comptroller, priceOracle, vai, vaiController, vusdt } = await loadFixture(
      comptrollerFixture,
    ));
    accessControl.isAllowedToCall.reset();
    accessControl.isAllowedToCall.returns(true);
    await vusdt.harnessSetBalance(user1.address, bigNumber18.mul(200));
    await comptroller.connect(user1).enterMarkets([vusdt.address]);
  });

  it("check wallet usdt balance", async () => {
    expect(await usdt.balanceOf(wallet.address)).to.eq(bigNumber18.mul(100000000));
    expect(await vusdt.balanceOf(user1.address)).to.eq(bigNumber18.mul(200));
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
      expect(res[1]).to.eq(bigNumber18.mul(200));
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
      await vaiController.setBaseRate(bigNumber17.mul(2));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);

      await vaiController.connect(user1).repayVAI(bigNumber18.mul(120));
      expect(await vai.balanceOf(user1.address)).to.eq(BigNumber.from(0));
      expect(await comptroller.mintedVAIs(user1.address)).to.eq(BigNumber.from(0));
      expect(await vai.balanceOf(treasuryAddress.address)).to.eq(bigNumber18.mul(20));
    });

    it("success for 1.2 rate repay half", async () => {
      await vaiController.setBaseRate(bigNumber17.mul(2));
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
      expect(res[1]).to.eq(bigNumber18.mul(80));
      expect(res[2]).to.eq(bigNumber18.mul(0));
    });

    it("success for 1.2 rate 0.9 vusdt collateralFactor", async () => {
      await vaiController.setBaseRate(bigNumber17.mul(2));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(9));
      const res = await comptroller.getHypotheticalAccountLiquidity(
        user1.address,
        ethers.constants.AddressZero,
        BigNumber.from(0),
        BigNumber.from(0),
      );
      expect(res[1]).to.eq(bigNumber18.mul(60));
      expect(res[2]).to.eq(bigNumber18.mul(0));
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

    it("success for zero rate 0.2 vusdt collateralFactor", async () => {
      await vai.connect(user2).approve(vaiController.address, ethers.constants.MaxUint256);
      await vaiController.harnessSetBlockNumber(BigNumber.from(100000));
      await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(3));
      await vaiController.connect(user2).liquidateVAI(user1.address, bigNumber18.mul(60), vusdt.address);
      expect(await vai.balanceOf(user2.address)).to.eq(bigNumber18.mul(40));
      expect(await vusdt.balanceOf(user2.address)).to.eq(bigNumber18.mul(60));
    });

    it("success for 1.2 rate 0.3 vusdt collateralFactor", async () => {
      await vai.connect(user2).approve(vaiController.address, ethers.constants.MaxUint256);

      const TEMP_BLOCKS_PER_YEAR = 100000;
      await vaiController.setBlocksPerYear(TEMP_BLOCKS_PER_YEAR);

      await vaiController.setBaseRate(bigNumber17.mul(2));
      await vaiController.harnessSetBlockNumber(BigNumber.from(TEMP_BLOCKS_PER_YEAR));

      await comptroller._setCollateralFactor(vusdt.address, bigNumber17.mul(3));

      await vaiController.connect(user2).liquidateVAI(user1.address, bigNumber18.mul(60), vusdt.address);
      expect(await vai.balanceOf(user2.address)).to.eq(bigNumber18.mul(40));
      expect(await vusdt.balanceOf(user2.address)).to.eq(bigNumber18.mul(50));
      expect(await vai.balanceOf(treasuryAddress.address)).to.eq(bigNumber18.mul(10));
      expect(await comptroller.mintedVAIs(user1.address)).to.eq(bigNumber18.mul(50));
    });
  });

  describe("#getVAIRepayRate", async () => {
    it("success for zero baseRate", async () => {
      const res = await vaiController.getVAIRepayRate();
      expect(res).to.eq(0);
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPirce 1e18", async () => {
      await vaiController.setBaseRate(bigNumber17);
      await vaiController.setFloatRate(bigNumber17);
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);

      expect(await vaiController.getVAIRepayRate()).to.eq(bigNumber17);
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPirce 0.5 * 1e18", async () => {
      await vaiController.setBaseRate(bigNumber17);
      await vaiController.setFloatRate(bigNumber17);

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
      await vaiController.setBaseRate(bigNumber17);
      await vaiController.setFloatRate(bigNumber17);
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(bigNumber18.mul(110));
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPirce 0.5 * 1e18", async () => {
      await vaiController.setBaseRate(bigNumber17);
      await vaiController.setFloatRate(bigNumber17);
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
      expect((await vaiController.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(50)))[0]).to.eq(
        bigNumber18.mul(50),
      );
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPirce 1e18", async () => {
      await vaiController.setBaseRate(bigNumber17);
      await vaiController.setFloatRate(bigNumber17);
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(110)))[0]).to.eq(
        bigNumber18.mul(100),
      );

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(110)))[1]).to.eq(
        bigNumber18.mul(10),
      );

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(110)))[2]).to.eq(
        bigNumber18.mul(0),
      );
    });

    it("success for baseRate 0.1 floatRate 0.1 vaiPirce 0.5 * 1e18", async () => {
      await vaiController.setBaseRate(bigNumber17);
      await vaiController.setFloatRate(bigNumber17);
      await priceOracle.setDirectPrice(vai.address, bigNumber17.mul(5));
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(115)))[0]).to.eq(
        bigNumber18.mul(100),
      );

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(115)))[1]).to.eq(
        bigNumber18.mul(15),
      );

      expect((await vaiController.getVAICalculateRepayAmount(user1.address, bigNumber18.mul(115)))[2]).to.eq(
        bigNumber18.mul(0),
      );
    });
  });

  describe("#getMintableVAI", async () => {
    beforeEach("mintVAI", async () => {
      await vaiController.connect(user1).mintVAI(bigNumber18.mul(50));
      expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(50));
      await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
    });

    it("include current interest when calculating mintable VAI", async () => {
      await vaiController.setBaseRate(bigNumber17);
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(bigNumber18.mul(55));
      expect((await vaiController.getMintableVAI(user1.address))[1]).to.eq(bigNumber18.mul(45));
    });
  });

  describe("#accrueVAIInterest", async () => {
    beforeEach("mintVAI", async () => {
      await vaiController.connect(user1).mintVAI(bigNumber18.mul(100));
      expect(await vai.balanceOf(user1.address)).to.eq(bigNumber18.mul(100));
      await vai.connect(user1).approve(vaiController.address, ethers.constants.MaxUint256);
    });

    it("success for called once", async () => {
      await vaiController.setBaseRate(bigNumber17);
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR);
      await vaiController.accrueVAIInterest();

      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(bigNumber18.mul(110));
    });

    it("success for called twice", async () => {
      await vaiController.setBaseRate(bigNumber17);
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR / 2);
      await vaiController.accrueVAIInterest();
      await vaiController.harnessFastForward(BLOCKS_PER_YEAR / 2);
      await vaiController.accrueVAIInterest();

      expect(await vaiController.getVAIRepayAmount(user1.address)).to.eq(bigNumber18.mul(110));
    });
  });

  describe("#setBaseRate", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControl.isAllowedToCall.whenCalledWith(wallet.address, "setBaseRate(uint256)").returns(false);
      await expect(vaiController.setBaseRate(42)).to.be.revertedWith("access denied");
    });

    it("emits NewVAIBaseRate event", async () => {
      const tx = await vaiController.setBaseRate(42);
      await expect(tx).to.emit(vaiController, "NewVAIBaseRate").withArgs(0, 42);
    });

    it("sets new base rate in storage", async () => {
      await vaiController.setBaseRate(42);
      expect(await vaiController.getVariable("baseRateMantissa")).to.equal(42);
    });
  });

  describe("#setFloatRate", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControl.isAllowedToCall.whenCalledWith(wallet.address, "setFloatRate(uint256)").returns(false);
      await expect(vaiController.setFloatRate(42)).to.be.revertedWith("access denied");
    });

    it("emits NewVAIFloatRate event", async () => {
      const tx = await vaiController.setFloatRate(42);
      await expect(tx).to.emit(vaiController, "NewVAIFloatRate").withArgs(0, 42);
    });

    it("sets new float rate in storage", async () => {
      await vaiController.setFloatRate(42);
      expect(await vaiController.getVariable("floatRateMantissa")).to.equal(42);
    });
  });

  describe("#setMintCap", async () => {
    it("fails if access control does not allow the call", async () => {
      accessControl.isAllowedToCall.whenCalledWith(wallet.address, "setMintCap(uint256)").returns(false);
      await expect(vaiController.setMintCap(42)).to.be.revertedWith("access denied");
    });

    it("emits NewVAIMintCap event", async () => {
      const tx = await vaiController.setMintCap(42);
      await expect(tx).to.emit(vaiController, "NewVAIMintCap").withArgs(constants.MaxUint256, 42);
    });

    it("sets new mint cap in storage", async () => {
      await vaiController.setMintCap(42);
      expect(await vaiController.getVariable("mintCap")).to.equal(42);
    });
  });

  describe("#setReceiver", async () => {
    it("fails if called by a non-admin", async () => {
      await expect(vaiController.connect(user1).setReceiver(user1.address)).to.be.revertedWith("only admin can");
    });

    it("reverts if the receiver is zero address", async () => {
      await expect(vaiController.setReceiver(constants.AddressZero)).to.be.revertedWith("invalid receiver address");
    });

    it("emits NewVAIReceiver event", async () => {
      const tx = await vaiController.setReceiver(user1.address);
      await expect(tx).to.emit(vaiController, "NewVAIReceiver").withArgs(treasuryAddress.address, user1.address);
    });

    it("sets VAI receiver address in storage", async () => {
      await vaiController.setReceiver(user1.address);
      expect(await vaiController.getVariable("receiver")).to.equal(user1.address);
    });
  });

  describe("#setAccessControl", async () => {
    it("reverts if called by non-admin", async () => {
      await expect(vaiController.connect(user1).setAccessControl(accessControl.address)).to.be.revertedWith(
        "only admin can",
      );
    });

    it("reverts if ACM is zero address", async () => {
      await expect(vaiController.setAccessControl(constants.AddressZero)).to.be.revertedWith("can't be zero address");
    });

    it("emits NewAccessControl event", async () => {
      const newAccessControl = await smock.fake<IAccessControlManager>(
        "contracts/Governance/IAccessControlManager.sol:IAccessControlManager",
      );
      const tx = await vaiController.setAccessControl(newAccessControl.address);
      await expect(tx)
        .to.emit(vaiController, "NewAccessControl")
        .withArgs(accessControl.address, newAccessControl.address);
    });

    it("sets ACM address in storage", async () => {
      const newAccessControl = await smock.fake<IAccessControlManager>(
        "contracts/Governance/IAccessControlManager.sol:IAccessControlManager",
      );
      await vaiController.setAccessControl(newAccessControl.address);
      expect(await vaiController.getVariable("accessControl")).to.equal(newAccessControl.address);
    });
  });
});
