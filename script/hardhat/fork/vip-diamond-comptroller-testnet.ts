import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { VBep20 } from "../../../typechain";
import { cutParams as params } from "../../deploy/comptroller/cut-params.json";
import { forking, pretendExecutingVip, testVip } from "./vip-framework";
import { ProposalType } from "./vip-framework/types";
import { makeProposal } from "./vip-framework/utils";

const UNITROLLER = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const DIAMOND_CUT_FACET = "0x69Ca940186C29b6a9D64e1Be1C59fb7A466354E2";
const DIAMOND = "0xF6A9DBc8453EB8b1528B6Cd3f08eC632134f831F";
const DIAMOND_INIT = "0x6D7f7Ed4EbD3A1807d5fe8EE70c155bcAc8174Af";
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

const Owner = "0xce10739590001705F7FF231611ba4A48B2820327";
const zeroAddr = "0x0000000000000000000000000000000000000000";
const VBUSD = "0x08e0A5575De71037aE36AbfAfb516595fE68e5e4";
const VUSDT = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";

const initMainnetUser = async (user: string) => {
  await impersonateAccount(user);
  return ethers.getSigner(user);
};

forking(29043847, async () => {
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

  let USDT: ethers.contract;
  let BUSD: ethers.contract;
  let usdtHolder: ethers.Signer;
  let busdHolder: ethers.Signer;
  let vBUSD: ethers.contract;
  let vUSDT: ethers.contract;
  let diamondUnitroller;

  before(async () => {
    unitroller = await ethers.getContractAt("Comptroller", UNITROLLER);

    diamondUnitroller = await ethers.getContractAt("Comptroller", unitroller.address);

    await impersonateAccount(Owner);
    owner = await ethers.getSigner(Owner);
    const [signer] = await ethers.getSigners();
    await signer.sendTransaction({
      to: owner.address,
      value: ethers.BigNumber.from("10000000000000000000"),
      data: undefined,
    });

    busdHolder = await initMainnetUser("0xC825AD791A6046991e3706b6342970f6d87e4888");

    usdtHolder = await initMainnetUser("0xa0747a72C329377C2CE4F0F3165197B3a5359EfE");

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
  });

  describe("Verify Storage slots before vip execution", async () => {
    // These tests checks the storage collision of comptroller while updating it via diamond.
    describe("Diamond deployed successfully before vip execution", async () => {
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

    describe("Verify storage layout before vip execution", async () => {
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

        // cheking all public mappings
        market = await unitroller.markets(vBUSD.address);

        venusBorrowerIndex = await unitroller.venusBorrowerIndex(vBUSD.address, busdHolder.address);

        venusSupplierIndex = await unitroller.venusSupplierIndex(vBUSD.address, busdHolder.address);

        venusBorrowSpeeds = await unitroller.venusBorrowSpeeds(vUSDT.address);
        venusSupplySpeeds = await unitroller.venusSupplySpeeds(vUSDT.address);
      });
    });
  });

  testVip("VIP-Diamond TRON Contract Migration", vipDiamond());

  describe("Verify Storage slots after VIP execution", async () => {
    // These tests checks the storage collision of comptroller while updating it via diamond.
    describe("Diamond deployed successfully after VIP execution", async () => {
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

    describe("Verify storage layout after VIP execution", async () => {
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

        const venusBorrowerIndexUpgrade = await diamondUnitroller.venusBorrowerIndex(vBUSD.address, busdHolder.address);
        expect(venusBorrowerIndex).to.equal(venusBorrowerIndexUpgrade);

        const venusSupplierIndexUpgrade = await diamondUnitroller.venusSupplierIndex(vBUSD.address, busdHolder.address);
        expect(venusSupplierIndex).to.equal(venusSupplierIndexUpgrade);

        const venusBorrowSpeedsUpgrade = await diamondUnitroller.venusBorrowSpeeds(vUSDT.address);
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
        await diamondUnitroller.connect(owner)._setMarketSupplyCaps([vBUSD.address], [parseUnits(currentSupplyCap, 0)]);
        expect(await diamondUnitroller.supplyCaps(vBUSD.address)).to.equals(parseUnits(currentSupplyCap, 0));
      });

      it("setting close factor", async () => {
        const currentCloseFactor = (await diamondUnitroller.closeFactorMantissa()).toString();
        await diamondUnitroller.connect(owner)._setCloseFactor(parseUnits("10000", 18));
        expect(await diamondUnitroller.closeFactorMantissa()).to.equals(parseUnits("10000", 18));
        await diamondUnitroller.connect(owner)._setCloseFactor(parseUnits(currentCloseFactor, 0));
        expect(await diamondUnitroller.closeFactorMantissa()).to.equals(parseUnits(currentCloseFactor, 0));
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
        await BUSD.connect(busdHolder).approve(vBUSD.address, 1200);
        await expect(vBUSD.connect(usdtHolder).mint(1000)).to.be.revertedWith("action is paused");

        expect(await diamondUnitroller.connect(owner)._setActionsPaused([vBUSD.address], [0], false)).to.emit(
          vBUSD,
          "ActionPausedMarket",
        );
        expect(await vBUSD.connect(busdHolder).mint(10)).to.be.emit(vBUSD, "Mint");
      });
    });
  });
});

forking(29043847, async () => {
  let owner, unitroller;
  let USDT: ethers.contract;
  let BUSD: ethers.contract;
  let usdtHolder: ethers.Signer;
  let busdHolder: ethers.Signer;
  let vBUSD: ethers.contract;
  let vUSDT: ethers.contract;
  let diamondUnitroller;

  before(async () => {
    pretendExecutingVip(vipDiamond());
    unitroller = await ethers.getContractAt("Comptroller", UNITROLLER);

    diamondUnitroller = await ethers.getContractAt("Comptroller", unitroller.address);

    await impersonateAccount(Owner);
    owner = await ethers.getSigner(Owner);
    const [signer] = await ethers.getSigners();
    await signer.sendTransaction({
      to: owner.address,
      value: ethers.BigNumber.from("10000000000000000000"),
      data: undefined,
    });

    busdHolder = await initMainnetUser("0xC825AD791A6046991e3706b6342970f6d87e4888");

    usdtHolder = await initMainnetUser("0xa0747a72C329377C2CE4F0F3165197B3a5359EfE");

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
  });

  describe("Diamond Hooks", () => {
    it("Diamond Unitroller Implementation (comptroller) should match the diamond Proxy Address", async () => {
      const comptrollerImplementation = await diamondUnitroller.comptrollerImplementation();
      const pendingComptrollerImplementation = await diamondUnitroller.pendingComptrollerImplementation();
      expect(comptrollerImplementation.toLowerCase()).to.equal(DIAMOND.toLowerCase());
      expect(pendingComptrollerImplementation.toLowerCase()).to.equal(zeroAddr);
    });
    it("mint vToken vBUSD", async () => {
      const vBUSDBalance = await BUSD.balanceOf(vBUSD.address);
      const busdHolerBalance = await BUSD.balanceOf(busdHolder.address);

      await BUSD.connect(busdHolder).approve(vBUSD.address, parseUnits("1100", 18));
      expect(await vBUSD.connect(busdHolder).mint(parseUnits("1000", 18))).to.emit(vBUSD, "Mint");

      const newvBUSDBalance = await BUSD.balanceOf(vBUSD.address);
      const newBusdHolerBalance = await BUSD.balanceOf(busdHolder.address);

      expect(newvBUSDBalance).greaterThan(vBUSDBalance);
      expect(newBusdHolerBalance).lessThan(busdHolerBalance);
    });

    it("redeem vToken", async () => {
      const vBUSDUserBal = await vBUSD.connect(busdHolder).balanceOf(busdHolder.address);
      const BUSDBal = await BUSD.connect(busdHolder).balanceOf(busdHolder.address);

      expect(await vBUSD.connect(busdHolder).redeem(1000)).to.emit(vBUSD, "Redeem");

      const newBUSDBal = await BUSD.connect(busdHolder).balanceOf(busdHolder.address);
      const newBUSDUserBal = await vBUSD.connect(busdHolder).balanceOf(busdHolder.address);

      expect(newBUSDUserBal).to.equal(vBUSDUserBal.sub(1000));
      expect(newBUSDBal).greaterThan(BUSDBal);
    });

    it("borrow vToken", async () => {
      const busdUserBal = await BUSD.balanceOf(busdHolder.address);

      expect(await vBUSD.connect(busdHolder).borrow(1000)).to.emit(vBUSD, "Borrow");

      expect((await BUSD.balanceOf(busdHolder.address)).toString()).to.equal(busdUserBal.add(1000));
    });

    it("Repay vToken", async () => {
      const busdUserBal = await BUSD.balanceOf(busdHolder.address);

      expect(await vBUSD.connect(busdHolder).borrow(1000)).to.emit(vBUSD, "Borrow");

      expect((await BUSD.balanceOf(busdHolder.address)).toString()).to.equal(busdUserBal.add(1000));

      expect(await vBUSD.connect(busdHolder).repayBorrow(1000)).to.emit(vBUSD, "RepayBorrow");

      const balanceAfterRepay = await BUSD.balanceOf(busdHolder.address);
      expect(balanceAfterRepay).to.equal(busdUserBal);
    });
  });
});
