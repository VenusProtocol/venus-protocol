import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../../helpers/utils";
import {
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  EIP20Interface,
  IAccessControlManagerV5,
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
  vToken: FakeContract<VToken>;
};
const corePoolId = 0;

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
  const vToken = await smock.fake<VToken>("VToken");

  return { oracle, comptroller, unitroller, comptrollerLens, accessControl, vToken };
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

  describe("setLiquidationIncentive", () => {
    let unitroller: Unitroller;
    let comptroller: ComptrollerMock;
    let vToken: FakeContract<VToken>;
    const initialIncentive = convertToUnit("0", 18);
    const validIncentive = convertToUnit("1.1", 18);
    const tooSmallIncentive = convertToUnit("0.99999", 18);

    beforeEach(async () => {
      ({ unitroller, vToken } = await loadFixture(deploySimpleComptroller));
      comptroller = await ethers.getContractAt("ComptrollerMock", unitroller.address);
    });

    it("fails if incentive is less than 1e18", async () => {
      await comptroller._supportMarket(vToken.address);
      await expect(
        comptroller["setLiquidationIncentive(address,uint256)"](vToken.address, tooSmallIncentive),
      ).to.be.revertedWith("incentive < 1e18");
    });

    it("accepts a valid incentive and emits a NewLiquidationIncentive event", async () => {
      await comptroller._supportMarket(vToken.address);
      expect(
        await comptroller.callStatic["setLiquidationIncentive(address,uint256)"](vToken.address, validIncentive),
      ).to.equal(ComptrollerErrorReporter.Error.NO_ERROR);
      await expect(comptroller["setLiquidationIncentive(address,uint256)"](vToken.address, validIncentive))
        .to.emit(comptroller, "NewLiquidationIncentive")
        .withArgs(corePoolId, vToken.address, initialIncentive, validIncentive);
      const data = await comptroller.markets(vToken.address);
      expect(data.liquidationIncentiveMantissa).to.equal(validIncentive);
    });

    it("should revert on same values", async () => {
      await comptroller._supportMarket(vToken.address);
      await comptroller["setLiquidationIncentive(address,uint256)"](vToken.address, validIncentive);
      await expect(
        comptroller["setLiquidationIncentive(address,uint256)"](vToken.address, validIncentive),
      ).to.be.revertedWith("old value is same as new value");
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

  describe("_setCloseFactor", () => {
    let comptroller: ComptrollerMock;

    beforeEach(async () => {
      ({ comptroller } = await loadFixture(deploySimpleComptroller));
    });

    it("fails if not called by admin", async () => {
      await expect(comptroller.connect(accounts[0])._setCloseFactor(1)).to.be.revertedWith("only admin can");
    });

    it("should revert on same values", async () => {
      await expect(comptroller._setCloseFactor(0)).to.be.revertedWith("old value is same as new value");
    });

    it("fails if factor is set out of range", async () => {
      await expect(comptroller._setCloseFactor(convertToUnit(1, 18)))
        .to.emit(comptroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.INVALID_CLOSE_FACTOR,
          ComptrollerErrorReporter.FailureInfo.SET_CLOSE_FACTOR_VALIDATION,
          0,
        );
    });
  });

  describe("_setCollateralFactor", () => {
    const half = convertToUnit("0.5", 18);
    let comptroller: ComptrollerMock;
    let vToken: FakeContract<VToken>;
    let oracle: FakeContract<PriceOracle>;

    type Contracts = SimpleComptrollerFixture & { vToken: FakeContract<VToken> };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      contracts.vToken.comptroller.returns(contracts.comptroller.address);
      contracts.vToken.isVToken.returns(true);
      return { ...contracts };
    }

    beforeEach(async () => {
      ({ comptroller, oracle, vToken } = await loadFixture(deploy));
      configureOracle(oracle);
    });

    it("fails if asset is not listed", async () => {
      await expect(
        comptroller["setCollateralFactor(address,uint256,uint256)"](vToken.address, half, half),
      ).to.be.revertedWith("market not listed");
    });

    it("fails if factor is set without an underlying price", async () => {
      await comptroller._supportMarket(vToken.address);
      oracle.getUnderlyingPrice.returns(0);
      await expect(comptroller["setCollateralFactor(address,uint256,uint256)"](vToken.address, half, half))
        .to.emit(comptroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.PRICE_ERROR,
          ComptrollerErrorReporter.FailureInfo.SET_COLLATERAL_FACTOR_WITHOUT_PRICE,
          0,
        );
    });

    it("succeeds and sets market", async () => {
      await comptroller._supportMarket(vToken.address);
      await expect(comptroller["setCollateralFactor(address,uint256,uint256)"](vToken.address, half, half))
        .emit(comptroller, "NewCollateralFactor")
        .withArgs(corePoolId, vToken.address, "0", half);
    });

    it("succeeds and sets market using alias", async () => {
      await comptroller.supportMarket(vToken.address);
      await expect(
        comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](corePoolId, vToken.address, half, half),
      )
        .emit(comptroller, "NewCollateralFactor")
        .withArgs(corePoolId, vToken.address, "0", half);

      expect(await comptroller.isMarketListed(vToken.address)).to.be.true;
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

        beforeEach(async () => {
          comptrollerLens = await smock.fake<ComptrollerLens>("ComptrollerLens");
          await comptroller._setComptrollerLens(comptrollerLens.address);
          await comptroller._setCloseFactor(convertToUnit("0.5", 18));
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
          const errCode = await comptroller.callStatic.liquidateBorrowAllowed(
            vToken.address,
            vToken.address,
            accounts[0].address,
            root.address,
            convertToUnit("1", 18),
          );
          expect(errCode).to.equal(0);
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
        await comptroller.setIsBorrowAllowed(0, vToken.address, true);
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
        await comptroller.setIsBorrowAllowed(0, vToken.address, true);

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
        await comptroller.setIsBorrowAllowed(0, vToken.address, true);

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

  describe("E-Mode Pool", async () => {
    let comptroller: ComptrollerMock;
    let vToken: FakeContract<VToken>;
    let accessControl: FakeContract<IAccessControlManagerV5>;
    let oracle: FakeContract<PriceOracle>;
    let poolId;

    const corePoolId = 0;
    const oneMantissa = parseUnits("1", 18);
    const defaultCF = parseUnits("0.5", 18);
    const defaultLT = parseUnits("0.6", 18);
    const defaultLI = parseUnits("1.1", 18);

    const coreCF = parseUnits("0.3", 18);
    const coreLT = parseUnits("0.4", 18);
    const coreLI = parseUnits("1.1", 18);

    async function deploy(): Promise<SimpleComptrollerFixture & { vToken: FakeContract<VToken> }> {
      const contracts = await deploySimpleComptroller();
      const vToken = await smock.fake<VToken>("VToken");
      configureVToken(vToken, contracts.comptroller);
      await contracts.comptroller._supportMarket(vToken.address);
      const comptrollerLensFactory = await ethers.getContractFactory("ComptrollerLens");
      const comptrollerLens = await comptrollerLensFactory.deploy();
      await contracts.comptroller._setComptrollerLens(comptrollerLens.address);
      return { ...contracts, vToken };
    }

    beforeEach(async () => {
      ({ comptroller, vToken, accessControl, oracle } = await loadFixture(deploy));
      accessControl.isAllowedToCall.returns(true);
      configureOracle(oracle);
      await comptroller["setCollateralFactor(address,uint256,uint256)"](vToken.address, coreCF, coreLT);
      await comptroller["setLiquidationIncentive(address,uint256)"](vToken.address, coreLI);
      await comptroller.createPool("e-mode");
      poolId = await comptroller.lastPoolId();
      await comptroller.addPoolMarkets([poolId], [vToken.address]);
    });

    describe("createPool", () => {
      it("reverts if label is empty", async () => {
        await expect(comptroller.createPool("")).to.be.revertedWithCustomError(comptroller, "EmptyPoolLabel");
      });

      it("should increment poolId and stores label", async () => {
        const currentLastPoolId = await comptroller.lastPoolId();
        const newLabel = "test-pool";

        const tx = await comptroller.createPool(newLabel);
        await tx.wait();

        // poolId should increment by 1
        const newPoolId = currentLastPoolId.add(1);
        expect(await comptroller.lastPoolId()).to.equal(newPoolId);

        const poolData = await comptroller.pools(newPoolId);
        expect(poolData.label).to.equal(newLabel);

        await expect(tx).to.emit(comptroller, "PoolCreated").withArgs(newPoolId, newLabel);

        const returnedPoolId = await comptroller.callStatic.createPool("another-pool");
        expect(returnedPoolId).to.equal(newPoolId.add(1));
      });
    });

    describe("addPoolMarkets", () => {
      it("reverts if array lengths mismatch", async () => {
        await expect(
          comptroller.addPoolMarkets([poolId], [vToken.address, vToken.address]),
        ).to.be.revertedWithCustomError(comptroller, "ArrayLengthMismatch");
      });

      it("reverts if trying to add to core pool (poolId 0)", async () => {
        await expect(comptroller.addPoolMarkets([corePoolId], [vToken.address])).to.be.revertedWithCustomError(
          comptroller,
          "InvalidOperationForCorePool",
        );
      });

      it("reverts if pool does not exist", async () => {
        await expect(comptroller.addPoolMarkets([poolId + 1], [vToken.address]))
          .to.be.revertedWithCustomError(comptroller, "PoolDoesNotExist")
          .withArgs(poolId + 1);
      });

      it("reverts if market Already exist in the pool", async () => {
        await expect(comptroller.addPoolMarkets([poolId], [vToken.address]))
          .to.be.revertedWithCustomError(comptroller, "MarketAlreadyListed")
          .withArgs(poolId, vToken.address);
      });

      it("reverts if market not listed in core pool", async () => {
        const fakeVToken = await smock.fake<VToken>("VToken");
        await expect(comptroller.addPoolMarkets([poolId], [fakeVToken.address])).to.be.revertedWithCustomError(
          comptroller,
          "MarketNotListedInCorePool",
        );
      });

      it("should add multiple markets", async () => {
        const vToken1 = await smock.fake<VToken>("VToken");
        const vToken2 = await smock.fake<VToken>("VToken");

        await comptroller._supportMarket(vToken1.address);
        await comptroller._supportMarket(vToken2.address);

        await comptroller.addPoolMarkets([poolId, poolId], [vToken1.address, vToken2.address]);

        const vTokensInPool = await comptroller.getPoolVTokens(poolId);
        expect(vTokensInPool).to.include(vToken1.address);
        expect(vTokensInPool).to.include(vToken2.address);
      });
    });

    describe("setIsBorrowAllowed", () => {
      it("reverts if pool does not exist", async () => {
        await expect(comptroller.setIsBorrowAllowed(poolId + 1, vToken.address, true))
          .to.be.revertedWithCustomError(comptroller, "PoolDoesNotExist")
          .withArgs(poolId + 1);
      });

      it("reverts if market is not listed in the pool", async () => {
        const fakeVToken = await smock.fake<VToken>("VToken");
        await expect(comptroller.setIsBorrowAllowed(poolId, fakeVToken.address, true)).to.be.revertedWithCustomError(
          comptroller,
          "MarketConfigNotFound",
        );
      });

      it("should return silenty if borrowAllowed is already set to desired value", async () => {
        await comptroller.setIsBorrowAllowed(poolId, vToken.address, true);
        await expect(comptroller.setIsBorrowAllowed(poolId, vToken.address, true)).to.not.emit(
          comptroller,
          "BorrowAllowedUpdated",
        );
      });

      it("should update borrowAllowed and emits event", async () => {
        await expect(comptroller.setIsBorrowAllowed(poolId, vToken.address, true))
          .to.emit(comptroller, "BorrowAllowedUpdated")
          .withArgs(poolId, vToken.address, false, true);

        let [, , , , , , isBorrowAllowed] = await comptroller.poolMarkets(poolId, vToken.address);
        expect(isBorrowAllowed).to.be.true;

        // swtitch to false
        await comptroller.setIsBorrowAllowed(poolId, vToken.address, false);
        [, , , , , , isBorrowAllowed] = await comptroller.poolMarkets(poolId, vToken.address);
        expect(isBorrowAllowed).to.be.false;
      });
    });

    describe("setCollateralFactor for specific poolId", () => {
      it("reverts if pool does not exist", async () => {
        await expect(
          comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
            poolId + 1,
            vToken.address,
            defaultCF,
            defaultLT,
          ),
        )
          .to.be.revertedWithCustomError(comptroller, "PoolDoesNotExist")
          .withArgs(poolId + 1);
      });

      it("reverts if market is not listed in the pool", async () => {
        const fakeVToken = await smock.fake<VToken>("VToken");
        await expect(
          comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
            poolId,
            fakeVToken.address,
            defaultCF,
            defaultLT,
          ),
        ).to.be.revertedWith("market not listed");
      });

      it("reverts on invalid parameter bounds", async () => {
        // CF > 1
        await expect(
          comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
            poolId,
            vToken.address,
            oneMantissa.add(1),
            defaultLT,
          ),
        ).to.emit(comptroller, "Failure");

        // LT > 1
        await expect(
          comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
            poolId,
            vToken.address,
            defaultCF,
            oneMantissa.add(1),
          ),
        ).to.emit(comptroller, "Failure");

        // LT < CF
        const lowerLT = parseUnits("0.4", 18);
        await expect(
          comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
            poolId,
            vToken.address,
            defaultCF,
            lowerLT,
          ),
        ).to.emit(comptroller, "Failure");
      });

      it("should update collateral factor and liquidation threshold and emits event", async () => {
        await expect(
          comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
            poolId,
            vToken.address,
            defaultCF,
            defaultLT,
          ),
        )
          .to.emit(comptroller, "NewCollateralFactor")
          .withArgs(poolId, vToken.address, 0, defaultCF);

        const [, cf, , lt] = await comptroller.poolMarkets(poolId, vToken.address);
        expect(cf).to.equal(defaultCF);
        expect(lt).to.equal(defaultLT);
      });
    });

    describe("setLiquidationIncentive with poolId", () => {
      it("reverts if pool does not exist", async () => {
        await expect(
          comptroller["setLiquidationIncentive(uint96,address,uint256)"](poolId + 1, vToken.address, defaultLI),
        )
          .to.be.revertedWithCustomError(comptroller, "PoolDoesNotExist")
          .withArgs(poolId + 1);
      });

      it("reverts if market is not listed in the pool", async () => {
        const fakeVToken = await smock.fake<VToken>("VToken");
        await expect(
          comptroller["setLiquidationIncentive(uint96,address,uint256)"](poolId, fakeVToken.address, defaultLI),
        ).to.be.revertedWith("market not listed");
      });

      it("reverts on invalid parameter bounds", async () => {
        // LI < 1
        const lessThanOne = parseUnits("0.9", 18);
        await expect(
          comptroller["setLiquidationIncentive(uint96,address,uint256)"](poolId, vToken.address, lessThanOne),
        ).to.be.revertedWith("incentive < 1e18");
      });

      it("should update liquidation incentive and emits event", async () => {
        await expect(comptroller["setLiquidationIncentive(uint96,address,uint256)"](poolId, vToken.address, defaultLI))
          .to.emit(comptroller, "NewLiquidationIncentive")
          .withArgs(poolId, vToken.address, 0, defaultLI);

        const [, , , , li] = await comptroller.poolMarkets(poolId, vToken.address);
        expect(li).to.equal(defaultLI);
      });
    });

    describe("removePoolMarket", () => {
      it("reverts if pool does not exist", async () => {
        await expect(comptroller.removePoolMarket(poolId + 1, vToken.address))
          .to.be.revertedWithCustomError(comptroller, "PoolMarketNotFound")
          .withArgs(poolId + 1, vToken.address);
      });

      it("reverts if market is not listed in the pool", async () => {
        const fakeVToken = await smock.fake<VToken>("VToken");
        await expect(comptroller.removePoolMarket(poolId, fakeVToken.address))
          .to.be.revertedWithCustomError(comptroller, "PoolMarketNotFound")
          .withArgs(poolId, fakeVToken.address);
      });

      it("removes the market and emits event", async () => {
        // Add an extra market
        const vToken2 = await smock.fake<VToken>("VToken");
        await comptroller._supportMarket(vToken2.address);
        await comptroller.addPoolMarkets([poolId], [vToken2.address]);

        // Remove one
        await expect(comptroller.removePoolMarket(poolId, vToken2.address))
          .to.emit(comptroller, "PoolMarketRemoved")
          .withArgs(poolId, vToken2.address);

        // Confirm only one remains
        const vTokens = await comptroller.getPoolVTokens(poolId);
        expect(vTokens.length).to.equal(1);
        expect(vTokens).to.deep.equal([vToken.address]);
      });

      it("should delete pool vTokens array if last market removed", async () => {
        await expect(comptroller.removePoolMarket(poolId, vToken.address))
          .to.emit(comptroller, "PoolMarketRemoved")
          .withArgs(poolId, vToken.address);

        const vTokens = await comptroller.getPoolVTokens(poolId);
        expect(vTokens.length).to.equal(0);
      });
    });

    describe("poolEnter", () => {
      it("reverts if entering the wrong pool", async () => {
        await expect(comptroller.enterPool(poolId + 1)).to.be.revertedWithCustomError(comptroller, "PoolDoesNotExist");
      });

      it("reverts if entering the same pool", async () => {
        await comptroller.enterPool(poolId); // success
        await expect(comptroller.enterPool(poolId)).to.be.revertedWithCustomError(comptroller, "AlreadyInSelectedPool");
      });

      it("reverts if user has invalid pool borrows", async () => {
        await comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
          poolId,
          vToken.address,
          defaultCF,
          defaultLT,
        );
        await comptroller["setLiquidationIncentive(uint96,address,uint256)"](poolId, vToken.address, defaultLI);
        await comptroller.setIsBorrowAllowed(poolId, vToken.address, false);
        vToken.borrowBalanceStored.returns(parseUnits("10", 18));
        await comptroller.enterMarkets([vToken.address]);

        await expect(comptroller.enterPool(poolId)).to.be.revertedWithCustomError(
          comptroller,
          "IncompatibleBorrowedAssets",
        );
      });

      it("should emit PoolSelected on successful pool switch", async () => {
        await comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
          poolId,
          vToken.address,
          defaultCF,
          defaultLT,
        );
        await comptroller["setLiquidationIncentive(uint96,address,uint256)"](poolId, vToken.address, defaultLI);
        await expect(comptroller.enterPool(poolId))
          .to.emit(comptroller, "PoolSelected")
          .withArgs(root.address, corePoolId, poolId);
      });
    });

    describe("effective risk params", () => {
      it("should return emode params if market included in the emode category, else falls back to core", async () => {
        await comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
          poolId,
          vToken.address,
          defaultCF,
          defaultLT,
        );
        await comptroller["setLiquidationIncentive(uint96,address,uint256)"](poolId, vToken.address, defaultLI);

        // Core pool params should be used initially (userPool 0)
        let cf = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 0);
        let lt = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 1);
        expect(cf).to.equal(coreCF);
        expect(lt).to.equal(coreLT);

        // Enter e-mode pool → effective params should update to pool defaults
        await comptroller.enterPool(poolId);
        cf = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 0);
        lt = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 1);
        expect(cf).to.equal(defaultCF);
        expect(lt).to.equal(defaultLT);

        // set e-mode pool isActive to false → fallback to core pool params
        await comptroller.setPoolActive(poolId, false);
        cf = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 0);
        lt = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 1);
        expect(cf).to.equal(coreCF);
        expect(lt).to.equal(coreLT);

        // set e-mode pool isActive to true → effective params should update to pool defaults
        await comptroller.setPoolActive(poolId, true);
        cf = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 0);
        lt = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 1);
        expect(cf).to.equal(defaultCF);
        expect(lt).to.equal(defaultLT);
      });
    });

    describe("setAllowCorePoolFallback", () => {
      it("should update the AllowCorePoolFallback", async () => {
        await expect(comptroller.setAllowCorePoolFallback(poolId, true))
          .to.emit(comptroller, "PoolFallbackStatusUpdated")
          .withArgs(poolId, false, true);

        const pool = await comptroller.pools(poolId);
        expect(pool.allowCorePoolFallback).to.equal(true);
      });

      it("should use risk factors as zero if market not configured in the pool", async () => {
        await comptroller.removePoolMarket(poolId, vToken.address);
        await comptroller.enterPool(poolId);
        const cf = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 0);
        const lt = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 1);
        expect(cf).to.equal(0);
        expect(lt).to.equal(0);
      });

      it("should use core pool risk factors if market not configured in the pool and allowCorePoolFallback is true", async () => {
        await comptroller.setAllowCorePoolFallback(poolId, true);
        await comptroller.removePoolMarket(poolId, vToken.address);
        await comptroller.enterPool(poolId);
        const cf = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 0);
        const lt = await comptroller.getEffectiveLtvFactor(root.getAddress(), vToken.address, 1);
        expect(cf).to.equal(coreCF);
        expect(lt).to.equal(coreLT);
      });
    });

    describe("Pool isActive Status", () => {
      it("reverts if pool does not exist", async () => {
        await expect(comptroller.setPoolActive(poolId + 1, false))
          .to.be.revertedWithCustomError(comptroller, "PoolDoesNotExist")
          .withArgs(poolId + 1);
      });

      it("reverts if tries to set for core pool", async () => {
        await expect(comptroller.setPoolActive(corePoolId, false)).to.be.revertedWithCustomError(
          comptroller,
          "InvalidOperationForCorePool",
        );
      });

      it("should return silenty if isActive is already set to desired value", async () => {
        await comptroller.setPoolActive(poolId, true);
        await expect(comptroller.setPoolActive(poolId, true)).to.not.emit(comptroller, "BorrowAllowedUpdated");
      });

      it("should update isActive and emits event", async () => {
        await expect(comptroller.setPoolActive(poolId, false))
          .to.emit(comptroller, "PoolActiveStatusUpdated")
          .withArgs(poolId, true, false);

        let [, isActive] = await comptroller.pools(poolId);
        expect(isActive).to.be.false;

        // swtitch to false
        await comptroller.setPoolActive(poolId, true);
        [, isActive] = await comptroller.pools(poolId);
        expect(isActive).to.be.true;
      });
    });

    describe("setPoolLabel", () => {
      it("should update the pool label", async () => {
        const newPoolLabel = "stablecoins e-mode";
        await expect(comptroller.setPoolLabel(poolId, newPoolLabel))
          .to.emit(comptroller, "PoolLabelUpdated")
          .withArgs(poolId, "e-mode", newPoolLabel);

        const pool = await comptroller.pools(poolId);
        expect(pool.label).to.equal(newPoolLabel);
      });
    });

    describe("Market Getters", () => {
      it("returns correct key for core pool", async () => {
        const key = await comptroller.getPoolMarketIndex(corePoolId, vToken.address);
        const expected = ethers.utils.hexZeroPad(vToken.address, 32);
        expect(key.toLowerCase()).to.equal(expected.toLowerCase());
      });

      it("returns correct core pool market info using markets()", async () => {
        const [isListed, cf, isVenus, lt, li, marketPoolId, isBorrowAllowed] = await comptroller.markets(
          vToken.address,
        );

        expect(isListed).to.be.true;
        expect(cf).to.equal(coreCF);
        expect(isVenus).to.be.false;
        expect(lt).to.equal(coreLT);
        expect(li).to.equal(coreLI);
        expect(marketPoolId).to.equal(corePoolId);
        expect(isBorrowAllowed).to.be.false;
      });

      it("returns correct pool market info using poolMarkets()", async () => {
        await comptroller["setCollateralFactor(uint96,address,uint256,uint256)"](
          poolId,
          vToken.address,
          defaultCF,
          defaultLT,
        );
        await comptroller["setLiquidationIncentive(uint96,address,uint256)"](poolId, vToken.address, defaultLI);
        await comptroller.setIsBorrowAllowed(poolId, vToken.address, true);

        const [isListed, cf, isVenus, lt, li, marketPoolId, isBorrowAllowed] = await comptroller.poolMarkets(
          poolId,
          vToken.address,
        );

        expect(isListed).to.be.true;
        expect(cf).to.equal(defaultCF);
        expect(isVenus).to.be.false;
        expect(lt).to.equal(defaultLT);
        expect(li).to.equal(defaultLI);
        expect(marketPoolId).to.equal(poolId);
        expect(isBorrowAllowed).to.be.true;
      });

      it("returns all the markets of the specific pool", async () => {
        const vToken1 = await smock.fake<VToken>("VToken");
        const vToken2 = await smock.fake<VToken>("VToken");
        await comptroller._supportMarket(vToken1.address);
        await comptroller._supportMarket(vToken2.address);

        const poolId = await comptroller.callStatic.createPool("vToken-emode");
        await comptroller.createPool("vToken-emode");
        await comptroller.addPoolMarkets([poolId, poolId], [vToken1.address, vToken2.address]);

        const vTokens = await comptroller.getPoolVTokens(poolId);
        expect(vTokens).to.include(vToken1.address);
        expect(vTokens).to.include(vToken2.address);
      });
    });
  });
});
