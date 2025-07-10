import { smock, MockContract } from "@defi-wonderland/smock";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";

import { ComptrollerLens, ComptrollerLens__factory,IAccessControlManagerV5, VBep20, SetterFacet } from "../../../typechain";
import { deployDiamond } from "../Comptroller/Diamond/scripts/deploy";
import { initMainnetUser, setForkBlock, FacetCutAction } from "./utils";
import { convertToUnit } from "../../../helpers/utils";
import { diamond } from "../../../typechain/contracts/Comptroller";
import { time } from "console";

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
const TIMELOCK_ADDRESS = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const ACM = "0x4788629abc6cfca10f9f969efdeaa1cf70c23555";
const OLD_SETTER_FACET = "0x9B0D9D7c50d90f23449c4BbCAA671Ce7cd19DbCf";

if (process.env.FORKED_NETWORK === "bscmainnet") {
    describe("Liquidation Threshold Diamond Fork Test", () => {
        let owner: SignerWithAddress;
        let diamondUnitroller: any;
        let vUsdt: VBep20;
        let timeLockUser: ethers.Signer;
        let accessControlManager: any;
        let setterFacet: SetterFacet;
        let comptrollerLens: MockContract<ComptrollerLens>;

        before(async () => {
            // Fork mainnet at a recent block
            await setForkBlock(53416777);

            owner = await initMainnetUser(Owner, ethers.utils.parseUnits("2"));
            // Deploy Diamond facets onto Unitroller
            //const result = await deployDiamond(UNITROLLER);
            console.log("scipt this 34")
            //diamondUnitroller = result.unitroller;
            // Get contract instances
            vUsdt = await ethers.getContractAt("contracts/Tokens/VTokens/VBep20Delegate.sol:VBep20Delegate", VUSDT);

            accessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
            accessControlManager.isAllowedToCall.returns(true);

            timeLockUser = await initMainnetUser(TIMELOCK_ADDRESS, ethers.utils.parseUnits("2"));


            const setterFacetFactory = await ethers.getContractFactory("SetterFacet");
            const newSetterFacet: SetterFacet = await setterFacetFactory.deploy();
            await newSetterFacet.deployed();

            const addSetCollateralFactorSignature = newSetterFacet.interface.getSighash(
                newSetterFacet.interface.functions["_setCollateralFactor(address,uint256,uint256)"],
            );

            let diamond = await ethers.getContractAt("Diamond", UNITROLLER);

            const existingPolicyFacetFunctions = await diamond.facetFunctionSelectors(OLD_SETTER_FACET);

            const cut = [
                {
                    facetAddress: newSetterFacet.address,
                    action: FacetCutAction.Add,
                    functionSelectors: [addSetCollateralFactorSignature],
                },
                {
                    facetAddress: newSetterFacet.address,
                    action: FacetCutAction.Replace,
                    functionSelectors: existingPolicyFacetFunctions,
                },
            ];

            await diamond.connect(timeLockUser).diamondCut(cut);
            setterFacet = await ethers.getContractAt("SetterFacet", UNITROLLER);
            // Set the access control manager on the unitroller
            console.log("hello there")
            await setterFacet.connect(owner)._setAccessControl(accessControlManager.address);

            const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
            const comptrollerLens = await ComptrollerLensFactory.deploy();
            await setterFacet.connect(owner)._setComptrollerLens(comptrollerLens.address);

            console.log("hello there 123")
            // unitroller with diamond
            diamondUnitroller = await ethers.getContractAt("ComptrollerMock", UNITROLLER);
            console.log("hello there 123456")
        });

        it("Should set liquidation threshold and emit event", async () => {
            const newCF = convertToUnit("0.5", 18);
            const newLT = convertToUnit("0.6", 18);

            await setterFacet.connect(timeLockUser)._setCollateralFactor(VUSDT, newCF, newLT)
            //   await expect(
            //     diamondUnitroller.connect(owner)._setCollateralFactor(VUSDT, newCF, newLT)
            //   ).to.emit(diamondUnitroller, "NewLiquidationThreshold").withArgs(VUSDT, newCF, newLT);

            //   const threshold = await diamondUnitroller.marketliquidationThreshold(VUSDT);
            //   expect(threshold).to.equal(newLT);
        });

        // it("Should revert if liquidation threshold < collateral factor", async () => {
        //   const newCF = convertToUnit("0.7", 18);
        //   const newLT = convertToUnit("0.6", 18);
        //   await expect(
        //     diamondUnitroller._setCollateralFactor(VUSDT, newCF, newLT)
        //   ).to.be.revertedWith("SET_COLLATERAL_FACTOR_VALIDATION_LIQUIDATION_THRESHOLD");
        // });

        // it("Should revert if liquidation threshold > 1e18", async () => {
        //   const newCF = convertToUnit("0.8", 18);
        //   const newLT = convertToUnit("1.1", 18);
        //   await expect(
        //     diamondUnitroller._setCollateralFactor(VUSDT, newCF, newLT)
        //   ).to.be.revertedWith("SET_LIQUIDATION_THRESHOLD_VALIDATION");
        // });
    });
} 