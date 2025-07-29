import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  CollateralSwapper,
  ComptrollerMock,
  ComptrollerMock__factory,
  Diamond,
  Diamond__factory,
  VBNB,
  VBNB__factory,
  VToken,
  WBNBSwapHelper,
} from "../../../typechain";
import { forking, initMainnetUser } from "./utils";

// to fix invalid opcode revert, update hardhat to 2.22.15 and @defi-wonderland/smock to 2.4.0
const COMPTROLLER_ADDRESS = "0xfd36e2c2a6789db23113685031d7f16329158384";
const vBNB_ADDRESS = "0xA07c5b74C9B40447a954e1466938b865b6BBea36";
const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const POLICY_FACET_ADDRESS = "0x93e7Ff7c87B496aE76fFb22d437c9d46461A9B51";
const SUPPLIER_ADDRESSES = ["0xf50453F0C5F8B46190a4833B136282b50c7343BE", "0xd14D59ddb9Cdaa0C20a9C31369bF2fc4eeAF56CB"];

const FORK_MAINNET = process.env.FORKED_NETWORK === "bscmainnet";

let timelock: SignerWithAddress;
let collateralSwapper: CollateralSwapper;
let coreComptroller: ComptrollerMock;
let unitroller: Diamond;
let vBNB: VBNB;
let vWBNB: VToken;
let wBNBSwapHelper: WBNBSwapHelper;

// ---------- deploy vWBNB ----------
export async function deployFreshVWBNB(
  timelock: SignerWithAddress,
): Promise<{ vWBNB: VToken; coreComptroller: ComptrollerMock }> {
  const VBEP20DELEGATE = "0x6E5cFf66C7b671fA1D5782866D80BD15955d79F6";
  const INTEREST_RATE_MODEL = "0x3aa125788FC6b9F801772baEa887aA40328015e9";
  const coreComptroller = ComptrollerMock__factory.connect(COMPTROLLER_ADDRESS, timelock);
  const vBep20Factory = await ethers.getContractFactory("VBep20Delegator", timelock);
  const vTokenConfig = {
    initialExchangeRateMantissa: parseUnits("1", 28),
    name: "Venus WBNB",
    symbol: "vWBNB",
    decimals: 8,
    becomeImplementationData: "0x",
  };
  const vWBNB = await vBep20Factory.deploy(
    WBNB_ADDRESS,
    COMPTROLLER_ADDRESS,
    INTEREST_RATE_MODEL,
    vTokenConfig.initialExchangeRateMantissa,
    vTokenConfig.name,
    vTokenConfig.symbol,
    vTokenConfig.decimals,
    NORMAL_TIMELOCK,
    VBEP20DELEGATE,
    vTokenConfig.becomeImplementationData,
  );
  await vWBNB.deployed();

  // List market
  await (await coreComptroller._supportMarket(vWBNB.address)).wait();

  // Set risk parameters
  await coreComptroller._setMarketSupplyCaps([vWBNB.address], [parseUnits("20000", 18)]);
  await coreComptroller._setMarketBorrowCaps([vWBNB.address], [parseUnits("0", 18)]);
  await coreComptroller._setCollateralFactor(vWBNB.address, parseUnits("0.85", 18));
  expect(await vWBNB.underlying()).equals(WBNB_ADDRESS);
  return { vWBNB, coreComptroller };
}

// ---------- Main Forked Test ----------
if (FORK_MAINNET) {
  const blockNumber = 55239594;
  forking(blockNumber, () => {
    describe("CollateralSwapper Upgrade + Swap Flow", () => {
      before(async () => {
        timelock = await initMainnetUser(NORMAL_TIMELOCK, ethers.utils.parseUnits("2"));
        unitroller = Diamond__factory.connect(COMPTROLLER_ADDRESS, timelock);
        vBNB = VBNB__factory.connect(vBNB_ADDRESS, timelock);
        ({ vWBNB, coreComptroller } = await deployFreshVWBNB(timelock));

        const CollateralSwapperFactory = await ethers.getContractFactory("CollateralSwapper");
        collateralSwapper = await upgrades.deployProxy(CollateralSwapperFactory, [], {
          constructorArgs: [COMPTROLLER_ADDRESS, vBNB_ADDRESS],
          initializer: "initialize",
          unsafeAllow: ["state-variable-immutable"],
        });
        const WBNBSwapHelperFactory = await ethers.getContractFactory("WBNBSwapHelper");
        wBNBSwapHelper = await WBNBSwapHelperFactory.deploy(WBNB_ADDRESS, collateralSwapper.address);
      });

      // ---------- VIP-1: Enable Swapping ----------
      describe("VIP-1: Enable Swapping via PolicyFacet", () => {
        it("should upgrade seize logic on unitroller", async () => {
          const PolicyFacet = await ethers.getContractFactory("PolicyFacet");
          const tempPolicyFacet = await PolicyFacet.deploy();

          const selectors = [
            PolicyFacet.interface.getSighash("seizeAllowed(address,address,address,address,uint256)"),
            PolicyFacet.interface.getSighash("seizeVerify(address,address,address,address,uint256)"),
          ];

          await unitroller.connect(timelock).diamondCut([
            {
              facetAddress: tempPolicyFacet.address,
              action: 1,
              functionSelectors: selectors,
            },
          ]);
        });

        it("should revert when user has insufficient or zero vBNB balance", async () => {
          const LOW_BALANCE_USER = "0xc20A9dc2Ef57b02D97d9A41F179686887C85c71b";
          const lowBalanceUserSigner = await initMainnetUser(LOW_BALANCE_USER, ethers.utils.parseUnits("2"));
          const vBNBBalance = await vBNB.balanceOf(LOW_BALANCE_USER);
          expect(vBNBBalance).equals(0);
          await expect(
            collateralSwapper
              .connect(lowBalanceUserSigner)
              .swapFullCollateral(LOW_BALANCE_USER, vBNB_ADDRESS, vWBNB.address, wBNBSwapHelper.address),
          ).to.be.revertedWithCustomError(collateralSwapper, "NoVTokenBalance");

          await expect(
            collateralSwapper
              .connect(lowBalanceUserSigner)
              .swapCollateralWithAmount(
                LOW_BALANCE_USER,
                vBNB_ADDRESS,
                vWBNB.address,
                ethers.utils.parseEther("0.1"),
                wBNBSwapHelper.address,
              ),
          ).to.be.revertedWithCustomError(collateralSwapper, "NoVTokenBalance");
        });

        it("should revert if user can be liquidated on swapping the collateral", async () => {
          for (const address of SUPPLIER_ADDRESSES) {
            const supplier = await initMainnetUser(address, ethers.utils.parseUnits("2"));
            await expect(
              collateralSwapper
                .connect(supplier)
                .swapFullCollateral(address, vBNB_ADDRESS, vWBNB.address, wBNBSwapHelper.address),
            ).to.be.revertedWithCustomError(collateralSwapper, "SwapCausesLiquidation");
          }
        });

        it("should partially swap vBNB to vWBNB for a user", async () => {
          const address = SUPPLIER_ADDRESSES[0];
          const supplier = await initMainnetUser(address, ethers.utils.parseUnits("2"));

          const fullBalance = await vBNB.balanceOf(address);
          const amountToSeize = fullBalance.div(10); // 10% partial

          expect(amountToSeize).to.be.gt(0);

          const beforeVBNB = await vBNB.balanceOf(address);
          const beforeVWBNB = await vWBNB.balanceOf(address);

          await collateralSwapper
            .connect(supplier)
            .swapCollateralWithAmount(address, vBNB_ADDRESS, vWBNB.address, amountToSeize, wBNBSwapHelper.address);

          const afterVBNB = await vBNB.balanceOf(address);
          const afterVWBNB = await vWBNB.balanceOf(address);

          // Assertions
          expect(afterVBNB).to.equal(beforeVBNB.sub(amountToSeize));
          expect(afterVWBNB).to.be.gt(beforeVWBNB);
        });

        it("should swap full vBNB to vWBNB for multiple suppliers", async () => {
          for (const address of SUPPLIER_ADDRESSES) {
            const supplier = await initMainnetUser(address, ethers.utils.parseUnits("2"));
            const beforeVWbnb = await vWBNB.balanceOf(address);
            // to avoid liquidations
            await coreComptroller.connect(supplier).enterMarkets([vWBNB.address]);
            await collateralSwapper
              .connect(supplier)
              .swapFullCollateral(address, vBNB_ADDRESS, vWBNB.address, wBNBSwapHelper.address);

            const afterVBnb = await vBNB.balanceOf(address);
            const afterVWbnb = await vWBNB.balanceOf(address);

            expect(afterVBnb).to.equal(0);
            expect(afterVWbnb).to.be.gt(beforeVWbnb);
          }
        });

        it("should revert if non-swapper tries to seize or wrong token is seized", async () => {
          const vUSDC_ADDRESS = "0xf508fCD89b8bd15579dc79A6827cB4686A3592c8";
          const vUSDC = VBNB__factory.connect(vUSDC_ADDRESS, timelock);

          const SUPPLIER_ADDRESS = "0xf50453F0C5F8B46190a4833B136282b50c7343BE";
          const vBNBBalance = await vUSDC.balanceOf(SUPPLIER_ADDRESS);
          const [liquidator] = await ethers.getSigners();
          expect(vBNBBalance.toNumber()).to.gt(0);

          //TODO first add check at comptroller
          // await expect(vBNB.seize(liquidator.address, address, vBNBBalance)).to.be.rejectedWith("market not listed");

          const swapper = await initMainnetUser(collateralSwapper.address, ethers.utils.parseUnits("2"));
          await expect(
            vUSDC.connect(swapper).seize(liquidator.address, SUPPLIER_ADDRESS, vBNBBalance),
          ).to.be.rejectedWith("market not listed");
        });
      });

      // ---------- VIP-2: Rollback Upgrade ----------
      describe("VIP-2: Rollback to original PolicyFacet", () => {
        it("should reassign old policy facet", async () => {
          const PolicyFacet = await ethers.getContractFactory("PolicyFacet");
          const selectors = [
            PolicyFacet.interface.getSighash("seizeAllowed(address,address,address,address,uint256)"),
            PolicyFacet.interface.getSighash("seizeVerify(address,address,address,address,uint256)"),
          ];

          await unitroller.connect(timelock).diamondCut([
            {
              facetAddress: POLICY_FACET_ADDRESS,
              action: 1,
              functionSelectors: selectors,
            },
          ]);
        });

        it("should revert on collateral swap attempt after rollback", async () => {
          const SUPPLIER_ADDRESS = "0x927d81b91c41D1961e3A7d24847b95484e60C626";
          const supplier = await initMainnetUser(SUPPLIER_ADDRESS, ethers.utils.parseUnits("2"));
          await expect(
            collateralSwapper
              .connect(supplier)
              .swapFullCollateral(SUPPLIER_ADDRESS, vBNB_ADDRESS, vWBNB.address, wBNBSwapHelper.address),
          ).to.be.rejectedWith("market not listed"); // msg.sender is expected to be a market.
        });
      });
    });
  });
}
