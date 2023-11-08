import { smock } from "@defi-wonderland/smock";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { IAccessControlManagerV5__factory, VBep20 } from "../../../typechain";
import { deployDiamond } from "../Comptroller/Diamond/scripts/deploy";
import { initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const zeroAddr = "0x0000000000000000000000000000000000000000";
const VBUSD = "0x95c78222B3D6e262426483D42CfA53685A67Ab9D";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";

let owner,
  unitroller,
  diamondProxy,
  // layout variables
  oracle,
  maxAssets,
  closeFactorMantissa,
  liquidationIncentiveMantissa,
  allMarkets,
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
  accessControlManager;

export async function setForkBlock(blockNumber: number) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.BSC_ARCHIVE_NODE_URL,
          blockNumber: blockNumber,
        },
      },
    ],
  });
}

const forking = (blockNumber: number, fn: () => void) => {
  describe(`Diamond architecture check At block #${blockNumber}`, () => {
    before(async () => {
      await setForkBlock(blockNumber);
    });
    fn();
  });
};

forking(31873700, () => {
  let USDT: ethers.contract;
  let BUSD: ethers.contract;
  let usdtHolder: ethers.Signer;
  let busdHolder: ethers.Signer;
  let vBUSD: ethers.contract;
  let vUSDT: ethers.contract;
  let ownerSigner: SignerWithAddress; //eslint-disable-line
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
      unitroller = await ethers.getContractAt("ComptrollerMock", UNITROLLER);

      // deploy Diamond
      const result = await deployDiamond(UNITROLLER);
      diamondUnitroller = result.unitroller;
      diamondProxy = result.diamond;

      // unitroller with diamond
      diamondUnitroller = await ethers.getContractAt("ComptrollerMock", diamondUnitroller.address);

      busdHolder = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec", parseUnits("1000", 18));
      usdtHolder = await initMainnetUser("0x3e8734Ec146C981E3eD1f6b582D447DDE701d90c", parseUnits("1000", 18));
      ownerSigner = await initMainnetUser(Owner, parseUnits("1000", 18));
      accessControlManager = IAccessControlManagerV5__factory.connect(ACM, owner);

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
          expect(comptrollerImplementation.toLowerCase()).to.equal(diamondProxy.address.toLowerCase());
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
          await diamondUnitroller.connect(owner)._setCloseFactor(parseUnits("8", 17));
          expect(await diamondUnitroller.closeFactorMantissa()).to.equals(parseUnits("8", 17));
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
          const tx = await accessControlManager
            .connect(owner)
            .giveCallPermission(diamondUnitroller.address, "_setActionsPaused(address[],uint8[],bool)", Owner);
          await tx.wait();

          await expect(diamondUnitroller.connect(owner)._setActionsPaused([vUSDT.address], [0], true)).to.emit(
            diamondUnitroller,
            "ActionPausedMarket",
          );

          await expect(vUSDT.connect(usdtHolder).mint(1000)).to.be.revertedWith("action is paused");

          await expect(diamondUnitroller.connect(owner)._setActionsPaused([vUSDT.address], [0], false)).to.emit(
            diamondUnitroller,
            "ActionPausedMarket",
          );
          await expect(vUSDT.connect(busdHolder).mint(10)).to.be.emit(vUSDT, "Transfer");
        });

        it("sets forced liquidation", async () => {
          const tx = await accessControlManager
            .connect(owner)
            .giveCallPermission(diamondUnitroller.address, "_setForcedLiquidation(address,bool)", Owner);
          await tx.wait();

          await diamondUnitroller.connect(owner)._setForcedLiquidation(vUSDT.address, true);
          expect(await diamondUnitroller.isForcedLiquidationEnabled(vUSDT.address)).to.be.true;

          await diamondUnitroller.connect(owner)._setForcedLiquidation(vUSDT.address, false);
          expect(await diamondUnitroller.isForcedLiquidationEnabled(vUSDT.address)).to.be.false;
        });
      });

      describe("Diamond Hooks", () => {
        it("mint vToken vUSDT", async () => {
          const vBUSDBalance = await USDT.balanceOf(vUSDT.address);
          const busdHolerBalance = await USDT.balanceOf(await usdtHolder.getAddress());

          await USDT.connect(usdtHolder).approve(vUSDT.address, parseUnits("2", 18));
          await expect(await vUSDT.connect(usdtHolder).mint(parseUnits("2", 18))).to.emit(vUSDT, "Transfer");

          const newvBUSDBalance = await USDT.balanceOf(vUSDT.address);
          const newBusdHolerBalance = await USDT.balanceOf(await usdtHolder.getAddress());

          expect(newvBUSDBalance).greaterThan(vBUSDBalance);
          expect(newBusdHolerBalance).lessThan(busdHolerBalance);
        });

        it("redeem vToken", async () => {
          await USDT.connect(usdtHolder).approve(vUSDT.address, 2000);
          // await expect(vUSDT.connect(usdtHolder).mint(2000)).to.emit(vUSDT, "Mint");

          const vUSDTUserBal = await vUSDT.connect(usdtHolder).balanceOf(await usdtHolder.getAddress());
          await expect(await vUSDT.connect(usdtHolder).redeem(2000)).to.emit(vUSDT, "Transfer");
          const newVUSDTUserBal = await vUSDT.connect(usdtHolder).balanceOf(await usdtHolder.getAddress());

          expect(newVUSDTUserBal).to.equal(vUSDTUserBal.sub(2000));
        });

        it("borrow vToken", async () => {
          const busdUserBal = await USDT.balanceOf(await usdtHolder.getAddress());

          await expect(vUSDT.connect(usdtHolder).borrow(1000)).to.emit(vUSDT, "Borrow");

          expect((await USDT.balanceOf(await usdtHolder.getAddress())).toString()).to.equal(busdUserBal.add(1000));
        });

        it("Repay vToken", async () => {
          await USDT.connect(usdtHolder).approve(vUSDT.address, 2000);

          const busdUserBal = await USDT.balanceOf(await usdtHolder.getAddress());
          await vUSDT.connect(usdtHolder).borrow(1000);

          expect((await USDT.balanceOf(await usdtHolder.getAddress())).toString()).to.greaterThan(busdUserBal);

          await vUSDT.connect(usdtHolder).repayBorrow(1000);

          const balanceAfterRepay = await USDT.balanceOf(await usdtHolder.getAddress());
          expect(balanceAfterRepay).to.equal(busdUserBal);
        });
      });
    });
  }
});
