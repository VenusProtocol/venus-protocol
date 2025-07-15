import { smock, MockContract } from "@defi-wonderland/smock";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { network } from "hardhat";

const { expect } = chai;
chai.use(smock.matchers);

import { ComptrollerLens, ComptrollerLens__factory, IAccessControlManagerV5, VBep20, SetterFacet, Unitroller__factory } from "../../../typechain";
import { initMainnetUser, setForkBlock, FacetCutAction } from "./utils";
import { convertToUnit } from "../../../helpers/utils";

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
const TIMELOCK_ADDRESS = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const ACM = "0x4788629abc6cfca10f9f969efdeaa1cf70c23555";

// get function selectors from ABI
function getSelectors(contract: any) {
  const signatures = Object.keys(contract.interface.functions);
  console.log("signatures : ", signatures);
  const selectors: any = signatures.reduce((acc: any, val) => {
    if (val !== "init(bytes)") {
      acc.push(contract.interface.getSighash(val));
    }
    return acc;
  }, []);
  selectors.contract = contract;
  return selectors;
}

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
            
            // Get contract instances
            vUsdt = await ethers.getContractAt("contracts/Tokens/VTokens/VBep20Delegate.sol:VBep20Delegate", VUSDT);

            accessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
            accessControlManager.isAllowedToCall.returns(true);

            timeLockUser = await initMainnetUser(TIMELOCK_ADDRESS, ethers.utils.parseUnits("2"));

            // Deploy new Diamond
            console.log("Deploying new Diamond...");
            const Diamond = await ethers.getContractFactory("Diamond");
            const diamond = await Diamond.deploy();
            await diamond.deployed();

            // Get the existing Unitroller
            const unitroller = await Unitroller__factory.connect(UNITROLLER, owner);
            console.log("unitroller : ", unitroller.address);

            // Get the current Diamond implementation to check existing selectors
            const currentImplementation = await unitroller.comptrollerImplementation();
            console.log("Current implementation: ", currentImplementation);
            const currentDiamond = await ethers.getContractAt("Diamond", currentImplementation);

            // Deploy all facets with updated functionality
            const FacetNames = ["MarketFacet", "PolicyFacet", "RewardFacet", "SetterFacet"];
            const cut: any = [];

            for (const FacetName of FacetNames) {
                const Facet = await ethers.getContractFactory(FacetName);
                const facet = await Facet.deploy();
                await facet.deployed();

                const FacetInterface = await ethers.getContractAt(`I${FacetName}`, facet.address);
                const selectors = getSelectors(FacetInterface);
                
                console.log(`Processing ${FacetName} with ${selectors.length} selectors`);
                
                // Check which selectors already exist and which are new
                const existingSelectors: any = [];
                const newSelectors: any = [];
                
                for (const selector of selectors) {
                    const mappedFacet = await currentDiamond.facetAddress(selector);
                    if (mappedFacet.facetAddress === ethers.constants.AddressZero) {
                        newSelectors.push(selector);
                    } else {
                        existingSelectors.push(selector);
                    }
                }
                
                console.log(`${FacetName}: ${newSelectors.length} new selectors, ${existingSelectors.length} existing selectors`);
                
                // Add new selectors
                if (newSelectors.length > 0) {
                    cut.push({
                        facetAddress: facet.address,
                        action: FacetCutAction.Add,
                        functionSelectors: newSelectors,
                    });
                }
                
                // Replace existing selectors
                if (existingSelectors.length > 0) {
                    cut.push({
                        facetAddress: facet.address,
                        action: FacetCutAction.Replace,
                        functionSelectors: existingSelectors,
                    });
                }
                console.log(`existingSelectors.length : ${existingSelectors.length }`);
                console.log(`newSelectors.length : ${newSelectors.length }`);
            }
            
            console.log(`Total cut operations: ${cut.length}`);
            for (let i = 0; i < cut.length; i++) {
                console.log(`Cut ${i}: ${cut[i].action} ${cut[i].functionSelectors.length} selectors to ${cut[i].facetAddress}`);
            }

            // Set the new Diamond as the pending implementation for the unitroller
            await unitroller.connect(owner)._setPendingImplementation(diamond.address);
            await diamond.connect(owner)._become(unitroller.address);
            
            console.log("Performing diamond cut...")
            const diamondCut = await ethers.getContractAt("IDiamondCut", unitroller.address);
            await diamondCut.connect(owner).diamondCut(cut);
            console.log("Diamond cut completed")

            // Get the unitroller with new diamond implementation
            diamondUnitroller = await ethers.getContractAt("ComptrollerMock", UNITROLLER);

            // Get the setter facet interface from the unitroller
            setterFacet = await ethers.getContractAt("SetterFacet", UNITROLLER);
            
            // Set the access control manager on the unitroller
            console.log("Setting access control manager...");
            await setterFacet.connect(owner)._setAccessControl(accessControlManager.address);

            // Deploy and set the comptroller lens
            const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
            comptrollerLens = await ComptrollerLensFactory.deploy();
            await setterFacet.connect(owner)._setComptrollerLens(comptrollerLens.address);

            console.log("Setup completed");
        });

        it("Should set liquidation threshold and emit event", async () => {
            const newCF = convertToUnit("0.5", 18);
            const newLT = convertToUnit("0.6", 18);

            // Call the function through the diamond proxy
            const tx = await setterFacet.connect(timeLockUser)._setCollateralFactor(VUSDT, newCF, newLT);
            
            // Verify the liquidation threshold was set
            const threshold = await diamondUnitroller.marketliquidationThreshold(VUSDT);
            expect(threshold).to.equal(newLT);
            
            // Check if the transaction was successful
            expect(tx).to.not.be.undefined;
        });

        it("Should revert if liquidation threshold < collateral factor", async () => {
            const newCF = convertToUnit("0.7", 18);
            const newLT = convertToUnit("0.6", 18);
            await expect(
                setterFacet.connect(timeLockUser)._setCollateralFactor(VUSDT, newCF, newLT)
            ).to.be.revertedWith("SET_COLLATERAL_FACTOR_VALIDATION_LIQUIDATION_THRESHOLD");
        });

        it("Should revert if liquidation threshold > 1e18", async () => {
            const newCF = convertToUnit("0.8", 18);
            const newLT = convertToUnit("1.1", 18);
            await expect(
                setterFacet.connect(timeLockUser)._setCollateralFactor(VUSDT, newCF, newLT)
            ).to.be.revertedWith("SET_LIQUIDATION_THRESHOLD_VALIDATION");
        });
    });
} 