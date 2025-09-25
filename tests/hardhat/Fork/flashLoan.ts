import { FakeContract, smock } from "@defi-wonderland/smock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  BorrowDebtFlashLoanReceiver,
  BorrowDebtFlashLoanReceiver__factory,
  Diamond,
  FlashLoanFacet,
  IAccessControlManagerV8,
  IAccessControlManagerV8__factory,
  IERC20,
  InterestRateModel,
  MarketFacet,
  MockFlashLoanReceiver,
  MockFlashLoanReceiver__factory,
  PriceOracle,
  SetterFacet,
  Unitroller__factory,
  VBep20Delegate,
  VBep20Delegate__factory,
  VBep20Delegator,
  VBep20Delegator__factory,
} from "../../../typechain";
import { FORK_TESTNET, FacetCutAction, forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const blocksToMine: number = 30000;

export const bigNumber18 = BigNumber.from("1000000000000000000"); // 1e18
export const bigNumber16 = BigNumber.from("10000000000000000"); // 1e16

const AddressZero = "0x0000000000000000000000000000000000000000";
const TIMELOCK_ADDRESS = "0xce10739590001705F7FF231611ba4A48B2820327";
const vUSDT_ADDRESS = "0xb7526572FFE56AB9D7489838Bf2E18e3323b441A";
const USDT_ADDRESS = "0xA11c8D9DC9b66E209Ef60F0C8D969D3CD988782c";
const USDT_HOLDER = "0xbEe5b9859B03FEefd5Ae3ce7C5d92f3b09a55149";
const vBUSD_ADDRESS = "0x08e0A5575De71037aE36AbfAfb516595fE68e5e4";
const BUSD_ADDRESS = "0x8301F2213c0eeD49a7E28Ae4c3e91722919B8B47";
const BUSD_HOLDER = "0x72253172CECFb70561b73FCF3Fa77A52a1D035c7";
const OLD_POLICY_FACET = "0x671B787AEDB6769972f081C6ee4978146F7D92E6";
const OLD_SETTER_FACET = "0xb619F7ce96c0a6E3F0b44e993f663522F79f294A";
const OLD_MARKET_FACET = "0x377c2E7CE08B4cc7033EDF678EE1224A290075Fd";
const COMPTROLLER_ADDRESS = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const USER = "0x4C45758bF15AF0714E4CC44C4EFd177e209C2890";
const ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";

const USDTFlashLoanTotalFeeMantissa = parseUnits("0.05", 18);
const USDTFlashLoanProtocolShareMantissa = parseUnits("0.01", 18);
const BUSDFlashLoanTotalFeeMantissa = parseUnits("0.05", 18);
const BUSDFlashLoanProtocolShareMantissa = parseUnits("0.01", 18);

type SetupProtocolFixture = {
  diamond: Diamond;
  admin: SignerWithAddress;
  oracle: FakeContract<PriceOracle>;
  accessControlManager: IAccessControlManagerV8;
  interestRateModel: FakeContract<InterestRateModel>;
  timeLockUser: SignerWithAddress;
  USDT: IERC20;
  vUSDT: VBep20Delegate;
  vUSDTProxy: VBep20Delegator;
  BUSD: IERC20;
  vBUSD: VBep20Delegate;
  vBUSDProxy: VBep20Delegator;
  flashLoanFacet: FlashLoanFacet;
  setterFacet: SetterFacet;
  marketFacet: MarketFacet;
};

async function deploy(): Promise<SetupProtocolFixture> {
  const [admin] = await ethers.getSigners();
  const oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
  oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));

  const accessControlManager = await ethers.getContractAt("IAccessControlManagerV8", ACM);

  const interestRateModel = await smock.fake<InterestRateModel>("InterestRateModel");
  interestRateModel.isInterestRateModel.returns(true);

  const timeLockUser = await initMainnetUser(TIMELOCK_ADDRESS, ethers.utils.parseUnits("2"));

  const unitrollerdiamond = await ethers.getContractAt("Diamond", COMPTROLLER_ADDRESS);
  // Get the diamond proxy (Unitroller/Comptroller address)
  const Diamond = await ethers.getContractFactory("Diamond");
  const diamond = await Diamond.deploy();
  await diamond.deployed();

  const setterFacetFactory = await ethers.getContractFactory("SetterFacet");
  const newSetterFacet = await setterFacetFactory.deploy();
  await newSetterFacet.deployed();

  // Get the existing Unitroller
  const unitroller = await Unitroller__factory.connect(COMPTROLLER_ADDRESS, timeLockUser);
  const policyFacetFactory = await ethers.getContractFactory("PolicyFacet");
  const newPolicyFacet = await policyFacetFactory.deploy();
  await newPolicyFacet.deployed();
  const addSetWhiteListFlashLoanAccountFunctionSignature = newSetterFacet.interface.getSighash(
    newSetterFacet.interface.functions["setWhiteListFlashLoanAccount(address,bool)"],
  );

  const marketFacetFactory = await ethers.getContractFactory("MarketFacet");
  const newMarketFacet = await marketFacetFactory.deploy();
  await newMarketFacet.deployed();

  const addSetIsBorrowAllowedSelector = newSetterFacet.interface.getSighash("setIsBorrowAllowed(uint96,address,bool)");

  const addGetEffectiveLtvFactorSelector = newMarketFacet.interface.getSighash(
    "getEffectiveLtvFactor(address,address,uint8)",
  );

  const existingPolicyFacetFunctions = await unitrollerdiamond.facetFunctionSelectors(OLD_POLICY_FACET);

  const flashloanFacetFactory = await ethers.getContractFactory("FlashLoanFacet");
  const newFlashLoanFacet = await flashloanFacetFactory.deploy();
  await newFlashLoanFacet.deployed();

  const addExecuteFlashLoanFunctionSignature = newFlashLoanFacet.interface.getSighash(
    newFlashLoanFacet.interface.functions["executeFlashLoan(address,address,address[],uint256[],bytes)"],
  );

  const existingSetterFacetFunctions = await unitrollerdiamond.facetFunctionSelectors(OLD_SETTER_FACET);
  const existingMarketFacetFunctions = await unitrollerdiamond.facetFunctionSelectors(OLD_MARKET_FACET);

  const cut = [
    {
      facetAddress: newFlashLoanFacet.address,
      action: FacetCutAction.Add,
      functionSelectors: [addExecuteFlashLoanFunctionSignature],
    },
    {
      facetAddress: newPolicyFacet.address,
      action: FacetCutAction.Replace,
      functionSelectors: existingPolicyFacetFunctions,
    },
    {
      facetAddress: newMarketFacet.address,
      action: FacetCutAction.Add,
      functionSelectors: [addGetEffectiveLtvFactorSelector],
    },
    {
      facetAddress: newMarketFacet.address,
      action: FacetCutAction.Replace,
      functionSelectors: existingMarketFacetFunctions,
    },
    {
      facetAddress: newSetterFacet.address,
      action: FacetCutAction.Add,
      functionSelectors: [addSetWhiteListFlashLoanAccountFunctionSignature, addSetIsBorrowAllowedSelector],
    },
    {
      facetAddress: newSetterFacet.address,
      action: FacetCutAction.Replace,
      functionSelectors: existingSetterFacetFunctions,
    },
  ];

  await unitroller.connect(timeLockUser)._setPendingImplementation(diamond.address);
  await diamond.connect(timeLockUser)._become(unitroller.address);

  const diamondCut = await ethers.getContractAt("IDiamondCut", unitroller.address);
  await diamondCut.connect(timeLockUser).diamondCut(cut);

  const flashLoanFacet = await ethers.getContractAt("FlashLoanFacet", COMPTROLLER_ADDRESS);
  const setterFacet = await ethers.getContractAt("SetterFacet", COMPTROLLER_ADDRESS);
  const marketFacet = await ethers.getContractAt("MarketFacet", COMPTROLLER_ADDRESS);

  const USDT = await ethers.getContractAt("VBep20", USDT_ADDRESS);
  const vUSDTProxy = VBep20Delegator__factory.connect(vUSDT_ADDRESS, timeLockUser);
  const vUSDTFactory = await ethers.getContractFactory("VBep20Delegate");
  const vusdtImplementation = await vUSDTFactory.deploy();
  await vusdtImplementation.deployed();

  await vUSDTProxy.connect(timeLockUser)._setImplementation(vusdtImplementation.address, true, "0x00");
  const vUSDT = VBep20Delegate__factory.connect(vUSDT_ADDRESS, timeLockUser);
  await vUSDT.setAccessControlManager(accessControlManager.address);

  const BUSD = await ethers.getContractAt("VBep20Delegate", BUSD_ADDRESS);
  const vBUSDProxy = VBep20Delegator__factory.connect(vBUSD_ADDRESS, timeLockUser);
  const vBUSDFactory = await ethers.getContractFactory("VBep20Delegate");
  const vbusdImplementation = await vBUSDFactory.deploy();
  await vbusdImplementation.deployed();

  await vBUSDProxy.connect(timeLockUser)._setImplementation(vbusdImplementation.address, true, "0x00");
  const vBUSD = VBep20Delegate__factory.connect(vBUSD_ADDRESS, timeLockUser);
  await vBUSD.setAccessControlManager(accessControlManager.address);

  await setterFacet.connect(timeLockUser)._setPriceOracle(oracle.address);

  // set updated lens
  const ComptrollerLens = await ethers.getContractFactory("ComptrollerLens");
  const lens = await ComptrollerLens.deploy();
  await setterFacet.connect(timeLockUser)._setComptrollerLens(lens.address);

  return {
    admin,
    oracle,
    accessControlManager,
    interestRateModel,
    timeLockUser,
    USDT,
    vUSDT,
    vUSDTProxy,
    BUSD,
    vBUSD,
    vBUSDProxy,
    diamond,
    flashLoanFacet,
    setterFacet,
    marketFacet,
  };
}

forking(64048894, () => {
  if (FORK_TESTNET) {
    describe("FlashLoan Fork Test", async () => {
      let usdtHolder: SignerWithAddress;
      let busdHolder: SignerWithAddress;
      let USDT: IERC20;
      let vUSDT: VBep20Delegate;
      let BUSD: IERC20;
      let vBUSD: VBep20Delegate;
      let mockFlashLoanReceiver: MockFlashLoanReceiver;
      let borrowDebtFlashLoanReceiver: BorrowDebtFlashLoanReceiver;
      let user: SignerWithAddress;
      let timeLockUser: SignerWithAddress;
      let flashLoanFacet: FlashLoanFacet;
      let setterFacet: SetterFacet;
      let marketFacet: MarketFacet;
      let accessControlManager: IAccessControlManagerV8;

      beforeEach(async () => {
        ({ marketFacet, setterFacet, flashLoanFacet, vUSDT, vBUSD, USDT, BUSD, timeLockUser, accessControlManager } =
          await loadFixture(deploy));

        usdtHolder = await initMainnetUser(USDT_HOLDER, parseUnits("2"));
        busdHolder = await initMainnetUser(BUSD_HOLDER, parseUnits("2"));

        user = await initMainnetUser(USER, parseUnits("2"));
        user = await initMainnetUser(USER, parseUnits("2"));

        accessControlManager = IAccessControlManagerV8__factory.connect(ACM, timeLockUser);

        const MockFlashLoanReceiver =
          await ethers.getContractFactory<MockFlashLoanReceiver__factory>("MockFlashLoanReceiver");
        mockFlashLoanReceiver = await MockFlashLoanReceiver.deploy(flashLoanFacet.address);

        const BorrowDebtFlashLoanReceiver =
          await ethers.getContractFactory<BorrowDebtFlashLoanReceiver__factory>("BorrowDebtFlashLoanReceiver");
        borrowDebtFlashLoanReceiver = await BorrowDebtFlashLoanReceiver.deploy(flashLoanFacet.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(setterFacet.address, "setWhiteListFlashLoanAccount(address,bool)", timeLockUser.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(vUSDT.address, "setFlashLoanEnabled(bool)", timeLockUser.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(vBUSD.address, "setFlashLoanEnabled(bool)", timeLockUser.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(vUSDT.address, "setFlashLoanFeeMantissa(uint256,uint256)", timeLockUser.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(vBUSD.address, "setFlashLoanFeeMantissa(uint256,uint256)", timeLockUser.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(
            setterFacet.address,
            "setCollateralFactor(address,uint256,uint256)",
            timeLockUser.address,
          );

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(setterFacet.address, "setIsBorrowAllowed(uint96,address,bool)", timeLockUser.address);

        // ADDED: Set supply caps to allow minting
        await setterFacet.connect(timeLockUser).setMarketSupplyCaps(
          [vUSDT.address, vBUSD.address],
          [ethers.constants.MaxUint256.div(2), ethers.constants.MaxUint256.div(2)], // Large supply caps
        );
        // ADDED: Set borrow caps to allow borrowing in mode 1
        await setterFacet.connect(timeLockUser).setMarketBorrowCaps(
          [vUSDT.address, vBUSD.address],
          [ethers.constants.MaxUint256.div(2), ethers.constants.MaxUint256.div(2)], // Large borrow caps
        );

        // Unpause mint actions
        await setterFacet.connect(timeLockUser)._setActionsPaused([vUSDT.address, vBUSD.address], [0], false); // 0 = mint action
        // ADDED: Unpause borrow actions (needed for mode 1)
        await setterFacet.connect(timeLockUser)._setActionsPaused([vUSDT.address, vBUSD.address], [2], false); // 2 = borrow action
        await setterFacet.connect(timeLockUser)._setActionsPaused([vUSDT.address, vBUSD.address], [7], false); // 7 = enterMarket action

        await setterFacet
          .connect(timeLockUser)
          ["setCollateralFactor(address,uint256,uint256)"](vUSDT.address, parseUnits("0.9", 18), parseUnits("0.9", 18));

        await setterFacet
          .connect(timeLockUser)
          ["setCollateralFactor(address,uint256,uint256)"](vBUSD.address, parseUnits("0.9", 18), parseUnits("0.9", 18));

        await setterFacet.connect(timeLockUser).setIsBorrowAllowed(0, vUSDT.address, true);
        await setterFacet.connect(timeLockUser).setIsBorrowAllowed(0, vBUSD.address, true);
      });

      it("Should revert if flashLoan not enabled", async () => {
        await setterFacet.connect(timeLockUser).setWhiteListFlashLoanAccount(user.address, true);
        // Attempt to execute a flashLoan when the flashLoan feature is disabled, which should revert
        await expect(
          flashLoanFacet.connect(user).executeFlashLoan(
            user.address,
            mockFlashLoanReceiver.address,
            [vUSDT.address, vBUSD.address],
            [BUSDFlashLoanTotalFeeMantissa, BUSDFlashLoanProtocolShareMantissa],
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        ).to.be.revertedWithCustomError(flashLoanFacet, "FlashLoanNotEnabled");
      });

      it("Should revert if asset and amount arrays are mismatched", async () => {
        // Attempt to execute a flashLoan with mismatched arrays for assets and amounts, which should revert
        await vUSDT.connect(timeLockUser).setFlashLoanEnabled(true);
        await vBUSD.connect(timeLockUser).setFlashLoanEnabled(true);

        await expect(
          flashLoanFacet.connect(user).executeFlashLoan(
            user.address,
            mockFlashLoanReceiver.address,
            [vUSDT.address], // Only one asset provided
            [BUSDFlashLoanTotalFeeMantissa, BUSDFlashLoanProtocolShareMantissa], // Two loan amounts provided
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        ).to.be.revertedWithCustomError(flashLoanFacet, "InvalidFlashLoanParams");
      });

      it("Should revert if receiver is zero address", async () => {
        // Attempt to execute a flashLoan with a zero address as the receiver, which should revert
        await vUSDT.connect(timeLockUser).setFlashLoanEnabled(true);
        await vBUSD.connect(timeLockUser).setFlashLoanEnabled(true);

        await expect(
          flashLoanFacet.connect(user).executeFlashLoan(
            user.address,
            AddressZero,
            [vUSDT.address, vBUSD.address], // Zero address as an asset, which is invalid
            [BUSDFlashLoanTotalFeeMantissa, BUSDFlashLoanProtocolShareMantissa],
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        ).to.be.revertedWith("can't be zero address");
      });

      it("Should revert if user is not whitelisted", async () => {
        await vUSDT.connect(timeLockUser).setFlashLoanEnabled(true);
        await vBUSD.connect(timeLockUser).setFlashLoanEnabled(true);

        await expect(
          flashLoanFacet.connect(user).executeFlashLoan(
            user.address,
            mockFlashLoanReceiver.address,
            [vUSDT.address, vBUSD.address], // Zero address as an asset, which is invalid
            [BUSDFlashLoanTotalFeeMantissa, BUSDFlashLoanProtocolShareMantissa],
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        )
          .to.be.revertedWithCustomError(flashLoanFacet, "SenderNotAuthorizedForFlashLoan")
          .withArgs(user.address);
      });

      it("Should revert if whitelisting is done by non-authorized account", async () => {
        await expect(setterFacet.connect(user).setWhiteListFlashLoanAccount(user.address, true)).to.be.revertedWith(
          "access denied",
        );
      });

      it("Should revert if VToken address is Invalid", async () => {
        await vUSDT.connect(timeLockUser).setFlashLoanEnabled(true);
        await vBUSD.connect(timeLockUser).setFlashLoanEnabled(true);

        await expect(
          flashLoanFacet.connect(user).executeFlashLoan(
            user.address,
            mockFlashLoanReceiver.address,
            [AddressZero, vBUSD.address],
            [BUSDFlashLoanTotalFeeMantissa, BUSDFlashLoanProtocolShareMantissa],
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        ).to.be.reverted;
      });

      it("Should be able to do flashLoan for USDT & ETH", async () => {
        await setterFacet.connect(timeLockUser).setWhiteListFlashLoanAccount(user.address, true);
        await marketFacet.connect(user).updateDelegate(user.address, true);

        // Transfer USDT and BUSD tokens to Alice to set up initial balances
        await USDT.connect(usdtHolder).transfer(vUSDT.address, parseUnits("100", 6));
        await USDT.connect(usdtHolder).transfer(mockFlashLoanReceiver.address, parseUnits("50", 6));
        await BUSD.connect(busdHolder).transfer(vBUSD.address, parseUnits("50", 18));
        await BUSD.connect(busdHolder).transfer(mockFlashLoanReceiver.address, parseUnits("5", 18));

        // Mine blocks as required by the test setup
        await mine(blocksToMine);

        const balanceBeforeUSDT = await USDT.balanceOf(vUSDT.address);
        const balanceBeforeBUSD = await BUSD.balanceOf(vBUSD.address);

        // Enable the flashLoan and set fee mantissa on vUSDT and vBUSD contracts
        await vUSDT.connect(timeLockUser).setFlashLoanEnabled(true);
        await vBUSD.connect(timeLockUser).setFlashLoanEnabled(true);

        await vUSDT
          .connect(timeLockUser)
          .setFlashLoanFeeMantissa(USDTFlashLoanTotalFeeMantissa, USDTFlashLoanProtocolShareMantissa);
        await vBUSD
          .connect(timeLockUser)
          .setFlashLoanFeeMantissa(BUSDFlashLoanTotalFeeMantissa, BUSDFlashLoanProtocolShareMantissa);

        // Define the actual flash loan amounts
        const usdtFlashLoanAmount = parseUnits("10", 6); // 10 USDT
        const busdFlashLoanAmount = parseUnits("10", 18); // 10 BUSD

        // user initiates a flashLoan of USDT and BUSD through the flashLoanFacet contract
        await flashLoanFacet.connect(user).executeFlashLoan(
          user.address,
          mockFlashLoanReceiver.address,
          [vUSDT.address, vBUSD.address],
          [usdtFlashLoanAmount, busdFlashLoanAmount],
          ethers.utils.formatBytes32String(""), // Add the missing `param` argument
        );

        // Record USDT and BUSD balances in vUSDT and vBUSD contracts after flashLoan
        const balanceAfterUSDT = await USDT.balanceOf(vUSDT.address);
        const balanceAfterBUSD = await BUSD.balanceOf(vBUSD.address);

        const BUSDFlashLoanFee = busdFlashLoanAmount.mul(BUSDFlashLoanTotalFeeMantissa).div(parseUnits("1", 18));
        const USDTFlashLoanFee = usdtFlashLoanAmount.mul(USDTFlashLoanTotalFeeMantissa).div(parseUnits("1", 18));
        const USDTFlashLoanProtocolFeeMantissa = USDTFlashLoanFee.mul(USDTFlashLoanProtocolShareMantissa).div(
          parseUnits("1", 18),
        );
        const BUSDFlashLoanProtocolFeeMantissa = BUSDFlashLoanFee.mul(BUSDFlashLoanProtocolShareMantissa).div(
          parseUnits("1", 18),
        );
        const remainderBUSD = BUSDFlashLoanFee.sub(BUSDFlashLoanProtocolFeeMantissa);
        const remainderUSDT = USDTFlashLoanFee.sub(USDTFlashLoanProtocolFeeMantissa);

        // Validate that USDT and BUSD balances in the contracts increased, confirming repayment plus fees
        expect(balanceAfterBUSD).to.be.closeTo(balanceBeforeBUSD.add(remainderBUSD), 1);
        expect(balanceAfterUSDT).to.be.closeTo(balanceBeforeUSDT.add(remainderUSDT), 1);
      });

      it("Should be able to do flashLoan for USDT & BUSD with debt position", async () => {
        await setterFacet.connect(timeLockUser).setWhiteListFlashLoanAccount(user.address, true);
        await marketFacet.connect(user).updateDelegate(user.address, true);

        // Transfer USDT and BUSD tokens to provide liquidity to vTokens
        await USDT.connect(usdtHolder).transfer(vUSDT.address, parseUnits("100", 6));
        await BUSD.connect(busdHolder).transfer(vBUSD.address, parseUnits("100", 18));

        // Give user tokens to provide as collateral (needed for borrowing in mode 1)
        await USDT.connect(usdtHolder).transfer(user.address, parseUnits("100", 6));
        await BUSD.connect(busdHolder).transfer(user.address, parseUnits("100", 18));

        // User approves and mints collateral
        await USDT.connect(user).approve(vUSDT.address, parseUnits("80", 6));
        await BUSD.connect(user).approve(vBUSD.address, parseUnits("80", 18));

        await vUSDT.connect(user).mint(parseUnits("75", 6)); // User supplies USDT as collateral
        await vBUSD.connect(user).mint(parseUnits("75", 18)); // User supplies BUSD as collateral

        // Mine blocks as required by the test setup
        await mine(blocksToMine);

        // Get initial balances and borrow positions
        const userBorrowBalanceBeforeUSDT = await vUSDT.borrowBalanceStored(user.address);
        const userBorrowBalanceBeforeBUSD = await vBUSD.borrowBalanceStored(user.address);

        // Enable the flashLoan and set fee mantissa on vUSDT and vBUSD contracts
        await vUSDT.connect(timeLockUser).setFlashLoanEnabled(true);
        await vBUSD.connect(timeLockUser).setFlashLoanEnabled(true);

        await marketFacet.connect(user).enterMarkets([vUSDT.address, vBUSD.address]);

        await vUSDT
          .connect(timeLockUser)
          .setFlashLoanFeeMantissa(USDTFlashLoanTotalFeeMantissa, USDTFlashLoanProtocolShareMantissa);
        await vBUSD
          .connect(timeLockUser)
          .setFlashLoanFeeMantissa(BUSDFlashLoanTotalFeeMantissa, BUSDFlashLoanProtocolShareMantissa);

        // Define the flash loan amounts (smaller amounts to ensure borrowing limits)
        const usdtFlashLoanAmount = parseUnits("5", 6); // 5 USDT
        const busdFlashLoanAmount = parseUnits("5", 18); // 5 BUSD

        // User initiates a flashLoan with mode = 1 (debt position) for both tokens
        const tx = await flashLoanFacet.connect(user).executeFlashLoan(
          user.address,
          borrowDebtFlashLoanReceiver.address, // receiver
          [vUSDT.address, vBUSD.address], // vTokens
          [usdtFlashLoanAmount, busdFlashLoanAmount], // amounts
          ethers.utils.formatBytes32String(""), // param
        );

        // Record balances after flashLoan
        const userBorrowBalanceAfterUSDT = await vUSDT.borrowBalanceStored(user.address);
        const userBorrowBalanceAfterBUSD = await vBUSD.borrowBalanceStored(user.address);

        // Verify debt positions were created
        expect(userBorrowBalanceAfterUSDT).to.be.gt(userBorrowBalanceBeforeUSDT);
        expect(userBorrowBalanceAfterBUSD).to.be.gt(userBorrowBalanceBeforeBUSD);

        // Verify FlashLoanExecuted event was emitted
        await expect(tx)
          .to.emit(flashLoanFacet, "FlashLoanExecuted")
          .withArgs(
            borrowDebtFlashLoanReceiver.address,
            [vUSDT.address, vBUSD.address],
            [usdtFlashLoanAmount, busdFlashLoanAmount],
          );
      });
    });
  }
});
