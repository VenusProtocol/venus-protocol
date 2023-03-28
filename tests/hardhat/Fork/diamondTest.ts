import { smock } from "@defi-wonderland/smock";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { IERC20Upgradeable, VBep20 } from "../../../typechain";

const { deployDiamond } = require("../../../script/diamond/deploy");

const { expect } = chai;
chai.use(smock.matchers);

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const zeroAddr = "0x0000000000000000000000000000000000000000";
const VBUSD = "0x95c78222B3D6e262426483D42CfA53685A67Ab9D";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";

let owner,
  unitroller,
  diamondProxy,
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
  venusBorrowerIndex

const initMainnetUser = async (user: string) => {
  await impersonateAccount(user);
  return ethers.getSigner(user);
};

export async function setForkBlock(blockNumber: number) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.BSC_ARCHIVE_NODE,
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

forking(26713742, () => {
  let USDT: IERC20Upgradeable;
  let BUSD: IERC20Upgradeable;
  let usdtHolder: any;
  let busdHolder: any;
  let vBUSD: any;
  let vUSDT: any;
  let admin: SignerWithAddress;
  let diamondUnitroller;

  if (process.env.FORK_MAINNET === "true") {
    before(async () => {
      /*
       *  Forking mainnet
       * */

      /**
       *  sending gas cost to owner
       * */
      impersonateAccount(Owner);
      owner = await ethers.getSigner(Owner);
      const [signer] = await ethers.getSigners();
      await signer.sendTransaction({
        to: owner.address,
        value: ethers.BigNumber.from("10000000000000000000"),
        data: undefined,
      });

      // unitroller without diamond
      unitroller = await ethers.getContractAt("Comptroller", UNITROLLER);

      // deploy Diamond
      const result = await deployDiamond(UNITROLLER);
      diamondUnitroller = result.unitroller;
      diamondProxy = result.diamond;

      // unitroller with diamond
      diamondUnitroller = await ethers.getContractAt("Comptroller", diamondUnitroller.address);

      busdHolder = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec");
      usdtHolder = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec");

      [vBUSD, vUSDT] = await Promise.all(
        [VBUSD, VUSDT].map((address: string) => {
          return ethers.getContractAt("VBep20Delegate", address);
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

          maxAssets = await unitroller.maxAssets();
          const maxAssetsAfterUpgrade = await diamondUnitroller.maxAssets();
          expect(maxAssets).to.equal(maxAssetsAfterUpgrade);

          // oracle = await unitroller.oracle();
          // const oracelUpgrade = await diamondUnitroller.oracel();
          // expect(oracle).to.equal(oracelUpgrade);

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
          expect(vaiControllerUpgrade).to.equal(vaiController)

          mintedVAIs = await unitroller.mintedVAIs(busdHolder.address);
          unitroller.minte
          const mintedVAIsUpgrade = await diamondUnitroller.mintedVAIs(usdtHolder.address);
          expect(mintedVAIsUpgrade).to.equal(mintedVAIs)

          mintVAIGuardianPaused = await unitroller.mintVAIGuardianPaused();
          const mintVAIGuardianPausedUpgrade = (await diamondUnitroller. mintVAIGuardianPaused());
          expect(mintVAIGuardianPausedUpgrade).to.equal(mintVAIGuardianPaused)

          repayVAIGuardianPaused = await unitroller.repayVAIGuardianPaused();
          const repayVAIGuardianPausedUpgrade = (await diamondUnitroller.repayVAIGuardianPaused());
          expect(repayVAIGuardianPausedUpgrade).to.equal(repayVAIGuardianPaused)

          protocolPaused = await unitroller.protocolPaused();
          const protocolPausedUpgrade = await diamondUnitroller.protocolPaused();
          expect(protocolPausedUpgrade).to.equal(protocolPaused)

          venusVAIVaultRate = await unitroller.venusVAIVaultRate();
          const venusVAIVaultRateUpgrade = await diamondUnitroller.venusVAIVaultRate();
          expect(venusVAIVaultRateUpgrade).to.equal(venusVAIVaultRate)

          vaiVaultAddress = await unitroller.vaiVaultAddress();
          const vaiVaultAddressUpgrade = await diamondUnitroller.vaiVaultAddress();
          expect(vaiVaultAddressUpgrade).to.equal(vaiVaultAddress)

          releaseStartBlock = await unitroller.releaseStartBlock();
          const releaseStartBlockUpgrade = await diamondUnitroller.releaseStartBlock();
          expect(releaseStartBlockUpgrade).to.equal(releaseStartBlock)

          minReleaseAmount = await unitroller.minReleaseAmount();
          const minReleaseAmountUpgrade = await diamondUnitroller.minReleaseAmount();
          expect(minReleaseAmountUpgrade).to.equal(minReleaseAmount)

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
          expect(liquidatorContract).to.equal(liquidatorContractUpgrade)    
      
          comptrollerLens = await unitroller.comptrollerLens();
          const comptrollerLensUpgrade = await diamondUnitroller.comptrollerLens();
          expect(comptrollerLens).to.equal(comptrollerLensUpgrade)

          // cheking all public mapingns 
          market = await unitroller.markets(vBUSD.address);
          const marketUpgrade = await diamondUnitroller.markets(vBUSD.address);
          expect(market.collateralFactorMantissa).to.equal(marketUpgrade.collateralFactorMantissa);
          expect(market.isListed).to.equal(marketUpgrade.isListed);
          expect(market.isVenus).to.equal(marketUpgrade.isVenus);

          // venusBorrowerIndex = await unitroller.venusBorrowerIndex(vBUSD.address,zeroAddr);
          // console.log(venusBorrowerIndex,"----- venusBorrowerIndex");

          // venusSupplierIndex = await unitroller.venusSupplierIndex(vBUSD.address,zeroAddr);
          // console.log(venusSupplierIndex,"---- venusSupplierIndex");

          let venusBorrowSpeeds = await unitroller.venusBorrowSpeeds(vUSDT.address);
          const venusBorrowSpeedsUpgrade = await diamondUnitroller.venusBorrowSpeeds(vUSDT.address); 
          let venusSupplySpeeds = await unitroller.venusSupplySpeeds(vUSDT.address);
          const venusSupplySpeedsUpgrade = await diamondUnitroller.venusSupplySpeeds(vUSDT.address);           

          expect(venusBorrowSpeeds).to.equal(venusBorrowSpeedsUpgrade);
          expect(venusSupplySpeeds).to.equal(venusSupplySpeedsUpgrade);

        });
      });
    });

    // TODO !!
    describe("Verify states of diamond Contract", () => {
      // describe("Diamond setters", () => {
      //   it("setting market supply cap", async () => {
      //     expect(await unitroller.supplyCaps(vBUSD.address)).to.equals(0);
      //     await unitroller._setMarketSupplyCaps([vBUSD.address], [parseUnits("100000", 18)]);
      //     expect(await unitroller.supplyCaps(vBUSD.address)).to.equals(parseUnits("100000", 18));
      //   });

      //   it("checking PriceOracle", async () => {
      //     await unitroller._setPriceOracle(oracle.address);
      //     const oracleAddress = await comptroller.oracle();
      //     expect(await unitroller.oracle()).to.equals(oracle.address);
    //   });

      //   it("setting collateral factor", async () => {
      //     let data = await unitroller.markets(vBUSD.address);
      //     expect(data.collateralFactorMantissa).to.equals(0);
      //     await unitroller._setCollateralFactor(vBUSD.address, parseUnits("0.7", 18));
      //     data = await unitroller.markets(vBUSD.address);
      //     expect(data.collateralFactorMantissa).to.equals(parseUnits("0.7", 18));
      //   });
      // });

      describe("Diamond Hooks", () => {
        it("mint vToken vBUSD", async () => {
          const vBUSDBalance = await BUSD.balanceOf(vBUSD.address);
          const usdtHolerBalance = (await BUSD.balanceOf(usdtHolder.address)).toString();

          expect(vBUSDBalance.toString()).to.equal(parseUnits("15088539659055255125122602",0));
          expect(usdtHolerBalance.toString()).to.equal(parseUnits("8839004217706336576688",0));

          expect(await vBUSD.connect(usdtHolder).mint(1000)).to.emit(vBUSD, "Mint");

          const newvBUSDBalance = await BUSD.balanceOf(vBUSD.address);
          const newUsdtHolerBalance = await BUSD.balanceOf(usdtHolder.address);

          expect(newvBUSDBalance.toString()).to.equal(parseUnits("15088539659055255125123602",0));
          expect(newUsdtHolerBalance.toString()).to.equal(parseUnits("8839004217706336575688",0));
        });

        it("redeem vToken", async () => {
          
          let vBUSDBalance = (await BUSD.balanceOf(vBUSD.address)).toString();
          let usdtHolerBalance = (await vBUSD.balanceOf(usdtHolder.address)).toString();
          console.log(usdtHolerBalance,"++++")
          
          expect(await vBUSD.connect(usdtHolder).redeem(1000)).to.emit(vBUSD,"Redeem");
          
          let newVBUSDBalance = (await BUSD.balanceOf(vBUSD.address)).toString();
          let newUsdtHolerBalance = (await vBUSD.balanceOf(usdtHolder.address)).toString();
          console.log(newUsdtHolerBalance,"++++")
          
          expect(Number(vBUSDBalance)).greaterThan(Number(newVBUSDBalance));
          expect(newUsdtHolerBalance).to.equal(parseUnits("54755160421016577",0)); 
         
        });

        it("borrow vToken", async () => {
          expect((await BUSD.balanceOf(usdtHolder.address)).toString()).to.equal(parseUnits("8839004217926107052066",0));

          expect(await vBUSD.connect(usdtHolder).borrow(1000)).to.emit(vBUSD,"Borrow");

          expect((await BUSD.balanceOf(usdtHolder.address)).toString()).to.equal(parseUnits("8839004217926107053066",0));

        });

        it("Repay vToken", async () => {
          expect((await BUSD.balanceOf(usdtHolder.address)).toString()).to.equal(parseUnits("8839004217926107053066",0));

          expect(await vBUSD.connect(usdtHolder).borrow(1000)).to.emit(vBUSD,"Borrow");

          expect((await BUSD.balanceOf(usdtHolder.address)).toString()).to.equal(parseUnits("8839004217926107054066",0));

          expect(await vBUSD.connect(usdtHolder).repayBorrow(1000)).to.emit(vBUSD,"RepayBorrow");

          expect((await BUSD.balanceOf(usdtHolder.address)).toString()).to.equal(parseUnits("8839004217926107053066",0));

        });

        // describe("Diamond Rewards", () => {
        //   it("grant and claim rewards", async () => {
        //     await BUSD.connect(usdtHolder).transfer(vBUSD.address, 1000);
        //     await USDT.connect(usdtHolder).approve(vUSDT.address, 110);
        //     await vUSDT.connect(usdtHolder).mint(110);
        //     await vUSDT.connect(usdtHolder).redeem(10);
        //     await expect(vBUSD.connect(usdtHolder).borrow(10)).to.emit(vBUSD, "Borrow");
        //     let borrowBalance;
        //     [, , borrowBalance] = await vBUSD.getAccountSnapshot(usdtHolder.address);
        //     expect(borrowBalance).equal(10);
        //     await BUSD.connect(usdtHolder).approve(vBUSD.address, 10);
        //     await vBUSD.connect(usdtHolder).repayBorrow(10);
        //     let xvsS = await unitroller.getXVSAddress();

        //     let vxvsS = await unitroller.getXVSVTokenAddress();
        //     XVS = XVS__factory.connect(xvsS, admin);
        //     XVSV = VToken__factory.connect(vxvsS, admin);
        //   });
        // });
      });
    });
  }
});
