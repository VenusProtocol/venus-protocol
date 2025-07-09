import { smock } from "@defi-wonderland/smock";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { IAccessControlManagerV5__factory, VBep20 } from "../../../typechain";
import { deployDiamond } from "../Comptroller/Diamond/scripts/deploy";
import { initMainnetUser , setForkBlock } from "./utils";
import { convertToUnit } from "../../../helpers/utils";

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const ACM = "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555";

if (process.env.FORKED_NETWORK === "bscmainnet") {
  describe("Liquidation Threshold Diamond Fork Test", () => {
    let owner: SignerWithAddress;
    let diamondUnitroller: any;
    let vUsdt: VBep20;
    let accessControlManager: any;

    before(async () => {
      // Fork mainnet at a recent block
      await setForkBlock(53416777);

      await impersonateAccount(Owner);
      owner = await ethers.getSigner(Owner);
      // Deploy Diamond facets onto Unitroller
      const result = await deployDiamond(UNITROLLER);
      console.log("scipt this 34")
      diamondUnitroller = result.unitroller;

      // unitroller with diamond
      diamondUnitroller = await ethers.getContractAt("ComptrollerMock", diamondUnitroller.address);
      // Get contract instances
      vUsdt = await ethers.getContractAt("contracts/Tokens/VTokens/VBep20Delegate.sol:VBep20Delegate", VUSDT);
      accessControlManager = IAccessControlManagerV5__factory.connect(ACM, owner);
    });

    it("Should set liquidation threshold and emit event", async () => {
      const newCF = convertToUnit("0.5", 18);
      const newLT = convertToUnit("0.6", 18);
      await expect(
        diamondUnitroller.connect(owner)._setCollateralFactor(VUSDT, newCF, newLT)
      )
        .to.emit(diamondUnitroller, "NewLiquidationThreshold")
        .withArgs(VUSDT, newCF, newLT);
      const threshold = await diamondUnitroller.marketliquidationThreshold(VUSDT);
      expect(threshold).to.equal(newLT);
    });

    it("Should revert if liquidation threshold < collateral factor", async () => {
      const newCF = convertToUnit("0.7", 18);
      const newLT = convertToUnit("0.6", 18);
      await expect(
        diamondUnitroller._setCollateralFactor(VUSDT, newCF, newLT)
      ).to.be.revertedWith("SET_COLLATERAL_FACTOR_VALIDATION_LIQUIDATION_THRESHOLD");
    });

    it("Should revert if liquidation threshold > 1e18", async () => {
      const newCF = convertToUnit("0.8", 18);
      const newLT = convertToUnit("1.1", 18);
      await expect(
        diamondUnitroller._setCollateralFactor(VUSDT, newCF, newLT)
      ).to.be.revertedWith("SET_LIQUIDATION_THRESHOLD_VALIDATION");
    });
  });
} 