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
    const underlyingB = await mockUnderlying("TokenB", "TKNB");

    const vTokenFactory = await smock.mock<VBep20Harness__factory>("VBep20Harness");
    const vTokenA = await vTokenFactory.deploy(
      underlyingA.address,
      contracts.comptroller.address,
      contracts.interestRateModel.address,
      "200000000000000000000000",
      "vTokenA",
      "VTKNA",
      18,
      contracts.admin.address,
    );

    const vTokenB = await vTokenFactory.deploy(
      underlyingB.address,
      contracts.comptroller.address,
      contracts.interestRateModel.address,
      "200000000000000000000000",
      "vTokenB",
      "VTKNB",
      18,
      contracts.admin.address,
    );

    protocolShareReserveMock = await smock.fake<IProtocolShareReserve>(
      "contracts/external/IProtocolShareReserve.sol:IProtocolShareReserve",
    );
    vTokenA.setAccessControlManager(contracts.accessControlManager.address);
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
      expect(await vTokenA.isFlashLoanEnabled()).to.be.false;
      expect(await vTokenB.isFlashLoanEnabled()).to.be.false;

      // whitelist alice for flashLoan
      await comptroller.setWhiteListFlashLoanAccount(alice.address, true);

      await expect(
        mockReceiverContract
          .connect(alice)
          .requestFlashLoan(
            [vTokenA.address, vTokenB.address],
            [flashLoanAmount1, flashLoanAmount2],
            mockReceiverContract.address,
            "0x",
          ),
      ).to.be.revertedWithCustomError(comptroller, "FlashLoanNotEnabled");
    });

    it("Should revert if the user is zero address", async () => {
      await expect(comptroller.setWhiteListFlashLoanAccount(ethers.constants.AddressZero, true)).to.be.revertedWith(
        "can't be zero address",
      );
    });

    it("Should revert if contract is not whitelisted", async () => {
      await vTokenA.setFlashLoanEnabled(true);
      await vTokenB.setFlashLoanEnabled(true);
      expect(await vTokenA.isFlashLoanEnabled()).to.be.true;
      expect(await vTokenB.isFlashLoanEnabled()).to.be.true;
      await expect(
        mockReceiverContract.requestFlashLoan(
          [vTokenA.address, vTokenB.address],
          [flashLoanAmount1, flashLoanAmount2],
          mockReceiverContract.address,
          "0x",
        ),
      )
        .to.be.revertedWithCustomError(comptroller, "SenderNotAuthorizedForFlashLoan")
        .withArgs(mockReceiverContract.address);
    });

    it("Should revert if array params are unequal", async () => {
      await vTokenA.setFlashLoanEnabled(true);
      await vTokenB.setFlashLoanEnabled(true);

      await expect(
        mockReceiverContract.requestFlashLoan(
          [vTokenB.address],
          [flashLoanAmount1, flashLoanAmount2],
          mockReceiverContract.address,
          "0x",
        ),
      ).to.be.revertedWithCustomError(comptroller, "InvalidFlashLoanParams");
    });

    it("should revert when requested flash loan amount is zero", async () => {
      await vTokenA.setFlashLoanEnabled(true);
      await vTokenB.setFlashLoanEnabled(true);

      // whitelist alice for flashLoan
      await comptroller.setWhiteListFlashLoanAccount(alice.address, true);

      expect(await vTokenA.isFlashLoanEnabled()).to.be.true;
      expect(await vTokenB.isFlashLoanEnabled()).to.be.true;

      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("50", 18));
      await underlyingB.harnessSetBalance(vTokenB.address, parseUnits("50", 18));

      // Execute the flashLoan from the mockReceiverContract
      await expect(
        mockReceiverContract.requestFlashLoan(
          [vTokenA.address, vTokenB.address],
          [0, 0],
          mockReceiverContract.address,
          "0x",
        ),
      ).to.be.revertedWithCustomError(comptroller, "InvalidAmount");
    });

    it("Should revert if receiver's executeOperation returns false", async () => {
      // Enable flashLoan for vTokens
      await vTokenA.setFlashLoanEnabled(true);
      await vTokenB.setFlashLoanEnabled(true);

      // Deploy the bad receiver contract
      const BadFlashLoanReceiver = await ethers.getContractFactory("BadFlashLoanReceiver");
      const badReceiver = await BadFlashLoanReceiver.deploy(unitroller.address);
      await badReceiver.deployed();

      // whitelist badReceiver contract for flashLoan
      await comptroller.setWhiteListFlashLoanAccount(badReceiver.address, true);

      // set delegate to receiver contract to allow flashloan onBehalfOf from alice
      await comptroller.connect(alice).updateDelegate(badReceiver.address, true);

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

    it("User has not supplied in venus - Should not create debt position if receiver repays full amount + fee", async () => {
      await vTokenA.setFlashLoanEnabled(true);
      await vTokenB.setFlashLoanEnabled(true);

      // Set the balance of mockReceiver in order to pay for flashLoan fee
      await underlyingA.harnessSetBalance(mockReceiverContract.address, parseUnits("30", 18));
      await underlyingB.harnessSetBalance(mockReceiverContract.address, parseUnits("30", 18));
      // whitelist mockReceiverContract for flashLoan
      await comptroller.setWhiteListFlashLoanAccount(mockReceiverContract.address, true);

      // set delegate to receiver contract to allow flashloan onBehalfOf from alice
      await comptroller.connect(alice).updateDelegate(mockReceiverContract.address, true);

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

    it("User has not supplied in venus - should revert if repayment is insufficient", async () => {
      await vTokenA.setFlashLoanEnabled(true);
      await vTokenB.setFlashLoanEnabled(true);

      // whitelist mockReceiverContract for flashLoan
      await comptroller.setWhiteListFlashLoanAccount(mockReceiverContract.address, true);

      expect(await vTokenA.isFlashLoanEnabled()).to.be.true;
      expect(await vTokenB.isFlashLoanEnabled()).to.be.true;

      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("50", 18));
      await underlyingB.harnessSetBalance(vTokenB.address, parseUnits("50", 18));

      await comptroller.connect(alice).updateDelegate(mockReceiverContract.address, true);

      // Execute the flashLoan from the mockReceiverContract
      await expect(
        mockReceiverContract
          .connect(alice)
          .requestFlashLoan(
            [vTokenA.address, vTokenB.address],
            [flashLoanAmount1, flashLoanAmount2],
            mockReceiverContract.address,
            "0x",
          ),
      ).to.be.revertedWith("Insufficient balance");
    });

    it("User has supplied in venus - Should not create debt position if repays full amount + fee", async () => {
      await vTokenA.setFlashLoanEnabled(true);
      await vTokenB.setFlashLoanEnabled(true);

      // Set the balance of mockReceiver in order to pay for flashLoan fee
      await underlyingA.harnessSetBalance(mockReceiverContract.address, parseUnits("30", 18));
      await underlyingB.harnessSetBalance(mockReceiverContract.address, parseUnits("30", 18));
      // whitelist mockReceiverContract for flashLoan
      await comptroller.setWhiteListFlashLoanAccount(mockReceiverContract.address, true);

      // set delegate to receiver contract to allow flashloan onBehalfOf from alice
      await comptroller.connect(alice).updateDelegate(mockReceiverContract.address, true);

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

      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("60", 18));
      await underlyingB.harnessSetBalance(vTokenB.address, parseUnits("60", 18));

      await underlyingA.harnessSetBalance(alice.address, parseUnits("1000", 18));
      await underlyingB.harnessSetBalance(alice.address, parseUnits("1000", 18));
      await underlyingA.connect(alice).approve(vTokenA.address, parseUnits("1000", 18));
      await underlyingB.connect(alice).approve(vTokenB.address, parseUnits("1000", 18));
      await vTokenA.connect(alice).mint(parseUnits("500", 18)); // Alice supplies 500 tokens as collateral
      await vTokenB.connect(alice).mint(parseUnits("500", 18)); // Alice supplies 500 tokens as collateral

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

    it("User has supplied in venus - Should create debt position if repays less than required", async () => {
      await vTokenA.setFlashLoanEnabled(true);
      await vTokenB.setFlashLoanEnabled(true);

      // Deploy the bad receiver contract
      const BorrowDebtFlashLoanReceiver = await ethers.getContractFactory("BorrowDebtFlashLoanReceiver");
      const borrowDebtReceiver = await BorrowDebtFlashLoanReceiver.deploy(unitroller.address);
      await borrowDebtReceiver.deployed();

      // whitelist borrowDebtReceiver for flashLoan
      await comptroller.setWhiteListFlashLoanAccount(borrowDebtReceiver.address, true);

      // set delegate to receiver contract to allow flashloan onBehalfOf from alice
      await comptroller.connect(alice).updateDelegate(borrowDebtReceiver.address, true);

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
      await underlyingA.harnessSetBalance(borrowDebtReceiver.address, flashLoanAmount1); // No fee
      await underlyingB.harnessSetBalance(borrowDebtReceiver.address, flashLoanAmount2); // No fee

      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("60", 18));
      await underlyingB.harnessSetBalance(vTokenB.address, parseUnits("60", 18));

      // Calculate expected protocol fees
      const expectedProtocolFeeA = flashLoanAmount1
        .mul(totalFeeMantissaTokenA)
        .mul(protocolShareMantissaTokenA)
        .div(parseUnits("1", 36));
      const expectedProtocolFeeB = flashLoanAmount2
        .mul(totalFeeMantissaTokenB)
        .mul(protocolShareMantissaTokenB)
        .div(parseUnits("1", 36));

      // Get protocol share reserve address
      const protocolShareReserveA = await vTokenA.protocolShareReserve();
      const protocolShareReserveB = await vTokenB.protocolShareReserve();

      // Get protocol share reserve balances before flash loan
      const protocolReserveBalanceBeforeA = await underlyingA.balanceOf(protocolShareReserveA);
      const protocolReserveBalanceBeforeB = await underlyingB.balanceOf(protocolShareReserveB);
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

      // Check that debt position was created for the onBehalf
      const aliceBorrowBalanceAfterA = await vTokenA.borrowBalanceStored(alice.address);
      const aliceBorrowBalanceAfterB = await vTokenB.borrowBalanceStored(alice.address);

      expect(aliceBorrowBalanceAfterA).to.be.gt(aliceBorrowBalanceBeforeA);
      expect(aliceBorrowBalanceAfterB).to.be.gt(aliceBorrowBalanceBeforeB);

      // Check that protocol share reserve received the expected fees
      const protocolReserveBalanceAfterA = await underlyingA.balanceOf(protocolShareReserveA);
      const protocolReserveBalanceAfterB = await underlyingB.balanceOf(protocolShareReserveB);

      expect(protocolReserveBalanceAfterA).to.equal(protocolReserveBalanceBeforeA.add(expectedProtocolFeeA));
      expect(protocolReserveBalanceAfterB).to.equal(protocolReserveBalanceBeforeB.add(expectedProtocolFeeB));

      // Verify that updateAssetsState was called on protocol share reserve
      expect(protocolShareReserveMock.updateAssetsState).to.have.been.calledWith(
        comptroller.address,
        underlyingA.address,
        3, // IProtocolShareReserve.IncomeType.FLASHLOAN
      );
      expect(protocolShareReserveMock.updateAssetsState).to.have.been.calledWith(
        comptroller.address,
        underlyingB.address,
        3, // IProtocolShareReserve.IncomeType.FLASHLOAN
      );
    });

    it("User has not enough supply in Venus and repays lesser amount (should revert)", async () => {
      await vTokenA.setFlashLoanEnabled(true);
      await vTokenB.setFlashLoanEnabled(true);

      // whitelist mockReceiverContract for flashLoan
      await comptroller.setWhiteListFlashLoanAccount(mockReceiverContract.address, true);

      // set delegate to receiver contract to allow flashloan onBehalfOf from alice
      await comptroller.connect(alice).updateDelegate(mockReceiverContract.address, true);

      expect(await vTokenA.isFlashLoanEnabled()).to.be.true;
      expect(await vTokenB.isFlashLoanEnabled()).to.be.true;

      // alice supplies insufficient collateral
      await underlyingA.harnessSetBalance(alice.address, parseUnits("10", 18));
      await underlyingB.harnessSetBalance(alice.address, parseUnits("10", 18));
      await underlyingA.connect(alice).approve(vTokenA.address, parseUnits("10", 18));
      await underlyingB.connect(alice).approve(vTokenB.address, parseUnits("10", 18));
      await vTokenA.connect(alice).mint(parseUnits("5", 18));
      await vTokenB.connect(alice).mint(parseUnits("5", 18));
      await comptroller.connect(alice).enterMarkets([vTokenA.address, vTokenB.address]);

      // Only repay principal, not fee
      await underlyingA.harnessSetBalance(mockReceiverContract.address, flashLoanAmount1);
      await underlyingB.harnessSetBalance(mockReceiverContract.address, flashLoanAmount2);

      await expect(
        mockReceiverContract
          .connect(alice)
          .requestFlashLoan(
            [vTokenA.address, vTokenB.address],
            [flashLoanAmount1, flashLoanAmount2],
            mockReceiverContract.address,
            "0x",
          ),
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should revert with NotEnoughRepayment when repayment is less than total fee", async () => {
      await vTokenA.setFlashLoanEnabled(true);
      await vTokenB.setFlashLoanEnabled(true);

      // Deploy the insufficient repayment receiver
      const InsufficientRepaymentReceiver = await ethers.getContractFactory("InsufficientRepaymentFlashLoanReceiver");
      const insufficientReceiver = await InsufficientRepaymentReceiver.deploy(comptroller.address);

      // whitelist insufficientReceiver for flashLoan
      await comptroller.setWhiteListFlashLoanAccount(insufficientReceiver.address, true);

      // set delegate to receiver contract to allow flashloan onBehalfOf from alice
      await comptroller.connect(alice).updateDelegate(insufficientReceiver.address, true);

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

      await comptroller.setIsBorrowAllowed(0, vTokenA.address, true);
      await comptroller.setIsBorrowAllowed(0, vTokenB.address, true);

      await underlyingA.harnessSetBalance(vTokenA.address, parseUnits("60", 18));
      await underlyingB.harnessSetBalance(vTokenB.address, parseUnits("60", 18));

      // Calculate expected fees
      const expectedFeeA = flashLoanAmount1.mul(totalFeeMantissaTokenA).div(parseUnits("1", 18));
      const expectedFeeB = flashLoanAmount2.mul(totalFeeMantissaTokenB).div(parseUnits("1", 18));

      // Give the receiver exactly half of each fee (insufficient)
      const amountA = expectedFeeA;
      const amountB = expectedFeeB;

      await underlyingA.harnessSetBalance(insufficientReceiver.address, amountA);
      await underlyingB.harnessSetBalance(insufficientReceiver.address, amountB);

      // Execute the flashLoan - should revert with NotEnoughRepayment
      await expect(
        insufficientReceiver
          .connect(alice)
          .requestFlashLoan(
            [vTokenA.address, vTokenB.address],
            [flashLoanAmount1, flashLoanAmount2],
            insufficientReceiver.address,
            "0x",
          ),
      ).to.be.revertedWithCustomError(comptroller, "NotEnoughRepayment");
    });
  });
});
