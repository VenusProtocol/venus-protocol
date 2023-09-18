import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  Comptroller,
  ComptrollerLens,
  ComptrollerLens__factory,
  Comptroller__factory,
  EIP20Interface,
  IAccessControlManager,
  PriceOracle,
  VAIController,
  VToken,
} from "../../../typechain";
import { ComptrollerErrorReporter } from "../util/Errors";

const { expect } = chai;
chai.use(smock.matchers);

type SimpleComptrollerFixture = {
  oracle: FakeContract<PriceOracle>;
  accessControl: FakeContract<IAccessControlManager>;
  comptrollerLens: MockContract<ComptrollerLens>;
  comptroller: MockContract<Comptroller>;
};

async function deploySimpleComptroller(): Promise<SimpleComptrollerFixture> {
  const oracle = await smock.fake<PriceOracle>("PriceOracle");
  const accessControl = await smock.fake<IAccessControlManager>("AccessControlManager");
  accessControl.isAllowedToCall.returns(true);
  const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
  const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
  const comptroller = await ComptrollerFactory.deploy();
  const comptrollerLens = await ComptrollerLensFactory.deploy();
  await comptroller._setAccessControl(accessControl.address);
  await comptroller._setComptrollerLens(comptrollerLens.address);
  await comptroller._setPriceOracle(oracle.address);
  await comptroller._setLiquidationIncentive(convertToUnit("1", 18));
  return { oracle, comptroller, comptrollerLens, accessControl };
}

function configureOracle(oracle: FakeContract<PriceOracle>) {
  oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));
}

function configureVToken(vToken: FakeContract<VToken>, comptroller: MockContract<Comptroller>) {
  vToken.comptroller.returns(comptroller.address);
  vToken.isVToken.returns(true);
  vToken.exchangeRateStored.returns(convertToUnit("2", 18));
  vToken.totalSupply.returns(convertToUnit("1000000", 18));
  vToken.totalBorrows.returns(convertToUnit("900000", 18));
}

describe("Comptroller", () => {
  let root: SignerWithAddress;
  let accounts: SignerWithAddress[];

  before(async () => {
    [root, ...accounts] = await ethers.getSigners();
  });

  describe("constructor", () => {
    it("on success it sets admin to creator and pendingAdmin is unset", async () => {
      const { comptroller } = await loadFixture(deploySimpleComptroller);
      expect(await comptroller.admin()).to.equal(root.address);
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

    it("fails if incentive is less than 1e18", async () => {
      await expect(comptroller._setLiquidationIncentive(tooSmallIncentive)).to.be.revertedWith("incentive < 1e18");
    });

    it("accepts a valid incentive and emits a NewLiquidationIncentive event", async () => {
      expect(await comptroller.callStatic._setLiquidationIncentive(validIncentive)).to.equal(
        ComptrollerErrorReporter.Error.NO_ERROR,
      );
      await expect(await comptroller._setLiquidationIncentive(validIncentive))
        .to.emit(comptroller, "NewLiquidationIncentive")
        .withArgs(initialIncentive, validIncentive);
      expect(await comptroller.liquidationIncentiveMantissa()).to.equal(validIncentive);
    });
  });

  describe("Non zero address check", () => {
    let comptroller: MockContract<Comptroller>;

    beforeEach(async () => {
      ({ comptroller } = await loadFixture(deploySimpleComptroller));
    });

    type FuncNames = keyof Comptroller["functions"];

    function testZeroAddress<Func extends FuncNames>(funcName: Func, args: Parameters<Comptroller[Func]>) {
      it(funcName, async () => {
        await expect(comptroller[funcName](...args)).to.be.revertedWith("can't be zero address");
      });
    }
    testZeroAddress("_setPriceOracle", [constants.AddressZero]);
    testZeroAddress("_setCollateralFactor", [constants.AddressZero, 0]);
    testZeroAddress("_setPauseGuardian", [constants.AddressZero]);
    testZeroAddress("_setVAIController", [constants.AddressZero]);
    testZeroAddress("_setTreasuryData", [constants.AddressZero, constants.AddressZero, 0]);
    testZeroAddress("_setComptrollerLens", [constants.AddressZero]);
    testZeroAddress("_setVAIVaultInfo", [constants.AddressZero, 0, 0]);
    testZeroAddress("_setVenusSpeeds", [[constants.AddressZero], [0], [0]]);
  });

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
      await expect(comptroller.connect(accounts[0])._setPriceOracle(oracle.address)).to.be.revertedWith(
        "only admin can",
      );
      expect(await comptroller.oracle()).to.equal(oracle.address);
    });

    it("accepts a valid price oracle and emits a NewPriceOracle event", async () => {
      await expect(await comptroller._setPriceOracle(newOracle.address))
        .to.emit(comptroller, "NewPriceOracle")
        .withArgs(oracle.address, newOracle.address);
      expect(await comptroller.oracle()).to.equal(newOracle.address);
    });
  });

  describe("_setComptrollerLens", () => {
    let comptroller: MockContract<Comptroller>;
    let comptrollerLens: MockContract<ComptrollerLens>;

    type Contracts = {
      comptrollerLens: MockContract<ComptrollerLens>;
      comptroller: MockContract<Comptroller>;
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
      await expect(comptroller.connect(accounts[0])._setComptrollerLens(comptrollerLens.address)).to.be.revertedWith(
        "only admin can",
      );
    });

    it("should fire an event", async () => {
      const { comptroller, comptrollerLens } = await loadFixture(deploy);
      const oldComptrollerLensAddress = await comptroller.comptrollerLens();
      await expect(await comptroller._setComptrollerLens(comptrollerLens.address))
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
      await expect(comptroller.connect(accounts[0])._setCloseFactor(1)).to.be.revertedWith("only admin can");
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

    it("fails if asset is not listed", async () => {
      await expect(comptroller._setCollateralFactor(vToken.address, half)).to.be.revertedWith("market not listed");
    });

    it("fails if factor is set without an underlying price", async () => {
      await comptroller._supportMarket(vToken.address);
      oracle.getUnderlyingPrice.returns(0);
      await expect(await comptroller._setCollateralFactor(vToken.address, half))
        .to.emit(comptroller, "Failure")
        .withArgs(
          ComptrollerErrorReporter.Error.PRICE_ERROR,
          ComptrollerErrorReporter.FailureInfo.SET_COLLATERAL_FACTOR_WITHOUT_PRICE,
          0,
        );
    });

    it("succeeds and sets market", async () => {
      await comptroller._supportMarket(vToken.address);
      await expect(await comptroller._setCollateralFactor(vToken.address, half))
        .to.emit(comptroller, "NewCollateralFactor")
        .withArgs(vToken.address, "0", half);
    });
  });

  describe("_setForcedLiquidation", async () => {
    let comptroller: MockContract<Comptroller>;
    let vToken: FakeContract<VToken>;
    let accessControl: FakeContract<IAccessControlManager>;

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

    it("fails if asset is not a VToken", async () => {
      await expect(comptroller._supportMarket(token.address)).to.be.reverted;
    });

    it("succeeds and sets market", async () => {
      await expect(await comptroller._supportMarket(vToken1.address))
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

  describe("Hooks", () => {
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

    describe("mintAllowed", () => {
      beforeEach(async () => {
        ({ comptroller, vToken } = await loadFixture(deploy));
        configureVToken(vToken, comptroller);
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
        const someVToken = await smock.fake<VToken>("VToken");
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

      describe("isForcedLiquidationEnabled == true", async () => {
        beforeEach(async () => {
          await comptroller._setForcedLiquidation(vToken.address, true);
        });

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

      describe("isForcedLiquidationEnabled == false", async () => {
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
  });
});
