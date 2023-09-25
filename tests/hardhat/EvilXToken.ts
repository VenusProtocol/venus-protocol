import { smock } from "@defi-wonderland/smock";
import chai from "chai";
import { ethers } from "hardhat";

import { convertToUnit } from "../../helpers/utils";
import { ComptrollerHarness__factory, IAccessControlManager } from "../../typechain";

const { expect } = chai;

describe("Evil Token test", async () => {
  let vToken1, vToken2, vToken3, unitroller, user;

  beforeEach(async () => {
    const [root, account1] = await ethers.getSigners();

    const accessControlMock = await smock.fake<IAccessControlManager>("IAccessControlManager");
    accessControlMock.isAllowedToCall.returns(true);

    user = account1;
    const cf1 = 0.5,
      cf2 = 0.666,
      cf3 = 0,
      up1 = 3,
      up2 = 2.718,
      up3 = 1;

    const comptrollerLensFactory = await ethers.getContractFactory("ComptrollerLens");
    const comptrollerLens = await comptrollerLensFactory.deploy();
    await comptrollerLens.deployed();

    const unitrollerFactory = await ethers.getContractFactory("Unitroller");
    unitroller = await unitrollerFactory.deploy();
    await unitroller.deployed();

    const comptrollerFactory = await ethers.getContractFactory("ComptrollerHarness");
    const comptroller = await comptrollerFactory.deploy();
    await comptroller.deployed();

    const priceOracleFactory = await ethers.getContractFactory("SimplePriceOracle");
    const priceOracle = await priceOracleFactory.deploy();
    await priceOracle.deployed();

    const xvsFactory = await ethers.getContractFactory("XVS");
    const xvs = await xvsFactory.deploy(root.address);
    await xvs.deployed();

    const venusRate = 1;

    await unitroller._setPendingImplementation(comptroller.address);
    await comptroller._become(unitroller.address);

    unitroller = ComptrollerHarness__factory.connect(unitroller.address, root);

    await unitroller._setAccessControl(accessControlMock.address);

    await unitroller._setLiquidationIncentive(convertToUnit(1.1, 18));
    await unitroller._setCloseFactor(convertToUnit(0.8, 18));
    await unitroller._setPriceOracle(priceOracle.address);
    await unitroller._setComptrollerLens(comptrollerLens.address);
    await unitroller.setXVSAddress(xvs.address); // harness only
    await unitroller.harnessSetVenusRate(venusRate);

    await unitroller._setTreasuryData(account1.address, account1.address, 1e14);

    const borrowRate = 1e10;

    const interestRateModelFactory = await ethers.getContractFactory("InterestRateModelHarness");
    const interestRateModel = await interestRateModelFactory.deploy(borrowRate);
    await interestRateModel.deployed();
    const decimals = 18;
    const symbol = "vBNB";
    const name = `VToken ${symbol}`;
    const admin = root;
    const quantity = 1e10;

    const underlying1Factory = await ethers.getContractFactory("BEP20Harness");
    const underlying1 = await underlying1Factory.deploy(quantity, name, decimals, symbol);
    await underlying1.deployed();

    const vDelegatee1Factory = await ethers.getContractFactory("VBep20MockDelegate");
    const vDelegatee1 = await vDelegatee1Factory.deploy();
    await vDelegatee1.deployed();

    const vDelegator1Factory = await ethers.getContractFactory("VBep20Delegator");
    const vDelegator1 = await vDelegator1Factory.deploy(
      underlying1.address,
      unitroller.address,
      interestRateModel.address,
      convertToUnit(1.1, 18),
      "token1",
      symbol,
      decimals,
      admin.address,
      vDelegatee1.address,
      "0x00",
    );
    await vDelegator1.deployed();

    vToken1 = await ethers.getContractAt("VBep20MockDelegate", vDelegator1.address);

    await unitroller._supportMarket(vToken1.address);
    await unitroller._setCollateralFactor(vToken1.address, convertToUnit(cf1, 18));
    await priceOracle.setUnderlyingPrice(vToken1.address, convertToUnit(up1, 18));

    const underlying2Factory = await ethers.getContractFactory("BEP20Harness");
    const underlying2 = await underlying2Factory.deploy(quantity, name, decimals, symbol);
    await underlying2.deployed();

    const vDelegatee2Factory = await ethers.getContractFactory("VBep20MockDelegate");
    const vDelegatee2 = await vDelegatee2Factory.deploy();
    await vDelegatee2.deployed();

    const vDelegator2Factory = await ethers.getContractFactory("VBep20Delegator");
    const vDelegator2 = await vDelegator2Factory.deploy(
      underlying2.address,
      unitroller.address,
      interestRateModel.address,
      convertToUnit(1.1, 18),
      "token2",
      symbol,
      decimals,
      admin.address,
      vDelegatee1.address,
      "0x00",
    );
    await vDelegator2.deployed();

    vToken2 = await ethers.getContractAt("VBep20MockDelegate", vDelegator2.address);

    await unitroller._supportMarket(vToken2.address);
    await unitroller._setCollateralFactor(vToken2.address, convertToUnit(cf2, 18));
    await priceOracle.setUnderlyingPrice(vToken2.address, convertToUnit(up2, 18));

    const underlying3Factory = await ethers.getContractFactory("BEP20Harness");
    const underlying3 = await underlying3Factory.deploy(quantity, name, decimals, symbol);
    await underlying3.deployed();

    const vDelegatee3Factory = await ethers.getContractFactory("EvilXToken");
    const vDelegatee3 = await vDelegatee3Factory.deploy();
    await vDelegatee3.deployed();

    const vDelegator3Factory = await ethers.getContractFactory("EvilXDelegator");
    const vDelegator3 = await vDelegator3Factory.deploy(
      underlying3.address,
      unitroller.address,
      interestRateModel.address,
      convertToUnit(1.5, 18),
      "token3",
      symbol,
      decimals,
      admin.address,
      vDelegatee3.address,
      "0x00",
    );
    await vDelegator3.deployed();

    vToken3 = await ethers.getContractAt("EvilXToken", vDelegator3.address);
    await unitroller._supportMarket(vToken3.address);

    await unitroller._setCollateralFactor(vToken3.address, convertToUnit(cf2, 18));
    await unitroller._setCollateralFactor(vToken3.address, convertToUnit(cf3, 18));
    await priceOracle.setUnderlyingPrice(vToken2.address, convertToUnit(up3, 18));

    await unitroller._setMarketSupplyCaps(
      [vToken1.address, vToken2.address, vToken3.address],
      [convertToUnit(1, 18), convertToUnit(1, 18), convertToUnit(1, 18)],
    );

    await unitroller.connect(user).enterMarkets([vToken1.address, vToken2.address, vToken3.address]);
    await underlying1.harnessSetBalance(user.address, convertToUnit(1, 8));
    await underlying1.connect(user).approve(vToken1.address, convertToUnit(1, 10));
    await vToken1.connect(user).mint(convertToUnit(1, 4));
    await underlying3.harnessSetBalance(vToken3.address, convertToUnit(1, 8));
  });

  it("Check the updated vToken states after transfer out", async () => {
    let liquidity = 0;

    ({ 1: liquidity } = await unitroller.getAccountLiquidity(user.address));

    expect(liquidity).equal("4999");
    await vToken3.setComptrollerAddress(unitroller.address);

    // Emitting event from the Evil token to get the state of the account's liquidity which should be
    // less than before calling the borrow hence vToken's internal states are updated before the Transfer out.
    await expect(vToken3.connect(user).borrow(100)).to.emit(vToken3, "LogLiquidity").withArgs("4899");
  });
});
