import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber } from "ethers";
import { getAddress, keccak256, parseUnits, solidityPack } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  FaucetToken,
  FaucetToken__factory,
  SwapRouter,
  SwapRouter__factory,
  VBep20Immutable,
} from "../../../typechain";
import { IPancakePair } from "../../../typechain/contracts/Swap/interfaces/IPancakePair";
import { IPancakeSwapV2Factory } from "../../../typechain/contracts/Swap/interfaces/IPancakeSwapV2Factory";
import { IWBnb } from "../../../typechain/contracts/Swap/interfaces/IWBNB";

const { expect } = chai;
chai.use(smock.matchers);

const SWAP_AMOUNT = parseUnits("100", 18);
const MIN_AMOUNT_OUT = parseUnits("90", 18);
const DEFAULT_RESERVE = parseUnits("1000", 18);

type SwapFixture = {
  vToken: FakeContract<VBep20Immutable>;
  wBNB: FakeContract<IWBnb>;
  tokenA: MockContract<FaucetToken>;
  tokenB: MockContract<FaucetToken>;
  swapRouter: MockContract<SwapRouter>;
  pancakeFactory: FakeContract<IPancakeSwapV2Factory>;
  tokenPair: FakeContract<IPancakePair>;
  wBnbPair: FakeContract<IPancakePair>;
};

async function deploySwapContract(): Promise<SwapFixture> {
  const vToken = await smock.fake<VBep20Immutable>("VBep20Immutable");
  const wBNB = await smock.fake<IWBnb>("IWBNB");
  const pancakeFactory = await smock.fake<IPancakeSwapV2Factory>("IPancakeSwapV2Factory");

  const SwapRouter = await smock.mock<SwapRouter__factory>("SwapRouter");
  const swapRouter = await upgrades.deployProxy(SwapRouter, [], {
    constructorArgs: [wBNB.address, pancakeFactory.address],
  });

  const FaucetToken = await smock.mock<FaucetToken__factory>("FaucetToken");
  const tokenA = await FaucetToken.deploy(parseUnits("1000", 18), "TOKENA", 18, "A");
  const tokenB = await FaucetToken.deploy(parseUnits("1000", 18), "TOKENB", 18, "B");

  //Calculate tokenPair address
  let create2Address = getCreate2Address(pancakeFactory.address, [tokenA.address, tokenB.address]);
  const tokenPair = await smock.fake<IPancakePair>("IPancakePair", { address: create2Address.toLocaleLowerCase() });

  //Calculate wBNB pair address
  create2Address = getCreate2Address(pancakeFactory.address, [wBNB.address, tokenB.address]);
  const wBnbPair = await smock.fake<IPancakePair>("IPancakePair", { address: create2Address.toLocaleLowerCase() });

  return { swapRouter, wBNB, vToken, tokenA, tokenB, pancakeFactory, tokenPair, wBnbPair };
}

async function configure(fixture: SwapFixture, user: SignerWithAddress) {
  const { tokenPair, wBnbPair, tokenA, swapRouter, wBNB } = fixture;
  tokenPair.getReserves.returns({
    reserve0: DEFAULT_RESERVE,
    reserve1: DEFAULT_RESERVE,
    blockTimestampLast: 0,
  });
  wBnbPair.getReserves.returns({
    reserve0: DEFAULT_RESERVE,
    reserve1: DEFAULT_RESERVE,
    blockTimestampLast: 0,
  });
  await tokenA.allocateTo(user.address, SWAP_AMOUNT);
  await tokenA.connect(user).approve(swapRouter.address, SWAP_AMOUNT);
  wBNB.transfer.returns(true);
}

function getCreate2Address(factoryAddress: string, [tokenA, tokenB]: [string, string]): string {
  const [token0, token1] = BigNumber.from(tokenA) < BigNumber.from(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
  const create2Inputs = [
    "0xff",
    factoryAddress,
    keccak256(solidityPack(["address", "address"], [token0, token1])),
    "0xd0d4c4cd0848c93cb4fd1f498d7013ee6bfb25783ea21593d5834f5d250ece66", //IPairBytecode Hash
  ];
  const sanitizedInputs = `0x${create2Inputs.map(i => i.slice(2)).join("")}`;
  return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`);
}

async function getValidDeadline(): Promise<number> {
  // getting timestamp
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const blockBefore = await ethers.provider.getBlock(blockNumBefore);
  return blockBefore.timestamp + 1;
}

describe("Swap Contract", () => {
  let user: SignerWithAddress;
  let vToken: FakeContract<VBep20Immutable>;
  let wBNB: FakeContract<IWBnb>;
  let swapRouter: MockContract<SwapRouter>;
  let tokenA: FakeContract<IERC20>;
  let tokenB: FakeContract<IERC20>;

  beforeEach(async () => {
    [, user] = await ethers.getSigners();
    const contracts = await loadFixture(deploySwapContract);
    await configure(contracts, user);
    ({ vToken, wBNB, swapRouter, tokenA, tokenB } = contracts);
  });

  describe("Swap", () => {
    it("revert if deadline has passed", async () => {
      await expect(
        swapRouter.swapExactTokensForTokens(
          SWAP_AMOUNT,
          MIN_AMOUNT_OUT,
          [tokenA.address, tokenB.address],
          user.address,
          0,
        ),
      ).to.be.revertedWithCustomError(swapRouter, "SwapDeadlineExpire");
    });
    it("should swap tokenA -> tokenB", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapExactTokensForTokens(
            SWAP_AMOUNT,
            MIN_AMOUNT_OUT,
            [tokenA.address, tokenB.address],
            user.address,
            deadline,
          ),
      ).to.emit(swapRouter, "SwapTokensForTokens");
    });
    it("should swap BNB -> token", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapExactETHForTokens(MIN_AMOUNT_OUT, [wBNB.address, tokenB.address], user.address, deadline, {
            value: SWAP_AMOUNT,
          }),
      ).to.emit(swapRouter, "SwapBnbForTokens");
    });
  });
  describe("Supply", () => {
    it("revert if deadline has passed", async () => {
      await expect(
        swapRouter.swapAndSupply(vToken.address, SWAP_AMOUNT, MIN_AMOUNT_OUT, [tokenA.address, tokenB.address], 0),
      ).to.be.revertedWithCustomError(swapRouter, "SwapDeadlineExpire");
    });
    it("swap tokenA -> tokenB --> supply tokenB", async () => {
      const deadline = await getValidDeadline();
      await expect(
        swapRouter
          .connect(user)
          .swapAndSupply(vToken.address, SWAP_AMOUNT, MIN_AMOUNT_OUT, [tokenA.address, tokenB.address], deadline),
      ).to.emit(swapRouter, "SupplyOnBehalf");
    });
    it("swap BNB -> token --> supply token", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapBnbAndSupply(vToken.address, MIN_AMOUNT_OUT, [wBNB.address, tokenB.address], deadline, {
            value: SWAP_AMOUNT,
          }),
      ).to.emit(swapRouter, "SupplyOnBehalf");
    });
  });
  describe("Repay", () => {
    it("revert if deadline has passed", async () => {
      await expect(
        swapRouter.swapAndRepay(vToken.address, SWAP_AMOUNT, MIN_AMOUNT_OUT, [tokenA.address, tokenB.address], 0),
      ).to.be.revertedWithCustomError(swapRouter, "SwapDeadlineExpire");
    });
    it("swap tokenA -> tokenB --> supply tokenB", async () => {
      const deadline = await getValidDeadline();
      await expect(
        swapRouter
          .connect(user)
          .swapAndRepay(vToken.address, SWAP_AMOUNT, MIN_AMOUNT_OUT, [tokenA.address, tokenB.address], deadline),
      ).to.emit(swapRouter, "RepayOnBehalf");
    });
    it("swap BNB -> token --> supply token", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapBnbAndRepay(vToken.address, MIN_AMOUNT_OUT, [wBNB.address, tokenB.address], deadline, {
            value: SWAP_AMOUNT,
          }),
      ).to.emit(swapRouter, "RepayOnBehalf");
    });
  });
});
