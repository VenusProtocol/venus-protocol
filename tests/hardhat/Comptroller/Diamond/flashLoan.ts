import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
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
  IProtocolShareReserve,
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
const totalFeeMantissaTokenA = parseUnits("0.03", 18);
const totalFeeMantissaTokenB = parseUnits("0.04", 18);
const protocolShareMantissaTokenA = parseUnits("0.01", 18);
const protocolShareMantissaTokenB = parseUnits("0.01", 18);

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
  let alice: SignerWithAddress;
  let vTokenA: MockContract<VBep20Harness>;
  let vTokenB: MockContract<VBep20Harness>;
  let underlyingA: MockContract<BEP20Harness>;
  let underlyingB: MockContract<BEP20Harness>;
  let unitroller: Unitroller;
  let comptroller: ComptrollerMock;
  let mockReceiverContract: MockFlashLoanReceiver;
  let protocolShareReserveMock: FakeContract<IProtocolShareReserve>;

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
    );

    vTokenB.setAccessControlManager(contracts.accessControlManager.address);
    await vTokenA.setProtocolShareReserve(protocolShareReserveMock.address);
    await vTokenB.setProtocolShareReserve(protocolShareReserveMock.address);

    await vTokenA.setFlashLoanFeeMantissa(totalFeeMantissaTokenA, protocolShareMantissaTokenA);
    await vTokenB.setFlashLoanFeeMantissa(totalFeeMantissaTokenB, protocolShareMantissaTokenB);

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

      await comptroller["setLiquidationIncentive(address,uint256)"](vTokenA.address, convertToUnit("1", 18));
      await comptroller["setLiquidationIncentive(address,uint256)"](vTokenB.address, convertToUnit("1", 18));

      const MockFlashLoanReceiver =
        await ethers.getContractFactory<MockFlashLoanReceiver__factory>("MockFlashLoanReceiver");
      mockReceiverContract = await MockFlashLoanReceiver.deploy(unitroller.address);
      await mockReceiverContract.deployed();
    });

    it("Should revert if flashLoan is not enabled", async () => {
      await expect(
        mockReceiverContract.requestFlashLoan(
          [vTokenA.address, vTokenB.address],
          [flashLoanAmount1, flashLoanAmount2],
          mockReceiverContract.address,
          "0x",
        ),
      ).to.be.revertedWithCustomError(comptroller, "FlashLoanNotEnabled");
    });

    it("Should revert if array params are unequal", async () => {
      await vTokenA._toggleFlashLoan();
      await vTokenB._toggleFlashLoan();

      await expect(
        mockReceiverContract.requestFlashLoan(
          [vTokenB.address],
          [flashLoanAmount1, flashLoanAmount2],
          mockReceiverContract.address,
          "0x",
        ),
      ).to.be.revertedWithCustomError(comptroller, "InvalidFlashLoanParams");
    });

    it("Should revert if receiver's executeOperation returns false", async () => {
      // Enable flashLoan for vTokens
      await vTokenA._toggleFlashLoan();
      await vTokenB._toggleFlashLoan();

      // Deploy the bad receiver contract
      const BadFlashLoanReceiver = await ethers.getContractFactory("BadFlashLoanReceiver");
      const badReceiver = await BadFlashLoanReceiver.deploy(unitroller.address);
      await badReceiver.deployed();

      // Set the balance of badReceiver to cover full repayment for both tokens
      await underlyingA.harnessSetBalance(badReceiver.address, parseUnits("20", 18));
      await underlyingB.harnessSetBalance(badReceiver.address, parseUnits("20", 18));

      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("50", 18));
      await underlyingB.harnessSetBalance(vTokenB.address, parseUnits("50", 18));

      await expect(
        badReceiver
          .connect(alice)
          .requestFlashLoan(
            [vTokenA.address, vTokenB.address],
            [flashLoanAmount1, flashLoanAmount2],
            badReceiver.address,
            "0x",
          ),
      ).to.be.revertedWithCustomError(comptroller, "ExecuteFlashLoanFailed");
    });

    it("FlashLoan for multiple underlying and transfer funds to PSR", async () => {
      // Enable flashLoan for multiple vToken
      await vTokenA._toggleFlashLoan();
      await vTokenB._toggleFlashLoan();
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
      const psrABalanceBefore = await underlyingA.balanceOf(protocolShareReserveMock.address);
      const psrBBalanceBefore = await underlyingB.balanceOf(protocolShareReserveMock.address);

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

      // Calculate total fees and protocol fees according to the modified logic
      // totalFee = flashLoanAmount * totalFeeMantissa
      // protocolFee = totalFee * (protocolShareMantissa / totalFeeMantissa)
      const totalFeeA = flashLoanAmount1.mul(totalFeeMantissaTokenA).div(parseUnits("1", 18));
      const protocolFeeA = totalFeeA.mul(protocolShareMantissaTokenA).div(parseUnits("1", 18));
      const remainderFeeA = totalFeeA.sub(protocolFeeA);

      const totalFeeB = flashLoanAmount2.mul(totalFeeMantissaTokenB).div(parseUnits("1", 18));
      const protocolFeeB = totalFeeB.mul(protocolShareMantissaTokenB).div(parseUnits("1", 18));
      const remainderFeeB = totalFeeB.sub(protocolFeeB);

      // Verify vToken balances
      expect(afterBalanceVTokenA).to.be.equal(beforeBalanceVTokenA.add(remainderFeeA));
      expect(afterBalanceVTokenB).to.be.equal(beforeBalanceVTokenB.add(remainderFeeB));

      // Verify protocol share reserve balances
      expect(await underlyingA.balanceOf(protocolShareReserveMock.address)).to.equal(
        psrABalanceBefore.add(protocolFeeA),
      );
      expect(await underlyingB.balanceOf(protocolShareReserveMock.address)).to.equal(
        psrBBalanceBefore.add(protocolFeeB),
      );

      await expect(flashLoan)
        .to.emit(comptroller, "FlashLoanExecuted")
        .withArgs(
          mockReceiverContract.address,
          [vTokenA.address, vTokenB.address],
          [flashLoanAmount1, flashLoanAmount2],
        );

      expect(protocolShareReserveMock.updateAssetsState).to.have.been.calledWith(
        comptroller.address,
        underlyingA.address,
        2,
      );

      expect(protocolShareReserveMock.updateAssetsState).to.have.been.calledWith(
        comptroller.address,
        underlyingB.address,
        2,
      );
    });

    it("Should create debt position if receiver repays less than required", async () => {
      await vTokenA._toggleFlashLoan();
      await vTokenB._toggleFlashLoan();

      // Deploy the bad receiver contract
      const BorrowDebtFlashLoanReceiver = await ethers.getContractFactory("BorrowDebtFlashLoanReceiver");
      const borrowDebtReceiver = await BorrowDebtFlashLoanReceiver.deploy(unitroller.address);
      await borrowDebtReceiver.deployed();

      // Set collateral factors for the markets
      await comptroller["setCollateralFactor(address,uint256,uint256)"](
        vTokenA.address,
        parseUnits("0.9", 18),
        parseUnits("1", 18),
      );
      await comptroller["setCollateralFactor(address,uint256,uint256)"](
        vTokenB.address,
        parseUnits("0.9", 18),
        parseUnits("1", 18),
      );

      // Set borrow caps to allow borrowing
      await comptroller._setMarketBorrowCaps(
        [vTokenA.address, vTokenB.address],
        [parseUnits("100000", 18), parseUnits("100000", 18)],
      );

      // Set supply caps to allow supplying
      await comptroller._setMarketSupplyCaps(
        [vTokenA.address, vTokenB.address],
        [parseUnits("100000", 18), parseUnits("100000", 18)],
      );

      await comptroller.setIsBorrowAllowed(0, vTokenA.address, true);
      await comptroller.setIsBorrowAllowed(0, vTokenB.address, true);

      // Alice needs to have collateral to borrow against
      await underlyingA.harnessSetBalance(alice.address, parseUnits("1000", 18));
      await underlyingB.harnessSetBalance(alice.address, parseUnits("1000", 18));
      await underlyingA.connect(alice).approve(vTokenA.address, parseUnits("1000", 18));
      await underlyingB.connect(alice).approve(vTokenB.address, parseUnits("1000", 18));
      await vTokenA.connect(alice).mint(parseUnits("500", 18)); // Alice supplies 500 tokens as collateral
      await vTokenB.connect(alice).mint(parseUnits("500", 18)); // Alice supplies 500 tokens as collateral

      // Enter markets for Alice so she can borrow
      await comptroller.connect(alice).enterMarkets([vTokenA.address, vTokenB.address]);

      // Set receiver balance to less than required repayment
      await underlyingA.harnessSetBalance(mockReceiverContract.address, flashLoanAmount1); // No fee
      await underlyingB.harnessSetBalance(mockReceiverContract.address, flashLoanAmount2); // No fee

      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("60", 18));
      await underlyingB.harnessSetBalance(vTokenB.address, parseUnits("60", 18));

      const aliceBorrowBalanceBeforeA = await vTokenA.borrowBalanceStored(alice.address);
      const aliceBorrowBalanceBeforeB = await vTokenB.borrowBalanceStored(alice.address);

      await expect(
        borrowDebtReceiver
          .connect(alice)
          .requestFlashLoan(
            [vTokenA.address, vTokenB.address],
            [flashLoanAmount1, flashLoanAmount2],
            borrowDebtReceiver.address,
            "0x",
          ),
      ).to.not.be.reverted;

      // Check that debt position was created for the initiator
      const aliceBorrowBalanceAfterA = await vTokenA.borrowBalanceStored(alice.address);
      const aliceBorrowBalanceAfterB = await vTokenB.borrowBalanceStored(alice.address);

      expect(aliceBorrowBalanceAfterA).to.be.gt(aliceBorrowBalanceBeforeA);
      expect(aliceBorrowBalanceAfterB).to.be.gt(aliceBorrowBalanceBeforeB);
    });

    it("Should not create debt position if receiver repays full amount + fee", async () => {
      await vTokenA._toggleFlashLoan();
      await vTokenB._toggleFlashLoan();

      // Set the balance of mockReceiver in order to pay for flashLoan fee
      await underlyingA.harnessSetBalance(mockReceiverContract.address, parseUnits("30", 18));
      await underlyingB.harnessSetBalance(mockReceiverContract.address, parseUnits("30", 18));

      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("60", 18));
      await underlyingB.harnessSetBalance(vTokenB.address, parseUnits("60", 18));

      await expect(
        mockReceiverContract
          .connect(alice)
          .requestFlashLoan(
            [vTokenA.address, vTokenB.address],
            [flashLoanAmount1, flashLoanAmount2],
            mockReceiverContract.address,
            "0x",
          ),
      ).to.not.be.reverted;

      // Check that no debt position was created
      const debtA = await vTokenA.borrowBalanceStored(alice.address);
      const debtB = await vTokenB.borrowBalanceStored(alice.address);
      expect(debtA).to.equal(0);
      expect(debtB).to.equal(0);
    });
  });
});
