import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish, Contract } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { FacetCutAction, getSelectors } from "../../../script/deploy/comptroller/diamond";
import {
  BUSDLiquidator,
  ComptrollerMock,
  ComptrollerMock__factory,
  Diamond__factory,
  FaucetToken,
  IAccessControlManagerV8,
  IAccessControlManagerV8__factory,
  IProtocolShareReserve,
  Liquidator__factory,
  ProxyAdmin__factory,
  Unitroller__factory,
  VBep20,
  VBep20Delegate__factory,
  VBep20Delegator__factory,
} from "../../../typechain";
import {
  deployComptrollerWithMarkets,
  deployJumpRateModel,
  deployLiquidatorContract,
} from "../fixtures/ComptrollerWithMarkets";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const TOTAL_LIQUIDATION_INCENTIVE = parseUnits("1.1", 18);
const TREASURY_PERCENT_IN_LIQUIDATOR_C = parseUnits("0.1", 18);
const LIQUIDATOR_PERCENT_IN_BUSDLIQUIDATOR_C = parseUnits("0.8", 18);
const MANTISSA_ONE = parseUnits("1", 18);

const addresses = {
  bscmainnet: {
    VBNB: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
    VBUSD: "0x95c78222B3D6e262426483D42CfA53685A67Ab9D",
    VUSDT: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
    USDT_HOLDER: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    BUSD_HOLDER: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
    UNITROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
    ACCESS_CONTROL_MANAGER: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
    LIQUIDATOR: "0x0870793286aada55d39ce7f82fb2766e8004cf43",
    PSR: "0xCa01D5A9A248a830E9D93231e791B1afFed7c446",
  },
};

const deployBUSDLiquidator = async ({
  comptroller,
  vBUSD,
  treasuryAddress,
  liquidatorShareMantissa,
}: {
  comptroller: ComptrollerMock;
  vBUSD: VBep20;
  treasuryAddress: string;
  liquidatorShareMantissa: BigNumberish;
}) => {
  const busdLiquidatorFactory = await ethers.getContractFactory("BUSDLiquidator");
  const busdLiquidator = (await upgrades.deployProxy(busdLiquidatorFactory, [liquidatorShareMantissa], {
    constructorArgs: [comptroller.address, vBUSD.address, treasuryAddress],
  })) as BUSDLiquidator;
  await busdLiquidator.deployed();
  return busdLiquidator;
};

interface BUSDLiquidatorFixture {
  comptroller: ComptrollerMock;
  busdLiquidator: BUSDLiquidator;
  vCollateral: VBep20;
  vBUSD: VBep20;
  busd: FaucetToken;
  treasuryAddress: string;
  collateral: Contract;
}

async function upgradeComptroller() {
  const timelock = await initMainnetUser(addresses.bscmainnet.TIMELOCK, parseEther("1"));
  const DiamondFactory = await ethers.getContractFactory("Diamond");
  const newDiamond = await DiamondFactory.deploy();

  const Unitroller = Unitroller__factory.connect(addresses.bscmainnet.UNITROLLER, timelock);
  await Unitroller._setPendingImplementation(newDiamond.address);
  await newDiamond.connect(timelock)._become(Unitroller.address);

  const diamond = Diamond__factory.connect(addresses.bscmainnet.UNITROLLER, timelock);

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
      selectors = selectors.filter(x => !["0xbf32442d"].includes(x));
      cut.push({
        facetAddress: facet.address,
        action: FacetCutAction.Add,
        functionSelectors: selectors,
      });
    }
  }

  await diamond.diamondCut(cut);

  const comptrollerNew = ComptrollerMock__factory.connect(addresses.bscmainnet.UNITROLLER, timelock);

  // set updated lens
  const ComptrollerLens = await ethers.getContractFactory("ComptrollerLens");
  const lens = await ComptrollerLens.deploy();
  await comptrollerNew._setComptrollerLens(lens.address);

  const liquidatorNewFactory = await ethers.getContractFactory("Liquidator");
  const liquidatorNewImpl = await liquidatorNewFactory.deploy(
    addresses.bscmainnet.UNITROLLER,
    addresses.bscmainnet.VBNB,
    addresses.bscmainnet.WBNB,
    lens.address,
  );
  const proxyAdmin = ProxyAdmin__factory.connect("0x2b40B43AC5F7949905b0d2Ed9D6154a8ce06084a", timelock);

  await proxyAdmin.connect(timelock).upgrade(addresses.bscmainnet.LIQUIDATOR, liquidatorNewImpl.address);
  const liquidatorNew = Liquidator__factory.connect(addresses.bscmainnet.LIQUIDATOR, timelock);

  const protocolShareReserveFactory = await ethers.getContractFactory("ProtocolShareReserve");
  const protocolShareReserve = await protocolShareReserveFactory.deploy(
    comptrollerNew.address,
    addresses.bscmainnet.WBNB,
    addresses.bscmainnet.VBNB,
  );

  await liquidatorNew.connect(timelock).setProtocolShareReserve(protocolShareReserve.address);

  return comptrollerNew;
}

async function configureNew(vTokenAddress: string, timelock: SignerWithAddress) {
  const accessControlManager = IAccessControlManagerV8__factory.connect(
    addresses.bscmainnet.ACCESS_CONTROL_MANAGER,
    timelock,
  );
  const vTokenProxy = VBep20Delegator__factory.connect(vTokenAddress, timelock);
  const vTokenFactory = await ethers.getContractFactory("VBep20Delegate");
  const vTokenImpl = await vTokenFactory.deploy();
  await vTokenImpl.deployed();
  await vTokenProxy.connect(timelock)._setImplementation(vTokenImpl.address, true, "0x00");
  const vToken = VBep20Delegate__factory.connect(vTokenAddress, timelock);
  const protocolShareReserve = await smock.fake<IProtocolShareReserve>("ProtocolShareReserve");
  await vToken.setAccessControlManager(addresses.bscmainnet.ACCESS_CONTROL_MANAGER);
  await accessControlManager.giveCallPermission(
    vToken.address,
    "setReduceReservesBlockDelta(uint256)",
    addresses.bscmainnet.TIMELOCK,
  );
  await accessControlManager.giveCallPermission(
    vToken.address,
    "_setInterestRateModel(address)",
    addresses.bscmainnet.TIMELOCK,
  );
  await vToken.connect(timelock).setReduceReservesBlockDelta(1000);
  await expect(vToken.connect(timelock).setProtocolShareReserve(ethers.constants.AddressZero)).to.be.revertedWith(
    "zero address",
  );
  await vToken.connect(timelock).setProtocolShareReserve(protocolShareReserve.address);
  return vToken;
}

const setupLocal = async (): Promise<BUSDLiquidatorFixture> => {
  const [, supplier, borrower, someone, treasury] = await ethers.getSigners();
  const { comptroller, vTokens, vBNB } = await deployComptrollerWithMarkets({ numBep20Tokens: 2 });
  const [vBUSD, vCollateral] = vTokens;
  const zeroRateModel = await deployJumpRateModel({
    baseRatePerYear: 0,
    multiplierPerYear: 0,
    jumpMultiplierPerYear: 0,
    kink: 0,
  });
  await zeroRateModel.deployed();
  await vBUSD._setInterestRateModel(zeroRateModel.address);
  await comptroller.setIsBorrowAllowed(0, vBUSD.address, true);
  await comptroller["setLiquidationIncentive(address,uint256)"](vCollateral.address, TOTAL_LIQUIDATION_INCENTIVE);
  await deployLiquidatorContract({
    comptroller,
    vBNB,
    treasuryAddress: treasury.address,
    treasuryPercentMantissa: TREASURY_PERCENT_IN_LIQUIDATOR_C,
  });

  const busdLiquidator = await deployBUSDLiquidator({
    comptroller,
    vBUSD,
    treasuryAddress: treasury.address,
    liquidatorShareMantissa: LIQUIDATOR_PERCENT_IN_BUSDLIQUIDATOR_C,
  });

  const baseCloseFactorMantissa = ethers.utils.parseUnits("0.05", 18); // 5%
  const defaultCloseFactorMantissa = ethers.utils.parseUnits("0.5", 18); // 50%
  const targetHealthFactor = ethers.utils.parseUnits("1.1", 18); // 1.1
  const accessControlManager = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");

  const LiquidationManager = await ethers.getContractFactory("LiquidationManager");
  const liquidationManager = await LiquidationManager.deploy(
    baseCloseFactorMantissa,
    defaultCloseFactorMantissa,
    targetHealthFactor,
  );
  await liquidationManager.deployed();
  await liquidationManager.initialize(accessControlManager.address);

  await comptroller.setLiquidationManager(liquidationManager.address);
  await comptroller["setCollateralFactor(address,uint256,uint256)"](
    vCollateral.address,
    parseUnits("0.5", 18),
    parseUnits("0.5", 18),
  );
  await comptroller._setMarketSupplyCaps(
    [vBUSD.address, vCollateral.address],
    [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
  );
  await comptroller._setMarketBorrowCaps(
    [vBUSD.address, vCollateral.address],
    [ethers.constants.MaxUint256, ethers.constants.MaxUint256],
  );
  await comptroller.setMarketMaxLiquidationIncentive(vCollateral.address, TOTAL_LIQUIDATION_INCENTIVE);
  await comptroller.setMarketMaxLiquidationIncentive(vBUSD.address, TOTAL_LIQUIDATION_INCENTIVE);

  const busd = await ethers.getContractAt("FaucetToken", await vBUSD.underlying());
  const collateral = await ethers.getContractAt("FaucetToken", await vCollateral.underlying());

  await busd.allocateTo(supplier.address, parseUnits("5000", 18));
  await busd.connect(supplier).approve(vBUSD.address, parseUnits("5000", 18));
  await vBUSD.connect(supplier).mint(parseUnits("5000", 18));

  await collateral.allocateTo(borrower.address, parseUnits("10000", 18));
  await collateral.connect(borrower).approve(vCollateral.address, parseUnits("10000", 18));
  await vCollateral.connect(borrower).mint(parseUnits("10000", 18));
  await comptroller.connect(borrower).enterMarkets([vCollateral.address]);
  await vBUSD.connect(borrower).borrow(parseUnits("1000", 18));

  await busd.allocateTo(someone.address, parseUnits("10000", 18));
  await busd.connect(someone).approve(busdLiquidator.address, parseUnits("10000", 18));

  await comptroller._setForcedLiquidation(vBUSD.address, true);
  return { comptroller, busdLiquidator, vCollateral, vBUSD, busd, treasuryAddress: treasury.address, collateral };
};

const setupFork = async (): Promise<BUSDLiquidatorFixture> => {
  const [admin, , borrower, someone] = await ethers.getSigners();
  const timelock = await initMainnetUser(addresses.bscmainnet.TIMELOCK, parseEther("1"));

  const zeroRateModel = await deployJumpRateModel({
    baseRatePerYear: 0,
    multiplierPerYear: 0,
    jumpMultiplierPerYear: 0,
  });

  const comptroller = await upgradeComptroller();
  const vBUSD = await configureNew(addresses.bscmainnet.VBUSD, timelock);
  const vCollateral = await configureNew(addresses.bscmainnet.VUSDT, timelock);
  const busd = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vBUSD.underlying());
  const collateral = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vCollateral.underlying());
  const treasuryAddress = await comptroller.treasuryAddress();
  const acm = IAccessControlManagerV8__factory.connect(addresses.bscmainnet.ACCESS_CONTROL_MANAGER, admin);

  let tx = await acm
    .connect(timelock)
    .giveCallPermission(
      addresses.bscmainnet.UNITROLLER,
      "setLiquidationManager(address)",
      addresses.bscmainnet.TIMELOCK,
    );
  await tx.wait();

  tx = await acm
    .connect(timelock)
    .giveCallPermission(
      addresses.bscmainnet.UNITROLLER,
      "setMarketMaxLiquidationIncentive(address,uint256)",
      addresses.bscmainnet.TIMELOCK,
    );
  await tx.wait();

  const baseCloseFactorMantissa = ethers.utils.parseUnits("0.05", 18); // 5%
  const defaultCloseFactorMantissa = ethers.utils.parseUnits("0.5", 18); // 50%
  const targetHealthFactor = ethers.utils.parseUnits("1.1", 18); // 1.1
  const accessControlManager = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");

  const LiquidationManager = await ethers.getContractFactory("LiquidationManager");
  const liquidationManager = await LiquidationManager.deploy(
    baseCloseFactorMantissa,
    defaultCloseFactorMantissa,
    targetHealthFactor,
  );
  await liquidationManager.deployed();
  await liquidationManager.initialize(accessControlManager.address);

  await comptroller.setLiquidationManager(liquidationManager.address);

  const busdLiquidator = await deployBUSDLiquidator({
    comptroller,
    vBUSD,
    treasuryAddress: await comptroller.treasuryAddress(),
    liquidatorShareMantissa: LIQUIDATOR_PERCENT_IN_BUSDLIQUIDATOR_C,
  });

  await acm
    .connect(timelock)
    .giveCallPermission(comptroller.address, "_setActionsPaused(address[],uint8[],bool)", busdLiquidator.address);
  await comptroller
    .connect(timelock)
    .setMarketMaxLiquidationIncentive(vCollateral.address, TOTAL_LIQUIDATION_INCENTIVE);
  await comptroller.connect(timelock).setMarketMaxLiquidationIncentive(vBUSD.address, TOTAL_LIQUIDATION_INCENTIVE);
  await comptroller.connect(timelock)._setMarketSupplyCaps([vBUSD.address], [ethers.constants.MaxUint256]);
  await comptroller.connect(timelock)._setMarketBorrowCaps([vBUSD.address], [ethers.constants.MaxUint256]);
  await comptroller.connect(timelock)._setForcedLiquidation(vBUSD.address, true);
  await comptroller.connect(timelock)._setXVSToken("0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63");
  await comptroller.connect(timelock)._setXVSVToken("0x151B1e2635A717bcDc836ECd6FbB62B674FE3E1D");
  const actions = {
    MINT: 0,
    BORROW: 2,
    ENTER_MARKETS: 7,
  };
  await comptroller
    .connect(timelock)
    ._setActionsPaused([vBUSD.address], [actions.MINT, actions.BORROW, actions.ENTER_MARKETS], false);
  await vBUSD.connect(timelock)._setInterestRateModel(zeroRateModel.address);
  await vCollateral.connect(timelock)._setInterestRateModel(zeroRateModel.address);

  const busdHolder = await initMainnetUser(addresses.bscmainnet.BUSD_HOLDER, parseEther("1"));
  await busd.connect(busdHolder).approve(vBUSD.address, parseUnits("10000000", 18));
  await vBUSD.connect(busdHolder).mint(parseUnits("10000000", 18)); // inject liquidity

  const usdtHolder = await initMainnetUser(addresses.bscmainnet.USDT_HOLDER, parseEther("1"));
  await collateral.connect(usdtHolder).transfer(borrower.address, parseUnits("10000", 18));
  await collateral.connect(borrower).approve(vCollateral.address, parseUnits("10000", 18));
  await vCollateral.connect(borrower).mint(parseUnits("10000", 18));
  await comptroller.connect(borrower).enterMarkets([vCollateral.address]);
  await vBUSD.connect(borrower).borrow(parseUnits("1000", 18));

  await busd.connect(busdHolder).transfer(someone.address, parseUnits("10000", 18));
  await busd.connect(someone).approve(busdLiquidator.address, parseUnits("10000", 18));

  return { comptroller, busdLiquidator, vCollateral, vBUSD, busd, treasuryAddress, collateral };
};

const test = (setup: () => Promise<BUSDLiquidatorFixture>) => () => {
  describe("BUSDLiquidator", () => {
    let comptroller: ComptrollerMock;
    let busdLiquidator: BUSDLiquidator;
    let vCollateral: VBep20;
    let vBUSD: VBep20;
    let busd: FaucetToken;
    let borrower: SignerWithAddress;
    let someone: SignerWithAddress;
    let treasuryAddress: string;

    beforeEach(async () => {
      ({ comptroller, busdLiquidator, vCollateral, vBUSD, busd, treasuryAddress } = await loadFixture(setup));
      [, , borrower, someone] = await ethers.getSigners();
    });

    describe("setLiquidatorShare", () => {
      it("should set liquidator share", async () => {
        const newLiquidatorShareMantissa = parseUnits("1.0", 18);
        await busdLiquidator.setLiquidatorShare(newLiquidatorShareMantissa);
        expect(await busdLiquidator.liquidatorShareMantissa()).to.equal(newLiquidatorShareMantissa);
      });

      it("should emit NewLiquidatorShare event", async () => {
        const oldLiquidatorShareMantissa = parseUnits("0.8", 18);
        const newLiquidatorShareMantissa = parseUnits("0.85", 18);
        const tx = await busdLiquidator.setLiquidatorShare(newLiquidatorShareMantissa);
        await expect(tx)
          .to.emit(busdLiquidator, "NewLiquidatorShare")
          .withArgs(oldLiquidatorShareMantissa, newLiquidatorShareMantissa);
      });

      it("should revert if caller is not owner", async () => {
        const newLiquidatorShareMantissa = parseUnits("1.02", 18);
        await expect(busdLiquidator.connect(someone).setLiquidatorShare(newLiquidatorShareMantissa)).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });

      it("should revert if new liquidator share is > MANTISA_ONE", async () => {
        const newLiquidatorShareMantissa = parseUnits("1.1", 18);
        await expect(busdLiquidator.setLiquidatorShare(newLiquidatorShareMantissa))
          .to.be.revertedWithCustomError(busdLiquidator, "LiquidatorShareTooHigh")
          .withArgs(MANTISSA_ONE, newLiquidatorShareMantissa);
      });
    });

    describe("liquidateEntireBorrow", async () => {
      it("should repay entire borrow", async () => {
        const repayAmount = parseUnits("1000", 18);
        const tx = await busdLiquidator.connect(someone).liquidateEntireBorrow(borrower.address, vCollateral.address);
        await expect(tx).to.changeTokenBalances(busd, [someone, vBUSD], [repayAmount.mul(-1), repayAmount]);
        expect(await vBUSD.callStatic.borrowBalanceCurrent(borrower.address)).to.equal(0);
      });

      it("should seize collateral and split correctly between liquidator and treasury", async () => {
        const repayAmount = parseUnits("1000", 18);

        // Capture balances before liquidation
        const treasuryBalanceBefore = await vCollateral.callStatic.balanceOf(treasuryAddress);
        const liquidatorBalanceBefore = await vCollateral.callStatic.balanceOf(someone.address);

        // Perform liquidation
        const tx = await busdLiquidator.connect(someone).liquidateEntireBorrow(borrower.address, vCollateral.address);

        // Capture balances after liquidation
        const treasuryBalanceAfter = await vCollateral.callStatic.balanceOf(treasuryAddress);
        const liquidatorBalanceAfter = await vCollateral.callStatic.balanceOf(someone.address);

        const [, totalSeizedCollateral] = await comptroller[
          "liquidateCalculateSeizeTokens(address,address,address,uint256)"
        ](borrower.address, vBUSD.address, vCollateral.address, repayAmount); // 110%

        // Compute treasury share taken by the Liquidator contract
        const liquidatorContractTreasuryShare = totalSeizedCollateral
          .mul(TOTAL_LIQUIDATION_INCENTIVE.sub(MANTISSA_ONE))
          .mul(TREASURY_PERCENT_IN_LIQUIDATOR_C)
          .div(TOTAL_LIQUIDATION_INCENTIVE)
          .div(MANTISSA_ONE);

        // Effective collateral after treasury cut at Liquidator contract
        const effectiveSeizedCollateral = totalSeizedCollateral.sub(liquidatorContractTreasuryShare);

        // Compute effective liquidation incentive for BUSDLiquidator
        // LI - treasury portion of bonus; e.g., if LI = 1.1 and treasury = 0.1, effective = 1.09
        const effectiveLiqIncentive = MANTISSA_ONE.add(
          TOTAL_LIQUIDATION_INCENTIVE.sub(MANTISSA_ONE)
            .mul(MANTISSA_ONE.sub(TREASURY_PERCENT_IN_LIQUIDATOR_C))
            .div(MANTISSA_ONE),
        );

        // Compute treasury and liquidator shares for BUSDLiquidator
        const treasuryPercent = MANTISSA_ONE.sub(LIQUIDATOR_PERCENT_IN_BUSDLIQUIDATOR_C); // Treasury share of bonus
        const bonusMantissa = effectiveLiqIncentive.sub(MANTISSA_ONE); // Extra over 100%
        const bonusAmount = effectiveSeizedCollateral.mul(bonusMantissa).div(effectiveLiqIncentive);
        const treasuryShare = bonusAmount.mul(treasuryPercent).div(MANTISSA_ONE);
        const liquidatorShare = effectiveSeizedCollateral.sub(treasuryShare);

        await expect(tx).to.changeTokenBalance(vCollateral, borrower, totalSeizedCollateral.mul(-1));
        expect(treasuryBalanceAfter.sub(treasuryBalanceBefore)).to.be.closeTo(treasuryShare, 1);
        expect(liquidatorBalanceAfter.sub(liquidatorBalanceBefore)).to.be.closeTo(liquidatorShare, 1);
      });
    });

    describe("liquidateBorrow", async () => {
      it("should repay a part of the borrow", async () => {
        const repayAmount = parseUnits("100", 18);
        const tx = await busdLiquidator
          .connect(someone)
          .liquidateBorrow(borrower.address, repayAmount, vCollateral.address);
        await expect(tx).to.changeTokenBalances(busd, [someone, vBUSD], [repayAmount.mul(-1), repayAmount]);
        expect(await vBUSD.callStatic.borrowBalanceCurrent(borrower.address)).to.equal(parseUnits("900", 18));
      });

      it("should seize collateral correctly for partial repay and split between liquidator and treasury", async () => {
        const repayAmount = parseUnits("100", 18);

        const tx = await busdLiquidator
          .connect(someone)
          .liquidateBorrow(borrower.address, repayAmount, vCollateral.address);

        const [, totalSeizedCollateral] = await comptroller[
          "liquidateCalculateSeizeTokens(address,address,address,uint256)"
        ](borrower.address, vBUSD.address, vCollateral.address, repayAmount); // 110%

        // Treasury share taken by the Liquidator contract
        const liquidatorContractTreasuryShare = totalSeizedCollateral
          .mul(TOTAL_LIQUIDATION_INCENTIVE.sub(MANTISSA_ONE))
          .mul(TREASURY_PERCENT_IN_LIQUIDATOR_C)
          .div(TOTAL_LIQUIDATION_INCENTIVE)
          .div(MANTISSA_ONE);

        // Effective collateral that BUSDLiquidator receives
        const effectiveSeizedCollateral = totalSeizedCollateral.sub(liquidatorContractTreasuryShare);

        // Effective liquidation incentive (bonus portion after treasury cut)
        // Example: LI = 1.1, treasury cut = 0.1 → effective = 1.09
        const effectiveLiqIncentive = MANTISSA_ONE.add(
          TOTAL_LIQUIDATION_INCENTIVE.sub(MANTISSA_ONE)
            .mul(MANTISSA_ONE.sub(TREASURY_PERCENT_IN_LIQUIDATOR_C))
            .div(MANTISSA_ONE),
        );

        // Treasury percent for BUSDLiquidator
        const BUSDLiquidatorTreasuryPercent = MANTISSA_ONE.sub(LIQUIDATOR_PERCENT_IN_BUSDLIQUIDATOR_C);

        // Bonus mantissa (extra over 100%)
        const bonusMantissa = effectiveLiqIncentive.sub(MANTISSA_ONE);

        // Bonus amount
        const bonusAmount = effectiveSeizedCollateral.mul(bonusMantissa).div(effectiveLiqIncentive);

        // Treasury and liquidator shares from effectiveSeizedCollateral
        const treasuryShare = bonusAmount.mul(BUSDLiquidatorTreasuryPercent).div(MANTISSA_ONE);
        const liquidatorShare = effectiveSeizedCollateral.sub(treasuryShare);

        await expect(tx).to.changeTokenBalances(
          vCollateral,
          [borrower, someone, treasuryAddress],
          [totalSeizedCollateral.mul(-1), liquidatorShare, treasuryShare],
        );
      });
    });
  });
};

if (FORK_MAINNET) {
  const blockNumber = 32275000;
  // For market-specific liquidations, the logic in the Liquidator contract has changed,
  // which will break the old fork test.
  forking(blockNumber, test(setupFork));
} else {
  test(setupLocal)();
}
