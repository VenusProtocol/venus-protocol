import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Signer } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  CollateralSwapper,
  ComptrollerMock,
  IAccessControlManagerV8,
  InterestRateModelHarness,
  MockVBNB,
  VBep20Harness,
  WBNB,
  WBNBSwapHelper,
} from "../../../typechain";

export const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18

type SetupMarketFixture = {
  comptroller: FakeContract<ComptrollerMock>;
  vBNB: MockVBNB;
  WBNB: MockContract<WBNB>;
  vWBNB: MockContract<VBep20Harness>;
  collateralSwapper: CollateralSwapper;
  wBNBSwapHelper: WBNBSwapHelper;
};

const setupMarketFixture = async (): Promise<SetupMarketFixture> => {
  const [admin] = await ethers.getSigners();
  const accessControl = await smock.fake<IAccessControlManagerV8>("AccessControlManager");
  accessControl.isAllowedToCall.returns(true);

  const comptroller = await smock.fake<ComptrollerMock>("ComptrollerMock");
  comptroller.isComptroller.returns(1);

  const interestRateModelHarnessFactory = await ethers.getContractFactory("InterestRateModelHarness");
  const InterestRateModelHarness = (await interestRateModelHarnessFactory.deploy(
    BigNumber.from(18).mul(5),
  )) as InterestRateModelHarness;

  const VBNBFactory = await ethers.getContractFactory("MockVBNB");
  const vBNB = await VBNBFactory.deploy(
    comptroller.address,
    InterestRateModelHarness.address,
    parseUnits("1", 28),
    "Venus BNB",
    "vBNB",
    8,
    admin.address,
  );

  await vBNB.setAccessControlManager(accessControl.address);
  const WBNBFactory = await ethers.getContractFactory("WBNB");
  const WBNB = await WBNBFactory.deploy();

  const vTokenFactory = await ethers.getContractFactory("VBep20Harness");
  const vTokenConfig = {
    initialExchangeRateMantissa: parseUnits("1", 28),
    name: "Venus WBNB",
    symbol: "vWBNB",
    decimals: 8,
    becomeImplementationData: "0x",
  };
  const vWBNB = await vTokenFactory.deploy(
    WBNB.address,
    comptroller.address,
    InterestRateModelHarness.address,
    vTokenConfig.initialExchangeRateMantissa,
    vTokenConfig.name,
    vTokenConfig.symbol,
    vTokenConfig.decimals,
    admin.address,
  );
  await vWBNB.deployed();

  const CollateralSwapperFactory = await ethers.getContractFactory("CollateralSwapper");
  const collateralSwapper = await upgrades.deployProxy(CollateralSwapperFactory, [], {
    constructorArgs: [comptroller.address, vBNB.address],
    initializer: "initialize",
    unsafeAllow: ["state-variable-immutable"],
  });
  const WBNBSwapHelperFactory = await ethers.getContractFactory("WBNBSwapHelper");
  const wBNBSwapHelper = await WBNBSwapHelperFactory.deploy(WBNB.address, collateralSwapper.address);

  return {
    comptroller,
    vBNB,
    WBNB,
    vWBNB,
    collateralSwapper,
    wBNBSwapHelper,
  };
};

describe("CollateralSwapper", () => {
  let vBNB: MockVBNB;
  let WBNB: MockContract<WBNB>;
  let vWBNB: MockContract<VBep20Harness>;
  let admin: Signer;
  let user1: Signer;
  let comptroller: FakeContract<ComptrollerMock>;
  let collateralSwapper: CollateralSwapper;
  let wBNBSwapHelper: WBNBSwapHelper;

  beforeEach(async () => {
    [admin, user1] = await ethers.getSigners();
    ({ comptroller, vBNB, WBNB, vWBNB, collateralSwapper, wBNBSwapHelper } = await loadFixture(setupMarketFixture));
    expect(await vWBNB.underlying()).equals(WBNB.address);

    // Get some vBNB
    await vBNB.connect(user1).mint({ value: parseEther("5") });
    comptroller.seizeAllowed.returns(0);
  });

  describe("swapCollateral", async () => {
    it("should swapFullCollateral from vBNB to vWBNB", async () => {
      const balanceBeforeSupplying = await vWBNB.balanceOf(await user1.getAddress());
      await expect(balanceBeforeSupplying.toString()).to.eq(parseUnits("0", 8));
      await collateralSwapper
        .connect(user1)
        .swapFullCollateral(await user1.getAddress(), vBNB.address, vWBNB.address, wBNBSwapHelper.address);
      const balanceAfterSupplying = await vWBNB.balanceOf(await user1.getAddress());
      await expect(balanceAfterSupplying.toString()).to.eq(parseUnits("5", 8));
    });

    it("should swapCollateralWithAmount from vBNB to vWBNB", async () => {
      const vBNBBalance = await vBNB.balanceOf(await user1.getAddress());
      const amountToSeize = vBNBBalance.div(2); // 50% partial

      await collateralSwapper
        .connect(user1)
        .swapCollateralWithAmount(
          await user1.getAddress(),
          vBNB.address,
          vWBNB.address,
          amountToSeize,
          wBNBSwapHelper.address,
        );
      const balanceAfterSupplying = await vWBNB.balanceOf(await user1.getAddress());
      await expect(balanceAfterSupplying).to.eq(amountToSeize);
    });
  });

  describe("SweepToken", () => {
    it("should revert when called by non owner", async () => {
      await expect(collateralSwapper.connect(user1).sweepToken(WBNB.address)).to.be.rejectedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("should sweep all tokens", async () => {
      await WBNB.deposit({ value: parseUnits("2", 18) });
      await WBNB.transfer(collateralSwapper.address, parseUnits("2", 18));
      const ownerPreviousBalance = await WBNB.balanceOf(await admin.getAddress());
      await collateralSwapper.connect(admin).sweepToken(WBNB.address);

      expect(await WBNB.balanceOf(collateralSwapper.address)).to.be.eq(0);
      expect(await WBNB.balanceOf(await admin.getAddress())).to.be.greaterThan(ownerPreviousBalance);
    });
  });

  describe(" should revert on seize failures", async () => {
    it("should revert if caller is not user or approved delegate", async () => {
      comptroller.approvedDelegates.returns(false);

      await expect(
        collateralSwapper
          .connect(admin)
          .swapFullCollateral(await user1.getAddress(), vBNB.address, vWBNB.address, wBNBSwapHelper.address),
      ).to.be.revertedWithCustomError(collateralSwapper, "Unauthorized");
    });

    it("should revert on swapCollateralWithAmount with zero amount", async () => {
      await expect(
        collateralSwapper
          .connect(user1)
          .swapCollateralWithAmount(await user1.getAddress(), vBNB.address, vWBNB.address, 0, wBNBSwapHelper.address),
      ).to.be.revertedWithCustomError(collateralSwapper, "ZeroAmount");
    });

    it("should revert if user balance is zero", async () => {
      await expect(
        collateralSwapper
          .connect(admin)
          .swapFullCollateral(await admin.getAddress(), vBNB.address, vWBNB.address, wBNBSwapHelper.address),
      ).to.be.revertedWithCustomError(collateralSwapper, "NoVTokenBalance");
    });

    it("should revert if swapCollateralWithAmount is greater than user's balance", async () => {
      const userBalance = await vBNB.balanceOf(await user1.getAddress());
      const moreThanBalance = userBalance.add(1);

      await expect(
        collateralSwapper
          .connect(user1)
          .swapCollateralWithAmount(
            await user1.getAddress(),
            vBNB.address,
            vWBNB.address,
            moreThanBalance,
            wBNBSwapHelper.address,
          ),
      ).to.be.revertedWithCustomError(collateralSwapper, "NoVTokenBalance");
    });

    it("should revert if user becomes unsafe after swap", async () => {
      comptroller.getAccountLiquidity.returns([0, 0, 1]); // shortfall > 0

      await expect(
        collateralSwapper
          .connect(user1)
          .swapFullCollateral(await user1.getAddress(), vBNB.address, vWBNB.address, wBNBSwapHelper.address),
      ).to.be.revertedWithCustomError(collateralSwapper, "SwapCausesLiquidation");
      comptroller.getAccountLiquidity.reset();
    });

    it("should revert if marketFrom.seize fails", async () => {
      comptroller.seizeAllowed.returns(1); // simulate failure

      await expect(
        collateralSwapper
          .connect(user1)
          .swapFullCollateral(await user1.getAddress(), vBNB.address, vWBNB.address, wBNBSwapHelper.address),
      ).to.be.revertedWithCustomError(collateralSwapper, "SeizeFailed");
      comptroller.seizeAllowed.reset();
    });

    it("should revert if underlying transfer fails", async () => {
      comptroller.redeemAllowed.returns(1); // simulate redeem failure

      await expect(
        collateralSwapper
          .connect(user1)
          .swapFullCollateral(await user1.getAddress(), vBNB.address, vWBNB.address, wBNBSwapHelper.address),
      ).to.be.reverted;
      comptroller.redeemAllowed.reset();
    });

    it("should revert if mintBehalf fails", async () => {
      comptroller.mintAllowed.returns(1); // simulate failure

      await expect(
        collateralSwapper
          .connect(user1)
          .swapFullCollateral(await user1.getAddress(), vBNB.address, vWBNB.address, wBNBSwapHelper.address),
      ).to.be.revertedWithCustomError(collateralSwapper, "MintFailed");
      comptroller.mintAllowed.reset();
    });
  });
});
