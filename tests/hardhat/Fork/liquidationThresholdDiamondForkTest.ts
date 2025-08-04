import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  ComptrollerLens,
  ComptrollerLens__factory,
  PolicyFacet,
  ResilientOracleInterface,
  RewardFacet,
  SetterFacet,
  Unitroller__factory,
  VBep20Harness,
} from "../../../typechain";
import { ComptrollerErrorReporter } from "../util/Errors";
import { FacetCutAction, initMainnetUser, setForkBlock } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const Owner = "0x939bd8d64c0a9583a7dcea9933f7b21697ab6396";
const TIMELOCK_ADDRESS = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const UNITROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384";
const VUSDT = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const VETH = "0xf508fCD89b8bd15579dc79A6827cB4686A3592c8";
const ACM = "0x4788629abc6cfca10f9f969efdeaa1cf70c23555";
const OLD_SETTER_FACET = "0x9B0D9D7c50d90f23449c4BbCAA671Ce7cd19DbCf";
const OLD_POLICY_FACET = "0x93e7Ff7c87B496aE76fFb22d437c9d46461A9B51";
const OLD_REWARD_FACET = "0xc2F6bDCEa4907E8CB7480d3d315bc01c125fb63C";
const OLD_MARKET_FACET = "0x4b093a3299F39615bA6b34B7897FDedCe7b83D63";
const ETH_HOLDER = "0x98B4be9C7a32A5d3bEFb08bB98d65E6D204f7E98";
const XVS_ADDRESS = "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63";

if (process.env.FORKED_NETWORK === "bscmainnet") {
  describe("Liquidation Threshold Diamond Fork Test", () => {
    let owner: SignerWithAddress;
    let vUsdt: ethers.contract;
    let timeLockUser: ethers.Signer;
    let accessControlManager: any;
    let setterFacet: SetterFacet;
    let comptrollerLens: MockContract<ComptrollerLens>;
    let oracle: FakeContract<ResilientOracleInterface>;

    before(async () => {
      // Fork mainnet at a recent block
      await setForkBlock(54176946);
      oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
      owner = await initMainnetUser(Owner, ethers.utils.parseUnits("2"));
      timeLockUser = await initMainnetUser(TIMELOCK_ADDRESS, ethers.utils.parseUnits("2"));

      // Get contract instances
      vUsdt = await ethers.getContractAt("VBep20Harness", VUSDT);

      accessControlManager = await ethers.getContractAt("IAccessControlManagerV5", ACM);

      // Get the diamond proxy (Unitroller/Comptroller address)
      const Diamond = await ethers.getContractFactory("Diamond");
      const diamond = await Diamond.deploy();
      await diamond.deployed();

      // Get the existing Unitroller
      const unitroller = await Unitroller__factory.connect(UNITROLLER, owner);

      const unitrollerDiamond = await ethers.getContractAt("Diamond", UNITROLLER);

      // Deploy the new SetterFacet
      const setterFacetFactory = await ethers.getContractFactory("SetterFacet");
      const newSetterFacet = await setterFacetFactory.deploy();
      await newSetterFacet.deployed();

      // Get the selector for the new function
      const addSetCollateralFactorSignature = newSetterFacet.interface.getSighash(
        newSetterFacet.interface.functions["setCollateralFactor(address,uint256,uint256)"],
      );

      // Get all existing selectors for the old SetterFacet (if you want to replace all)
      // You may need to update this address to the actual old SetterFacet address

      const existingSetterFacetFunctions = await unitrollerDiamond.facetFunctionSelectors(OLD_SETTER_FACET);

      // Build the cut array
      const cut = [
        {
          facetAddress: newSetterFacet.address,
          action: FacetCutAction.Add,
          functionSelectors: [addSetCollateralFactorSignature],
        },
        {
          facetAddress: newSetterFacet.address,
          action: FacetCutAction.Replace,
          functionSelectors: existingSetterFacetFunctions,
        },
      ];

      await unitroller.connect(owner)._setPendingImplementation(diamond.address);
      await diamond.connect(owner)._become(unitroller.address);

      // upgrade diamond with facets
      const diamondCut = await ethers.getContractAt("IDiamondCut", unitroller.address);
      // Perform the diamond cut as the admin/timelock
      await diamondCut.connect(timeLockUser).diamondCut(cut);

      // Now you can use the new SetterFacet via the proxy
      setterFacet = await ethers.getContractAt("SetterFacet", UNITROLLER);

      // Deploy and set the comptroller lens
      const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
      comptrollerLens = await ComptrollerLensFactory.deploy();
      await setterFacet.connect(owner)._setComptrollerLens(comptrollerLens.address);
      await setterFacet.connect(owner)._setPriceOracle(oracle.address);

      oracle.getUnderlyingPrice.returns((vToken: string) => {
        if (vToken == vUsdt.address) {
          return convertToUnit(1, 18);
        } else {
          return convertToUnit(1200, 18);
        }
      });

      await accessControlManager
        .connect(owner)
        .giveCallPermission(setterFacet.address, "setCollateralFactor(address,uint256,uint256)", Owner);
    });

    it("Should set liquidation threshold and emit event", async () => {
      const oldCF = convertToUnit("0.8", 18);
      const newCF = convertToUnit("0.7", 18);
      const newLT = convertToUnit("0.8", 18);

      // Call the function through the diamond proxy
      const tx = await setterFacet.connect(owner).setCollateralFactor(vUsdt.address, newCF, newLT);
      await expect(tx).to.emit(setterFacet, "NewCollateralFactor").withArgs(vUsdt.address, oldCF, newCF);
      await expect(tx).to.emit(setterFacet, "NewLiquidationThreshold").withArgs(vUsdt.address, 0, newLT);
    });

    it("Should revert if liquidation threshold < collateral factor", async () => {
      const newCF = convertToUnit("0.9", 18);
      const newLT = convertToUnit("0.6", 18);
      await expect(setterFacet.connect(timeLockUser).setCollateralFactor(VUSDT, newCF, newLT))
        .to.emit(setterFacet, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.PRICE_ERROR,
          ComptrollerErrorReporter.FailureInfo.SET_COLLATERAL_FACTOR_VALIDATION_LIQUIDATION_THRESHOLD,
          0,
        );
    });

    it("Should revert if liquidation threshold > 1e18", async () => {
      const newCF = convertToUnit("0.9", 18);
      const newLT = convertToUnit("1.1", 18);

      await expect(setterFacet.connect(timeLockUser).setCollateralFactor(vUsdt.address, newCF, newLT))
        .to.emit(setterFacet, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.PRICE_ERROR,
          ComptrollerErrorReporter.FailureInfo.SET_LIQUIDATION_THRESHOLD_VALIDATION,
          0,
        );
    });
  });

  describe("Liquidation Mechanism", () => {
    let owner: SignerWithAddress;
    let eth: ethers.contract;
    let vUsdt: ethers.contract;
    let vEth: VBep20Harness;
    let ethHolder: ethers.Signer;
    let accessControlManager: any;
    let setterFacet: SetterFacet;
    let rewardFacet: RewardFacet;
    let policyFacet: PolicyFacet;
    let comptrollerLens: MockContract<ComptrollerLens>;
    let oracle: FakeContract<ResilientOracleInterface>;

    before(async () => {
      // Fork mainnet at a recent block
      await setForkBlock(54063097);
      oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
      owner = await initMainnetUser(Owner, ethers.utils.parseUnits("2"));

      // Get contract instances
      vUsdt = await ethers.getContractAt("VBep20Harness", VUSDT);
      vEth = await ethers.getContractAt("VBep20Harness", VETH);
      const underlyingEth = await vEth.underlying();
      eth = await ethers.getContractAt("IERC20Upgradeable", underlyingEth);
      ethHolder = await initMainnetUser(ETH_HOLDER, parseUnits("1000", 18));

      //accessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
      accessControlManager = await ethers.getContractAt("IAccessControlManagerV5", ACM);

      // Get the diamond proxy (Unitroller/Comptroller address)
      const Diamond = await ethers.getContractFactory("Diamond");
      const diamond = await Diamond.deploy();
      await diamond.deployed();

      // Get the existing Unitroller
      const unitroller = await Unitroller__factory.connect(UNITROLLER, owner);

      const unitrollerDiamond = await ethers.getContractAt("Diamond", UNITROLLER);

      // Deploy the new Facets
      const setterFacetFactory = await ethers.getContractFactory("SetterFacet");
      const newSetterFacet = await setterFacetFactory.deploy();
      await newSetterFacet.deployed();

      const policyFacetFactory = await ethers.getContractFactory("PolicyFacet");
      const newPolicyFacet = await policyFacetFactory.deploy();
      await newPolicyFacet.deployed();

      const rewardFacetFactory = await ethers.getContractFactory("RewardFacet");
      const newRewardFacet = await rewardFacetFactory.deploy();
      await newRewardFacet.deployed();

      const marketFacetFactory = await ethers.getContractFactory("MarketFacet");
      const newMarketFacet = await marketFacetFactory.deploy();
      await newMarketFacet.deployed();

      // Get the selector for the new function
      const addSetCollateralFactorSignature = newSetterFacet.interface.getSighash(
        newSetterFacet.interface.functions["setCollateralFactor(address,uint256,uint256)"],
      );

      const existingSetterFacetFunctions = await unitrollerDiamond.facetFunctionSelectors(OLD_SETTER_FACET);
      const existingPolicyFacetFunctions = await unitrollerDiamond.facetFunctionSelectors(OLD_POLICY_FACET);
      const existingRewardFacetFunctions = await unitrollerDiamond.facetFunctionSelectors(OLD_REWARD_FACET);
      const existingMarketFacetFunctions = await unitrollerDiamond.facetFunctionSelectors(OLD_MARKET_FACET);

      // Build the cut array
      const cut = [
        {
          facetAddress: newSetterFacet.address,
          action: FacetCutAction.Add,
          functionSelectors: [addSetCollateralFactorSignature],
        },
        {
          facetAddress: newSetterFacet.address,
          action: FacetCutAction.Replace,
          functionSelectors: existingSetterFacetFunctions,
        },

        {
          facetAddress: newPolicyFacet.address,
          action: FacetCutAction.Replace,
          functionSelectors: existingPolicyFacetFunctions,
        },
        {
          facetAddress: newRewardFacet.address,
          action: FacetCutAction.Replace,
          functionSelectors: existingRewardFacetFunctions,
        },
        {
          facetAddress: newMarketFacet.address,
          action: FacetCutAction.Replace,
          functionSelectors: existingMarketFacetFunctions,
        },
      ];

      await unitroller.connect(owner)._setPendingImplementation(diamond.address);
      await diamond.connect(owner)._become(unitroller.address);

      // upgrade diamond with facets
      const diamondCut = await ethers.getContractAt("IDiamondCut", unitroller.address);
      // Perform the diamond cut as the admin/timelock
      await diamondCut.connect(owner).diamondCut(cut);

      // Now you can use the new SetterFacet via the proxy
      setterFacet = await ethers.getContractAt("SetterFacet", UNITROLLER);
      rewardFacet = await ethers.getContractAt("RewardFacet", UNITROLLER);
      policyFacet = await ethers.getContractAt("PolicyFacet", UNITROLLER);

      // Deploy and set the comptroller lens
      const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
      comptrollerLens = await ComptrollerLensFactory.deploy();

      await setterFacet.connect(owner)._setComptrollerLens(comptrollerLens.address);
      await setterFacet.connect(owner)._setPriceOracle(oracle.address);

      oracle.getUnderlyingPrice.returns((vToken: string) => {
        if (vToken == vUsdt.address) {
          return convertToUnit(1, 18);
        } else if (vToken == vEth.address) {
          return convertToUnit(1200, 18);
        }
      });

      await accessControlManager
        .connect(owner)
        .giveCallPermission(setterFacet.address, "setCollateralFactor(address,uint256,uint256)", Owner);
    });

    it("borrow allowed for user", async () => {
      const newCF = convertToUnit("0.7", 18);
      const newLT = convertToUnit("0.8", 18);
      await setterFacet.connect(owner).setCollateralFactor(vEth.address, newCF, newLT);

      await eth.connect(ethHolder).approve(vEth.address, parseUnits("2", 18));
      await expect(vEth.connect(ethHolder).mint(parseUnits("2", 18))).to.emit(vEth, "Transfer");

      await eth.connect(ethHolder).approve(vEth.address, 2000);
      await expect(await vEth.connect(ethHolder).redeem(2000)).to.emit(vEth, "Transfer");

      await expect(vEth.connect(ethHolder).borrow(parseUnits("1", 18))).to.emit(vEth, "Borrow");
    });

    it("user in liquidation state", async () => {
      const newCF = convertToUnit("0", 18);
      const newLT = convertToUnit("0", 18);
      await setterFacet.connect(owner).setCollateralFactor(vEth.address, newCF, newLT);

      await expect(vEth.connect(ethHolder).borrow(parseUnits("1", 18))).to.revertedWith("math error");
    });

    it("liquidate the user using the Liquidator contract", async () => {
      // Addresses from mainnet fork
      const LIQUIDATOR = "0x0870793286aada55d39ce7f82fb2766e8004cf43";
      const LIQUIDATOR_ACCOUNT = "0xec641b5afa871cf097f3b375d8c77284b5ae235c";
      const PROTOCOL_SHARE_RESERVE = "0xCa01D5A9A248a830E9D93231e791B1afFed7c446";

      // Impersonate accounts
      await impersonateAccount(LIQUIDATOR_ACCOUNT);
      const liquidatorSigner = await ethers.getSigner(LIQUIDATOR_ACCOUNT);
      //await setBalance(ETH_HOLDER, ethers.utils.parseEther("10"));
      await setBalance(LIQUIDATOR_ACCOUNT, ethers.utils.parseEther("10"));

      // Get contract instances
      const liquidator = await ethers.getContractAt("Liquidator", LIQUIDATOR);

      await eth.connect(ethHolder).transfer(liquidatorSigner.address, parseUnits("2", 18));
      await eth.connect(liquidatorSigner).approve(vEth.address, parseUnits("1", 18));

      // Record balances before liquidation
      const borrowerDebtBefore = await vEth.borrowBalanceStored(ethHolder.address);
      const liquidatorVethBalanceBefore = await vEth.balanceOf(liquidatorSigner.address);
      const protocolShareReserveBalanceBefore = await eth.balanceOf(PROTOCOL_SHARE_RESERVE);

      // 5. Liquidator contract repays part of the borrow
      const repayAmount = parseUnits("0.5", 18);
      await eth.connect(liquidatorSigner).approve(liquidator.address, repayAmount);
      await expect(
        liquidator.connect(liquidatorSigner).liquidateBorrow(
          vEth.address, // vToken borrowed (ETH)
          ethHolder.address, // borrower
          repayAmount, // repay amount
          vEth.address, // collateral to seize
        ),
      ).to.emit(liquidator, "LiquidateBorrowedTokens");

      // 6. Assert: Borrower's debt decreased and liquidator received seized collateral
      const borrowerDebtAfter = await vEth.borrowBalanceStored(ethHolder.address);
      const liquidatorVethBalanceAfter = await vEth.balanceOf(liquidatorSigner.address);
      const protocolShareReserveBalanceAfter = await eth.balanceOf(PROTOCOL_SHARE_RESERVE);

      expect(borrowerDebtAfter.lt(borrowerDebtBefore)).to.be.true;
      expect(liquidatorVethBalanceAfter.gt(liquidatorVethBalanceBefore)).to.be.true;
      expect(protocolShareReserveBalanceAfter.gt(protocolShareReserveBalanceBefore)).to.be.true;
    });

    it("allow a user to claim XVS rewards using claimVenus", async () => {
      await policyFacet.connect(owner)._setVenusSpeeds([vEth.address], [parseUnits("1", 18)], [parseUnits("1", 18)]);

      const newCF = convertToUnit("0.7", 18);
      const newLT = convertToUnit("0.8", 18);
      await setterFacet.connect(owner).setCollateralFactor(vEth.address, newCF, newLT);
      // 1. Setup: Get contract instances and user
      const xvs = await ethers.getContractAt("XVS", XVS_ADDRESS);

      // 2. User supplies and borrows to accrue rewards
      await eth.connect(ethHolder).approve(vEth.address, parseUnits("2", 18));
      await vEth.connect(ethHolder).mint(parseUnits("2", 18));
      await vEth.connect(ethHolder).borrow(parseUnits("0.5", 18));

      // 3. Advance blocks to accrue rewards
      for (let i = 0; i < 20; i++) {
        await ethers.provider.send("evm_mine", []);
      }

      // 4. Trigger reward distribution by interacting again
      const borrowBalance = await vEth.borrowBalanceStored(ethHolder.address);
      const repayAmount = borrowBalance.lt(parseUnits("0.01", 18)) ? borrowBalance : parseUnits("0.01", 18);

      if (borrowBalance.gt(0)) {
        await eth.connect(ethHolder).approve(vEth.address, repayAmount);
        await vEth.connect(ethHolder).repayBorrow(repayAmount);
      } else {
        console.log("No borrow balance to repay, skipping repayBorrow call.");
      }

      // 5. Check XVS balance before claim
      const xvsBalanceBefore = await xvs.balanceOf(ethHolder.address);

      // 6. Call claimVenus
      await rewardFacet
        .connect(ethHolder)
        ["claimVenus(address[],address[],bool,bool,bool)"]([ethHolder.address], [vEth.address], true, true, false);

      // 7. Check XVS balance after claim
      const xvsBalanceAfter = await xvs.balanceOf(ethHolder.address);

      // 8. Assert: ethHolder received XVS rewards (BigNumber comparison)
      expect(xvsBalanceAfter.gt(xvsBalanceBefore)).to.be.true;
    });
  });
}
