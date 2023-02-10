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
  VBep20Immutable__factory,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

let BUSD: FaucetToken;
let USDT: FaucetToken;
let BabyDoge: VBep20Immutable;
let SFM: VBep20Immutable;
let swapRouter: SwapRouter;
let wBNB: IWBNB;
let busdUser: any;
let usdtUser: any;
let BabyDogeUser: any;
let SFMUser: any;
let wBNBUser: any;
let vBUSD: VBep20Immutable;
let vUSDT: VBep20Immutable;
let vSFM: VBep20Immutable;
let vBabyDoge: VBep20Immutable;
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

async function configureVtoken(underlyingToken: FaucetToken | VBep20Immutable, name: string, symbol: string) {
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
  await USDT.connect(usdtUser).approve(swapRouter.address, parseUnits("1"));
  await BUSD.connect(busdUser).approve(swapRouter.address, parseUnits("1"));
};

const swapRouterDeflationaryConfigure = async (): Promise<void> => {
  [admin] = await ethers.getSigners();
  BabyDogeUser = await initMainnetUser("0x0639556f03714a74a5feeaf5736a4a64ff70d206");
  SFMUser = await initMainnetUser("0xdaa3b5ae0521264e55f45157eb6e158e1f3e5012");
  wBNBUser = await initMainnetUser("0xf977814e90da44bfa03b6295a0616a897441acec");

  wBNB = IWBNB__factory.connect("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", admin);
  BabyDoge = VBep20Immutable__factory.connect("0xc748673057861a797275CD8A068AbB95A902e8de", admin);
  SFM = VBep20Immutable__factory.connect("0x42981d0bfbAf196529376EE702F2a9Eb9092fcB5", admin);

  const pancakeSwapFactory = IPancakeSwapV2Factory__factory.connect(
    "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    admin,
  );
  const swapRouterFactory = await ethers.getContractFactory("SwapRouter");

  swapRouter = await upgrades.deployProxy(swapRouterFactory, [], {
    constructorArgs: [wBNB.address, pancakeSwapFactory.address],
  });

  await swapRouter.deployed();
  await BabyDoge.connect(BabyDogeUser).approve(swapRouter.address, parseUnits("100"));
  await SFM.connect(SFMUser).approve(swapRouter.address, parseUnits("100"));
};
async function getValidDeadline(): Promise<number> {
  // getting timestamp
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const blockBefore = await ethers.provider.getBlock(blockNumBefore);
  return blockBefore.timestamp + 100;
}

describe("Swap Contract", () => {
  if (process.env.FORK_MAINNET === "true") {
    describe("Tokens And BNB", () => {
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

      it("should swap BNB -> Exact token", async () => {
        const prevBalance = await BUSD.balanceOf(usdtUser.address);
        const deadline = await getValidDeadline();
        const amountOut = await swapRouter.getAmountsOut(1, [wBNB.address, BUSD.address]);
        await swapRouter
          .connect(usdtUser)
          .swapETHForExactTokens(amountOut[0], [wBNB.address, BUSD.address], usdtUser.address, deadline, {
            value: SWAP_BNB_AMOUNT,
          });
        const currBalance = await BUSD.balanceOf(usdtUser.address);
        expect(currBalance).greaterThan(prevBalance);
      });

      it("should swap BNB -> Exact token -> Supply", async () => {
        const prevBalance = await vBUSD.balanceOf(usdtUser.address);
        const deadline = await getValidDeadline();
        const amountOut = await swapRouter.getAmountsOut(1, [wBNB.address, BUSD.address]);
        await swapRouter
          .connect(usdtUser)
          .swapETHForExactTokensAndSupply(vBUSD.address, amountOut[0], [wBNB.address, BUSD.address], deadline, {
            value: SWAP_BNB_AMOUNT,
          });
        const currBalance = await vBUSD.balanceOf(usdtUser.address);
        expect(currBalance).greaterThan(prevBalance);
      });

      it("should revert when swap BNB -> Exact token and input is not sufficient", async () => {
        const deadline = await getValidDeadline();
        const amountOut = await swapRouter.getAmountsOut(1, [wBNB.address, BUSD.address]);
        await expect(
          swapRouter
            .connect(usdtUser)
            .swapETHForExactTokens(amountOut[0].add(274), [wBNB.address, BUSD.address], usdtUser.address, deadline, {
              value: SWAP_BNB_AMOUNT,
            }),
        ).to.be.revertedWithCustomError(swapRouter, "ExcessiveInputAmount");
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

      it("Borrow--> swap TokenA -> Exact TokenB --> repay token", async () => {
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
            .swapTokensForExactTokensAndRepay(
              vUSDT.address,
              BORROW_AMOUNT,
              SWAP_AMOUNT,
              [BUSD.address, USDT.address],
              deadline,
            ),
        ).to.emit(swapRouter, "RepayOnBehalf");
        [, , borrowBalance] = await vUSDT.getAccountSnapshot(busdUser.address);
        expect(borrowBalance).equal(0);
      });

      it("Borrow--> swap BNB -> TokenB --> repay tokenB", async () => {
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

      it("Borrow--> swap BNB -> TokenB --> repay exact tokenB", async () => {
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
            .swapETHForExactTokensAndRepay(vUSDT.address, 274, [wBNB.address, USDT.address], deadline, {
              value: 1,
            }),
        ).to.emit(swapRouter, "RepayOnBehalf");
        [, , borrowBalance] = await vUSDT.getAccountSnapshot(busdUser.address);
        expect(borrowBalance).equal(0);
      });

      it("should revert USDT -> EXACT BUSD if input is more then required", async () => {
        const deadline = await getValidDeadline();
        const amountRequired = await swapRouter.getAmountsOut(100, [USDT.address, BUSD.address]);

        await expect(
          swapRouter
            .connect(usdtUser)
            .swapTokensForExactTokens(
              MIN_AMOUNT_OUT + 10,
              amountRequired[1],
              [USDT.address, BUSD.address],
              usdtUser.address,
              deadline,
            ),
        ).to.be.revertedWithCustomError(swapRouter, "InputAmountAboveMaximum");
      });

      it("should swap USDT -> EXACT BUSD", async () => {
        const deadline = await getValidDeadline();
        const prevBalance = await BUSD.balanceOf(usdtUser.address);
        await swapRouter
          .connect(usdtUser)
          .swapTokensForExactTokens(
            MIN_AMOUNT_OUT,
            SWAP_AMOUNT,
            [USDT.address, BUSD.address],
            usdtUser.address,
            deadline,
          );
        const currBalance = await BUSD.balanceOf(usdtUser.address);
        expect(currBalance).greaterThan(prevBalance);
      });

      it("should swap USDT -> EXACT BUSD -> Supply", async () => {
        const deadline = await getValidDeadline();
        const prevBalance = await vBUSD.balanceOf(usdtUser.address);
        await swapRouter
          .connect(usdtUser)
          .swapTokensForExactTokensAndSupply(
            vBUSD.address,
            MIN_AMOUNT_OUT,
            SWAP_AMOUNT,
            [USDT.address, BUSD.address],
            deadline,
          );
        const currBalance = await vBUSD.balanceOf(usdtUser.address);
        expect(currBalance).greaterThan(prevBalance);
      });
    });

    describe("Tokens And BNB on supporting Fee", () => {
      beforeEach(async () => {
        await loadFixture(swapRouterDeflationaryConfigure);
        await deploySimpleComptroller();
        configureOracle(oracle);
        vBabyDoge = await configureVtoken(BabyDoge, "vToken Baby Doge", "vBabyDoge");
        vSFM = await configureVtoken(SFM, "vToken SFM", "vSFM");

        await comptroller._supportMarket(vBabyDoge.address);
        await comptroller._supportMarket(vSFM.address);
        await comptroller._setPriceOracle(oracle.address);
        await expect(comptroller.connect(SFMUser).enterMarkets([vSFM.address])).to.emit(comptroller, "MarketEntered");
        await expect(comptroller.connect(BabyDogeUser).enterMarkets([vBabyDoge.address])).to.emit(
          comptroller,
          "MarketEntered",
        );

        await comptroller._setMarketSupplyCaps([vBabyDoge.address], [parseUnits("100000", 18)]);
        await comptroller._setMarketSupplyCaps([vSFM.address], [parseUnits("100000", 18)]);

        await comptroller._setCollateralFactor(vBabyDoge.address, parseUnits("0.7", 18));
        await comptroller._setCollateralFactor(vSFM.address, parseUnits("0.5", 18));
      });

      it("should swap tokenA -> tokenB  at supporting fee", async () => {
        const deadline = await getValidDeadline();
        await expect(
          swapRouter
            .connect(SFMUser)
            .swapExactTokensForTokensAtSupportingFee(
              parseUnits("0.000001"),
              MIN_AMOUNT_OUT,
              [SFM.address, BabyDoge.address],
              SFMUser.address,
              deadline,
            ),
        ).to.emit(swapRouter, "SwapTokensForTokens");
      });

      it("should swap BNB -> token  at supporting fee", async () => {
        const deadline = await getValidDeadline();
        await expect(
          swapRouter
            .connect(wBNBUser)
            .swapExactETHForTokensAtSupportingFee(
              MIN_AMOUNT_OUT,
              [wBNB.address, SFM.address],
              wBNBUser.address,
              deadline,
              {
                value: parseUnits("0.000001"),
              },
            ),
        ).to.emit(swapRouter, "SwapBnbForTokens");
      });

      it("swap tokenA -> tokenB --> supply tokenB at supporting fee", async () => {
        const prevBalance = await vBabyDoge.balanceOf(SFMUser.address);
        const deadline = await getValidDeadline();

        await expect(
          swapRouter
            .connect(SFMUser)
            .swapAndSupplyAtSupportingFee(
              vBabyDoge.address,
              parseUnits("0.000001"),
              MIN_AMOUNT_OUT,
              [SFM.address, BabyDoge.address],
              deadline,
            ),
        ).to.emit(swapRouter, "SupplyOnBehalf");

        const currBalance = await vBabyDoge.balanceOf(SFMUser.address);
        expect(currBalance).greaterThan(prevBalance);
      });

      it("swap BNB -> token --> supply token at supporting fee", async () => {
        const deadline = await getValidDeadline();
        const prevBalance = await vSFM.balanceOf(wBNBUser.address);

        await expect(
          swapRouter
            .connect(wBNBUser)
            .swapBnbAndSupplyAtSupportingFee(vSFM.address, MIN_AMOUNT_OUT, [wBNB.address, SFM.address], deadline, {
              value: parseUnits("0.000001"),
            }),
        ).to.emit(swapRouter, "SupplyOnBehalf");

        const currBalance = await vSFM.balanceOf(wBNBUser.address);
        expect(currBalance).greaterThan(prevBalance);
      });

      it("swap tokenA -> tokenB --> repay tokenB at supporting fee", async () => {
        await SFM.connect(SFMUser).transfer(vSFM.address, parseUnits("1"));
        const borrowAmount = parseUnits("0.00000001");
        const deadline = await getValidDeadline();
        await expect(
          swapRouter
            .connect(SFMUser)
            .swapAndSupplyAtSupportingFee(
              vBabyDoge.address,
              borrowAmount,
              MIN_AMOUNT_OUT,
              [SFM.address, BabyDoge.address],
              deadline,
            ),
        ).to.emit(swapRouter, "SupplyOnBehalf");

        await expect(vBabyDoge.connect(SFMUser).borrow(borrowAmount)).to.emit(vBabyDoge, "Borrow");
        const [, , borrowBalancePrev] = await vBabyDoge.getAccountSnapshot(SFMUser.address);
        expect(borrowBalancePrev).equal(borrowAmount);

        await expect(
          swapRouter
            .connect(SFMUser)
            .swapAndRepayAtSupportingFee(
              vBabyDoge.address,
              100,
              MIN_AMOUNT_OUT,
              [SFM.address, BabyDoge.address],
              deadline,
            ),
        ).to.emit(swapRouter, "RepayOnBehalf");
        const [, , borrowBalanceAfter] = await vBabyDoge.getAccountSnapshot(SFMUser.address);
        expect(borrowBalanceAfter).lessThan(borrowBalancePrev);
      });

      it("swap BNB -> token --> repay token at supporting fee", async () => {
        await SFM.connect(SFMUser).transfer(vSFM.address, parseUnits("1"));
        const borrowAmount = parseUnits("0.00000001");
        const deadline = await getValidDeadline();

        await expect(
          swapRouter
            .connect(wBNBUser)
            .swapBnbAndSupplyAtSupportingFee(vSFM.address, MIN_AMOUNT_OUT, [wBNB.address, SFM.address], deadline, {
              value: parseUnits("0.000001"),
            }),
        ).to.emit(swapRouter, "SupplyOnBehalf");

        await expect(vSFM.connect(wBNBUser).borrow(borrowAmount)).to.emit(vSFM, "Borrow");
        const [, , borrowBalancePrev] = await vSFM.getAccountSnapshot(wBNBUser.address);
        expect(borrowBalancePrev).equal(borrowAmount);

        await expect(
          swapRouter
            .connect(wBNBUser)
            .swapBnbAndRepayAtSupportingFee(vSFM.address, MIN_AMOUNT_OUT, [wBNB.address, SFM.address], deadline, {
              value: parseUnits("0.000000001"),
            }),
        ).to.emit(swapRouter, "RepayOnBehalf");

        const [, , borrowBalanceAfter] = await vSFM.getAccountSnapshot(wBNBUser.address);
        expect(borrowBalanceAfter).lessThan(borrowBalancePrev);
      });
    });
  }
});
