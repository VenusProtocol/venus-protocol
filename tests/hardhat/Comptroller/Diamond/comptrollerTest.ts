import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../../helpers/utils";
import {
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  EIP20Interface,
  IAccessControlManagerV5,
  LiquidationManager,
  PriceOracle,
  Unitroller,
  VAIController,
  VToken,
} from "../../../../typechain";
import { ComptrollerErrorReporter } from "../../util/Errors";
import { deployDiamond } from "./scripts/deploy";

const { expect } = chai;
chai.use(smock.matchers);

type SimpleComptrollerFixture = {
  oracle: FakeContract<PriceOracle>;
  accessControl: FakeContract<IAccessControlManagerV5>;
  comptrollerLens: MockContract<ComptrollerLens>;
  unitroller: Unitroller;
  comptroller: ComptrollerMock;
};

async function deploySimpleComptroller(): Promise<SimpleComptrollerFixture> {
  const oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
  const accessControl = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
  accessControl.isAllowedToCall.returns(true);
  const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");

  const result = await deployDiamond("");
  const unitroller = result.unitroller;
  const comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
  const comptrollerLens = await ComptrollerLensFactory.deploy();
  await comptroller._setAccessControl(accessControl.address);
  await comptroller._setComptrollerLens(comptrollerLens.address);
  await comptroller._setPriceOracle(oracle.address);
  return { oracle, comptroller, unitroller, comptrollerLens, accessControl };
}

function configureOracle(oracle: FakeContract<PriceOracle>) {
  oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));
}

async function configureVToken(vToken: FakeContract<VToken>, unitroller?: ComptrollerMock) {
  if (unitroller === undefined) {
    const result = await deployDiamond("");
    unitroller = result.unitroller;
  }
  vToken.comptroller.returns(unitroller.address);
  vToken.isVToken.returns(true);
  vToken.exchangeRateStored.returns(convertToUnit("2", 18));
  vToken.totalSupply.returns(convertToUnit("1000000", 18));
  vToken.totalBorrows.returns(convertToUnit("900000", 18));
}

describe("Comptroller", () => {
  let root: SignerWithAddress;
  let accounts: SignerWithAddress[];
  let comptroller: ComptrollerMock;

  before(async () => {
    [root, ...accounts] = await ethers.getSigners();
  });

  type FuncNames = keyof ComptrollerMock["functions"];

  function testZeroAddress<Func extends FuncNames>(funcName: Func, args: Parameters<ComptrollerMock[Func]>) {
    it(funcName, async () => {
      await expect(comptroller[funcName](...args)).to.be.revertedWith("can't be zero address");
    });
  }

  describe("constructor", () => {
    it("on success it sets admin to creator and pendingAdmin is unset", async () => {
      const { comptroller } = await loadFixture(deploySimpleComptroller);
      expect(await comptroller.admin()).to.equal(root.address);
      expect(await comptroller.pendingAdmin()).to.equal(constants.AddressZero);
    });
  });

  describe("_setVenusVAIVaultRate", () => {
    let unitroller: Unitroller;
    let comptroller: ComptrollerMock;

    beforeEach(async () => {
      ({ unitroller } = await loadFixture(deploySimpleComptroller));
      comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
    });

    it("should revert on same values", async () => {
      await expect(comptroller._setVenusVAIVaultRate(0)).to.be.revertedWith("old value is same as new value");
    });
  });

  describe("_setVAIVaultInfo", () => {
    let unitroller: Unitroller;
    let comptroller: ComptrollerMock;

    beforeEach(async () => {
      ({ unitroller } = await loadFixture(deploySimpleComptroller));
      comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
    });

    it("should revert on same values", async () => {
      await expect(comptroller._setVAIVaultInfo(constants.AddressZero, 0, 0)).to.be.revertedWith(
        "old address is same as new address",
      );
      await comptroller._setVAIVaultInfo(accounts[0].address, 0, 0);
      testZeroAddress("_setVAIVaultInfo", [constants.AddressZero, 0, 0]);
    });
  });

  describe("_setVAIController", () => {
    let unitroller: Unitroller;
    let comptroller: ComptrollerMock;

    beforeEach(async () => {
      ({ unitroller } = await loadFixture(deploySimpleComptroller));
      comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
    });

    it("should revert on same values", async () => {
      await expect(comptroller._setVAIController(constants.AddressZero)).to.be.revertedWith(
        "old address is same as new address",
      );
      await comptroller._setVAIController(accounts[0].address);
      testZeroAddress("_setVAIController", [constants.AddressZero]);
    });
  });

  describe("_setVAIMintRate", () => {
    let unitroller: Unitroller;
    let comptroller: ComptrollerMock;

    beforeEach(async () => {
      ({ unitroller } = await loadFixture(deploySimpleComptroller));
      comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
    });

    it("should revert on same values", async () => {
      await expect(comptroller._setVAIMintRate(0)).to.be.revertedWith("old value is same as new value");
    });
  });

  describe("_setLiquidatorContract", () => {
    let unitroller: Unitroller;
    let comptroller: ComptrollerMock;

    beforeEach(async () => {
      ({ unitroller } = await loadFixture(deploySimpleComptroller));
      comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
    });

    it("should revert on same values", async () => {
      await expect(comptroller._setLiquidatorContract(constants.AddressZero)).to.be.revertedWith(
        "old address is same as new address",
      );
    });

    it("should revert on zero address", async () => {
      await comptroller._setLiquidatorContract(accounts[0].address);
      await expect(comptroller._setLiquidatorContract(constants.AddressZero)).to.be.revertedWith(
        "can't be zero address",
      );
    });
  });

  describe("_setPauseGuardian", () => {
    let unitroller: Unitroller;
    let comptroller: ComptrollerMock;

    beforeEach(async () => {
      ({ unitroller } = await loadFixture(deploySimpleComptroller));
      comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
    });

    it("should revert on same values", async () => {
      await expect(comptroller._setPauseGuardian(constants.AddressZero)).to.be.revertedWith(
        "old address is same as new address",
      );
      await comptroller._setPauseGuardian(accounts[0].address);
      testZeroAddress("_setPauseGuardian", [constants.AddressZero]);
    });
  });

  describe("_setVenusSpeeds", () => {
    let unitroller: Unitroller;

    beforeEach(async () => {
      ({ unitroller } = await loadFixture(deploySimpleComptroller));
      comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
    });

    it("ensure non zero address for venus speeds", async () => {
      testZeroAddress("_setVenusSpeeds", [[constants.AddressZero], [0], [0]]);
    });
  });

  describe("_setPriceOracle", () => {
    let comptroller: ComptrollerMock;
    let oracle: FakeContract<PriceOracle>;
    let newOracle: FakeContract<PriceOracle>;

    type Contracts = SimpleComptrollerFixture & {
      newOracle: FakeContract<PriceOracle>;
    };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const newOracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
      // comptroller = await ethers.getContractAt("ComptrollerMock", contracts.unitroller);
      return { ...contracts, newOracle };
    }

    beforeEach(async () => {
      ({ comptroller, oracle, newOracle } = await loadFixture(deploy));
    });

    it("fails if called by non-admin", async () => {
      await expect(comptroller.connect(accounts[0])._setPriceOracle(newOracle.address)).to.be.revertedWith(
        "only admin can",
      );
      expect(await comptroller.oracle()).to.equal(oracle.address);
    });

    it("accepts a valid price oracle and emits a NewPriceOracle event", async () => {
      await expect(comptroller._setPriceOracle(newOracle.address))
        .to.emit(comptroller, "NewPriceOracle")
        .withArgs(oracle.address, newOracle.address);
      expect(await comptroller.oracle()).to.equal(newOracle.address);
    });

    it("setPriceOracle is alias for _setPriceOracle", async () => {
      await expect(comptroller.setPriceOracle(newOracle.address))
        .to.emit(comptroller, "NewPriceOracle")
        .withArgs(oracle.address, newOracle.address);
      expect(await comptroller.oracle()).to.equal(newOracle.address);
    });

    it("Should revert on same values", async () => {
      await expect(comptroller._setPriceOracle(oracle.address)).to.be.revertedWith(
        "old address is same as new address",
      );
      testZeroAddress("_setPriceOracle", [constants.AddressZero]);
    });
  });

  describe("_setComptrollerLens", () => {
    let unitroller: Unitroller;
    let comptroller: ComptrollerMock;
    let comptrollerLens: MockContract<ComptrollerLens>;

    type Contracts = {
      unitroller: Unitroller;
      comptroller: ComptrollerMock;
      comptrollerLens: MockContract<ComptrollerLens>;
    };

    async function deploy(): Promise<Contracts> {
      // const ComptrollerFactory = await smock.mock<Comptroller__factory>("ComptrollerMock");
      const result = await deployDiamond("");
      unitroller = result.unitroller;
      const comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
      const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
      const comptrollerLens = await ComptrollerLensFactory.deploy();
      return { unitroller, comptroller, comptrollerLens };
    }

    beforeEach(async () => {
      ({ comptroller, comptrollerLens } = await loadFixture(deploy));
    });

    it("fails if not called by admin", async () => {
      await expect(comptroller.connect(accounts[0])._setComptrollerLens(comptrollerLens.address)).to.be.revertedWith(
        "only admin can",
      );
    });

    it("should fire an event", async () => {
      const { comptroller, comptrollerLens } = await loadFixture(deploy);
      const oldComptrollerLensAddress = await comptroller.comptrollerLens();
      await expect(comptroller._setComptrollerLens(comptrollerLens.address))
        .to.emit(comptroller, "NewComptrollerLens")
        .withArgs(oldComptrollerLensAddress, comptrollerLens.address);
    });

    it("should revert on same value", async () => {
      const { comptroller, comptrollerLens } = await loadFixture(deploy);
      await comptroller._setComptrollerLens(comptrollerLens.address);
      await expect(comptroller._setComptrollerLens(comptrollerLens.address)).to.be.revertedWith(
        "old address is same as new address",
      );
      testZeroAddress("_setComptrollerLens", [constants.AddressZero]);
    });
  });

  describe("setCollateralFactor", () => {
    const half = convertToUnit("0.5", 18);
    const liquidationThreshold = convertToUnit("0.6", 18);
    let comptroller: ComptrollerMock;
    let vToken: FakeContract<VToken>;
    let oracle: FakeContract<PriceOracle>;

    type Contracts = SimpleComptrollerFixture & { vToken: FakeContract<VToken> };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const vToken = await smock.fake<VToken>("contracts/Tokens/VTokens/VToken.sol:VToken");
      vToken.comptroller.returns(contracts.comptroller.address);
      vToken.isVToken.returns(true);
      return { vToken, ...contracts };
    }

    beforeEach(async () => {
      ({ comptroller, oracle, vToken } = await loadFixture(deploy));
      configureOracle(oracle);
    });

    it("fails if asset is not listed", async () => {
      await expect(comptroller.setCollateralFactor(vToken.address, half, liquidationThreshold)).to.be.revertedWith(
        "market not listed",
      );
    });

    it("fails if factor is set without an underlying price", async () => {
      await comptroller._supportMarket(vToken.address);
      oracle.getUnderlyingPrice.returns(0);
      await expect(comptroller.setCollateralFactor(vToken.address, half, liquidationThreshold))
        .to.emit(comptroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.PRICE_ERROR,
          ComptrollerErrorReporter.FailureInfo.SET_COLLATERAL_FACTOR_WITHOUT_PRICE,
          0,
        );
    });

    it("succeeds and sets market", async () => {
      await comptroller._supportMarket(vToken.address);
      await expect(comptroller.setCollateralFactor(vToken.address, half, liquidationThreshold))
        .emit(comptroller, "NewCollateralFactor")
        .withArgs(vToken.address, "0", half);
    });

    it("succeeds and sets market using alias", async () => {
      await comptroller.supportMarket(vToken.address);
      await expect(comptroller.setCollateralFactor(vToken.address, half, liquidationThreshold))
        .emit(comptroller, "NewCollateralFactor")
        .withArgs(vToken.address, "0", half);

      expect(await comptroller.isMarketListed(vToken.address)).to.be.true;
    });
  });

  describe("setMarketMaxLiquidationIncentive", () => {
    let comptroller: ComptrollerMock;
    let vToken: FakeContract<VToken>;
    let oracle: FakeContract<PriceOracle>;

    type Contracts = SimpleComptrollerFixture & { vToken: FakeContract<VToken> };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const vToken = await smock.fake<VToken>("VToken");
      vToken.comptroller.returns(contracts.comptroller.address);
      vToken.isVToken.returns(true);
      return { vToken, ...contracts };
    }

    beforeEach(async () => {
      ({ comptroller, oracle, vToken } = await loadFixture(deploy));
      configureOracle(oracle);
    });

    it("fails if asset is not listed", async () => {
      await expect(
        comptroller.setMarketMaxLiquidationIncentive(vToken.address, convertToUnit("1.1", 18)),
      ).to.be.revertedWith("market not listed");
    });

    it("fails if incentive is less than 1e18", async () => {
      await comptroller._supportMarket(vToken.address);
      await expect(
        comptroller.setMarketMaxLiquidationIncentive(vToken.address, convertToUnit("0.99999", 18)),
      ).to.be.revertedWith("incentive < mantissaOne");
    });

    it("succeeds and sets market liquidation incentive", async () => {
      await comptroller._supportMarket(vToken.address);
      const newIncentive = convertToUnit("1.1", 18);
      await expect(comptroller.setMarketMaxLiquidationIncentive(vToken.address, newIncentive))
        .to.emit(comptroller, "NewMarketLiquidationIncentive")
        .withArgs(vToken.address, "0", newIncentive);
    });

    it("should revert on same values", async () => {
      await comptroller._supportMarket(vToken.address);
      const newIncentive = convertToUnit("1.1", 18);
      await comptroller.setMarketMaxLiquidationIncentive(vToken.address, newIncentive);
      await expect(comptroller.setMarketMaxLiquidationIncentive(vToken.address, newIncentive)).to.be.revertedWith(
        "old value is same as new value",
      );
    });
  });

  describe("setLiquidationManager", () => {
    let comptroller: ComptrollerMock;
    let liquidationMananger: FakeContract<LiquidationManager>;

    beforeEach(async () => {
      ({ comptroller } = await loadFixture(deploySimpleComptroller));
    });

    it("succeeds and sets liquidation manager", async () => {
      liquidationMananger = await smock.fake<LiquidationManager>("LiquidationManager");
      await expect(comptroller.setLiquidationManager(liquidationMananger.address))
        .to.emit(comptroller, "NewLiquidationManager")
        .withArgs(constants.AddressZero, liquidationMananger.address);
      expect(await comptroller.liquidationManager()).to.equal(liquidationMananger.address);
    });

    it("should revert on same values", async () => {
      liquidationMananger = await smock.fake<LiquidationManager>("LiquidationManager");
      await comptroller.setLiquidationManager(liquidationMananger.address);
      await expect(comptroller.setLiquidationManager(liquidationMananger.address)).to.be.revertedWith(
        "old address is same as new address",
      );
      testZeroAddress("setLiquidationManager", [constants.AddressZero]);
    });
  });

  describe("_setForcedLiquidation", async () => {
    let comptroller: ComptrollerMock;
    let vToken: FakeContract<VToken>;
    let accessControl: FakeContract<IAccessControlManagerV5>;

    type Contracts = SimpleComptrollerFixture & { vToken: FakeContract<VToken> };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const vToken = await smock.fake<VToken>("VToken");
      await contracts.comptroller._supportMarket(vToken.address);
      return { ...contracts, vToken };
    }

    beforeEach(async () => {
      ({ comptroller, vToken, accessControl } = await loadFixture(deploy));
      configureVToken(vToken, comptroller);
    });

    it("fails if asset is not listed", async () => {
      const someVToken = await smock.fake<VToken>("VToken");
      await expect(comptroller._setForcedLiquidation(someVToken.address, true)).to.be.revertedWith("market not listed");
    });

    it("fails if ACM does not allow the call", async () => {
      accessControl.isAllowedToCall.returns(false);
      await expect(comptroller._setForcedLiquidation(vToken.address, true)).to.be.revertedWith("access denied");
      accessControl.isAllowedToCall.returns(true);
    });

    it("sets forced liquidation", async () => {
      await comptroller._setForcedLiquidation(vToken.address, true);
      expect(await comptroller.isForcedLiquidationEnabled(vToken.address)).to.be.true;

      await comptroller._setForcedLiquidation(vToken.address, false);
      expect(await comptroller.isForcedLiquidationEnabled(vToken.address)).to.be.false;
    });

    it("should alias setForcedLiquidation to _setForcedLiquidation", async () => {
      await comptroller.setForcedLiquidation(vToken.address, true);
      expect(await comptroller.isForcedLiquidationEnabled(vToken.address)).to.be.true;

      await comptroller.setForcedLiquidation(vToken.address, false);
      expect(await comptroller.isForcedLiquidationEnabled(vToken.address)).to.be.false;
    });

    it("sets forced liquidation for VAI, even though it is not a listed market", async () => {
      const vaiController = await smock.fake<VAIController>("VAIController");
      await comptroller._setVAIController(vaiController.address);
      await comptroller._setForcedLiquidation(vaiController.address, true);
      expect(await comptroller.isForcedLiquidationEnabled(vaiController.address)).to.be.true;

      await comptroller._setForcedLiquidation(vaiController.address, false);
      expect(await comptroller.isForcedLiquidationEnabled(vaiController.address)).to.be.false;
    });

    it("emits IsForcedLiquidationEnabledUpdated event", async () => {
      const tx1 = await comptroller._setForcedLiquidation(vToken.address, true);
      await expect(tx1).to.emit(comptroller, "IsForcedLiquidationEnabledUpdated").withArgs(vToken.address, true);

      const tx2 = await comptroller._setForcedLiquidation(vToken.address, false);
      await expect(tx2).to.emit(comptroller, "IsForcedLiquidationEnabledUpdated").withArgs(vToken.address, false);
    });
  });

  describe("_setForcedLiquidationForUser", async () => {
    let comptroller: ComptrollerMock;
    let vToken: FakeContract<VToken>;
    let accessControl: FakeContract<IAccessControlManagerV5>;

    type Contracts = SimpleComptrollerFixture & { vToken: FakeContract<VToken> };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const vToken = await smock.fake<VToken>("VToken");
      await contracts.comptroller._supportMarket(vToken.address);
      return { ...contracts, vToken };
    }

    beforeEach(async () => {
      ({ comptroller, vToken, accessControl } = await loadFixture(deploy));
      configureVToken(vToken, comptroller);
    });

    it("fails if asset is not listed", async () => {
      const someVToken = await smock.fake<VToken>("VToken");
      await expect(comptroller._setForcedLiquidationForUser(root.address, someVToken.address, true)).to.be.revertedWith(
        "market not listed",
      );
    });

    it("fails if ACM does not allow the call", async () => {
      accessControl.isAllowedToCall.returns(false);
      await expect(comptroller._setForcedLiquidationForUser(root.address, vToken.address, true)).to.be.revertedWith(
        "access denied",
      );
      accessControl.isAllowedToCall.returns(true);
    });

    it("sets forced liquidation for user", async () => {
      await comptroller._setForcedLiquidationForUser(root.address, vToken.address, true);
      expect(await comptroller.isForcedLiquidationEnabledForUser(root.address, vToken.address)).to.be.true;

      await comptroller._setForcedLiquidationForUser(root.address, vToken.address, false);
      expect(await comptroller.isForcedLiquidationEnabledForUser(root.address, vToken.address)).to.be.false;
    });

    it("sets forced liquidation for VAI, even though it is not a listed market", async () => {
      const vaiController = await smock.fake<VAIController>("VAIController");
      await comptroller._setVAIController(vaiController.address);
      await comptroller._setForcedLiquidationForUser(root.address, vaiController.address, true);
      expect(await comptroller.isForcedLiquidationEnabledForUser(root.address, vaiController.address)).to.be.true;

      await comptroller._setForcedLiquidationForUser(root.address, vaiController.address, false);
      expect(await comptroller.isForcedLiquidationEnabledForUser(root.address, vaiController.address)).to.be.false;
    });

    it("emits IsForcedLiquidationEnabledForUserUpdated event", async () => {
      const tx1 = await comptroller._setForcedLiquidationForUser(root.address, vToken.address, true);
      await expect(tx1)
        .to.emit(comptroller, "IsForcedLiquidationEnabledForUserUpdated")
        .withArgs(root.address, vToken.address, true);

      const tx2 = await comptroller._setForcedLiquidationForUser(root.address, vToken.address, false);
      await expect(tx2)
        .to.emit(comptroller, "IsForcedLiquidationEnabledForUserUpdated")
        .withArgs(root.address, vToken.address, false);
    });
  });

  describe("_supportMarket", () => {
    let unitroller: Unitroller;
    let comptroller: ComptrollerMock;
    let oracle: FakeContract<PriceOracle>;
    let vToken1: FakeContract<VToken>;
    let vToken2: FakeContract<VToken>;
    let token: FakeContract<EIP20Interface>; //eslint-disable-line

    type Contracts = SimpleComptrollerFixture & {
      vToken1: FakeContract<VToken>;
      vToken2: FakeContract<VToken>;
      token: FakeContract<EIP20Interface>;
    };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const vToken1 = await smock.fake<VToken>("contracts/Tokens/VTokens/VToken.sol:VToken");
      const vToken2 = await smock.fake<VToken>("contracts/Tokens/VTokens/VToken.sol:VToken");
      const token = await smock.fake<EIP20Interface>("contracts/Tokens/EIP20Interface.sol:EIP20Interface");
      return { ...contracts, vToken1, vToken2, token };
    }

    beforeEach(async () => {
      ({ comptroller, oracle, vToken1, vToken2, token } = await loadFixture(deploy));
      configureOracle(oracle);
      configureVToken(vToken1, unitroller);
      configureVToken(vToken2, unitroller);
    });

    it("fails if asset is not a VToken", async () => {
      await expect(comptroller._supportMarket(token.address)).to.be.reverted;
    });

    it("succeeds and sets market", async () => {
      await expect(comptroller._supportMarket(vToken1.address))
        .to.emit(comptroller, "MarketListed")
        .withArgs(vToken1.address);
    });

    it("cannot list a market a second time", async () => {
      const tx1 = await comptroller._supportMarket(vToken1.address);
      const tx2 = await comptroller._supportMarket(vToken1.address);
      await expect(tx1).to.emit(comptroller, "MarketListed").withArgs(vToken1.address);
      await expect(tx2)
        .to.emit(comptroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.MARKET_ALREADY_LISTED,
          ComptrollerErrorReporter.FailureInfo.SUPPORT_MARKET_EXISTS,
          0,
        );
    });

    it("can list two different markets", async () => {
      const tx1 = await comptroller._supportMarket(vToken1.address);
      const tx2 = await comptroller._supportMarket(vToken2.address);
      await expect(tx1).to.emit(comptroller, "MarketListed").withArgs(vToken1.address);
      await expect(tx2).to.emit(comptroller, "MarketListed").withArgs(vToken2.address);
    });
  });

  describe("updateDelegate", async () => {
    let comptroller: ComptrollerMock;

    type Contracts = SimpleComptrollerFixture & { vToken: FakeContract<VToken> };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const vToken = await smock.fake<VToken>("VToken");
      await contracts.comptroller._supportMarket(vToken.address);
      return { ...contracts, vToken };
    }

    beforeEach(async () => {
      ({ comptroller } = await loadFixture(deploy));
    });

    it("should revert when zero address is passed", async () => {
      await expect(comptroller.updateDelegate(ethers.constants.AddressZero, true)).to.be.revertedWith(
        "can't be zero address",
      );
    });

    it("should revert when approval status is already set to the requested value", async () => {
      await comptroller.updateDelegate(accounts[1].address, true);
      await expect(comptroller.updateDelegate(accounts[1].address, true)).to.be.revertedWith(
        "Delegation status unchanged",
      );
    });

    it("should emit event on success", async () => {
      await expect(await comptroller.updateDelegate(accounts[1].address, true))
        .to.emit(comptroller, "DelegateUpdated")
        .withArgs(root.address, accounts[1].address, true);
    });
  });

  describe("Hooks", () => {
    let unitroller: Unitroller;
    let comptroller: ComptrollerMock;
    let vToken: FakeContract<VToken>;

    type Contracts = SimpleComptrollerFixture & { vToken: FakeContract<VToken> };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const vToken = await smock.fake<VToken>("contracts/Tokens/VTokens/VToken.sol:VToken");
      await contracts.comptroller._supportMarket(vToken.address);
      return { ...contracts, vToken };
    }

    beforeEach(async () => {
      ({ comptroller, vToken } = await loadFixture(deploy));
      configureVToken(vToken, unitroller);
    });

    describe("mintAllowed", () => {
      beforeEach(async () => {
        ({ comptroller, vToken } = await loadFixture(deploy));
        configureVToken(vToken, unitroller);
      });

      it("allows minting if cap is not reached", async () => {
        const cap = convertToUnit("1001", 18);
        const currentVTokenSupply = convertToUnit("500", 18);
        const exchangeRate = convertToUnit("2", 18);
        // underlying supply = currentVTokenSupply * exchangeRate = 1000

        vToken.totalSupply.returns(currentVTokenSupply);
        vToken.exchangeRateStored.returns(exchangeRate);
        await comptroller._setMarketSupplyCaps([vToken.address], [cap]);
        expect(
          await comptroller.callStatic.mintAllowed(vToken.address, root.address, convertToUnit("0.9999", 18)),
        ).to.equal(0); // 0 means "no error"
      });

      it("reverts if supply cap reached", async () => {
        const cap = convertToUnit("1001", 18);
        const currentVTokenSupply = convertToUnit("500", 18);
        const exchangeRate = convertToUnit("2", 18);
        // underlying supply = currentVTokenSupply * exchangeRate = 1000

        vToken.totalSupply.returns(currentVTokenSupply);
        vToken.exchangeRateStored.returns(exchangeRate);
        await comptroller._setMarketSupplyCaps([vToken.address], [cap]);
        await expect(
          comptroller.mintAllowed(vToken.address, root.address, convertToUnit("1.01", 18)),
        ).to.be.revertedWith("market supply cap reached");
      });

      it("reverts if market is not listed", async () => {
        const someVToken = await smock.fake<VToken>("contracts/Tokens/VTokens/VToken.sol:VToken");
        await expect(
          comptroller.mintAllowed(someVToken.address, root.address, convertToUnit("1", 18)),
        ).to.be.revertedWith("market not listed");
      });
    });

    describe("redeemVerify", () => {
      it("should allow you to redeem 0 underlying for 0 tokens", async () => {
        await comptroller.redeemVerify(vToken.address, accounts[0].address, 0, 0);
      });

      it("should allow you to redeem 5 underlyig for 5 tokens", async () => {
        await comptroller.redeemVerify(vToken.address, accounts[0].address, 5, 5);
      });

      it("should not allow you to redeem 5 underlying for 0 tokens", async () => {
        await expect(comptroller.redeemVerify(vToken.address, accounts[0].address, 5, 0)).to.be.revertedWith(
          "redeemTokens zero",
        );
      });
    });

    describe("liquidateBorrowAllowed", async () => {
      const generalTests = () => {
        it("reverts if borrowed market is not listed", async () => {
          const someVToken = await smock.fake<VToken>("VToken");
          await expect(
            comptroller.liquidateBorrowAllowed(
              someVToken.address,
              vToken.address,
              accounts[0].address,
              root.address,
              convertToUnit("1", 18),
            ),
          ).to.be.revertedWith("market not listed");
        });

        it("reverts if collateral market is not listed", async () => {
          const someVToken = await smock.fake<VToken>("VToken");
          await expect(
            comptroller.liquidateBorrowAllowed(
              vToken.address,
              someVToken.address,
              accounts[0].address,
              root.address,
              convertToUnit("1", 18),
            ),
          ).to.be.revertedWith("market not listed");
        });

        it("does not revert if borrowed vToken is VAIController", async () => {
          const vaiController = await smock.fake<VAIController>("VAIController");
          await comptroller._setVAIController(vaiController.address);
          await expect(
            comptroller.liquidateBorrowAllowed(
              vaiController.address,
              vToken.address,
              accounts[0].address,
              root.address,
              convertToUnit("1", 18),
            ),
          ).to.not.be.revertedWith("market not listed");
        });
      };

      const forcedLiquidationTests = () => {
        generalTests();

        it("allows liquidations without shortfall", async () => {
          vToken.borrowBalanceStored.returns(convertToUnit("100", 18));
          const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
            vToken.address,
            vToken.address,
            accounts[0].address,
            root.address,
            convertToUnit("1", 18),
          );
          expect(errCode).to.equal(0);
        });

        it("allows to repay 100% of the borrow", async () => {
          vToken.borrowBalanceStored.returns(convertToUnit("1", 18));
          const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
            vToken.address,
            vToken.address,
            accounts[0].address,
            root.address,
            convertToUnit("1", 18),
          );
          expect(errCode).to.equal(0);
        });

        it("fails with TOO_MUCH_REPAY if trying to repay > borrowed amount", async () => {
          vToken.borrowBalanceStored.returns(convertToUnit("0.99", 18));
          const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
            vToken.address,
            vToken.address,
            accounts[0].address,
            root.address,
            convertToUnit("1", 18),
          );
          expect(errCode).to.equal(17);
        });
      };

      describe("Forced liquidations enabled for user", async () => {
        beforeEach(async () => {
          await comptroller._setForcedLiquidationForUser(root.address, vToken.address, true);
        });

        it("enables forced liquidation for user", async () => {
          expect(await comptroller.isForcedLiquidationEnabledForUser(root.address, vToken.address)).to.be.true;
        });

        forcedLiquidationTests();

        it("checks the shortfall if isForcedLiquidationEnabledForUser is set back to false", async () => {
          await comptroller._setForcedLiquidationForUser(root.address, vToken.address, false);
          vToken.borrowBalanceStored.returns(convertToUnit("100", 18));
          const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
            vToken.address,
            vToken.address,
            accounts[0].address,
            root.address,
            convertToUnit("1", 18),
          );
          expect(errCode).to.equal(3);
        });
      });

      describe("Forced liquidations enabled for entire market", async () => {
        beforeEach(async () => {
          await comptroller._setForcedLiquidation(vToken.address, true);
        });

        forcedLiquidationTests();

        it("checks the shortfall if isForcedLiquidationEnabled is set back to false", async () => {
          await comptroller._setForcedLiquidation(vToken.address, false);
          vToken.borrowBalanceStored.returns(convertToUnit("100", 18));
          const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
            vToken.address,
            vToken.address,
            accounts[0].address,
            root.address,
            convertToUnit("1", 18),
          );
          expect(errCode).to.equal(3);
        });
      });

      describe("Forced liquidations disabled", async () => {
        let comptrollerLens: FakeContract<ComptrollerLens>;
        let liquidationMananger: FakeContract<LiquidationManager>;

        beforeEach(async () => {
          comptrollerLens = await smock.fake<ComptrollerLens>("ComptrollerLens");
          liquidationMananger = await smock.fake<LiquidationManager>("LiquidationManager");
          await comptroller._setComptrollerLens(comptrollerLens.address);
          await comptroller.setLiquidationManager(liquidationMananger.address);
        });

        generalTests();

        it("fails if borrower has 0 shortfall", async () => {
          vToken.borrowBalanceStored.returns(convertToUnit("100", 18));
          comptrollerLens.getHypotheticalAccountLiquidity.returns([0, 1, 0]);
          const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
            vToken.address,
            vToken.address,
            accounts[0].address,
            root.address,
            convertToUnit("1", 18),
          );
          expect(errCode).to.equal(3);
        });

        it("succeeds if borrower has nonzero shortfall", async () => {
          vToken.borrowBalanceStored.returns(convertToUnit("100", 18));
          comptrollerLens.getHypotheticalAccountLiquidity.returns([0, 0, 1]);
          liquidationMananger.calculateCloseFactor.returns(convertToUnit("0.5", 18));
          const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
            vToken.address,
            vToken.address,
            accounts[0].address,
            root.address,
            convertToUnit("1", 18),
          );
          expect(errCode).to.equal(0);
        });

        it("fails with TOO_MUCH_REPAY if trying to repay > borrowed amount", async () => {
          vToken.borrowBalanceStored.returns(convertToUnit("100", 18));
          comptrollerLens.getHypotheticalAccountLiquidity.returns([0, 0, 1]);
          liquidationMananger.calculateCloseFactor.returns(convertToUnit("0.5", 18));
          const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
            vToken.address,
            vToken.address,
            accounts[0].address,
            root.address,
            convertToUnit("60", 18),
          );
          expect(errCode).to.equal(17);
        });
      });
    });

    describe("borrow", () => {
      let comptrollerLens: FakeContract<ComptrollerLens>;

      beforeEach(async () => {
        const contracts = await loadFixture(deploy);
        comptrollerLens = contracts.comptrollerLens;
        // ({ comptroller, oracle, vToken } = await loadFixture(deploy));
        configureVToken(contracts.vToken, contracts.unitroller);
        configureOracle(contracts.oracle);
      });

      it("allows borrowing if cap is not reached", async () => {
        const cap = convertToUnit("1001", 18);
        const currentVTokenBorrows = convertToUnit("500", 18);

        vToken.totalBorrows.returns(currentVTokenBorrows);
        vToken.borrowIndex.returns(1);
        comptrollerLens.getHypotheticalAccountLiquidity.returns([0, 0, 0]);
        await comptroller._setMarketBorrowCaps([vToken.address], [cap]);

        expect(
          await comptroller
            .connect(vToken.wallet)
            .callStatic.borrowAllowed(vToken.address, root.address, convertToUnit("0.9999", 18)),
        ).to.equal(0); // 0 means "no error"
      });

      it("reverts borrowing if borrow cap is reached", async () => {
        const cap = convertToUnit("100", 18);
        const currentVTokenBorrows = convertToUnit("500", 18);

        vToken.totalBorrows.returns(currentVTokenBorrows);
        vToken.borrowIndex.returns(1);
        comptrollerLens.getHypotheticalAccountLiquidity.returns([0, 0, 0]);
        await comptroller._setMarketBorrowCaps([vToken.address], [cap]);

        await expect(
          comptroller
            .connect(vToken.wallet)
            .callStatic.borrowAllowed(vToken.address, root.address, convertToUnit("0.9999", 18)),
        ).to.be.revertedWith("market borrow cap reached");
      });

      it("reverts borrowing if borrow cap is 0", async () => {
        const cap = convertToUnit("0", 18);
        const currentVTokenBorrows = convertToUnit("500", 18);

        vToken.totalBorrows.returns(currentVTokenBorrows);
        vToken.borrowIndex.returns(1);
        comptrollerLens.getHypotheticalAccountLiquidity.returns([0, 0, 0]);
        await comptroller._setMarketBorrowCaps([vToken.address], [cap]);

        await expect(
          comptroller
            .connect(vToken.wallet)
            .callStatic.borrowAllowed(vToken.address, root.address, convertToUnit("0.9999", 18)),
        ).to.be.revertedWith("market borrow cap is 0");
      });

      it("getBorrowingPower is an alias for getAccountLiquidity", async () => {
        console.log(vToken.wallet._address);
        const accountLiquidity = await comptroller.getAccountLiquidity(vToken.wallet._address);
        const borrowingPower = await comptroller.getBorrowingPower(vToken.wallet._address);

        expect(borrowingPower[0]).to.eq(accountLiquidity[0]);
        expect(borrowingPower[1]).to.eq(accountLiquidity[1]);
        expect(borrowingPower[2]).to.eq(accountLiquidity[2]);
      });
    });
  });
});
