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
const COMPTROLLER_ADDRESS = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D";
const USER = "0x4C45758bF15AF0714E4CC44C4EFd177e209C2890";

const USDTFlashLoanFeeMantissa = parseUnits("0.05", 6);
const BUSDFlashLoanFeeMantissa = parseUnits("0.03", 18);
const USDTFlashLoanAmount = parseUnits("20", 6);
const BUSDFlashLoanAmount = parseUnits("20", 18);

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
};

async function deploy(): Promise<SetupProtocolFixture> {
  const [admin] = await ethers.getSigners();
  const oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
  oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));

  const accessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
  accessControlManager.isAllowedToCall.returns(true);

  const interestRateModel = await smock.fake<InterestRateModel>("InterestRateModel");
  interestRateModel.isInterestRateModel.returns(true);

  const timeLockUser = await initMainnetUser(TIMELOCK_ADDRESS, ethers.utils.parseUnits("2"));

  const diamond = await ethers.getContractAt("Diamond", COMPTROLLER_ADDRESS);

  const policyFacetFactory = await ethers.getContractFactory("PolicyFacet");
  const newPolicyFacet: PolicyFacet = await policyFacetFactory.deploy();
  await newPolicyFacet.deployed();

  const addExecuteFlashLoanFunctionSignature = newPolicyFacet.interface.getSighash(
    newPolicyFacet.interface.functions["executeFlashLoan(address,address[],uint256[])"],
  );

  const existingPolicyFacetFunctions = await diamond.facetFunctionSelectors(OLD_POLICY_FACET);

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
  ];

  await diamond.connect(timeLockUser).diamondCut(cut);
  const policyFacet = await ethers.getContractAt("PolicyFacet", COMPTROLLER_ADDRESS);

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
  };
}

forking(47432690, () => {
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

      beforeEach(async () => {
        ({ policyFacet, vUSDT, vBUSD, USDT, BUSD, timeLockUser } = await loadFixture(deploy));

        usdtHolder = await initMainnetUser(USDT_HOLDER, parseUnits("2"));
        busdHolder = await initMainnetUser(BUSD_HOLDER, parseUnits("2"));

        user = await initMainnetUser(USER, parseUnits("2"));

        const MockFlashLoanReceiver = await ethers.getContractFactory<MockFlashLoanReceiver__factory>(
          "MockFlashLoanReceiver",
        );
        mockFlashLoanReceiver = await MockFlashLoanReceiver.deploy(policyFacet.address);
      });

      it("Should revert if flashLoan not enabled", async () => {
        // Attempt to execute a flashLoan when the flashLoan feature is disabled, which should revert
        await expect(
          policyFacet
            .connect(user)
            .executeFlashLoan(
              mockFlashLoanReceiver.address,
              [vUSDT.address, vBUSD.address],
              [USDTFlashLoanAmount, BUSDFlashLoanAmount],
            ),
        ).to.be.revertedWith("FlashLoan not enabled");
      });

      it("Should revert if asset and amount arrays are mismatched", async () => {
        // Attempt to execute a flashLoan with mismatched arrays for assets and amounts, which should revert
        await expect(
          policyFacet.connect(user).executeFlashLoan(
            mockFlashLoanReceiver.address,
            [vUSDT.address], // Only one asset provided
            [USDTFlashLoanAmount, BUSDFlashLoanAmount], // Two loan amounts provided
          ),
        ).to.be.revertedWith("Invalid flashLoan params");
      });

      it("Should revert if receiver is zero address", async () => {
        // Attempt to execute a flashLoan with a zero address as the receiver, which should revert
        await vUSDT.connect(timeLockUser)._toggleFlashLoan();
        await vBUSD.connect(timeLockUser)._toggleFlashLoan();

        await expect(
          policyFacet.connect(user).executeFlashLoan(
            AddressZero,
            [vUSDT.address, vBUSD.address], // Zero address as an asset, which is invalid
            [USDTFlashLoanAmount, BUSDFlashLoanAmount],
          ),
        ).to.be.revertedWith("zero address");
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

        await vUSDT.connect(timeLockUser)._setFlashLoanFeeMantissa(USDTFlashLoanFeeMantissa);
        await vBUSD.connect(timeLockUser)._setFlashLoanFeeMantissa(BUSDFlashLoanFeeMantissa);

        // user initiates a flashLoan of USDT and BUSD through the policyFacet contract
        await policyFacet
          .connect(user)
          .executeFlashLoan(
            mockFlashLoanReceiver.address,
            [vUSDT.address, vBUSD.address],
            [USDTFlashLoanAmount, BUSDFlashLoanAmount],
          );

        // Record USDT and BUSD balances in vUSDT and vBUSD contracts after flashLoan
        const balanceAfterUSDT = await USDT.balanceOf(vUSDT.address);
        const balanceAfterBUSD = await BUSD.balanceOf(vBUSD.address);

        const USDTFlashLoanFee = USDTFlashLoanAmount.mul(USDTFlashLoanFeeMantissa).div(parseUnits("1", 18));
        const BUSDFlashLoanFee = BUSDFlashLoanAmount.mul(BUSDFlashLoanFeeMantissa).div(parseUnits("1", 18));

        // Validate that USDT and BUSD balances in the contracts increased, confirming repayment plus fees
        expect(balanceAfterBUSD).to.be.equal(balanceBeforeBUSD.add(BUSDFlashLoanFee));
        expect(balanceAfterUSDT).to.be.equal(balanceBeforeUSDT.add(USDTFlashLoanFee));
      });
    });
  }
});
