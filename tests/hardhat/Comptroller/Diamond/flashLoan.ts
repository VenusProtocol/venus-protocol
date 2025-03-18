import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { convertToUnit } from "../../../../helpers/utils";
import {
  BEP20Harness,
  BEP20Harness__factory,
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  IAccessControlManagerV5,
  InterestRateModel,
  MockFlashLoanReceiver,
  MockFlashLoanReceiver__factory,
  PriceOracle,
  Unitroller,
  VBep20Harness,
  VBep20Harness__factory,
} from "../../../../typechain";
import { deployDiamond } from "./scripts/deploy";

const { expect } = chai;
chai.use(smock.matchers);

const flashLoanAmount1 = parseUnits("10", 18);
const flashLoanAmount2 = parseUnits("10", 18);
const protocolFeeMantissaTokenA = parseUnits("0.01", 18);
const protocolFeeMantissaTokenB = parseUnits("0.02", 18);
const supplierFeeMantissaTokenA = parseUnits("0.01", 18);
const supplierFeeMantissaTokenB = parseUnits("0.02", 18);

// Declare the types here
type FlashLoanContractsFixture = {
  admin: SignerWithAddress;
  oracle: FakeContract<PriceOracle>;
  comptrollerLens: MockContract<ComptrollerLens>;
  accessControlManager: FakeContract<IAccessControlManagerV5>;
  interestRateModel: FakeContract<InterestRateModel>;
  unitroller: Unitroller;
  comptroller: ComptrollerMock;
};

// Create a fixture will deploy all the required contracts for flashLoan
const flashLoanTestFixture = async (): Promise<FlashLoanContractsFixture> => {
  const [admin] = await ethers.getSigners();
  const oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
  oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));

  const accessControlManager = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
  accessControlManager.isAllowedToCall.returns(true);

  const interestRateModel = await smock.fake<InterestRateModel>("InterestRateModel");
  interestRateModel.isInterestRateModel.returns(true);

  const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");

  const result = await deployDiamond("");
  const unitroller = result.unitroller;
  const comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
  const comptrollerLens = await ComptrollerLensFactory.deploy();
  await comptroller._setAccessControl(accessControlManager.address);
  await comptroller._setComptrollerLens(comptrollerLens.address);
  await comptroller._setPriceOracle(oracle.address);
  await comptroller._setLiquidationIncentive(convertToUnit("1", 18));

  return {
    admin,
    oracle,
    comptrollerLens,
    accessControlManager,
    interestRateModel,
    unitroller,
    comptroller,
  };
};

describe("FlashLoan", async () => {
  let alice: SignerWithAddress;
  let vTokenA: MockContract<VBep20Harness>;
  let vTokenB: MockContract<VBep20Harness>;
  let underlyingA: MockContract<BEP20Harness>;
  let underlyingB: MockContract<BEP20Harness>;
  let unitroller: Unitroller;
  let comptroller: ComptrollerMock;
  let mockReceiverContract: MockFlashLoanReceiver;

  type Contracts = FlashLoanContractsFixture & {
    vTokenA: MockContract<VBep20Harness>;
    vTokenB: MockContract<VBep20Harness>;
    underlyingA: MockContract<BEP20Harness>;
    underlyingB: MockContract<BEP20Harness>;
  };

  const mockUnderlying = async (name: string, symbol: string): Promise<MockContract<BEP20Harness>> => {
    const underlyingFactory = await smock.mock<BEP20Harness__factory>("BEP20Harness");
    const underlying = await underlyingFactory.deploy(0, name, 18, symbol);
    return underlying;
  };

  async function deploy(): Promise<Contracts> {
    const contracts = await flashLoanTestFixture();
    const underlyingA = await mockUnderlying("TokenA", "TKNA");
    const vTokenAFactory = await smock.mock<VBep20Harness__factory>("VBep20Harness");
    const vTokenA = await vTokenAFactory.deploy(
      underlyingA.address,
      contracts.comptroller.address,
      contracts.interestRateModel.address,
      "200000000000000000000000",
      "vTokenA",
      "VTKNA",
      18,
      contracts.admin.address,
      true,
      protocolFeeMantissaTokenA,
      supplierFeeMantissaTokenA,
    );

    vTokenA.setAccessControlManager(contracts.accessControlManager.address);

    const underlyingB = await mockUnderlying("TokenB", "TKNB");
    const vTokenBFactory = await smock.mock<VBep20Harness__factory>("VBep20Harness");
    const vTokenB = await vTokenBFactory.deploy(
      underlyingB.address,
      contracts.comptroller.address,
      contracts.interestRateModel.address,
      "200000000000000000000000",
      "vTokenB",
      "VTKNB",
      18,
      contracts.admin.address,
      true,
      protocolFeeMantissaTokenB,
      supplierFeeMantissaTokenB,
    );

    vTokenA.setAccessControlManager(contracts.accessControlManager.address);

    return { ...contracts, vTokenA, vTokenB, underlyingA, underlyingB };
  }

  beforeEach(async () => {
    [alice] = await ethers.getSigners();
    ({ unitroller, comptroller, vTokenA, vTokenB, underlyingA, underlyingB } = await loadFixture(deploy));
  });

  describe("FlashLoan Multi-Assets", async () => {
    beforeEach(async () => {
      await comptroller._setMarketSupplyCaps(
        [vTokenA.address, vTokenB.address],
        [convertToUnit(1, 50), convertToUnit(1, 50)],
      );

      await comptroller._supportMarket(vTokenA.address);
      await comptroller._supportMarket(vTokenB.address);

      const MockFlashLoanReceiver = await ethers.getContractFactory<MockFlashLoanReceiver__factory>(
        "MockFlashLoanReceiver",
      );
      mockReceiverContract = await MockFlashLoanReceiver.deploy(unitroller.address);
      await mockReceiverContract.deployed();
    });

    it("Should revert if flashLoan is not enabled", async () => {
      await vTokenA._toggleFlashLoan();
      expect(await vTokenA.isFlashLoanEnabled()).to.be.false;

      await expect(
        mockReceiverContract.requestFlashLoan(
          [vTokenA.address, vTokenB.address],
          [flashLoanAmount1, flashLoanAmount2],
          mockReceiverContract.address,
          "0x",
        ),
      ).to.be.revertedWith("FlashLoan not enabled");
    });

    it("FlashLoan for multiple underlying", async () => {
      // Admin Enable flashLoan for multiple vToken
      expect(await vTokenA.isFlashLoanEnabled()).to.be.true;
      expect(await vTokenB.isFlashLoanEnabled()).to.be.true;

      // Set the balance of mockReceiver in order to pay for flashLoan fee
      await underlyingA.harnessSetBalance(mockReceiverContract.address, parseUnits("20", 18));
      await underlyingB.harnessSetBalance(mockReceiverContract.address, parseUnits("20", 18));

      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("50", 18));
      await underlyingB.harnessSetBalance(vTokenB.address, parseUnits("50", 18));

      // Get the balance before the flashLoan
      const beforeBalanceVTokenA = await underlyingA.balanceOf(vTokenA.address);
      const beforeBalanceVTokenB = await underlyingB.balanceOf(vTokenB.address);

      // Execute the flashLoan from the mockReceiverContract
      const flashLoan = await mockReceiverContract
        .connect(alice)
        .requestFlashLoan(
          [vTokenA.address, vTokenB.address],
          [flashLoanAmount1, flashLoanAmount2],
          mockReceiverContract.address,
          "0x",
        );

      // Get the balance after the flashLoan
      const afterBalanceVTokenA = await underlyingA.balanceOf(vTokenA.address);
      const afterBalanceVTokenB = await underlyingB.balanceOf(vTokenB.address);

      const feeOnFlashLoanTokenA = BigNumber.from(flashLoanAmount1)
        .mul(protocolFeeMantissaTokenA.add(supplierFeeMantissaTokenA))
        .div(parseUnits("1", 18));
      const feeOnFlashLoanTokenB = BigNumber.from(flashLoanAmount2)
        .mul(protocolFeeMantissaTokenB.add(supplierFeeMantissaTokenB))
        .div(parseUnits("1", 18));

      expect(afterBalanceVTokenA).to.be.equal(beforeBalanceVTokenA.add(feeOnFlashLoanTokenA));
      expect(afterBalanceVTokenB).to.be.equal(beforeBalanceVTokenB.add(feeOnFlashLoanTokenB));

      await expect(flashLoan)
        .to.emit(comptroller, "FlashLoanExecuted")
        .withArgs(
          mockReceiverContract.address,
          [vTokenA.address, vTokenB.address],
          [flashLoanAmount1, flashLoanAmount2],
        );
    });
  });
});
