import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
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
  IProtocolShareReserve,
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
const totalFeeMantissa = parseUnits("0.02", 18);
const protocolShareMantissa = parseUnits("0.01", 18);

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
  let protocolShareReserveMock: FakeContract<IProtocolShareReserve>;

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

    protocolShareReserveMock = await smock.fake<IProtocolShareReserve>(
      "contracts/external/IProtocolShareReserve.sol:IProtocolShareReserve",
    );

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
    );

    await vTokenA.setProtocolShareReserve(protocolShareReserveMock.address);
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
      await expect(vTokenA.toggleFlashLoan()).to.be.revertedWith("access denied");
      expect(await vTokenA.isFlashLoanEnabled()).to.be.false;
    });

    it("Enable flashLoan feature", async () => {
      accessControlManager.isAllowedToCall.returns(true);
      expect(await vTokenA.isFlashLoanEnabled()).to.be.false;
      await vTokenA.toggleFlashLoan();
      expect(await vTokenA.isFlashLoanEnabled()).to.be.true;
    });

    it("Disable flashLoan feature", async () => {
      expect(await vTokenA.isFlashLoanEnabled()).to.be.true;
      await vTokenA.toggleFlashLoan();
      expect(await vTokenA.isFlashLoanEnabled()).to.be.false;
    });

    it("Emit toggleFlashLoanEnabled event on toggle flashLoan feature", async () => {
      let result = await vTokenA.toggleFlashLoan();
      await expect(result).to.emit(vTokenA, "ToggleFlashLoanEnabled").withArgs(false, true);

      result = await vTokenA.toggleFlashLoan();
      await expect(result).to.emit(vTokenA, "ToggleFlashLoanEnabled").withArgs(true, false);
    });
  });

  describe("Set fee on flashLoan", () => {
    it("Should have access to set fee on flashLoan", async () => {
      accessControlManager.isAllowedToCall.returns(false);

      await expect(vTokenA.setFlashLoanFeeMantissa(totalFeeMantissa, protocolShareMantissa)).to.be.revertedWith(
        "access denied",
      );
    });

    it("Set fee on flashLoan", async () => {
      accessControlManager.isAllowedToCall.returns(true);
      await vTokenA.setFlashLoanFeeMantissa(totalFeeMantissa, protocolShareMantissa);

      expect(await vTokenA.flashLoanFeeMantissa()).to.be.equal(totalFeeMantissa);
      expect(await vTokenA.flashLoanProtocolShareMantissa()).to.be.equal(protocolShareMantissa);
    });

    it("Emit FlashLoanFeeUpdated event on set fee on flashLoan", async () => {
      const result = await vTokenA.setFlashLoanFeeMantissa(totalFeeMantissa, protocolShareMantissa);
      await expect(result)
        .to.emit(vTokenA, "FlashLoanFeeUpdated")
        .withArgs(20000000000000000n, totalFeeMantissa, 10000000000000000n, protocolShareMantissa);
    });
  });

  describe("Transfer underlying assets to receiver contract", () => {
    before(async () => {
      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("100", 18));
    });

    it("Revert if not comptroller", async () => {
      await expect(
        vTokenA.transferOutUnderlyingFlashloan(minter.address, parseUnits("1", 18)),
      ).to.be.revertedWithCustomError(vTokenA, "InvalidComptroller");
    });

    it("Only comptroller can transfer underlying assets to receiver contract", async () => {
      await vTokenA.connect(comptrollerSigner).transferOutUnderlyingFlashloan(minter.address, parseUnits("1", 18));

      expect(await underlyingA.balanceOf(minter.address)).to.be.equal(parseUnits("1", 18));
    });

    it("Emit TransferOutUnderlyingFlashloan event on transfer underlying assets to receiver contract", async () => {
      const result = await vTokenA
        .connect(comptrollerSigner)
        .transferOutUnderlyingFlashloan(receiver.address, parseUnits("1", 18));

      await expect(result)
        .to.emit(vTokenA, "TransferOutUnderlyingFlashloan")
        .withArgs(underlyingA.address, receiver.address, parseUnits("1", 18));
    });
  });

  describe("FlashLoan Single Asset", () => {
    before(async () => {
      const MockFlashLoanSimpleReceiver =
        await ethers.getContractFactory<MockFlashLoanSimpleReceiver__factory>("MockFlashLoanSimpleReceiver");
      mockReceiverSimple = await MockFlashLoanSimpleReceiver.deploy(vTokenA.address);
      await mockReceiverSimple.deployed();
      await vTokenA.setFlashLoanFeeMantissa(totalFeeMantissa, protocolShareMantissa);
      await underlyingA.harnessSetBalance(mockReceiverSimple.address, parseUnits("1", 18));
      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("10", 18));
      await underlyingA.harnessSetBalance(underlyingA.address, parseUnits("1", 18));
    });

    it("Should revert if the flashLoan is not enabled", async () => {
      expect(await vTokenA.isFlashLoanEnabled()).to.be.false;

      await expect(
        mockReceiverSimple.connect(alice).requestFlashLoan(flashLoanAmount, mockReceiverSimple.address, "0x"),
      ).to.be.revertedWithCustomError(vTokenA, "FlashLoanNotEnabled");
    });

    it("Should revert if user is not whitelisted", async () => {
      await vTokenA.toggleFlashLoan();

      await expect(
        mockReceiverSimple.connect(alice).requestFlashLoan(flashLoanAmount, mockReceiverSimple.address, "0x"),
      )
        .to.be.revertedWithCustomError(vTokenA, "SenderNotAuthorized")
        .withArgs(alice.address);
    });

    it("FlashLoan for single underlying", async () => {
      // whitelist alice for flashLoan
      await comptroller.setWhiteListFlashLoanAccount(alice.address, true);

      const vTokenBalanceBefore = await underlyingA.balanceOf(vTokenA.address);
      const psrBalanceBefore = await underlyingA.balanceOf(protocolShareReserveMock.address);

      // Execute flash loan
      const tx = await mockReceiverSimple
        .connect(alice)
        .requestFlashLoan(flashLoanAmount, mockReceiverSimple.address, "0x");

      const vTokenBalanceAfter = await underlyingA.balanceOf(vTokenA.address);
      const psrBalanceAfter = await underlyingA.balanceOf(protocolShareReserveMock.address);

      const totalFee = flashLoanAmount.mul(totalFeeMantissa).div(parseUnits("1", 18));
      const protocolFee = totalFee.mul(protocolShareMantissa).div(parseUnits("1", 18));
      const remainderFee = totalFee.sub(protocolFee);

      // Verify balances
      // 1. vToken should have original balance + remainderFee (since loan is returned and protocolFee is transferred out)
      expect(vTokenBalanceAfter).to.equal(vTokenBalanceBefore.add(remainderFee));

      // 2. Protocol Share Reserve should receive the protocolFee
      expect(psrBalanceAfter).to.equal(psrBalanceBefore.add(protocolFee));

      await expect(tx)
        .to.emit(vTokenA, "FlashLoanExecuted")
        .withArgs(mockReceiverSimple.address, underlyingA.address, flashLoanAmount);

      expect(protocolShareReserveMock.updateAssetsState).to.have.been.calledWith(
        comptroller.address,
        underlyingA.address,
        3,
      );
    });

    it("Should transfer protocol fees to the protocol share reserve", async () => {
      const totalFee = flashLoanAmount.mul(totalFeeMantissa).div(parseUnits("1", 18));
      const protocolFee = totalFee.mul(protocolShareMantissa).div(parseUnits("1", 18));
      const psrBalanceBefore = await underlyingA.balanceOf(protocolShareReserveMock.address);

      // Execute flash loan
      await mockReceiverSimple.connect(alice).requestFlashLoan(flashLoanAmount, mockReceiverSimple.address, "0x");
      const psrBalanceAfter = await underlyingA.balanceOf(protocolShareReserveMock.address);

      expect(protocolShareReserveMock.updateAssetsState).to.have.been.calledWith(
        comptroller.address,
        underlyingA.address,
        3,
      );

      expect(psrBalanceAfter).to.equal(psrBalanceBefore.add(protocolFee));
    });
  });
});
