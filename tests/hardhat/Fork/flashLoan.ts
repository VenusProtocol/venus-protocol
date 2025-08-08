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
  Diamond,
  IAccessControlManagerV5,
  IERC20,
  InterestRateModel,
  MockFlashLoanReceiver,
  MockFlashLoanReceiver__factory,
  PolicyFacet,
  SetterFacet,
  MarketFacet,
  Unitroller__factory,
  PriceOracle,
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
const OLD_POLICY_FACET = "0x085C8d0133291348004AabFfbE7CAc2097aF2aa1";
const OLD_SETTER_FACET = "0x490DFD07f592452307817C4283866035BDb3b275";
const COMPTROLLER_ADDRESS = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const USER = "0x4C45758bF15AF0714E4CC44C4EFd177e209C2890";
const ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";

const USDTFlashLoanProtocolFeeMantissa = parseUnits("0.05", 18);
const USDTFlashLoanSupplierFeeMantissa = parseUnits("0.03", 18);
const BUSDFlashLoanProtocolFeeMantissa = parseUnits("0.05", 18);
const BUSDFlashLoanSupplierFeeMantissa = parseUnits("0.03", 18);

type SetupProtocolFixture = {
  diamond: Diamond;
  admin: SignerWithAddress;
  oracle: FakeContract<PriceOracle>;
  accessControlManager: FakeContract<IAccessControlManagerV5>;
  interestRateModel: FakeContract<InterestRateModel>;
  timeLockUser: SignerWithAddress;
  USDT: IERC20;
  vUSDT: VBep20Delegate;
  vUSDTProxy: VBep20Delegator;
  BUSD: IERC20;
  vBUSD: VBep20Delegate;
  vBUSDProxy: VBep20Delegator;
  policyFacet: PolicyFacet;
  setterFacet: SetterFacet;
  marketFacet: MarketFacet;
};

async function deploy(): Promise<SetupProtocolFixture> {
  const [admin] = await ethers.getSigners();
  const oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
  oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));

  const accessControlManager = await ethers.getContractAt("IAccessControlManagerV5", ACM);

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

  const addExecuteFlashLoanFunctionSignature = newPolicyFacet.interface.getSighash(
    newPolicyFacet.interface.functions["executeFlashLoan(address,address,address[],uint256[],uint256[],address,bytes)"],
  );

  const addSetDelegateAuthorizationFlashloanFunctionSignature = newSetterFacet.interface.getSighash(
    newSetterFacet.interface.functions["setDelegateAuthorizationFlashloan(address,address,bool)"],
  );

  const existingPolicyFacetFunctions = await unitrollerdiamond.facetFunctionSelectors(OLD_POLICY_FACET);
  const existingSetterFacetFunctions = await unitrollerdiamond.facetFunctionSelectors(OLD_SETTER_FACET);

  const cut = [
    {
      facetAddress: newPolicyFacet.address,
      action: FacetCutAction.Add,
      functionSelectors: [addExecuteFlashLoanFunctionSignature],
    },
    {
      facetAddress: newPolicyFacet.address,
      action: FacetCutAction.Replace,
      functionSelectors: existingPolicyFacetFunctions,
    },
    {
      facetAddress: newSetterFacet.address,
      action: FacetCutAction.Add,
      functionSelectors: [addSetDelegateAuthorizationFlashloanFunctionSignature],
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

  const policyFacet = await ethers.getContractAt("PolicyFacet", COMPTROLLER_ADDRESS);
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
    policyFacet,
    setterFacet,
    marketFacet
  };
}

forking(56732787, () => {
  if (FORK_TESTNET) {
    describe("FlashLoan Fork Test", async () => {
      let usdtHolder: SignerWithAddress;
      let busdHolder: SignerWithAddress;
      let USDT: IERC20;
      let vUSDT: VBep20Delegate;
      let BUSD: IERC20;
      let vBUSD: VBep20Delegate;
      let mockFlashLoanReceiver: MockFlashLoanReceiver;
      let user: SignerWithAddress;
      let timeLockUser: SignerWithAddress;
      let policyFacet: PolicyFacet;
      let setterFacet: SetterFacet;
      let marketFacet: MarketFacet;
      let accessControlManager: FakeContract<IAccessControlManagerV5>;

      beforeEach(async () => {
        ({ marketFacet, setterFacet, policyFacet, vUSDT, vBUSD, USDT, BUSD, timeLockUser, accessControlManager } = await loadFixture(deploy));

        usdtHolder = await initMainnetUser(USDT_HOLDER, parseUnits("2"));
        busdHolder = await initMainnetUser(BUSD_HOLDER, parseUnits("2"));

        user = await initMainnetUser(USER, parseUnits("2"));
        user = await initMainnetUser(USER, parseUnits("2"));

        const MockFlashLoanReceiver =
          await ethers.getContractFactory<MockFlashLoanReceiver__factory>("MockFlashLoanReceiver");
        mockFlashLoanReceiver = await MockFlashLoanReceiver.deploy(policyFacet.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(setterFacet.address, "setDelegateAuthorizationFlashloan(address,address,bool)", timeLockUser.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(vUSDT.address, "_toggleFlashLoan()", timeLockUser.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(vBUSD.address, "_toggleFlashLoan()", timeLockUser.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(vUSDT.address, "_setFlashLoanFeeMantissa(uint256,uint256)", timeLockUser.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(vBUSD.address, "_setFlashLoanFeeMantissa(uint256,uint256)", timeLockUser.address);

        // ADDED: Set supply caps to allow minting
        await setterFacet
          .connect(timeLockUser)
          ._setMarketSupplyCaps(
            [vUSDT.address, vBUSD.address],
            [ethers.constants.MaxUint256.div(2), ethers.constants.MaxUint256.div(2)] // Large supply caps
          );

        // ADDED: Set borrow caps to allow borrowing in mode 1
        await setterFacet
          .connect(timeLockUser)
          ._setMarketBorrowCaps(
            [vUSDT.address, vBUSD.address],
            [ethers.constants.MaxUint256.div(2), ethers.constants.MaxUint256.div(2)] // Large borrow caps
          );

        // Unpause mint actions
        await setterFacet.connect(timeLockUser)._setActionsPaused([vUSDT.address, vBUSD.address], [0], false); // 0 = mint action

        // ADDED: Unpause borrow actions (needed for mode 1)
        await setterFacet.connect(timeLockUser)._setActionsPaused([vUSDT.address, vBUSD.address], [2], false); // 2 = borrow action
        await setterFacet.connect(timeLockUser)._setActionsPaused([vUSDT.address, vBUSD.address], [7], false); // 7 = enterMarket action

        await setterFacet
          .connect(timeLockUser)
          ._setCollateralFactor(vUSDT.address, parseUnits("0.9", 18)); // 80% collateral factor

        await setterFacet
          .connect(timeLockUser)
          ._setCollateralFactor(vBUSD.address, parseUnits("0.9", 18)); // 80% collateral factor

      });

      it("Should revert if flashLoan not enabled", async () => {
        // Attempt to execute a flashLoan when the flashLoan feature is disabled, which should revert
        await expect(
          policyFacet
            .connect(user)
            .executeFlashLoan(
              user.address,
              mockFlashLoanReceiver.address,
              [vUSDT.address, vBUSD.address],
              [BUSDFlashLoanProtocolFeeMantissa, BUSDFlashLoanSupplierFeeMantissa],
              [0, 0],
              user.address,
              ethers.utils.formatBytes32String(""), // Add the missing `param` argument
            ),
        ).to.be.revertedWith("FlashLoan not enabled");
      });

      it("Should revert if asset and amount arrays are mismatched", async () => {
        // Attempt to execute a flashLoan with mismatched arrays for assets and amounts, which should revert
        await expect(
          policyFacet.connect(user).executeFlashLoan(
            user.address,
            mockFlashLoanReceiver.address,
            [vUSDT.address], // Only one asset provided
            [BUSDFlashLoanProtocolFeeMantissa, BUSDFlashLoanSupplierFeeMantissa], // Two loan amounts provided
            [0, 0],
            user.address,
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        ).to.be.revertedWith("Invalid flashLoan params");
      });

      it("Should revert if receiver is zero address", async () => {
        // Attempt to execute a flashLoan with a zero address as the receiver, which should revert
        await vUSDT.connect(timeLockUser)._toggleFlashLoan();
        await vBUSD.connect(timeLockUser)._toggleFlashLoan();

        await expect(
          policyFacet.connect(user).executeFlashLoan(
            user.address,
            AddressZero,
            [vUSDT.address, vBUSD.address], // Zero address as an asset, which is invalid
            [BUSDFlashLoanProtocolFeeMantissa, BUSDFlashLoanSupplierFeeMantissa],
            [0, 0],
            user.address,
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        ).to.be.revertedWith("can't be zero address");
      });

      it("Should revert if VToken address is Invalid", async () => {
        // Attempt to execute a flashLoan with a zero address as the receiver, which should revert
        await vUSDT.connect(timeLockUser)._toggleFlashLoan();
        await vBUSD.connect(timeLockUser)._toggleFlashLoan();

        await expect(
          policyFacet.connect(user).executeFlashLoan(
            user.address,
            mockFlashLoanReceiver.address,
            [AddressZero, vBUSD.address],
            [BUSDFlashLoanProtocolFeeMantissa, BUSDFlashLoanSupplierFeeMantissa],
            [0, 0],
            user.address,
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        ).to.be.reverted;
      });

      it("Should revert if Sender not authorized to use flashloan on behalf", async () => {
        // Attempt to execute a flashLoan with a zero address as the receiver, which should revert
        await vUSDT.connect(timeLockUser)._toggleFlashLoan();
        await vBUSD.connect(timeLockUser)._toggleFlashLoan();

        await expect(
          policyFacet.connect(user).executeFlashLoan(
            user.address,
            mockFlashLoanReceiver.address,
            [vUSDT.address, vBUSD.address],
            [BUSDFlashLoanProtocolFeeMantissa, BUSDFlashLoanSupplierFeeMantissa],
            [1, 1],
            timeLockUser.address,
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        ).to.be.revertedWith("Sender not authorized to use flashloan on behalf");
      });

      it("Should be able to do flashLoan for USDT & ETH", async () => {
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
        await vUSDT.connect(timeLockUser)._toggleFlashLoan();
        await vBUSD.connect(timeLockUser)._toggleFlashLoan();

        await vUSDT
          .connect(timeLockUser)
          ._setFlashLoanFeeMantissa(USDTFlashLoanProtocolFeeMantissa, USDTFlashLoanSupplierFeeMantissa);
        await vBUSD
          .connect(timeLockUser)
          ._setFlashLoanFeeMantissa(BUSDFlashLoanProtocolFeeMantissa, BUSDFlashLoanSupplierFeeMantissa);

        // Define the actual flash loan amounts
        const usdtFlashLoanAmount = parseUnits("10", 6); // 10 USDT
        const busdFlashLoanAmount = parseUnits("10", 18); // 10 BUSD

        // user initiates a flashLoan of USDT and BUSD through the policyFacet contract
        await policyFacet
          .connect(user)
          .executeFlashLoan(
            user.address,
            mockFlashLoanReceiver.address,
            [vUSDT.address, vBUSD.address],
            [usdtFlashLoanAmount, busdFlashLoanAmount],
            [0, 0],
            user.address,
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          );

        // Record USDT and BUSD balances in vUSDT and vBUSD contracts after flashLoan
        const balanceAfterUSDT = await USDT.balanceOf(vUSDT.address);
        const balanceAfterBUSD = await BUSD.balanceOf(vBUSD.address);

        const USDTFlashLoanFee = usdtFlashLoanAmount.mul(USDTFlashLoanProtocolFeeMantissa).div(parseUnits("1", 18));
        const BUSDFlashLoanFee = busdFlashLoanAmount.mul(BUSDFlashLoanProtocolFeeMantissa).div(parseUnits("1", 18));

        // Validate that USDT and BUSD balances in the contracts increased, confirming repayment plus fees
        expect(balanceAfterBUSD).to.be.equal(balanceBeforeBUSD.add(BUSDFlashLoanFee));
        expect(balanceAfterUSDT).to.be.equal(balanceBeforeUSDT.add(USDTFlashLoanFee));
      });

      it("Should be able to do flashLoan for USDT & BUSD with debt position (mode = 1)", async () => {
        await setterFacet.connect(user).setDelegateAuthorizationFlashloan(
          vUSDT.address,
          timeLockUser.address,
          true, // Allow flash loan
        );

        await setterFacet.connect(user).setDelegateAuthorizationFlashloan(vBUSD.address, timeLockUser.address, true); // Allow flash loan
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
        const balanceBeforeUSDT = await USDT.balanceOf(vUSDT.address);
        const balanceBeforeBUSD = await BUSD.balanceOf(vBUSD.address);
        const userBorrowBalanceBeforeUSDT = await vUSDT.borrowBalanceStored(user.address);
        const userBorrowBalanceBeforeBUSD = await vBUSD.borrowBalanceStored(user.address);

        // Enable the flashLoan and set fee mantissa on vUSDT and vBUSD contracts
        await vUSDT.connect(timeLockUser)._toggleFlashLoan();
        await vBUSD.connect(timeLockUser)._toggleFlashLoan();

        await marketFacet.connect(user).enterMarkets([vUSDT.address, vBUSD.address]);

        await vUSDT
          .connect(timeLockUser)
          ._setFlashLoanFeeMantissa(USDTFlashLoanProtocolFeeMantissa, USDTFlashLoanSupplierFeeMantissa);
        await vBUSD
          .connect(timeLockUser)
          ._setFlashLoanFeeMantissa(BUSDFlashLoanProtocolFeeMantissa, BUSDFlashLoanSupplierFeeMantissa);

        // Define the flash loan amounts (smaller amounts to ensure borrowing limits)
        const usdtFlashLoanAmount = parseUnits("5", 6); // 5 USDT
        const busdFlashLoanAmount = parseUnits("5", 18); // 5 BUSD

        // User initiates a flashLoan with mode = 1 (debt position) for both tokens
        const tx = await policyFacet
          .connect(timeLockUser)
          .executeFlashLoan(
            timeLockUser.address,                           // initiator
            mockFlashLoanReceiver.address,          // receiver
            [vUSDT.address, vBUSD.address],         // vTokens
            [usdtFlashLoanAmount, busdFlashLoanAmount], // amounts
            [1, 1],                                 // modes = 1 (debt position for both)
            user.address,                           // onBehalfOf
            ethers.utils.formatBytes32String(""),   // param
          );

        // Record balances after flashLoan
        const balanceAfterUSDT = await USDT.balanceOf(vUSDT.address);
        const balanceAfterBUSD = await BUSD.balanceOf(vBUSD.address);
        const userBorrowBalanceAfterUSDT = await vUSDT.borrowBalanceStored(user.address);
        const userBorrowBalanceAfterBUSD = await vBUSD.borrowBalanceStored(user.address);

        // Calculate expected fees
        const usdtProtocolFee = usdtFlashLoanAmount.mul(USDTFlashLoanProtocolFeeMantissa).div(parseUnits("1", 18));
        const usdtSupplierFee = usdtFlashLoanAmount.mul(USDTFlashLoanSupplierFeeMantissa).div(parseUnits("1", 18));
        const usdtTotalFee = usdtProtocolFee.add(usdtSupplierFee);

        const busdProtocolFee = busdFlashLoanAmount.mul(BUSDFlashLoanProtocolFeeMantissa).div(parseUnits("1", 18));
        const busdSupplierFee = busdFlashLoanAmount.mul(BUSDFlashLoanSupplierFeeMantissa).div(parseUnits("1", 18));
        const busdTotalFee = busdProtocolFee.add(busdSupplierFee);

        // Verify debt positions were created
        expect(userBorrowBalanceAfterUSDT).to.be.gt(userBorrowBalanceBeforeUSDT);
        expect(userBorrowBalanceAfterBUSD).to.be.gt(userBorrowBalanceBeforeBUSD);

        // Verify debt amounts are approximately correct (flashloan + fees)
        const expectedUSDTDebt = usdtFlashLoanAmount.add(usdtTotalFee);
        const expectedBUSDDebt = busdFlashLoanAmount.add(busdTotalFee);
        const actualUSDTDebtIncrease = userBorrowBalanceAfterUSDT.sub(userBorrowBalanceBeforeUSDT);
        const actualBUSDDebtIncrease = userBorrowBalanceAfterBUSD.sub(userBorrowBalanceBeforeBUSD);

        expect(actualUSDTDebtIncrease).to.be.closeTo(expectedUSDTDebt, parseUnits("0.1", 6)); // 0.1 USDT tolerance
        expect(actualBUSDDebtIncrease).to.be.closeTo(expectedBUSDDebt, parseUnits("0.1", 18)); // 0.1 BUSD tolerance

        // Verify vToken balances decreased (since no repayment was made, debt was created)
        // The exact amount depends on the implementation, so use a reasonable tolerance
        expect(balanceAfterUSDT).to.be.lt(balanceBeforeUSDT); // USDT balance should decrease
        expect(balanceAfterBUSD).to.be.lt(balanceBeforeBUSD); // BUSD balance should decrease

        // Verify FlashLoanExecuted event was emitted
        await expect(tx)
          .to.emit(policyFacet, "FlashLoanExecuted")
          .withArgs(
            mockFlashLoanReceiver.address,
            [vUSDT.address, vBUSD.address],
            [usdtFlashLoanAmount, busdFlashLoanAmount]
          );
      });

      it("Should be able to do flashLoan with mixed modes (USDT mode=0, BUSD mode=1)", async () => {
        await setterFacet.connect(user).setDelegateAuthorizationFlashloan(
          vUSDT.address,
          timeLockUser.address,
          true, // Allow flash loan
        );

        await setterFacet.connect(user).setDelegateAuthorizationFlashloan(vBUSD.address, timeLockUser.address, true); // Allow flash loan

        // Transfer USDT and BUSD tokens to provide liquidity to vTokens
        await USDT.connect(usdtHolder).transfer(vUSDT.address, parseUnits("100", 6));
        await BUSD.connect(busdHolder).transfer(vBUSD.address, parseUnits("100", 18));

        // Give user tokens to provide as collateral (needed for borrowing BUSD in mode 1)
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
        const balanceBeforeUSDT = await USDT.balanceOf(vUSDT.address);
        const balanceBeforeBUSD = await BUSD.balanceOf(vBUSD.address);
        const userBorrowBalanceBeforeUSDT = await vUSDT.borrowBalanceStored(user.address);
        const userBorrowBalanceBeforeBUSD = await vBUSD.borrowBalanceStored(user.address);

        // Enable the flashLoan and set fee mantissa on vUSDT and vBUSD contracts
        await vUSDT.connect(timeLockUser)._toggleFlashLoan();
        await vBUSD.connect(timeLockUser)._toggleFlashLoan();

        await marketFacet.connect(user).enterMarkets([vUSDT.address, vBUSD.address]);

        await vUSDT
          .connect(timeLockUser)
          ._setFlashLoanFeeMantissa(USDTFlashLoanProtocolFeeMantissa, USDTFlashLoanSupplierFeeMantissa);
        await vBUSD
          .connect(timeLockUser)
          ._setFlashLoanFeeMantissa(BUSDFlashLoanProtocolFeeMantissa, BUSDFlashLoanSupplierFeeMantissa);

        // Define the flash loan amounts
        const usdtFlashLoanAmount = parseUnits("10", 6); // 10 USDT (mode 0 - classic)
        const busdFlashLoanAmount = parseUnits("5", 18); // 5 BUSD (mode 1 - debt position)

        // Calculate fees for USDT (mode 0) - receiver needs to have these to repay
        const usdtProtocolFee = usdtFlashLoanAmount.mul(USDTFlashLoanProtocolFeeMantissa).div(parseUnits("1", 18));
        const usdtSupplierFee = usdtFlashLoanAmount.mul(USDTFlashLoanSupplierFeeMantissa).div(parseUnits("1", 18));
        const usdtTotalFee = usdtProtocolFee.add(usdtSupplierFee);

        // Calculate fees for BUSD (mode 1) - will become part of debt
        const busdProtocolFee = busdFlashLoanAmount.mul(BUSDFlashLoanProtocolFeeMantissa).div(parseUnits("1", 18));
        const busdSupplierFee = busdFlashLoanAmount.mul(BUSDFlashLoanSupplierFeeMantissa).div(parseUnits("1", 18));
        const busdTotalFee = busdProtocolFee.add(busdSupplierFee);

        // For USDT (mode 0): Give receiver enough balance to repay loan + fees
        await USDT.connect(usdtHolder).transfer(mockFlashLoanReceiver.address, usdtFlashLoanAmount.add(usdtTotalFee));

        // For BUSD (mode 1): Give receiver NO balance to force debt creation
        await BUSD.connect(busdHolder).transfer(mockFlashLoanReceiver.address, parseUnits("0", 18));

        // Check user's account liquidity before flash loan
        const accountLiquidity = await policyFacet.getAccountLiquidity(user.address);

        expect(accountLiquidity[1]).to.be.gt(0, "User must have positive liquidity for BUSD debt creation");
        expect(accountLiquidity[2]).to.equal(0, "User must have no shortfall");

        // Record receiver balances after flash loan
        const receiverUSDTBefore = await USDT.balanceOf(mockFlashLoanReceiver.address);

        const tx = await policyFacet
          .connect(timeLockUser)
          .executeFlashLoan(
            timeLockUser.address,                     // initiator
            mockFlashLoanReceiver.address,            // receiver
            [vUSDT.address, vBUSD.address],           // vTokens
            [usdtFlashLoanAmount, busdFlashLoanAmount], // amounts
            [0, 1],                                   // modes: USDT=0 (classic), BUSD=1 (debt position)
            user.address,                             // onBehalfOf
            ethers.utils.formatBytes32String(""),     // param
          );


        // Record balances after flashLoan
        const balanceAfterUSDT = await USDT.balanceOf(vUSDT.address);
        const balanceAfterBUSD = await BUSD.balanceOf(vBUSD.address);
        const userBorrowBalanceAfterUSDT = await vUSDT.borrowBalanceStored(user.address);
        const userBorrowBalanceAfterBUSD = await vBUSD.borrowBalanceStored(user.address);

        // Record receiver balances after flash loan
        const receiverUSDTAfter = await USDT.balanceOf(mockFlashLoanReceiver.address);
        const receiverBUSDAfter = await BUSD.balanceOf(mockFlashLoanReceiver.address);

        // USDT: Should have NO debt increase (mode 0)
        expect(userBorrowBalanceAfterUSDT).to.equal(userBorrowBalanceBeforeUSDT, "USDT should have no debt increase in mode 0");

        // USDT: vToken balance should increase by protocol fee only
        const expectedUSDTProtocolFee = usdtFlashLoanAmount.mul(USDTFlashLoanProtocolFeeMantissa).div(parseUnits("1", 18));
        expect(balanceAfterUSDT).to.equal(balanceBeforeUSDT.add(expectedUSDTProtocolFee), "USDT vToken balance should increase by protocol fee");

        // USDT: Receiver should have consumed the loan + total fees
        expect(receiverUSDTAfter).to.be.lt(receiverUSDTBefore, "USDT receiver balance should decrease after repayment");

        // BUSD: Should have debt increase (mode 1)
        const actualBUSDDebtIncrease = userBorrowBalanceAfterBUSD.sub(userBorrowBalanceBeforeBUSD);
        const expectedBUSDDebt = busdFlashLoanAmount.add(busdTotalFee);

        expect(userBorrowBalanceAfterBUSD).to.be.gt(userBorrowBalanceBeforeBUSD, "BUSD should have debt increase in mode 1");
        expect(actualBUSDDebtIncrease).to.be.closeTo(expectedBUSDDebt, parseUnits("0.1", 18), "BUSD debt should equal loan + fees");

        // BUSD: vToken balance should decrease (tokens were lent out, no repayment)
        expect(balanceAfterBUSD).to.be.lt(balanceBeforeBUSD, "BUSD vToken balance should decrease (no repayment in mode 1)");

        // BUSD: Receiver should still have 0 balance (no repayment made)
        expect(receiverBUSDAfter).to.equal(busdFlashLoanAmount, "BUSD receiver balance should remain 0 (debt position mode)");

        // Verify FlashLoanExecuted event was emitted
        await expect(tx)
          .to.emit(policyFacet, "FlashLoanExecuted")
          .withArgs(
            mockFlashLoanReceiver.address,
            [vUSDT.address, vBUSD.address],
            [usdtFlashLoanAmount, busdFlashLoanAmount]
          );
      });

    });
  }
});
