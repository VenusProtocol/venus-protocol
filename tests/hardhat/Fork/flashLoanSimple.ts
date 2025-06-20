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
  IAccessControlManagerV5,
  IERC20,
  InterestRateModel,
  MockFlashLoanSimpleReceiver,
  MockFlashLoanSimpleReceiver__factory,
  PriceOracle,
  VBep20Delegate,
  VBep20Delegate__factory,
  VBep20Delegator,
  VBep20Delegator__factory,
} from "../../../typechain";
import { FORK_TESTNET, forking, initMainnetUser } from "./utils";

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
const USER = "0x4C45758bF15AF0714E4CC44C4EFd177e209C2890";

const flashLoanProtocolFeeMantissa = parseUnits("0.01", 6);
const flashLoanSupplierFeeMantissa = parseUnits("0.01", 6);
const flashLoanAmount = parseUnits("0.5", 6);

type SetupProtocolFixture = {
  admin: SignerWithAddress;
  oracle: FakeContract<PriceOracle>;
  accessControlManager: FakeContract<IAccessControlManagerV5>;
  interestRateModel: FakeContract<InterestRateModel>;
  timeLockUser: SignerWithAddress;
  USDT: IERC20;
  vUSDT: VBep20Delegate;
  vUSDTProxy: VBep20Delegator;
};

async function deployProtocol(): Promise<SetupProtocolFixture> {
  const [admin] = await ethers.getSigners();
  const oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
  oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));

  const accessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
  accessControlManager.isAllowedToCall.returns(true);

  const interestRateModel = await smock.fake<InterestRateModel>("InterestRateModel");
  interestRateModel.isInterestRateModel.returns(true);

  const USDT = await ethers.getContractAt("VBep20Harness", USDT_ADDRESS);

  const timeLockUser = await initMainnetUser(TIMELOCK_ADDRESS, ethers.utils.parseUnits("2"));
  const vUSDTProxy = VBep20Delegator__factory.connect(vUSDT_ADDRESS, timeLockUser);
  const vTokenFactory = await ethers.getContractFactory("VBep20Delegate");
  const vusdtImplementation = await vTokenFactory.deploy();
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
  };
}

forking(47432690, async () => {
  if (FORK_TESTNET) {
    describe("FlashLoan Fork Test", async () => {
      let usdtHolder: SignerWithAddress;
      let USDT: IERC20;
      let vUSDT: VBep20Delegate;
      let mockReceiverSimpleFlashLoan: MockFlashLoanSimpleReceiver;
      let user: SignerWithAddress;
      let timeLockUser: SignerWithAddress;

      beforeEach(async () => {
        ({ vUSDT, timeLockUser, USDT } = await loadFixture(deployProtocol));
        usdtHolder = await initMainnetUser(USDT_HOLDER, parseUnits("2"));
        user = await initMainnetUser(USER, parseUnits("2"));

        // Deploy a mock flashLoan receiver to test flashLoan functionality
        const MockFlashLoanSimpleReceiver =
          await ethers.getContractFactory<MockFlashLoanSimpleReceiver__factory>("MockFlashLoanSimpleReceiver");
        mockReceiverSimpleFlashLoan = await MockFlashLoanSimpleReceiver.deploy(vUSDT.address);
      });

      it("Should revert if flashLoan not enabled", async () => {
        // Attempt to take a flashLoan when the flashLoan feature is disabled should fail
        await expect(
          vUSDT.connect(user).executeFlashLoan(mockReceiverSimpleFlashLoan.address, flashLoanAmount),
        ).to.be.revertedWith("FlashLoan not enabled");
      });

      it("Should revert if receiver is zero address", async () => {
        // Enable flashLoan feature for testing
        await vUSDT.connect(timeLockUser)._toggleFlashLoan();
        // Attempt to take a flashLoan with zero address as receiver should fail
        await expect(vUSDT.connect(user).executeFlashLoan(AddressZero, flashLoanAmount)).to.be.revertedWith(
          "zero address",
        );
      });

      it("Should flashLoan USDT", async () => {
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
          ._setFlashLoanFeeMantissa(flashLoanProtocolFeeMantissa, flashLoanSupplierFeeMantissa);

        await vUSDT.connect(user).executeFlashLoan(mockReceiverSimpleFlashLoan.address, flashLoanAmount);

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
