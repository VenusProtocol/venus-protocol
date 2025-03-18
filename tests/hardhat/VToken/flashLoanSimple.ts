import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { SignerWithAddress } from "hardhat-deploy-ethers/signers";

import { convertToUnit } from "../../../helpers/utils";
import {
  BEP20Harness,
  BEP20Harness__factory,
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  IAccessControlManagerV5,
  InterestRateModel,
  MockFlashLoanSimpleReceiver,
  MockFlashLoanSimpleReceiver__factory,
  PriceOracle,
  Unitroller,
  VBep20Harness,
  VBep20Harness__factory,
} from "../../../typechain";
import { deployDiamond } from "../Comptroller/Diamond/scripts/deploy";
import { initMainnetUser } from "../Fork/utils";

const { expect } = chai;
chai.use(smock.matchers);

const flashLoanAmount = parseUnits("4", 18);
const protocolFeeMantissa = parseUnits("0.01", 18);
const supplierFeeMantissa = parseUnits("0.01", 18);

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
  let minter: SignerWithAddress;
  let alice: SignerWithAddress;
  let receiver: SignerWithAddress;
  let vTokenA: MockContract<VBep20Harness>;
  let underlyingA: MockContract<BEP20Harness>;
  let accessControlManager: FakeContract<IAccessControlManagerV5>;
  let comptroller: ComptrollerMock;
  let mockReceiverSimple: MockFlashLoanSimpleReceiver;
  let comptrollerSigner: SignerWithAddress;

  type Contracts = FlashLoanContractsFixture & {
    vTokenA: MockContract<VBep20Harness>;
    underlyingA: MockContract<BEP20Harness>;
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
      false,
      protocolFeeMantissa,
      supplierFeeMantissa,
    );
    await vTokenA.setAccessControlManager(contracts.accessControlManager.address);

    return { ...contracts, vTokenA, underlyingA };
  }

  before(async () => {
    [minter, alice, receiver] = await ethers.getSigners();
    ({ accessControlManager, comptroller, vTokenA, underlyingA } = await loadFixture(deploy));
    comptrollerSigner = await initMainnetUser(comptroller.address, ethers.utils.parseUnits("2"));
  });

  describe("Enable/disable flash loan feature", () => {
    it("Should have access to toggle flash loan feature", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      expect(await vTokenA.isFlashLoanEnabled()).to.be.false;
      await expect(vTokenA._toggleFlashLoan()).to.be.revertedWith("access denied");
      expect(await vTokenA.isFlashLoanEnabled()).to.be.false;
    });

    it("Enable flashLoan feature", async () => {
      accessControlManager.isAllowedToCall.returns(true);
      expect(await vTokenA.isFlashLoanEnabled()).to.be.false;
      await vTokenA._toggleFlashLoan();
      expect(await vTokenA.isFlashLoanEnabled()).to.be.true;
    });

    it("Disable flashLoan feature", async () => {
      expect(await vTokenA.isFlashLoanEnabled()).to.be.true;
      await vTokenA._toggleFlashLoan();
      expect(await vTokenA.isFlashLoanEnabled()).to.be.false;
    });

    it("Emit _ToggleFlashLoanEnabled event on toggle flashLoan feature", async () => {
      let result = await vTokenA._toggleFlashLoan();
      await expect(result).to.emit(vTokenA, "ToggleFlashLoanEnabled").withArgs(false, true);

      result = await vTokenA._toggleFlashLoan();
      await expect(result).to.emit(vTokenA, "ToggleFlashLoanEnabled").withArgs(true, false);
    });
  });

  describe("Set fee on flashLoan", () => {
    it("Should have access to set fee on flashLoan", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      await expect(vTokenA._setFlashLoanFeeMantissa(protocolFeeMantissa, supplierFeeMantissa)).to.be.revertedWith(
        "access denied",
      );
    });

    it("Set fee on flashLoan", async () => {
      accessControlManager.isAllowedToCall.returns(true);
      await vTokenA._setFlashLoanFeeMantissa(protocolFeeMantissa, supplierFeeMantissa);

      expect(await vTokenA.flashLoanProtocolFeeMantissa()).to.be.equal(protocolFeeMantissa);
      expect(await vTokenA.flashLoanSupplierFeeMantissa()).to.be.equal(supplierFeeMantissa);
    });

    it("Emit FlashLoanFeeUpdated event on set fee on flashLoan", async () => {
      const result = await vTokenA._setFlashLoanFeeMantissa(protocolFeeMantissa, supplierFeeMantissa);
      await expect(result)
        .to.emit(vTokenA, "FlashLoanFeeUpdated")
        .withArgs(10000000000000000n, protocolFeeMantissa, 10000000000000000n, supplierFeeMantissa);
    });
  });

  describe("Transfer underlying assets to receiver contract", () => {
    before(async () => {
      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("100", 18));
    });

    it("Revert if not comptroller", async () => {
      await expect(vTokenA.transferUnderlying(minter.address, parseUnits("1", 18))).to.be.revertedWith(
        "Invalid comptroller",
      );
    });

    it("Only comptroller can transfer underlying assets to receiver contract", async () => {
      await vTokenA.connect(comptrollerSigner).transferUnderlying(minter.address, parseUnits("1", 18));

      expect(await underlyingA.balanceOf(minter.address)).to.be.equal(parseUnits("1", 18));
    });

    it("Emit TransferUnderlying event on transfer underlying assets to receiver contract", async () => {
      const result = await vTokenA.connect(comptrollerSigner).transferUnderlying(receiver.address, parseUnits("1", 18));

      await expect(result)
        .to.emit(vTokenA, "TransferUnderlying")
        .withArgs(underlyingA.address, receiver.address, parseUnits("1", 18));
    });
  });

  describe("FlashLoan Single Asset", () => {
    before(async () => {
      const MockFlashLoanSimpleReceiver = await ethers.getContractFactory<MockFlashLoanSimpleReceiver__factory>(
        "MockFlashLoanSimpleReceiver",
      );
      mockReceiverSimple = await MockFlashLoanSimpleReceiver.deploy(vTokenA.address);
      await mockReceiverSimple.deployed();
      await vTokenA._setFlashLoanFeeMantissa(protocolFeeMantissa, supplierFeeMantissa);
      await underlyingA.harnessSetBalance(mockReceiverSimple.address, parseUnits("1", 18));
      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("10", 18));
      await underlyingA.harnessSetBalance(underlyingA.address, parseUnits("1", 18));
    });

    it("Should revert if the flashLoan is not enabled", async () => {
      await expect(
        mockReceiverSimple.requestFlashLoan(flashLoanAmount, mockReceiverSimple.address, "0x"),
      ).to.be.revertedWith("FlashLoan not enabled");
    });

    it("FlashLoan for single underlying", async () => {
      await vTokenA._toggleFlashLoan();
      const balanceBeforeflashLoan = await underlyingA.balanceOf(vTokenA.address);

      const flashLoan = await mockReceiverSimple
        .connect(alice)
        .requestFlashLoan(flashLoanAmount, mockReceiverSimple.address, "0x");

      const balanceAfterflashLoan = await underlyingA.balanceOf(vTokenA.address);
      const fee = BigNumber.from(flashLoanAmount)
        .mul(protocolFeeMantissa.add(supplierFeeMantissa))
        .div(parseUnits("1", 18));

      expect(balanceAfterflashLoan).to.be.equal(balanceBeforeflashLoan.add(fee));
      await expect(flashLoan)
        .to.emit(vTokenA, "FlashLoanExecuted")
        .withArgs(mockReceiverSimple.address, underlyingA.address, flashLoanAmount);
    });
  });
});
