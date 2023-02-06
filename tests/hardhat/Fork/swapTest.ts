import { smock } from "@defi-wonderland/smock";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { ethers, upgrades } from "hardhat";

import {
  FaucetToken,
  FaucetToken__factory,
  IPancakeSwapV2Factory__factory,
  IWBNB,
  IWBNB__factory,
  SwapRouter,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

let BUSD: FaucetToken;
let USDT: FaucetToken;
let swapRouter: SwapRouter;
let wBNB: IWBNB;
let busdUser: any;
let usdtUser: any;

const SWAP_AMOUNT = 100;
const MIN_AMOUNT_OUT = 90;

const SWAP_BNB_AMOUNT = 1;
const MIN_AMOUNT_OUT_BUSD = 250;

const initMainnetUser = async (user: string) => {
  await impersonateAccount(user);
  return ethers.getSigner(user);
};

const swapRouterFixture = async (): Promise<void> => {
  const [admin] = await ethers.getSigners();
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
      await swapRouterFixture();
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
      const deadline = await getValidDeadline();
      await expect(
        swapRouter
          .connect(usdtUser)
          .swapExactETHForTokens(MIN_AMOUNT_OUT_BUSD, [wBNB.address, BUSD.address], busdUser.address, deadline, {
            value: SWAP_BNB_AMOUNT,
          }),
      ).to.emit(swapRouter, "SwapBnbForTokens");
    });
  }
});
