import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { impersonateAccount, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  Comptroller,
  ComptrollerLens,
  ComptrollerLens__factory,
  Comptroller__factory,
  FaucetToken,
  FaucetToken__factory,
  IAccessControlManager,
  IPancakeSwapV2Factory__factory,
  IWBNB,
  IWBNB__factory,
  PriceOracle,
  SwapRouter,
  VBep20Immutable,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

let BUSD: FaucetToken;
let USDT: FaucetToken;
let swapRouter: SwapRouter;
let wBNB: IWBNB;
let busdUser: any;
let usdtUser: any;
let vBUSD: VBep20Immutable;
let vUSDT: VBep20Immutable;
let admin: SignerWithAddress;
let oracle: FakeContract<PriceOracle>;
let accessControl: FakeContract<IAccessControlManager>;
let comptrollerLens: MockContract<ComptrollerLens>;
let comptroller: MockContract<Comptroller>;

const SWAP_AMOUNT = 100;
const MIN_AMOUNT_OUT = 90;
const BORROW_AMOUNT = 30;

const SWAP_BNB_AMOUNT = 1;
const MIN_AMOUNT_OUT_BUSD = 250;

const initMainnetUser = async (user: string) => {
  await impersonateAccount(user);
  return ethers.getSigner(user);
};

async function deploySimpleComptroller() {
  oracle = await smock.fake<PriceOracle>("PriceOracle");
  accessControl = await smock.fake<IAccessControlManager>("AccessControlManager");
  accessControl.isAllowedToCall.returns(true);
  const ComptrollerLensFactory = await smock.mock<ComptrollerLens__factory>("ComptrollerLens");
  const ComptrollerFactory = await smock.mock<Comptroller__factory>("Comptroller");
  comptroller = await ComptrollerFactory.deploy();
  comptrollerLens = await ComptrollerLensFactory.deploy();
  await comptroller._setAccessControl(accessControl.address);
  await comptroller._setComptrollerLens(comptrollerLens.address);
  await comptroller._setPriceOracle(oracle.address);
  await comptroller._setLiquidationIncentive(parseUnits("1", 18));
  return { oracle, comptroller, comptrollerLens, accessControl };
}

function configureOracle(oracle: FakeContract<PriceOracle>) {
  oracle.getUnderlyingPrice.returns(parseUnits("1", 18));
}

async function configureVtoken(underlyingToken: FaucetToken, name: string, symbol: string) {
  const InterstRateModel = await ethers.getContractFactory("InterestRateModelHarness");
  const interestRateModel = await InterstRateModel.deploy(parseUnits("1", 12));
  await interestRateModel.deployed();

  const vTokenFactory = await ethers.getContractFactory("VBep20Immutable");
  const vToken = await vTokenFactory.deploy(
    underlyingToken.address,
    comptroller.address,
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

const swapRouterConfigure = async (): Promise<void> => {
  [admin] = await ethers.getSigners();
  // MAINNET USER WITH BALANCE
  busdUser = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec");
  usdtUser = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec");

  BUSD = FaucetToken__factory.connect("0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", admin);
  USDT = FaucetToken__factory.connect("0x55d398326f99059fF775485246999027B3197955", admin);
  wBNB = IWBNB__factory.connect("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", admin);

  const pancakeSwapFactory = IPancakeSwapV2Factory__factory.connect(
    "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    admin,
  );
  const swapRouterFactory = await ethers.getContractFactory("SwapRouter");

  swapRouter = await upgrades.deployProxy(swapRouterFactory, [], {
    constructorArgs: [wBNB.address, pancakeSwapFactory.address],
  });

  await swapRouter.deployed();
  await USDT.connect(usdtUser).approve(swapRouter.address, SWAP_AMOUNT);
  await BUSD.connect(busdUser).approve(swapRouter.address, SWAP_AMOUNT);
};

async function getValidDeadline(): Promise<number> {
  // getting timestamp
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const blockBefore = await ethers.provider.getBlock(blockNumBefore);
  return blockBefore.timestamp + 100;
}

describe("Swap Contract", () => {
  if (process.env.FORK_MAINNET === "true") {
    beforeEach(async () => {
      await loadFixture(swapRouterConfigure);
      await deploySimpleComptroller();
      configureOracle(oracle);
      vBUSD = await configureVtoken(BUSD, "vToken BUSD", "vBUSD");
      vUSDT = await configureVtoken(USDT, "vToken USDT", "vUSDT");

      await comptroller._supportMarket(vBUSD.address);
      await comptroller._supportMarket(vUSDT.address);
      await comptroller._setPriceOracle(oracle.address);
      await expect(comptroller.connect(usdtUser).enterMarkets([vBUSD.address])).to.emit(comptroller, "MarketEntered");
      await comptroller._setMarketSupplyCaps([vBUSD.address], [parseUnits("100000", 18)]);
      await comptroller._setCollateralFactor(vBUSD.address, parseUnits("0.7", 18));
      await comptroller._setCollateralFactor(vUSDT.address, parseUnits("0.5", 18));
    });

    it("revert if deadline has passed", async () => {
      await expect(
        swapRouter.swapExactTokensForTokens(
          SWAP_AMOUNT,
          MIN_AMOUNT_OUT,
          [USDT.address, BUSD.address],
          usdtUser.address,
          0,
        ),
      ).to.be.revertedWithCustomError(swapRouter, "SwapDeadlineExpire");
    });

    it("should swap USDT -> BUSD", async () => {
      const deadline = await getValidDeadline();
      const prevBalance = await BUSD.balanceOf(usdtUser.address);
      await expect(
        swapRouter
          .connect(usdtUser)
          .swapExactTokensForTokens(
            SWAP_AMOUNT,
            MIN_AMOUNT_OUT,
            [USDT.address, BUSD.address],
            usdtUser.address,
            deadline,
          ),
      ).to.emit(swapRouter, "SwapTokensForTokens");
      const currBalance = await BUSD.balanceOf(usdtUser.address);
      expect(currBalance).greaterThan(prevBalance);
    });

    it("should swap BNB -> token", async () => {
      const prevBalance = await BUSD.balanceOf(usdtUser.address);
      const deadline = await getValidDeadline();
      await expect(
        swapRouter
          .connect(usdtUser)
          .swapExactETHForTokens(MIN_AMOUNT_OUT_BUSD, [wBNB.address, BUSD.address], busdUser.address, deadline, {
            value: SWAP_BNB_AMOUNT,
          }),
      ).to.emit(swapRouter, "SwapBnbForTokens");
      const currBalance = await BUSD.balanceOf(usdtUser.address);
      expect(currBalance).greaterThan(prevBalance);
    });

    it("swap tokenA -> tokenB --> supply tokenB", async () => {
      const prevBalance = await vBUSD.balanceOf(usdtUser.address);
      const deadline = await getValidDeadline();
      await expect(
        swapRouter
          .connect(usdtUser)
          .swapAndSupply(vBUSD.address, SWAP_AMOUNT, MIN_AMOUNT_OUT, [USDT.address, BUSD.address], deadline),
      ).to.emit(swapRouter, "SupplyOnBehalf");
      const currBalance = await vBUSD.balanceOf(usdtUser.address);
      expect(currBalance).greaterThan(prevBalance);
    });

    it("swap BNB -> token --> supply token", async () => {
      const prevBalance = await vBUSD.balanceOf(usdtUser.address);
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(usdtUser)
          .swapBnbAndSupply(vBUSD.address, MIN_AMOUNT_OUT, [wBNB.address, BUSD.address], deadline, {
            value: SWAP_BNB_AMOUNT,
          }),
      ).to.emit(swapRouter, "SupplyOnBehalf");
      const currBalance = await vBUSD.balanceOf(usdtUser.address);
      expect(currBalance).greaterThan(prevBalance);
    });

    it("Borrow--> swap TokenA -> TokenB --> repay token", async () => {
      await USDT.connect(usdtUser).transfer(vUSDT.address, 1000);
      const deadline = await getValidDeadline();
      await expect(
        swapRouter
          .connect(busdUser)
          .swapAndSupply(vBUSD.address, SWAP_AMOUNT, MIN_AMOUNT_OUT, [USDT.address, BUSD.address], deadline),
      ).to.emit(swapRouter, "SupplyOnBehalf");
      await expect(vUSDT.connect(busdUser).borrow(BORROW_AMOUNT)).to.emit(vUSDT, "Borrow");
      let borrowBalance;
      [, , borrowBalance] = await vUSDT.getAccountSnapshot(busdUser.address);
      expect(borrowBalance).equal(BORROW_AMOUNT);
      await expect(
        swapRouter
          .connect(busdUser)
          .swapAndRepay(vUSDT.address, BORROW_AMOUNT + 1, BORROW_AMOUNT, [BUSD.address, USDT.address], deadline),
      ).to.emit(swapRouter, "RepayOnBehalf");
      [, , borrowBalance] = await vUSDT.getAccountSnapshot(busdUser.address);
      expect(borrowBalance).equal(0);
    });

    it("Borrow--> swap BNB -> TokenB --> repay token", async () => {
      await USDT.connect(usdtUser).transfer(vUSDT.address, 1000);
      let deadline = await getValidDeadline();
      await expect(
        swapRouter
          .connect(usdtUser)
          .swapBnbAndSupply(vBUSD.address, MIN_AMOUNT_OUT, [wBNB.address, BUSD.address], deadline, {
            value: SWAP_BNB_AMOUNT,
          }),
      ).to.emit(swapRouter, "SupplyOnBehalf");

      deadline = await getValidDeadline();
      await expect(
        swapRouter
          .connect(usdtUser)
          .swapBnbAndSupply(vBUSD.address, MIN_AMOUNT_OUT, [wBNB.address, BUSD.address], deadline, {
            value: SWAP_BNB_AMOUNT,
          }),
      ).to.emit(swapRouter, "SupplyOnBehalf");

      await expect(vUSDT.connect(busdUser).borrow(274)).to.emit(vUSDT, "Borrow");
      let borrowBalance;
      [, , borrowBalance] = await vUSDT.getAccountSnapshot(busdUser.address);
      expect(borrowBalance).equal(274);
      await expect(
        swapRouter
          .connect(busdUser)
          .swapBnbAndRepay(vUSDT.address, MIN_AMOUNT_OUT, [wBNB.address, USDT.address], deadline, {
            value: 1,
          }),
      ).to.emit(swapRouter, "RepayOnBehalf");
      [, , borrowBalance] = await vUSDT.getAccountSnapshot(busdUser.address);
      expect(borrowBalance).equal(0);
    });
  }
});
