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
  MockFlashLoanSimpleReceiver,
  MockFlashLoanSimpleReceiver__factory,
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
const OLD_POLICY_FACET = "0x671B787AEDB6769972f081C6ee4978146F7D92E6";
const OLD_SETTER_FACET = "0xb619F7ce96c0a6E3F0b44e993f663522F79f294A";
const COMPTROLLER_ADDRESS = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const USER = "0x4C45758bF15AF0714E4CC44C4EFd177e209C2890";
const ACM = "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA";

const flashLoanProtocolFeeMantissa = parseUnits("0.01", 6);
const flashLoanSupplierFeeMantissa = parseUnits("0.01", 6);
const flashLoanAmount = parseUnits("0.5", 6);

type SetupProtocolFixture = {
  diamond: Diamond;
  admin: SignerWithAddress;
  oracle: FakeContract<PriceOracle>;
  accessControlManager: IAccessControlManagerV5;
  interestRateModel: FakeContract<InterestRateModel>;
  timeLockUser: SignerWithAddress;
  USDT: IERC20;
  vUSDT: VBep20Delegate;
  vUSDTProxy: VBep20Delegator;
  policyFacet: PolicyFacet;
  setterFacet: SetterFacet;
};

async function deployProtocol(): Promise<SetupProtocolFixture> {
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
  const unitroller = Unitroller__factory.connect(COMPTROLLER_ADDRESS, timeLockUser);

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

  return {
    admin,
    oracle,
    accessControlManager,
    interestRateModel,
    timeLockUser,
    USDT,
    vUSDT,
    vUSDTProxy,
    diamond,
    policyFacet,
    setterFacet,
  };
}

forking(64048894, async () => {
  if (FORK_TESTNET) {
    describe("FlashLoan Fork Test", async () => {
      let usdtHolder: SignerWithAddress;
      let USDT: IERC20;
      let vUSDT: VBep20Delegate;
      let mockReceiverSimpleFlashLoan: MockFlashLoanSimpleReceiver;
      let user: SignerWithAddress;
      let timeLockUser: SignerWithAddress;
      let setterFacet: SetterFacet;
      let accessControlManager: IAccessControlManagerV5;

      beforeEach(async () => {
        ({ vUSDT, timeLockUser, USDT, accessControlManager, setterFacet } = await loadFixture(deployProtocol));
        usdtHolder = await initMainnetUser(USDT_HOLDER, parseUnits("2"));
        user = await initMainnetUser(USER, parseUnits("2"));

        // Deploy a mock flashLoan receiver to test flashLoan functionality
        const MockFlashLoanSimpleReceiver =
          await ethers.getContractFactory<MockFlashLoanSimpleReceiver__factory>("MockFlashLoanSimpleReceiver");

        mockReceiverSimpleFlashLoan = await MockFlashLoanSimpleReceiver.deploy(vUSDT.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(setterFacet.address, "setWhiteListFlashLoanAccount(address,bool)", timeLockUser.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(vUSDT.address, "_toggleFlashLoan()", timeLockUser.address);

        await accessControlManager
          .connect(timeLockUser)
          .giveCallPermission(vUSDT.address, "setFlashLoanFeeMantissa(uint256,uint256)", timeLockUser.address);
      });

      it("Should revert if flashLoan not enabled", async () => {
        // Attempt to take a flashLoan when the flashLoan feature is disabled should fail
        await expect(
          vUSDT
            .connect(user)
            .executeFlashLoan(
              user.address,
              mockReceiverSimpleFlashLoan.address,
              flashLoanAmount.toString(),
              ethers.utils.hexlify([]),
            ),
        ).to.be.revertedWithCustomError(vUSDT, "FlashLoanNotEnabled");
      });

      it("Should revert if user is not whitelisted", async () => {
        // Enable flashLoan feature for testing
        await vUSDT.connect(timeLockUser)._toggleFlashLoan();

        await expect(
          vUSDT
            .connect(user)
            .executeFlashLoan(
              user.address,
              mockReceiverSimpleFlashLoan.address,
              flashLoanAmount.toString(),
              ethers.utils.hexlify([]),
            ),
        ).to.be.revertedWithCustomError(vUSDT, "FlashLoanNotAuthorized");
      });

      it("Should revert if receiver is zero address", async () => {
        // Enable flashLoan feature for testing
        await vUSDT.connect(timeLockUser)._toggleFlashLoan();
        // Attempt to take a flashLoan with zero address as receiver should fail
        await expect(
          vUSDT
            .connect(user)
            .executeFlashLoan(user.address, AddressZero, flashLoanAmount.toString(), ethers.utils.hexlify([])),
        ).to.be.revertedWith("zero address");
      });

      it("Should flashLoan USDT", async () => {
        await setterFacet.connect(timeLockUser).setWhiteListFlashLoanAccount(user.address, true);
        // Transfer USDT tokens to test users for setting up the flashLoan test
        await USDT.connect(usdtHolder).transfer(vUSDT.address, parseUnits("1", 6));
        await USDT.connect(usdtHolder).transfer(mockReceiverSimpleFlashLoan.address, parseUnits("0.4", 6));

        // Record vUSDT contract's USDT balance before flashLoan
        const balanceBefore = await USDT.balanceOf(vUSDT.address);

        // Mine blocks if necessary for time-based operations
        await mine(blocksToMine);

        // Enable flashLoan feature by the admin
        await vUSDT.connect(timeLockUser)._toggleFlashLoan();
        await vUSDT
          .connect(timeLockUser)
          .setFlashLoanFeeMantissa(flashLoanProtocolFeeMantissa, flashLoanSupplierFeeMantissa);

        await vUSDT
          .connect(user)
          .executeFlashLoan(
            user.address,
            mockReceiverSimpleFlashLoan.address,
            flashLoanAmount.toString(),
            ethers.utils.hexlify([]),
          );

        // Check if the USDT balance in vUSDT increased, validating flashLoan repayment with fees
        const balanceAfter = await USDT.balanceOf(vUSDT.address);
        const totalFlashLoanFee = flashLoanAmount
          .mul(flashLoanProtocolFeeMantissa.add(flashLoanSupplierFeeMantissa))
          .div(parseUnits("1", 18));

        expect(balanceAfter.toString()).to.be.equal(balanceBefore.add(totalFlashLoanFee).toString());
      });
    });
  }
});
