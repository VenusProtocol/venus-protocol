import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";


import {
  Comptroller,
  ComptrollerLens,
  ComptrollerLens__factory,
  FaucetToken,
  FaucetToken__factory,
  IAccessControlManager,
  PriceOracle,
  VBep20Immutable
} from "../../../typechain";

const { deployDiamond } = require("../../../script/diamond/deploy");

const { expect } = chai;
chai.use(smock.matchers);

let BUSD: FaucetToken;
let USDT: FaucetToken;
let busdUser: any;
let usdtUser: any;
let vBUSD: VBep20Immutable;
let vUSDT: VBep20Immutable;
let admin: SignerWithAddress;
let oracle: FakeContract<PriceOracle>;
let accessControl: FakeContract<IAccessControlManager>;
let comptrollerLens: MockContract<ComptrollerLens>;
let comptroller: MockContract<Comptroller>;
let comptrollerProxy: MockContract<Comptroller>;

const initMainnetUser = async (user: string) => {
  await impersonateAccount(user);
  return ethers.getSigner(user);
};

async function deployComptroller() {
  oracle = await smock.fake<PriceOracle>("PriceOracle");
  accessControl = await smock.fake<IAccessControlManager>("IAccessControlManager");
  accessControl.isAllowedToCall.returns(true);
  const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
  comptrollerLens = await ComptrollerLensFactory.deploy();
  comptroller = await deployDiamond();
  comptrollerProxy = await ethers.getContractAt("Comptroller", comptroller.address);
  await comptrollerProxy._setAccessControl(accessControl.address);
  await comptrollerProxy._setComptrollerLens(comptrollerLens.address);
  await comptrollerProxy._setPriceOracle(oracle.address);
  await comptrollerProxy._setLiquidationIncentive(parseUnits("1", 18));
  return { oracle, comptrollerProxy, comptrollerLens, accessControl };
}

function configureOracle(oracle: FakeContract<PriceOracle>) {
    oracle.getUnderlyingPrice.returns(parseUnits("1", 18));
  }
  
  async function configureVtoken(underlyingToken: FaucetToken | VBep20Immutable, name: string, symbol: string) {
    const InterstRateModel = await ethers.getContractFactory("InterestRateModelHarness");
    const interestRateModel = await InterstRateModel.deploy(parseUnits("1", 12));
    await interestRateModel.deployed();
    const vTokenFactory = await ethers.getContractFactory("VBep20Immutable");
    const vToken = await vTokenFactory.deploy(
      underlyingToken.address,
      comptrollerProxy.address,
      interestRateModel.address,
      parseUnits("1", 18),
      name,
      symbol,
      18,
      admin.address,
    );
    await vToken.deployed();
    return vToken;
  }

  const vTokenConfigure = async (): Promise<void> => {
    [admin] = await ethers.getSigners();
    // MAINNET USER WITH BALANCE
    busdUser = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec");
    usdtUser = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec");
  
    BUSD = FaucetToken__factory.connect("0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", admin);
    USDT = FaucetToken__factory.connect("0x55d398326f99059fF775485246999027B3197955", admin);
  
  };
  

describe.only("diamond Contract", () => {
  if (process.env.FORK_MAINNET === "true") {
    before(async() => {
      await deployComptroller();
    })

    describe("Diamond setters", () => {
      beforeEach(async () => {
          configureOracle(oracle);
          await loadFixture(vTokenConfigure);
          vBUSD = await configureVtoken(BUSD, "vToken BUSD", "vBUSD");
          vUSDT = await configureVtoken(USDT, "vToken USDT", "vUSDT");
      })

      it("setting market supply cap", async () => {
        await comptrollerProxy._supportMarket(vBUSD.address);
        await comptrollerProxy._setAccessControl(accessControl.address);

        await comptrollerProxy._setMarketSupplyCaps([vBUSD.address], [parseUnits("100000", 18)]);

        await comptrollerProxy._setPriceOracle(oracle.address);

        await comptrollerProxy._setCollateralFactor(vBUSD.address, parseUnits("0.7", 18));

        // console.log(await comptrollerProxy.access());
        const treasuryGuardian = await comptrollerProxy.treasuryGuardian();
        const treasuryAddress = await comptrollerProxy.treasuryAddress();
        const treasuryPercent = await comptrollerProxy.treasuryPercent();

        console.log("gard",treasuryGuardian);
        console.log("add",treasuryAddress);
        console.log("per",treasuryPercent);

        expect(await comptrollerProxy.supplyCaps(vBUSD.address)).to.equals(parseUnits("100000", 18));

        expect(await comptrollerProxy.oracle()).to.equals(oracle.address);
        const data = await comptrollerProxy.markets(vBUSD.address);

        expect(data.collateralFactorMantissa).to.equals(parseUnits("0.7", 18));
        
      })
    })

    describe("Diamond", () => {
        beforeEach(async () => {
          configureOracle(oracle);
          await loadFixture(vTokenConfigure);
          vBUSD = await configureVtoken(BUSD, "vToken BUSD", "vBUSD");
          vUSDT = await configureVtoken(USDT, "vToken USDT", "vUSDT");
          await comptrollerProxy._supportMarket(vBUSD.address);
          await comptrollerProxy._supportMarket(vUSDT.address);
          await comptrollerProxy._setPriceOracle(oracle.address);
          await comptrollerProxy.connect(usdtUser).enterMarkets([vBUSD.address, vUSDT.address]);
          console.log(oracle.address);
          console.log(await comptrollerProxy.oracle());
          
          await comptrollerProxy._setMarketSupplyCaps([vBUSD.address], [parseUnits("100000", 18)]);
          console.log("market supply cap",await comptrollerProxy.supplyCaps(vBUSD.address));
          await comptrollerProxy._setMarketSupplyCaps([vUSDT.address], [parseUnits("100000", 18)]);
          await comptrollerProxy._setCollateralFactor(vBUSD.address, parseUnits("0.7", 18));
          await comptrollerProxy._setCollateralFactor(vUSDT.address, parseUnits("0.5", 18));
        });

        it("mint vToken", async () => {
          await BUSD.connect(usdtUser).transfer(vBUSD.address, 1000);
          await USDT.connect(usdtUser).approve(vUSDT.address, 110);
          await vUSDT.connect(usdtUser).mint(110);
          await vUSDT.connect(usdtUser).redeem(10);
          console.log((await vUSDT.connect(usdtUser).balanceOf(usdtUser.address)).toString());
          console.log((await vUSDT.getAccountSnapshot(usdtUser.address)).toString());
  
          console.log("borrow");
          await expect(vBUSD.connect(usdtUser).borrow(10)).to.emit(vBUSD, "Borrow");
          let borrowBalance;
          [, , borrowBalance] = await vBUSD.getAccountSnapshot(usdtUser.address);
          expect(borrowBalance).equal(10);
          await BUSD.connect(usdtUser).approve(vBUSD.address, 10);
          await vBUSD.connect(usdtUser).repayBorrow(10);
          [, , borrowBalance] = await vBUSD.getAccountSnapshot(usdtUser.address);
          expect(borrowBalance).equal(0);
        });
    });
    
}
});