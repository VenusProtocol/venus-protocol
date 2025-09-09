import { expect } from "chai";
import { Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { FacetCutAction, getSelectors } from "../../../script/deploy/comptroller/diamond";
import {
  BEP20__factory,
  ComptrollerMock,
  ComptrollerMock__factory,
  Diamond,
  Diamond__factory,
  IAccessControlManagerV8,
  IAccessControlManagerV8__factory,
  Unitroller__factory,
  VAIController,
  VAIController__factory,
  VAIUnitroller__factory,
  VBep20Delegator,
  VBep20Delegator__factory,
} from "../../../typechain";
import { IComptroller } from "../../../typechain/contracts/InterfacesV8.sol";
import { IComptroller__factory } from "../../../typechain/factories/contracts/InterfacesV8.sol";
import { forking, initMainnetUser } from "./utils";

const COMPTROLLER_ADDRESS = "0xfd36e2c2a6789db23113685031d7f16329158384";
const NORMAL_TIMELOCK = "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396";
const ACCESS_CONTROL_MANAGER = "0x4788629abc6cfca10f9f969efdeaa1cf70c23555";
const VAI_CONTROLLER = "0x004065D34C6b18cE4370ced1CeBDE94865DbFAFE";

const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const vUSDT_ADDRESS = "0xfD5840Cd36d94D7229439859C0112a4185BC0255";
const vUSDC_ADDRESS = "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8";
const vBTC_ADDRESS = "0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B";

const USER_ADDRESS = "0x50c6047B6F3EeC1aeDDa257A9065f91CF68A3b68"; // account with existing positions
const assets = [vUSDT_ADDRESS, vBTC_ADDRESS];

let timelock: Signer;
let oldComptroller: IComptroller;
let comptroller: ComptrollerMock;
let diamond: Diamond;
let vaiController: VAIController;
let vUSDC: VBep20Delegator;
let vUSDT: VBep20Delegator;
let vBTC: VBep20Delegator;
let acm: IAccessControlManagerV8;
let user: Signer;
const oldMarketsState: Record<string, any> = {};

async function upgradeComptroller() {
  const DiamondFactory = await ethers.getContractFactory("Diamond");
  const newDiamond = await DiamondFactory.deploy();

  const Unitroller = Unitroller__factory.connect(COMPTROLLER_ADDRESS, timelock);
  await Unitroller._setPendingImplementation(newDiamond.address);
  await newDiamond.connect(timelock)._become(Unitroller.address);

  diamond = Diamond__factory.connect(COMPTROLLER_ADDRESS, timelock);

  // remove existing facets (excluding reward which has no changes)
  const excludeFacets = ["0xc2F6bDCEa4907E8CB7480d3d315bc01c125fb63C"];
  const cut: any[] = [];

  const facets = await diamond.facets();
  for (const facet of facets) {
    if (excludeFacets.includes(facet.facetAddress)) continue;
    cut.push({
      facetAddress: ethers.constants.AddressZero,
      action: FacetCutAction.Remove,
      functionSelectors: facet.functionSelectors,
    });
  }

  await diamond.diamondCut(cut);
  cut.length = 0; // clear array

  // deploy and add new facets
  const FacetNames = ["MarketFacet", "PolicyFacet", "SetterFacet"];
  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName);
    const facet = await Facet.deploy();
    await facet.deployed();

    const facetInterface = await ethers.getContractAt(`I${FacetName}`, facet.address);
    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facetInterface),
    });

    if (FacetName === "MarketFacet") {
      const baseIface = await ethers.getContractAt("IFacetBase", facet.address);
      let selectors = getSelectors(baseIface);
      // exclude duplicate selectors
      selectors = selectors.filter(x => !["0xbf32442d", "0xe85a2960"].includes(x));
      cut.push({
        facetAddress: facet.address,
        action: FacetCutAction.Add,
        functionSelectors: selectors,
      });
    }
  }

  await diamond.diamondCut(cut);

  comptroller = ComptrollerMock__factory.connect(COMPTROLLER_ADDRESS, timelock);

  // set updated lens
  const ComptrollerLens = await ethers.getContractFactory("ComptrollerLens");
  const lens = await ComptrollerLens.deploy();
  await comptroller._setComptrollerLens(lens.address);

  return comptroller;
}

async function setAccessControls(acm: IAccessControlManagerV8) {
  const fnSigs = [
    "setCollateralFactor(address,uint256,uint256)",
    "setCollateralFactor(uint96,address,uint256,uint256)",
    "setLiquidationIncentive(address,uint256)",
    "setLiquidationIncentive(uint96,address,uint256)",
    "createPool(string)",
    "addPoolMarkets(uint96[],address[])",
    "setIsBorrowAllowed(uint96,address,bool)",
  ];
  for (const sig of fnSigs) {
    await acm.giveCallPermission(COMPTROLLER_ADDRESS, sig, NORMAL_TIMELOCK);
  }
}

if (process.env.FORKED_NETWORK === "bscmainnet") {
  const blockNumber = 58155767;
  forking(blockNumber, () => {
    describe("BNB Core Comptroller - eMode Upgrade", () => {
      const corePoolId = 0;

      before(async () => {
        user = await initMainnetUser(USER_ADDRESS);
        timelock = await initMainnetUser(NORMAL_TIMELOCK, parseUnits("2"));

        const UpdatedVToken = await ethers.getContractFactory("VBep20Delegate");
        const vTokenImpl = await UpdatedVToken.deploy();

        vUSDT = VBep20Delegator__factory.connect(vUSDT_ADDRESS, ethers.provider);
        vUSDC = VBep20Delegator__factory.connect(vUSDC_ADDRESS, ethers.provider);
        vBTC = VBep20Delegator__factory.connect(vBTC_ADDRESS, ethers.provider);

        // upgrade vTokens
        await vUSDT.connect(timelock)._setImplementation(vTokenImpl.address, false, "0x");
        await vBTC.connect(timelock)._setImplementation(vTokenImpl.address, false, "0x");
        await vUSDC.connect(timelock)._setImplementation(vTokenImpl.address, false, "0x");

        diamond = Diamond__factory.connect(COMPTROLLER_ADDRESS, timelock);
        oldComptroller = IComptroller__factory.connect(COMPTROLLER_ADDRESS, timelock);
        acm = IAccessControlManagerV8__factory.connect(ACCESS_CONTROL_MANAGER, timelock);

        // upgrade Unitroller
        const vaiUnitroller = VAIUnitroller__factory.connect(VAI_CONTROLLER, timelock);
        const vaiControllerFactor = await ethers.getContractFactory("VAIController");
        const vaiControllerImpl = await vaiControllerFactor.deploy();
        await vaiUnitroller._setPendingImplementation(vaiControllerImpl.address);
        await vaiControllerImpl.connect(timelock)._become(VAI_CONTROLLER);
        vaiController = VAIController__factory.connect(VAI_CONTROLLER, timelock);

        // store old impl state
        for (const market of assets) {
          oldMarketsState[market] = await oldComptroller.markets(market);
        }

        comptroller = await upgradeComptroller();
        await setAccessControls(acm);
      });

      describe("Storage Verification", () => {
        it("preserves markets state after upgrade", async () => {
          for (const market of assets) {
            const newMarketState = await comptroller.markets(market);
            const poolMarketState = await comptroller.poolMarkets(corePoolId, market);

            expect(poolMarketState).to.deep.equal(newMarketState);
            expect(newMarketState.length).to.be.gt(oldMarketsState[market].length);

            for (let i = 0; i < oldMarketsState[market].length; i++) {
              expect(oldMarketsState[market][i]).to.equal(newMarketState[i]);
            }
          }
        });

        it("old markets interface with 3 values works with upgraded comptroller", async () => {
          const market = await oldComptroller.markets(vUSDC_ADDRESS);
          expect(market.length).to.be.equal(3);
        });

        it("new PoolId index should not collide with existing core Pool", async () => {
          for (let i = 1; i < 5; i++) {
            for (const market of assets) {
              await comptroller.createPool("pool" + i);
              const poolMarket = await comptroller.poolMarkets(i, market);
              expect(poolMarket[0]).to.be.equal(false);
            }
          }
        });
      });

      describe("Risk Parameter Setters", () => {
        const CF = parseUnits("0.7", 18);
        const LT = parseUnits("0.8", 18);
        const LI = parseUnits("1.2", 18);

        it("updates collateral factor", async () => {
          await comptroller["setCollateralFactor(address,uint256,uint256)"](vUSDT_ADDRESS, CF, LT);
          const data = await comptroller.markets(vUSDT_ADDRESS);
          expect(data.collateralFactorMantissa).to.equal(CF);
          expect(data.liquidationThresholdMantissa).to.equal(LT);
        });

        it("updates liquidation incentive", async () => {
          await comptroller["setLiquidationIncentive(address,uint256)"](vUSDT_ADDRESS, LI);
          expect((await comptroller.markets(vUSDT_ADDRESS)).liquidationIncentiveMantissa).to.equal(LI);

          await comptroller["setLiquidationIncentive(address,uint256)"](vBTC_ADDRESS, LI);
          expect((await comptroller.markets(vBTC_ADDRESS)).liquidationIncentiveMantissa).to.equal(LI);
        });

        it("enables borrow in the core pool", async () => {
          for (const market of assets) {
            await comptroller.setIsBorrowAllowed(0, market, true);
            const usdcPoolMarket = await comptroller.poolMarkets(corePoolId, market);
            expect(usdcPoolMarket.isBorrowAllowed).to.be.true;
          }
        });
      });

      describe("eMode", () => {
        let poolId: number;

        it("creates an eMode pool", async () => {
          await comptroller.createPool("stable-coins");
          poolId = (await comptroller.lastPoolId()).toNumber();

          await comptroller.addPoolMarkets([poolId, poolId], [vBTC_ADDRESS, vUSDT_ADDRESS]);
          await comptroller.setIsBorrowAllowed(poolId, vUSDT_ADDRESS, true);

          await comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
            poolId,
            vBTC_ADDRESS,
            parseUnits("0.9", 18),
            parseUnits("0.97", 18),
          );
          await comptroller["setLiquidationIncentive(uint96,address,uint256)"](
            poolId,
            vBTC_ADDRESS,
            parseUnits("1.1", 18),
          );
          await comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
            poolId,
            vUSDT_ADDRESS,
            parseUnits("0.9", 18),
            parseUnits("0.95", 18),
          );
          await comptroller["setLiquidationIncentive(uint96,address,uint256)"](
            poolId,
            vUSDT_ADDRESS,
            parseUnits("1.05", 18),
          );
        });

        it("increases borrowing power after entering eMode", async () => {
          const before = await comptroller.getAccountLiquidity(USER_ADDRESS);
          await comptroller.connect(user).enterPool(poolId);
          const after = await comptroller.getAccountLiquidity(USER_ADDRESS);
          expect(after[1]).to.be.gt(before[1]);
        });

        it("should revert borrow if market is not enabled in the selected pool", async () => {
          await expect(vUSDC.connect(user).borrow(parseUnits("100", 18))).to.be.revertedWithCustomError(
            comptroller,
            "BorrowNotAllowedInPool",
          );
        });

        it("should revert on minting VAI while inside an eMode pool", async () => {
          await expect(vaiController.connect(user).callStatic.mintVAI(parseUnits("100", 18))).to.be.revertedWith(
            "VAI mint only allowed in the core Pool",
          );
        });

        it("should revert pool switch to corePool if account becomes unsafe", async () => {
          await comptroller.addPoolMarkets([poolId], [vUSDC_ADDRESS]);
          await comptroller.setIsBorrowAllowed(poolId, vUSDC_ADDRESS, true);
          await vUSDC.connect(user).borrow(parseUnits("569140", 18));
          await comptroller.setIsBorrowAllowed(corePoolId, vUSDC_ADDRESS, true);
          await expect(comptroller.connect(user).enterPool(corePoolId)).to.be.revertedWithCustomError(
            comptroller,
            "LiquidityCheckFailed",
          );
        });

        it("should exit Pool after repay", async () => {
          const usdc = BEP20__factory.connect(USDC, ethers.provider);
          await usdc.connect(user).approve(vUSDC.address, ethers.constants.MaxUint256);
          await vUSDC.connect(user).repayBorrow(parseUnits("569140", 18));
          await comptroller.connect(user).enterPool(corePoolId);
        });

        it("should revert on entring pool while having VAI Borrows", async () => {
          await vaiController.connect(user).mintVAI(parseUnits("100", 18));
          await expect(comptroller.connect(user).enterPool(poolId)).to.be.revertedWithCustomError(
            comptroller,
            "IncompatibleBorrowedAssets",
          );
        });
      });
    });
  });
}
