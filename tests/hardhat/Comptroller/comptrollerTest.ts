import { constants, Signer } from "ethers";
import * as hre from "hardhat";
import { ethers } from "hardhat";
import { smock, MockContract, FakeContract } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
const { expect } = chai;
chai.use(smock.matchers);

import {
  Comptroller, Comptroller__factory, PriceOracle, ComptrollerLens, ComptrollerLens__factory,
  VToken, EIP20Interface, EIP20Interface__factory
} from "../../../typechain";
import { convertToUnit } from "../../../helpers/utils";
import { ComptrollerErrorReporter } from "../util/Errors";


type SimpleComptrollerFixture = {
  oracle: FakeContract<PriceOracle>,
  comptrollerLens: MockContract<ComptrollerLens>,
  comptroller: MockContract<Comptroller>
};

async function deploySimpleComptroller(): Promise<SimpleComptrollerFixture> {
  const oracle = await smock.fake<PriceOracle>("PriceOracle");
  const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
  const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
  const comptroller = await ComptrollerFactory.deploy();
  const comptrollerLens = await ComptrollerLensFactory.deploy();
  await comptroller._setComptrollerLens(comptrollerLens.address);
  await comptroller._setPriceOracle(oracle.address);
  await comptroller._setLiquidationIncentive(convertToUnit("1", 18));
  return { oracle, comptroller, comptrollerLens };
}

function configureOracle(oracle: FakeContract<PriceOracle>) {
  oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));
}

function configureVToken(vToken: FakeContract<VToken>, comptroller: MockContract<Comptroller>) {
  vToken.comptroller.returns(comptroller.address);
  vToken.isVToken.returns(true);
  vToken.totalSupply.returns(convertToUnit("1000000", 18));
  vToken.totalBorrows.returns(convertToUnit("900000", 18));
}

describe("Comptroller", () => {
  let root: Signer;
  let accounts: Signer[];

  before(async () => {
    [root, ...accounts] = await ethers.getSigners();
  });

  describe('constructor', () => {
    it("on success it sets admin to creator and pendingAdmin is unset", async () => {
      const { comptroller } = await loadFixture(deploySimpleComptroller);
      expect(await comptroller.admin()).to.equal(await root.getAddress());
      expect(await comptroller.pendingAdmin()).to.equal(constants.AddressZero);
    });
  });

  describe("_setLiquidationIncentive", () => {
    let comptroller: MockContract<Comptroller>;
    const initialIncentive = convertToUnit("1", 18);
    const validIncentive = convertToUnit("1.1", 18);
    const tooSmallIncentive = convertToUnit("0.99999", 18);

    beforeEach(async () => {
      ({ comptroller } = await loadFixture(deploySimpleComptroller));
    });

    it("fails if called by non-admin", async () => {
      await expect(
        comptroller.connect(accounts[0])._setLiquidationIncentive(initialIncentive)
      ).to.be.revertedWith("only admin can");
      expect(await comptroller.liquidationIncentiveMantissa()).to.equal(initialIncentive);
    });

    it("fails if incentive is less than 1e18", async () => {
      await expect(
        comptroller._setLiquidationIncentive(tooSmallIncentive)
      ).to.be.revertedWith("incentive must be over 1e18");
    });

    it("accepts a valid incentive and emits a NewLiquidationIncentive event", async () => {
      expect(await comptroller.callStatic._setLiquidationIncentive(validIncentive))
        .to.equal(ComptrollerErrorReporter.Error.NO_ERROR);
      expect(await comptroller._setLiquidationIncentive(validIncentive))
        .to.emit(comptroller, "NewLiquidationIncentive")
        .withArgs(initialIncentive, validIncentive);
      expect(await comptroller.liquidationIncentiveMantissa()).to.equal(validIncentive);
    });
  });

  describe('Non zero address check', () => {
    let comptroller: MockContract<Comptroller>;
    
    beforeEach(async () => {
      ({ comptroller } = await loadFixture(deploySimpleComptroller));
    });

    type FuncNames = keyof Comptroller["functions"];

    function testZeroAddress<Func extends FuncNames>(funcName: Func, args: Parameters<Comptroller[Func]>) {
      it(funcName, async () => {
        await expect(
          comptroller[funcName](...args)
        ).to.be.revertedWith("can't be zero address");
      });
    }
    testZeroAddress('_setPriceOracle', [constants.AddressZero]);
    testZeroAddress('_setCollateralFactor', [constants.AddressZero, 0]);
    testZeroAddress('_setPauseGuardian', [constants.AddressZero]);
    testZeroAddress('_setBorrowCapGuardian', [constants.AddressZero]);
    testZeroAddress('_setVAIController', [constants.AddressZero]);
    testZeroAddress('_setTreasuryData', [constants.AddressZero, constants.AddressZero, 0]);
    testZeroAddress('_setComptrollerLens', [constants.AddressZero]);
    testZeroAddress('_setVAIVaultInfo', [constants.AddressZero, 0, 0]);
    testZeroAddress('_setVenusSpeed', [constants.AddressZero, 0]);
  })

  describe("_setPriceOracle", () => {
    let comptroller: MockContract<Comptroller>;
    let oracle: FakeContract<PriceOracle>;
    let newOracle: FakeContract<PriceOracle>;

    type Contracts = SimpleComptrollerFixture & {
      newOracle: FakeContract<PriceOracle>;
    };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const newOracle = await smock.fake<PriceOracle>("PriceOracle");
      return { ...contracts, newOracle };
    }

    beforeEach(async () => {
      ({ comptroller, oracle, newOracle } = await loadFixture(deploy));
    });

    it("fails if called by non-admin", async () => {
      await expect(comptroller.connect(accounts[0])._setPriceOracle(oracle.address))
        .to.be.revertedWith("only admin can");
      expect(await comptroller.oracle()).to.equal(oracle.address);
    });

    it("accepts a valid price oracle and emits a NewPriceOracle event", async () => {
      expect(await comptroller._setPriceOracle(newOracle.address))
        .to.emit(comptroller, "NewPriceOracle")
        .withArgs(oracle.address, newOracle.address);
      expect(await comptroller.oracle()).to.equal(newOracle.address);
    });
  });

  describe("_setComptrollerLens", () => {
    let comptroller: MockContract<Comptroller>;
    let comptrollerLens: MockContract<ComptrollerLens>;

    type Contracts = {
      comptrollerLens: MockContract<ComptrollerLens>,
      comptroller: MockContract<Comptroller>
    };

    async function deploy(): Promise<Contracts> {
      const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
      const comptroller = await ComptrollerFactory.deploy();
      const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
      const comptrollerLens = await ComptrollerLensFactory.deploy();
      return { comptroller, comptrollerLens };
    }

    beforeEach(async () => {
      ({ comptroller, comptrollerLens } = await loadFixture(deploy));
    });

    it("fails if not called by admin", async () => {
      await expect(
        comptroller.connect(accounts[0])._setComptrollerLens(comptrollerLens.address)
      ).to.be.revertedWith("only admin can");
    });

    it("should fire an event", async () => {
      const { comptroller, comptrollerLens } = await loadFixture(deploy);
      const oldComptrollerLensAddress = await comptroller.comptrollerLens();
      expect(await comptroller._setComptrollerLens(comptrollerLens.address))
        .to.emit(comptroller, "NewComptrollerLens")
        .withArgs(oldComptrollerLensAddress, comptrollerLens.address);
    });
  });

  describe("_setCloseFactor", () => {
    let comptroller: MockContract<Comptroller>;

    beforeEach(async () => {
      ({ comptroller } = await loadFixture(deploySimpleComptroller));
    });

    it("fails if not called by admin", async () => {
      await expect(comptroller.connect(accounts[0])._setCloseFactor(1))
        .to.be.revertedWith("only admin can");
    });
  });

  describe("_setCollateralFactor", () => {
    const half = convertToUnit("0.5", 18);
    let comptroller: MockContract<Comptroller>;
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

    it("fails if not called by admin", async () => {
      await expect(
        comptroller.connect(accounts[0])._setCollateralFactor(vToken.address, half)
      ).to.be.revertedWith("only admin can");
    });

    it("fails if asset is not listed", async () => {
      await expect(
        comptroller._setCollateralFactor(vToken.address, half)
      ).to.be.revertedWith("market not listed");
    });

    it("fails if factor is set without an underlying price", async () => {
      await comptroller._supportMarket(vToken.address);
      oracle.getUnderlyingPrice.returns(0);
      expect(await comptroller._setCollateralFactor(vToken.address, half))
        .to.emit(comptroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.PRICE_ERROR,
          ComptrollerErrorReporter.FailureInfo.SET_COLLATERAL_FACTOR_WITHOUT_PRICE
        );
    });

    it("succeeds and sets market", async () => {
      await comptroller._supportMarket(vToken.address);
      expect(await comptroller._setCollateralFactor(vToken.address, half))
        .to.emit(comptroller, "NewCollateralFactor")
        .withArgs(vToken.address, "0", half);
    });
  });

  describe("_supportMarket", () => {
    let comptroller: MockContract<Comptroller>;
    let oracle: FakeContract<PriceOracle>;
    let vToken1: FakeContract<VToken>;
    let vToken2: FakeContract<VToken>;
    let token: FakeContract<EIP20Interface>;

    type Contracts = SimpleComptrollerFixture & {
      vToken1: FakeContract<VToken>;
      vToken2: FakeContract<VToken>;
      token: FakeContract<EIP20Interface>;
    };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const vToken1 = await smock.fake<VToken>("VToken");
      const vToken2 = await smock.fake<VToken>("VToken");
      const token = await smock.fake<EIP20Interface>("EIP20Interface");
      return { ...contracts, vToken1, vToken2, token };
    }

    beforeEach(async () => {
      ({ comptroller, oracle, vToken1, vToken2, token } = await loadFixture(deploy));
      configureOracle(oracle);
      configureVToken(vToken1, comptroller);
      configureVToken(vToken2, comptroller);
    });

    it("fails if not called by admin", async () => {
      await expect(
        comptroller.connect(accounts[0])._supportMarket(vToken1.address)
      ).to.be.revertedWith("only admin can");
    });

    it("fails if asset is not a VToken", async () => {
      await expect(comptroller._supportMarket(token.address)).to.be.reverted;
    });

    it("succeeds and sets market", async () => {
      expect(await comptroller._supportMarket(vToken1.address))
        .to.emit(comptroller, "MarketListed")
        .withArgs(vToken1.address);
    });

    it("cannot list a market a second time", async () => {
      const tx1 = await comptroller._supportMarket(vToken1.address);
      const tx2 = await comptroller._supportMarket(vToken1.address);
      expect(tx1).to.emit(comptroller, "MarketListed").withArgs(vToken1.address);
      expect(tx2).to.emit(comptroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.MARKET_ALREADY_LISTED,
          ComptrollerErrorReporter.FailureInfo.SUPPORT_MARKET_EXISTS
        );
    });

    it("can list two different markets", async () => {
      const tx1 = await comptroller._supportMarket(vToken1.address);
      const tx2 = await comptroller._supportMarket(vToken2.address);
      expect(tx1).to.emit(comptroller, "MarketListed").withArgs(vToken1.address);
      expect(tx2).to.emit(comptroller, "MarketListed").withArgs(vToken2.address);
    });
  });

  describe("redeemVerify", () => {
    let comptroller: MockContract<Comptroller>;
    let vToken: FakeContract<VToken>;

    type Contracts = SimpleComptrollerFixture & { vToken: FakeContract<VToken> };

    async function deploy(): Promise<Contracts> {
      const contracts = await deploySimpleComptroller();
      const vToken = await smock.fake<VToken>("VToken");
      await contracts.comptroller._supportMarket(vToken.address);
      return { ...contracts, vToken };
    }

    beforeEach(async () => {
      ({ comptroller, vToken } = await loadFixture(deploy));
      configureVToken(vToken, comptroller);
    });

    it("should allow you to redeem 0 underlying for 0 tokens", async () => {
      await comptroller.redeemVerify(vToken.address, await accounts[0].getAddress(), 0, 0);
    });

    it("should allow you to redeem 5 underlyig for 5 tokens", async () => {
      await comptroller.redeemVerify(vToken.address, await accounts[0].getAddress(), 5, 5);
    });

    it("should not allow you to redeem 5 underlying for 0 tokens", async () => {
      await expect(comptroller.redeemVerify(vToken.address, await accounts[0].getAddress(), 5, 0))
        .to.be.revertedWith("redeemTokens zero");
    });
  })
});
