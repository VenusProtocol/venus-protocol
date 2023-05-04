import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { VBep20 } from "../../../typechain";
import { cutParams as params } from "../../deploy/comptroller/cut-params-mainnet.json";
import { forking, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";

const DIAMOND_CUT_FACET = "";
const DIAMOND = "";
const DIAMOND_INIT = "";
const cutParams = params;

export const vipDiamond = () => {
  const meta = {
    version: "v1",
    title: "VIP-105 Comptroller Diamond proxy",
    description: ``,
    forDescription:
      "I agree that Venus Protocol should proceed with the upgrading the Comptroller contract with diamond proxy",
    againstDescription: "I do not think that Venus Protocol should proceed with the Comptroller contract upgradation",
    abstainDescription: "I am indifferent to whether Venus Protocol proceeds with the Comptroller upgradation or not",
  };

  const initFunctionEncode = "0xe1c7392a";

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
        signature: "diamondCut((address,uint8,bytes4[])[],address,bytes)",
        params: [cutParams, DIAMOND_INIT, initFunctionEncode],
      },
    ],
    meta,
    ProposalType.REGULAR,
  );
};

forking(29043847, async () => {
  testVip("VIP-Diamond TRON Contract Migration", vipDiamond());
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
  venusBorrowerIndex,
  venusBorrowSpeeds,
  venusSupplySpeeds;

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
const zeroAddr = "0x0000000000000000000000000000000000000000";
const VBUSD = "0x95c78222B3D6e262426483D42CfA53685A67Ab9D";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";

const initMainnetUser = async (user: string) => {
  await impersonateAccount(user);
  return ethers.getSigner(user);
};

forking(29043847, async () => {
  let USDT: ethers.contract;
  let BUSD: ethers.contract;
  let usdtHolder: ethers.Signer;
  let busdHolder: ethers.Signer;
  let vBUSD: ethers.contract;
  let vUSDT: ethers.contract;
  let diamondUnitroller;

  if (process.env.FORK_MAINNET === "true") {
    before(async () => {
      /**
       *  sending gas cost to owner
       * */
      // await pretendExecutingVip(vipDiamond());

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

      diamondUnitroller = await ethers.getContractAt("Comptroller", unitroller.address);

      busdHolder = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec");
      usdtHolder = await initMainnetUser("0xc444949e0054A23c44Fc45789738bdF64aed2391");

      [vBUSD, vUSDT] = await Promise.all(
        [VBUSD, VUSDT].map((address: string) => {
          return ethers.getContractAt("contracts/Tokens/VTokens/VBep20Delegate.sol:VBep20Delegate", address);
        }),
      );
      [BUSD, USDT] = await Promise.all(
        [vBUSD, vUSDT].map(async (vToken: VBep20) => {
          const underlying = await vToken.underlying();
          return ethers.getContractAt("IERC20Upgradeable", underlying);
        }),
      );
    });

    describe("Verify Storage slots before vip execution ", async () => {
      // These tests checks the storage collision of comptroller while updating it via diamond.
      describe("Diamond deployed successfully", async () => {
        it("Owner of Diamond unitroller contract should match", async () => {
          const UnitrollerAdmin = await unitroller.admin();
          const pendingAdmin = await unitroller.pendingAdmin();
          expect(UnitrollerAdmin.toLowerCase()).to.equal(Owner.toLowerCase());
          expect(pendingAdmin.toLowerCase()).to.equal(zeroAddr);
        });

        it("Diamond Unitroller Implementation (comptroller) should match the diamond Proxy Address", async () => {
          const comptrollerImplementation = await unitroller.comptrollerImplementation();
          const pendingComptrollerImplementation = await unitroller.pendingComptrollerImplementation();
          expect(comptrollerImplementation.toLowerCase()).to.equal(
            "0xc934A1b15b30E9b515D8A87b5054432B9b965131".toLowerCase(),
          );
          expect(pendingComptrollerImplementation.toLowerCase()).to.equal(zeroAddr);
        });
      });

      describe("Verify storage layout", async () => {
        it("verify all the state before and after upgrade", async () => {
          oracle = await unitroller.oracle();

          maxAssets = await unitroller.maxAssets();

          closeFactorMantissa = await unitroller.closeFactorMantissa();

          liquidationIncentiveMantissa = await unitroller.liquidationIncentiveMantissa();

          allMarkets = await unitroller.allMarkets(0);

          venusRate = await unitroller.venusRate();

          venusSpeeds = await unitroller.venusSpeeds(BUSD.address);

          venusSupplyState = await unitroller.venusSupplyState(BUSD.address);

          venusBorrowState = await unitroller.venusBorrowState(BUSD.address);

          venusAccrued = await unitroller.venusAccrued(BUSD.address);

          vaiMintRate = await unitroller.vaiMintRate();

          vaiController = await unitroller.vaiController();

          mintedVAIs = await unitroller.mintedVAIs(busdHolder.address);
          unitroller.minte;

          mintVAIGuardianPaused = await unitroller.mintVAIGuardianPaused();

          repayVAIGuardianPaused = await unitroller.repayVAIGuardianPaused();

          protocolPaused = await unitroller.protocolPaused();

          venusVAIVaultRate = await unitroller.venusVAIVaultRate();

          vaiVaultAddress = await unitroller.vaiVaultAddress();

          releaseStartBlock = await unitroller.releaseStartBlock();

          minReleaseAmount = await unitroller.minReleaseAmount();

          treasuryGuardian = await unitroller.treasuryGuardian();

          treasuryAddress = await unitroller.treasuryAddress();

          treasuryPercent = await unitroller.treasuryPercent();

          liquidatorContract = await unitroller.liquidatorContract();

          comptrollerLens = await unitroller.comptrollerLens();

          market = await unitroller.markets(vBUSD.address);

          venusBorrowerIndex = await unitroller.venusBorrowerIndex(vBUSD.address, busdHolder.address);

          venusSupplierIndex = await unitroller.venusSupplierIndex(vBUSD.address, busdHolder.address);

          venusBorrowSpeeds = await unitroller.venusBorrowSpeeds(vUSDT.address);
          venusSupplySpeeds = await unitroller.venusSupplySpeeds(vUSDT.address);
        });
      });
    });

    testVip("VIP-Diamond TRON Contract Migration", vipDiamond());

    describe("Verify Storage slots after vip execution ", async () => {
      // These tests checks the storage collision of comptroller while updating it via diamond.
      describe("Diamond deployed successfully", async () => {
        it("Owner of Diamond unitroller contract should match", async () => {
          const diamondUnitrollerAdmin = await diamondUnitroller.admin();
          const pendingAdmin = await diamondUnitroller.pendingAdmin();
          expect(diamondUnitrollerAdmin.toLowerCase()).to.equal(Owner.toLowerCase());
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
          const oracelUpgrade = await diamondUnitroller.oracle();
          expect(oracle).to.equal(oracelUpgrade);

          const maxAssetsAfterUpgrade = await diamondUnitroller.maxAssets();
          expect(maxAssets).to.equal(maxAssetsAfterUpgrade);

          const closeFactorMantissaAfterUpgrade = await diamondUnitroller.closeFactorMantissa();
          expect(closeFactorMantissa).to.equal(closeFactorMantissaAfterUpgrade);

          const liquidationIncentiveMantissaAfterUpgrade = await diamondUnitroller.liquidationIncentiveMantissa();
          expect(liquidationIncentiveMantissa).to.equal(liquidationIncentiveMantissaAfterUpgrade);

          const allMarketsAfterUpgrade = await diamondUnitroller.allMarkets(0);
          expect(allMarkets).to.equal(allMarketsAfterUpgrade);

          const venusRateAfterUpgrade = await diamondUnitroller.venusRate();
          expect(venusRate).to.equal(venusRateAfterUpgrade);

          const venusSpeedsAfterUpgrade = await diamondUnitroller.venusSpeeds(BUSD.address);
          expect(venusSpeeds).to.equal(venusSpeedsAfterUpgrade);

          const venusSupplyStateAfterUpgrade = await diamondUnitroller.venusSupplyState(BUSD.address);
          expect(venusSupplyState.index.toString()).to.equal(venusSupplyStateAfterUpgrade.index.toString());

          const venusBorrowStateAfterUpgrade = await diamondUnitroller.venusBorrowState(BUSD.address);
          expect(venusBorrowState.index.toString()).to.equal(venusBorrowStateAfterUpgrade.index.toString());

          const venusAccruedAfterUpgrade = await diamondUnitroller.venusAccrued(BUSD.address);
          expect(venusAccrued).to.equal(venusAccruedAfterUpgrade);

          const vaiMintRateAfterUpgrade = await diamondUnitroller.vaiMintRate();
          expect(vaiMintRate).to.equal(vaiMintRateAfterUpgrade);

          const vaiControllerUpgrade = await diamondUnitroller.vaiController();
          expect(vaiControllerUpgrade).to.equal(vaiController);

          const mintedVAIsUpgrade = await diamondUnitroller.mintedVAIs(busdHolder.address);
          expect(mintedVAIsUpgrade).to.equal(mintedVAIs);

          const mintVAIGuardianPausedUpgrade = await diamondUnitroller.mintVAIGuardianPaused();
          expect(mintVAIGuardianPausedUpgrade).to.equal(mintVAIGuardianPaused);

          const repayVAIGuardianPausedUpgrade = await diamondUnitroller.repayVAIGuardianPaused();
          expect(repayVAIGuardianPausedUpgrade).to.equal(repayVAIGuardianPaused);

          const protocolPausedUpgrade = await diamondUnitroller.protocolPaused();
          expect(protocolPausedUpgrade).to.equal(protocolPaused);

          const venusVAIVaultRateUpgrade = await diamondUnitroller.venusVAIVaultRate();
          expect(venusVAIVaultRateUpgrade).to.equal(venusVAIVaultRate);

          const vaiVaultAddressUpgrade = await diamondUnitroller.vaiVaultAddress();
          expect(vaiVaultAddressUpgrade).to.equal(vaiVaultAddress);

          const releaseStartBlockUpgrade = await diamondUnitroller.releaseStartBlock();
          expect(releaseStartBlockUpgrade).to.equal(releaseStartBlock);

          const minReleaseAmountUpgrade = await diamondUnitroller.minReleaseAmount();
          expect(minReleaseAmountUpgrade).to.equal(minReleaseAmount);

          const treasuryGuardianUpgrade = await diamondUnitroller.treasuryGuardian();
          expect(treasuryGuardian).to.equal(treasuryGuardianUpgrade);

          const treasuryAddressUpgrade = await diamondUnitroller.treasuryAddress();
          expect(treasuryAddress).to.equal(treasuryAddressUpgrade);

          const treasuryPercentUpgrade = await diamondUnitroller.treasuryPercent();
          expect(treasuryPercent).to.equal(treasuryPercentUpgrade);

          const liquidatorContractUpgrade = await diamondUnitroller.liquidatorContract();
          expect(liquidatorContract).to.equal(liquidatorContractUpgrade);

          const comptrollerLensUpgrade = await diamondUnitroller.comptrollerLens();
          expect(comptrollerLens).to.equal(comptrollerLensUpgrade);

          // cheking all public mappings
          const marketUpgrade = await diamondUnitroller.markets(vBUSD.address);
          expect(market.collateralFactorMantissa).to.equal(marketUpgrade.collateralFactorMantissa);
          expect(market.isListed).to.equal(marketUpgrade.isListed);
          expect(market.isVenus).to.equal(marketUpgrade.isVenus);

          const venusBorrowerIndexUpgrade = await diamondUnitroller.venusBorrowerIndex(
            vBUSD.address,
            busdHolder.address,
          );
          expect(venusBorrowerIndex).to.equal(venusBorrowerIndexUpgrade);

          const venusSupplierIndexUpgrade = await diamondUnitroller.venusSupplierIndex(
            vBUSD.address,
            busdHolder.address,
          );
          expect(venusSupplierIndex).to.equal(venusSupplierIndexUpgrade);

          const venusBorrowSpeedsUpgrade = await diamondUnitroller.venusBorrowSpeeds(vUSDT.address);
          const venusSupplySpeedsUpgrade = await diamondUnitroller.venusSupplySpeeds(vUSDT.address);

          expect(venusBorrowSpeeds).to.equal(venusBorrowSpeedsUpgrade);
          expect(venusSupplySpeeds).to.equal(venusSupplySpeedsUpgrade);
        });
      });
    });
  }
});
