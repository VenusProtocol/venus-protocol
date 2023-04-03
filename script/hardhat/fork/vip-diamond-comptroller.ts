import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { VBep20 } from "../../../typechain";
import { deployFacets } from "../../diamond/deploy";
import { forking, pretendExecutingVip, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";

let DIAMOND_CUT_FACET;
let DIAMOND;
let DIAMOND_INIT;

const vip105 = async () => {
  const meta = {
    version: "v1",
    title: "VIP-105 Comptroller Diamond proxy",
    description: ``,
    forDescription:
      "I agree that Venus Protocol should proceed with the upgrading the Comptroller contract with diamond proxy",
    againstDescription: "I do not think that Venus Protocol should proceed with the Comptroller contract upgradation",
    abstainDescription: "I am indifferent to whether Venus Protocol proceeds with the Comptroller upgradation or not",
  };

  const { diamondCutFacet, diamond, diamondInit, cut } = await deployFacets(UNITROLLER);

  DIAMOND_CUT_FACET = diamondCutFacet.address;
  DIAMOND = diamond.address;
  DIAMOND_INIT = diamondInit.address;

  const initFunctionEncode = diamondInit.interface.encodeFunctionData("init");

  return makeProposal(
    [
      {
        target: UNITROLLER,
        signature: "_setPendingImplementation(address)",
        params: [DIAMOND],
      },
      {
        target: DIAMOND,
        signature: "_become()",
        params: [],
      },
      {
        target: UNITROLLER,
        signature: "facetCutInitilizer(address)",
        params: [DIAMOND_CUT_FACET],
      },
      {
        target: UNITROLLER,
        signature: "diamondCut(FacetCut[],address,bytes)",
        params: [cut, DIAMOND_INIT, initFunctionEncode],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(25892445, async () => {
  testVip("VIP-98 TRON Contract Migration", await vip105());
});

let owner,
  unitroller,
  // layout variables
  oracle,
  maxAssets,
  closeFactorMantissa,
  liquidationIncentiveMantissa,
  allMarkets,
  venusRate,
  venusSpeeds,
  venusSupplyState,
  venusBorrowState,
  venusAccrued,
  vaiMintRate,
  vaiController,
  mintedVAIs,
  mintVAIGuardianPaused,
  repayVAIGuardianPaused,
  protocolPaused,
  venusVAIVaultRate,
  vaiVaultAddress,
  releaseStartBlock,
  minReleaseAmount,
  treasuryGuardian,
  treasuryAddress,
  treasuryPercent,
  liquidatorContract,
  comptrollerLens,
  market,
  venusSupplierIndex,
  venusBorrowerIndex;

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
const zeroAddr = "0x0000000000000000000000000000000000000000";
const VBUSD = "0x95c78222B3D6e262426483D42CfA53685A67Ab9D";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";

const initMainnetUser = async (user: string) => {
  await impersonateAccount(user);
  return ethers.getSigner(user);
};

forking(26713742, () => {
  let USDT: ethers.contract;
  let BUSD: ethers.contract;
  let usdtHolder: ethers.Signer;
  let busdHolder: ethers.Signer;
  let vBUSD: ethers.contract;
  let vUSDT: ethers.contract;
  let diamondUnitroller;

  if (process.env.FORK_MAINNET === "true") {
    before(async () => {
      /*
       *  Forking mainnet
       * */

      /**
       *  sending gas cost to owner
       * */
      await impersonateAccount(Owner);
      owner = await ethers.getSigner(Owner);
      const [signer] = await ethers.getSigners();
      await signer.sendTransaction({
        to: owner.address,
        value: ethers.BigNumber.from("10000000000000000000"),
        data: undefined,
      });

      // unitroller without diamond
      unitroller = await ethers.getContractAt("Comptroller", UNITROLLER);

      // unitroller with diamond
      diamondUnitroller = await ethers.getContractAt("Comptroller", UNITROLLER);

      busdHolder = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec");
      usdtHolder = await initMainnetUser("0xc444949e0054A23c44Fc45789738bdF64aed2391");

      [vBUSD, vUSDT] = await Promise.all(
        [VBUSD, VUSDT].map((address: string) => {
          return ethers.getContractAt("contracts/Tokens/V0.8.13/VTokens/VBep20Delegate.sol:VBep20Delegate", address);
        }),
      );
      [BUSD, USDT] = await Promise.all(
        [vBUSD, vUSDT].map(async (vToken: VBep20) => {
          const underlying = await vToken.underlying();
          return ethers.getContractAt("IERC20Upgradeable", underlying);
        }),
      );
      await pretendExecutingVip(await vip105());
    });

    describe("Verify Storage slots", () => {
      // These tests checks the storage collision of comptroller while updating it via diamond.
      describe("Diamond deployed successfully", async () => {
        it("Owner of Diamond unitroller contract should match", async () => {
          const diamondUnitrollerAdmin = await diamondUnitroller.admin();
          const pendingAdmin = await diamondUnitroller.pendingAdmin();
          expect(diamondUnitrollerAdmin.toLowerCase()).to.equal(Owner);
          expect(pendingAdmin.toLowerCase()).to.equal(zeroAddr);
        });

        it("Diamond Unitroller Implementation (comptroller) should match the diamond Proxy Address", async () => {
          const comptrollerImplementation = await diamondUnitroller.comptrollerImplementation();
          const pendingComptrollerImplementation = await diamondUnitroller.pendingComptrollerImplementation();
          expect(comptrollerImplementation.toLowerCase()).to.equal(DIAMOND.toLowerCase());
          expect(pendingComptrollerImplementation.toLowerCase()).to.equal(zeroAddr);
        });
      });

      describe("Verify storage layout", async () => {
        it("verify all the state before and after upgrade", async () => {
          oracle = await unitroller.oracle();
          const oracelUpgrade = await diamondUnitroller.oracle();
          expect(oracle).to.equal(oracelUpgrade);

          maxAssets = await unitroller.maxAssets();
          const maxAssetsAfterUpgrade = await diamondUnitroller.maxAssets();
          expect(maxAssets).to.equal(maxAssetsAfterUpgrade);

          closeFactorMantissa = await unitroller.closeFactorMantissa();
          const closeFactorMantissaAfterUpgrade = await diamondUnitroller.closeFactorMantissa();
          expect(closeFactorMantissa).to.equal(closeFactorMantissaAfterUpgrade);

          liquidationIncentiveMantissa = await unitroller.liquidationIncentiveMantissa();
          const liquidationIncentiveMantissaAfterUpgrade = await diamondUnitroller.liquidationIncentiveMantissa();
          expect(liquidationIncentiveMantissa).to.equal(liquidationIncentiveMantissaAfterUpgrade);

          allMarkets = await unitroller.allMarkets(0);
          const allMarketsAfterUpgrade = await diamondUnitroller.allMarkets(0);
          expect(allMarkets).to.equal(allMarketsAfterUpgrade);

          venusRate = await unitroller.venusRate();
          const venusRateAfterUpgrade = await diamondUnitroller.venusRate();
          expect(venusRate).to.equal(venusRateAfterUpgrade);

          venusSpeeds = await unitroller.venusSpeeds(BUSD.address);
          const venusSpeedsAfterUpgrade = await diamondUnitroller.venusSpeeds(BUSD.address);
          expect(venusSpeeds).to.equal(venusSpeedsAfterUpgrade);

          venusSupplyState = await unitroller.venusSupplyState(BUSD.address);
          const venusSupplyStateAfterUpgrade = await diamondUnitroller.venusSupplyState(BUSD.address);
          expect(venusSupplyState.index.toString()).to.equal(venusSupplyStateAfterUpgrade.index.toString());

          venusBorrowState = await unitroller.venusBorrowState(BUSD.address);
          const venusBorrowStateAfterUpgrade = await diamondUnitroller.venusBorrowState(BUSD.address);
          expect(venusBorrowState.index.toString()).to.equal(venusBorrowStateAfterUpgrade.index.toString());

          venusAccrued = await unitroller.venusAccrued(BUSD.address);
          const venusAccruedAfterUpgrade = await diamondUnitroller.venusAccrued(BUSD.address);
          expect(venusAccrued).to.equal(venusAccruedAfterUpgrade);

          vaiMintRate = await unitroller.vaiMintRate();
          const vaiMintRateAfterUpgrade = await diamondUnitroller.vaiMintRate();
          expect(vaiMintRate).to.equal(vaiMintRateAfterUpgrade);

          vaiController = await unitroller.vaiController();
          const vaiControllerUpgrade = await diamondUnitroller.vaiController();
          expect(vaiControllerUpgrade).to.equal(vaiController);

          mintedVAIs = await unitroller.mintedVAIs(busdHolder.address);
          unitroller.minte;
          const mintedVAIsUpgrade = await diamondUnitroller.mintedVAIs(busdHolder.address);
          expect(mintedVAIsUpgrade).to.equal(mintedVAIs);

          mintVAIGuardianPaused = await unitroller.mintVAIGuardianPaused();
          const mintVAIGuardianPausedUpgrade = await diamondUnitroller.mintVAIGuardianPaused();
          expect(mintVAIGuardianPausedUpgrade).to.equal(mintVAIGuardianPaused);

          repayVAIGuardianPaused = await unitroller.repayVAIGuardianPaused();
          const repayVAIGuardianPausedUpgrade = await diamondUnitroller.repayVAIGuardianPaused();
          expect(repayVAIGuardianPausedUpgrade).to.equal(repayVAIGuardianPaused);

          protocolPaused = await unitroller.protocolPaused();
          const protocolPausedUpgrade = await diamondUnitroller.protocolPaused();
          expect(protocolPausedUpgrade).to.equal(protocolPaused);

          venusVAIVaultRate = await unitroller.venusVAIVaultRate();
          const venusVAIVaultRateUpgrade = await diamondUnitroller.venusVAIVaultRate();
          expect(venusVAIVaultRateUpgrade).to.equal(venusVAIVaultRate);

          vaiVaultAddress = await unitroller.vaiVaultAddress();
          const vaiVaultAddressUpgrade = await diamondUnitroller.vaiVaultAddress();
          expect(vaiVaultAddressUpgrade).to.equal(vaiVaultAddress);

          releaseStartBlock = await unitroller.releaseStartBlock();
          const releaseStartBlockUpgrade = await diamondUnitroller.releaseStartBlock();
          expect(releaseStartBlockUpgrade).to.equal(releaseStartBlock);

          minReleaseAmount = await unitroller.minReleaseAmount();
          const minReleaseAmountUpgrade = await diamondUnitroller.minReleaseAmount();
          expect(minReleaseAmountUpgrade).to.equal(minReleaseAmount);

          treasuryGuardian = await unitroller.treasuryGuardian();
          const treasuryGuardianUpgrade = await diamondUnitroller.treasuryGuardian();
          expect(treasuryGuardian).to.equal(treasuryGuardianUpgrade);

          treasuryAddress = await unitroller.treasuryAddress();
          const treasuryAddressUpgrade = await diamondUnitroller.treasuryAddress();
          expect(treasuryAddress).to.equal(treasuryAddressUpgrade);

          treasuryPercent = await unitroller.treasuryPercent();
          const treasuryPercentUpgrade = await diamondUnitroller.treasuryPercent();
          expect(treasuryPercent).to.equal(treasuryPercentUpgrade);

          liquidatorContract = await unitroller.liquidatorContract();
          const liquidatorContractUpgrade = await diamondUnitroller.liquidatorContract();
          expect(liquidatorContract).to.equal(liquidatorContractUpgrade);

          comptrollerLens = await unitroller.comptrollerLens();
          const comptrollerLensUpgrade = await diamondUnitroller.comptrollerLens();
          expect(comptrollerLens).to.equal(comptrollerLensUpgrade);

          // cheking all public mappings
          market = await unitroller.markets(vBUSD.address);
          const marketUpgrade = await diamondUnitroller.markets(vBUSD.address);
          expect(market.collateralFactorMantissa).to.equal(marketUpgrade.collateralFactorMantissa);
          expect(market.isListed).to.equal(marketUpgrade.isListed);
          expect(market.isVenus).to.equal(marketUpgrade.isVenus);

          venusBorrowerIndex = await unitroller.venusBorrowerIndex(vBUSD.address, busdHolder.address);
          const venusBorrowerIndexUpgrade = await diamondUnitroller.venusBorrowerIndex(
            vBUSD.address,
            busdHolder.address,
          );
          expect(venusBorrowerIndex).to.equal(venusBorrowerIndexUpgrade);

          venusSupplierIndex = await unitroller.venusSupplierIndex(vBUSD.address, busdHolder.address);
          const venusSupplierIndexUpgrade = await diamondUnitroller.venusSupplierIndex(
            vBUSD.address,
            busdHolder.address,
          );
          expect(venusSupplierIndex).to.equal(venusSupplierIndexUpgrade);

          const venusBorrowSpeeds = await unitroller.venusBorrowSpeeds(vUSDT.address);
          const venusBorrowSpeedsUpgrade = await diamondUnitroller.venusBorrowSpeeds(vUSDT.address);
          const venusSupplySpeeds = await unitroller.venusSupplySpeeds(vUSDT.address);
          const venusSupplySpeedsUpgrade = await diamondUnitroller.venusSupplySpeeds(vUSDT.address);

          expect(venusBorrowSpeeds).to.equal(venusBorrowSpeedsUpgrade);
          expect(venusSupplySpeeds).to.equal(venusSupplySpeedsUpgrade);
        });
      });
    });

    describe("Verify states of diamond Contract", () => {
      describe("Diamond setters", () => {
        it("setting market supply cap", async () => {
          const currentSupplyCap = (await diamondUnitroller.supplyCaps(vBUSD.address)).toString();
          await diamondUnitroller.connect(owner)._setMarketSupplyCaps([vBUSD.address], [parseUnits("100000", 18)]);
          expect(await diamondUnitroller.supplyCaps(vBUSD.address)).to.equals(parseUnits("100000", 18));
          await diamondUnitroller
            .connect(owner)
            ._setMarketSupplyCaps([vBUSD.address], [parseUnits(currentSupplyCap, 0)]);
          expect(await diamondUnitroller.supplyCaps(vBUSD.address)).to.equals(parseUnits(currentSupplyCap, 0));
        });

        it("setting close factor", async () => {
          const currentCloseFactor = (await diamondUnitroller.closeFactorMantissa()).toString();
          await diamondUnitroller.connect(owner)._setCloseFactor(parseUnits("10000", 18));
          expect(await diamondUnitroller.closeFactorMantissa()).to.equals(parseUnits("10000", 18));
          await diamondUnitroller.connect(owner)._setCloseFactor(parseUnits(currentCloseFactor, 0));
          expect(await diamondUnitroller.closeFactorMantissa()).to.equals(parseUnits(currentCloseFactor, 0));
        });

        it("setting collateral factor", async () => {
          await diamondUnitroller.connect(owner)._setCollateralFactor(vUSDT.address, 2);
          market = await diamondUnitroller.markets(vUSDT.address);
          expect(market.collateralFactorMantissa).to.equal(2);

          await diamondUnitroller.connect(owner)._setCollateralFactor(vUSDT.address, parseUnits("8", 17));
          market = await diamondUnitroller.markets(vUSDT.address);
          expect(market.collateralFactorMantissa).to.equal(parseUnits("8", 17));
        });

        it("setting setting Liquidation Incentive", async () => {
          await diamondUnitroller.connect(owner)._setLiquidationIncentive(parseUnits("13", 17));
          expect(await diamondUnitroller.liquidationIncentiveMantissa()).to.equal(parseUnits("13", 17));

          await diamondUnitroller.connect(owner)._setLiquidationIncentive(parseUnits("11", 17));
          expect(await diamondUnitroller.liquidationIncentiveMantissa()).to.equal(parseUnits("11", 17));
        });

        it("setting Pause Guardian", async () => {
          const currentPauseGuardia = (await diamondUnitroller.pauseGuardian()).toString();

          await diamondUnitroller.connect(owner)._setPauseGuardian(owner.address);
          expect(await diamondUnitroller.pauseGuardian()).to.equal(owner.address);

          await diamondUnitroller.connect(owner)._setPauseGuardian(currentPauseGuardia);
          expect(await diamondUnitroller.pauseGuardian()).to.equal(currentPauseGuardia);
        });

        it("setting market borrow cap", async () => {
          const currentBorrowCap = (await diamondUnitroller.borrowCaps(vUSDT.address)).toString();
          await diamondUnitroller.connect(owner)._setMarketBorrowCaps([vUSDT.address], [parseUnits("10000", 18)]);
          expect(await diamondUnitroller.borrowCaps(vUSDT.address)).to.equal(parseUnits("10000", 18));

          await diamondUnitroller.connect(owner)._setMarketBorrowCaps([vUSDT.address], [currentBorrowCap]);
          expect(await diamondUnitroller.borrowCaps(vUSDT.address)).to.equal(currentBorrowCap);
        });

        it("pausing mint action in vUSDT", async () => {
          expect(await diamondUnitroller.connect(owner)._setActionsPaused([vBUSD.address], [0], true)).to.emit(
            vBUSD,
            "ActionPausedMarket",
          );

          await expect(vBUSD.connect(usdtHolder).mint(1000)).to.be.revertedWith("action is paused");

          expect(await diamondUnitroller.connect(owner)._setActionsPaused([vBUSD.address], [0], false)).to.emit(
            vBUSD,
            "ActionPausedMarket",
          );
          expect(await vBUSD.connect(busdHolder).mint(10)).to.be.emit(vBUSD, "Mint");
        });
      });

      describe("Diamond Hooks", () => {
        it("mint vToken vBUSD", async () => {
          const vBUSDBalance = await BUSD.balanceOf(vBUSD.address);
          const busdHolerBalance = await BUSD.balanceOf(busdHolder.address);
          expect(await vBUSD.connect(busdHolder).mint(1000)).to.emit(vBUSD, "Mint");

          const newvBUSDBalance = await BUSD.balanceOf(vBUSD.address);
          const newBusdHolerBalance = await BUSD.balanceOf(busdHolder.address);
          expect(newvBUSDBalance.toString()).to.equal(vBUSDBalance.add(1000));
          expect(newBusdHolerBalance.toString()).to.equal(busdHolerBalance.sub(1000));
        });

        it("redeem vToken", async () => {
          const vBUSDBalance = (await BUSD.balanceOf(vBUSD.address)).toString();
          const busdHolderBalance = await vBUSD.balanceOf(busdHolder.address);
          expect(await vBUSD.connect(busdHolder).redeem(1000)).to.emit(vBUSD, "Redeem");

          const newVBUSDBalance = (await BUSD.balanceOf(vBUSD.address)).toString();
          const newBusdHolerBalance = (await vBUSD.balanceOf(busdHolder.address)).toString();
          expect(Number(vBUSDBalance)).greaterThan(Number(newVBUSDBalance));
          expect(newBusdHolerBalance).to.equal(busdHolderBalance.sub(1000));

          const vUSDTBalance = (await USDT.balanceOf(vUSDT.address)).toString();
          const usdtHolderBalance = await vUSDT.balanceOf(usdtHolder.address);
          expect(await vUSDT.connect(usdtHolder).redeem(1000)).to.emit(vUSDT, "Redeem");
          const newVUSDTBalance = (await USDT.balanceOf(vUSDT.address)).toString();
          const newUsdtHolerBalance = (await vUSDT.balanceOf(usdtHolder.address)).toString();
          expect(Number(vUSDTBalance)).greaterThan(Number(newVUSDTBalance));
          expect(newUsdtHolerBalance).to.equal(usdtHolderBalance.sub(1000));
        });

        it("borrow vToken", async () => {
          const busdUserBal = await BUSD.balanceOf(busdHolder.address);
          expect(await vBUSD.connect(busdHolder).borrow(1000)).to.emit(vBUSD, "Borrow");
          expect((await BUSD.balanceOf(busdHolder.address)).toString()).to.equal(busdUserBal.add(1000));

          const usdtUserBal = await BUSD.balanceOf(usdtHolder.address);
          expect(await vBUSD.connect(usdtHolder).borrow(1000)).to.emit(vBUSD, "Borrow");
          expect((await BUSD.balanceOf(usdtHolder.address)).toString()).to.equal(usdtUserBal.add(1000));
        });

        it("Repay vToken", async () => {
          const busdUserBal = await BUSD.balanceOf(busdHolder.address);
          expect(await vBUSD.connect(busdHolder).borrow(1000)).to.emit(vBUSD, "Borrow");
          expect((await BUSD.balanceOf(busdHolder.address)).toString()).to.equal(busdUserBal.add(1000));

          expect(await vBUSD.connect(busdHolder).repayBorrow(1000)).to.emit(vBUSD, "RepayBorrow");
          expect((await BUSD.balanceOf(busdHolder.address)).toString()).to.equal(busdUserBal);
        });
      });
    });
  }
});
