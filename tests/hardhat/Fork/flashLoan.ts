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
const COMPTROLLER_ADDRESS = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const USER = "0x4C45758bF15AF0714E4CC44C4EFd177e209C2890";
const ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";

const USDTFlashLoanProtocolFeeMantissa = parseUnits("0.05", 6);
const USDTFlashLoanSupplierFeeMantissa = parseUnits("0.03", 18);
const BUSDFlashLoanProtocolFeeMantissa = parseUnits("20", 6);
const BUSDFlashLoanSupplierFeeMantissa = parseUnits("20", 18);

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

  // Get the existing Unitroller
  const unitroller = await Unitroller__factory.connect(COMPTROLLER_ADDRESS, timeLockUser);

  const policyFacetFactory = await ethers.getContractFactory("PolicyFacet");
  const newPolicyFacet = await policyFacetFactory.deploy();
  await newPolicyFacet.deployed();

  const setterFacetFactory = await ethers.getContractFactory("SetterFacet");
  const newSetterFacet = await setterFacetFactory.deploy();
  await newSetterFacet.deployed();

  const addExecuteFlashLoanFunctionSignature = newPolicyFacet.interface.getSighash(
    newPolicyFacet.interface.functions["executeFlashLoan(address,address,address[],uint256[],bytes)"],
  );

  const addSetWhiteListFlashLoanAccountFunctionSignature = newSetterFacet.interface.getSighash(
    newSetterFacet.interface.functions["setWhiteListFlashLoanAccount(address,bool)"],
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
      functionSelectors: [addSetWhiteListFlashLoanAccountFunctionSignature],
    },
    {
      facetAddress: newSetterFacet.address,
      action: FacetCutAction.Replace,
      functionSelectors: existingSetterFacetFunctions,
    },
  ];

  await unitroller.connect(timeLockUser)._setPendingImplementation(diamond.address);
  await diamond.connect(timeLockUser)._become(unitroller.address);

  // upgrade diamond with facets
  const diamondCut = await ethers.getContractAt("IDiamondCut", unitroller.address);
  await diamondCut.connect(timeLockUser).diamondCut(cut);

  const policyFacet = await ethers.getContractAt("PolicyFacet", COMPTROLLER_ADDRESS);
  const setterFacet = await ethers.getContractAt("SetterFacet", COMPTROLLER_ADDRESS);

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
  };
}

forking(59918472, () => {
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
      let accessControlManager: FakeContract<IAccessControlManagerV5>;

      beforeEach(async () => {
        ({ setterFacet, policyFacet, vUSDT, vBUSD, USDT, BUSD, timeLockUser, accessControlManager } =
          await loadFixture(deploy));

        usdtHolder = await initMainnetUser(USDT_HOLDER, parseUnits("2"));
        busdHolder = await initMainnetUser(BUSD_HOLDER, parseUnits("2"));

        user = await initMainnetUser(USER, parseUnits("2"));

        const MockFlashLoanReceiver =
          await ethers.getContractFactory<MockFlashLoanReceiver__factory>("MockFlashLoanReceiver");
        mockFlashLoanReceiver = await MockFlashLoanReceiver.deploy(policyFacet.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(setterFacet.address, "setWhiteListFlashLoanAccount(address,bool)", timeLockUser.address);

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
      });

      it("Should revert if flashLoan not enabled", async () => {
        await setterFacet.connect(timeLockUser).setWhiteListFlashLoanAccount(user.address, true);
        // Attempt to execute a flashLoan when the flashLoan feature is disabled, which should revert
        await expect(
          policyFacet.connect(user).executeFlashLoan(
            user.address,
            mockFlashLoanReceiver.address,
            [vUSDT.address, vBUSD.address],
            [BUSDFlashLoanProtocolFeeMantissa, BUSDFlashLoanSupplierFeeMantissa],
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
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        ).to.be.revertedWith("Invalid flashLoan params");
      });

      it("Should revert if receiver is zero address", async () => {
        // Attempt to execute a flashLoan with a zero address as the receiver, which should revert
        await expect(
          policyFacet.connect(user).executeFlashLoan(
            user.address,
            AddressZero,
            [vUSDT.address, vBUSD.address], // Zero address as an asset, which is invalid
            [BUSDFlashLoanProtocolFeeMantissa, BUSDFlashLoanSupplierFeeMantissa],
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        ).to.be.revertedWith("can't be zero address");
      });

      it("Should revert if user is not whitelisted", async () => {
        // Attempt to execute a flashLoan with a zero address as the receiver, which should revert
        await expect(
          policyFacet.connect(user).executeFlashLoan(
            user.address,
            mockFlashLoanReceiver.address,
            [vUSDT.address, vBUSD.address], // Zero address as an asset, which is invalid
            [BUSDFlashLoanProtocolFeeMantissa, BUSDFlashLoanSupplierFeeMantissa],
            ethers.utils.formatBytes32String(""), // Add the missing `param` argument
          ),
        ).to.be.revertedWith("Flash loan not authorized for this account");
      });

      it("Should revert if whitelisting is done by non-authorized account", async () => {
        await expect(setterFacet.connect(user).setWhiteListFlashLoanAccount(user.address, true)).to.be.revertedWith(
          "access denied",
        );
      });

      it("Should be able to do flashLoan for USDT & ETH", async () => {
        await setterFacet.connect(timeLockUser).setWhiteListFlashLoanAccount(user.address, true);
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
        await policyFacet.connect(user).executeFlashLoan(
          user.address,
          mockFlashLoanReceiver.address,
          [vUSDT.address, vBUSD.address],
          [usdtFlashLoanAmount, busdFlashLoanAmount],
          ethers.utils.formatBytes32String(""), // Add the missing `param` argument
        );

        // Record USDT and BUSD balances in vUSDT and vBUSD contracts after flashLoan
        const balanceAfterUSDT = await USDT.balanceOf(vUSDT.address);
        const balanceAfterBUSD = await BUSD.balanceOf(vBUSD.address);

        // Calculate fees correctly
        const USDTFlashLoanFee = usdtFlashLoanAmount.mul(USDTFlashLoanProtocolFeeMantissa).div(parseUnits("1", 18));
        const BUSDFlashLoanFee = busdFlashLoanAmount.mul(BUSDFlashLoanProtocolFeeMantissa).div(parseUnits("1", 18));

        // Validate that USDT and BUSD balances in the contracts increased, confirming repayment plus fees
        expect(balanceAfterBUSD).to.be.equal(balanceBeforeBUSD.add(BUSDFlashLoanFee));
        expect(balanceAfterUSDT).to.be.equal(balanceBeforeUSDT.add(USDTFlashLoanFee));
      });
    });
  }
});
