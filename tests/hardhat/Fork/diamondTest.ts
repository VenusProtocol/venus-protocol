import { MockContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { Comptroller__factory, IERC20Upgradeable, VBep20, VToken__factory, XVS__factory } from "../../../typechain";

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
  maxAssets,
  closeFactorMantissa,
  liquidationIncentiveMantissa,
  allMarkets,
  venusRate,
  venusSpeeds,
  venusSupplyState,
  venusBorrowState,
  venusAccrued,
  vaiMintRate;

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
      // Using mainnet comptroller fork to verify it.
      describe("Diamond deployed successfully", async () => {
        it.only("Owner of Diamond unitroller contract should match", async () => {
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
          // unitroller states before the upgrade of diamond
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

          // unitroller states after the upgrade of diamond
          const maxAssetsAfterUpgrade = await diamondUnitroller.maxAssets();
          const closeFactorMantissaAfterUpgrade = await diamondUnitroller.closeFactorMantissa();
          const liquidationIncentiveMantissaAfterUpgrade = await diamondUnitroller.liquidationIncentiveMantissa();
          const allMarketsAfterUpgrade = await diamondUnitroller.allMarkets(0);
          const venusRateAfterUpgrade = await diamondUnitroller.venusRate();
          const venusSpeedsAfterUpgrade = await diamondUnitroller.venusSpeeds(BUSD.address);
          const venusSupplyStateAfterUpgrade = await diamondUnitroller.venusSupplyState(BUSD.address);
          const venusBorrowStateAfterUpgrade = await diamondUnitroller.venusBorrowState(BUSD.address);
          const venusAccruedAfterUpgrade = await diamondUnitroller.venusAccrued(BUSD.address);
          const vaiMintRateAfterUpgrade = await diamondUnitroller.vaiMintRate();

          // checks states for before and after upgrade to diamond.
          expect(maxAssets).to.equal(maxAssetsAfterUpgrade);
          expect(closeFactorMantissa).to.equal(closeFactorMantissaAfterUpgrade);
          expect(liquidationIncentiveMantissa).to.equal(liquidationIncentiveMantissaAfterUpgrade);
          expect(allMarkets).to.equal(allMarketsAfterUpgrade);
          expect(venusRate).to.equal(venusRateAfterUpgrade);
          expect(venusSpeeds).to.equal(venusSpeedsAfterUpgrade);
          expect(venusSupplyState.index.toString()).to.equal(venusSupplyStateAfterUpgrade.index.toString());
          expect(venusBorrowState.index.toString()).to.equal(venusBorrowStateAfterUpgrade.index.toString());
          expect(venusAccrued).to.equal(venusAccruedAfterUpgrade);
          expect(vaiMintRate).to.equal(vaiMintRateAfterUpgrade);
        });
      });
    });

    // TODO !!
    // describe("Verify states of diamond Contract", () => {
    //   describe("Diamond setters", () => {
    //     it("setting market supply cap", async () => {
    //       expect(await unitroller.supplyCaps(vBUSD.address)).to.equals(0);
    //       await unitroller._setMarketSupplyCaps([vBUSD.address], [parseUnits("100000", 18)]);
    //       expect(await unitroller.supplyCaps(vBUSD.address)).to.equals(parseUnits("100000", 18));
    //     });

    //     it("checking PriceOracle", async () => {
    //       await unitroller._setPriceOracle(oracle.address);
    //       const oracleAddress = await comptroller.oracle();
    //       expect(await unitroller.oracle()).to.equals(oracle.address);
    //     });

    //     it("setting collateral factor", async () => {
    //       let data = await unitroller.markets(vBUSD.address);
    //       expect(data.collateralFactorMantissa).to.equals(0);
    //       await unitroller._setCollateralFactor(vBUSD.address, parseUnits("0.7", 18));
    //       data = await unitroller.markets(vBUSD.address);
    //       expect(data.collateralFactorMantissa).to.equals(parseUnits("0.7", 18));
    //     });
    //   });

    //   describe("Diamond Hooks", () => {
    //     it("mint vToken", async () => {
    //       await BUSD.connect(usdtHolder).transfer(vBUSD.address, 1000);
    //       await USDT.connect(usdtHolder).approve(vUSDT.address, 110);
    //       await vUSDT.connect(usdtHolder).mint(110);
    //       expect(await vUSDT.connect(usdtHolder).balanceOf(usdtHolder.address)).equal(110);
    //     });

    //     it("redeem vToken", async () => {
    //       await BUSD.connect(usdtHolder).transfer(vBUSD.address, 1000);
    //       await USDT.connect(usdtHolder).approve(vUSDT.address, 110);
    //       await vUSDT.connect(usdtHolder).mint(110);
    //       await vUSDT.connect(usdtHolder).redeem(10);
    //       expect(await vUSDT.connect(usdtHolder).balanceOf(usdtHolder.address)).equal(100);
    //     });

    //     it("Burn vToken", async () => {
    //       await BUSD.connect(usdtHolder).transfer(vBUSD.address, 1000);
    //       await USDT.connect(usdtHolder).approve(vUSDT.address, 110);
    //       await vUSDT.connect(usdtHolder).mint(110);
    //       await expect(vBUSD.connect(usdtHolder).borrow(10)).to.emit(vBUSD, "Borrow");
    //       let borrowBalance;
    //       [, , borrowBalance] = await vBUSD.getAccountSnapshot(usdtHolder.address);
    //       expect(borrowBalance).equal(10);
    //     });

    //     it("Repay vToken", async () => {
    //       await BUSD.connect(usdtHolder).transfer(vBUSD.address, 1000);
    //       await USDT.connect(usdtHolder).approve(vUSDT.address, 110);
    //       await vUSDT.connect(usdtHolder).mint(110);
    //       await vBUSD.connect(usdtHolder).borrow(10);
    //       let borrowBalance;
    //       [, , borrowBalance] = await vBUSD.getAccountSnapshot(usdtHolder.address);
    //       expect(borrowBalance).equal(10);
    //       await BUSD.connect(usdtHolder).approve(vBUSD.address, 10);
    //       await vBUSD.connect(usdtHolder).repayBorrow(10);
    //       [, , borrowBalance] = await vBUSD.getAccountSnapshot(usdtHolder.address);
    //       expect(borrowBalance).equal(0);
    //     });

    //     describe("Diamond Rewards", () => {
    //       it("grant and claim rewards", async () => {
    //         await BUSD.connect(usdtHolder).transfer(vBUSD.address, 1000);
    //         await USDT.connect(usdtHolder).approve(vUSDT.address, 110);
    //         await vUSDT.connect(usdtHolder).mint(110);
    //         await vUSDT.connect(usdtHolder).redeem(10);
    //         await expect(vBUSD.connect(usdtHolder).borrow(10)).to.emit(vBUSD, "Borrow");
    //         let borrowBalance;
    //         [, , borrowBalance] = await vBUSD.getAccountSnapshot(usdtHolder.address);
    //         expect(borrowBalance).equal(10);
    //         await BUSD.connect(usdtHolder).approve(vBUSD.address, 10);
    //         await vBUSD.connect(usdtHolder).repayBorrow(10);
    //         let xvsS = await unitroller.getXVSAddress();

    //         let vxvsS = await unitroller.getXVSVTokenAddress();
    //         XVS = XVS__factory.connect(xvsS, admin);
    //         XVSV = VToken__factory.connect(vxvsS, admin);
    //       });
    //     });
    //   });
    // });
  }
});
