import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumber } from "ethers";
import { getAddress, keccak256, parseUnits, solidityPack } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  BEP20Harness__factory,
  ComptrollerHarness,
  ComptrollerHarness__factory,
  DeflatingERC20,
  DeflatingERC20__factory,
  EIP20Interface,
  FaucetToken,
  FaucetToken__factory,
  IPancakePair,
  IPancakeSwapV2Factory,
  IWBNB,
  SwapRouter,
  SwapRouter__factory,
  VBep20Immutable,
  WBNB,
  WBNB__factory,
} from "../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

const SWAP_AMOUNT = parseUnits("100", 18);
const MIN_AMOUNT_OUT = parseUnits("80", 18);
const DEFAULT_RESERVE = parseUnits("1000", 18);

type SwapFixture = {
  vToken: FakeContract<VBep20Immutable>;
  wBNB: MockContract<WBNB>;
  tokenA: MockContract<FaucetToken>;
  tokenB: MockContract<FaucetToken>;
  dToken: MockContract<DeflatingERC20>;
  swapRouter: MockContract<SwapRouter>;
  pancakeFactory: FakeContract<IPancakeSwapV2Factory>;
  tokenPair: FakeContract<IPancakePair>;
  wBnbPair: FakeContract<IPancakePair>;
  tokenAwBnbPair: FakeContract<IPancakePair>;
  dTokenPair: FakeContract<IPancakePair>;
  dTokenPair2: FakeContract<IPancakePair>;
  comptroller: MockContract<ComptrollerHarness>;
};

async function deploySwapContract(): Promise<SwapFixture> {
  const vToken = await smock.fake<VBep20Immutable>("VBep20Immutable");
  const wBNBFactory = await smock.mock<WBNB__factory>("WBNB");
  const wBNB = await wBNBFactory.deploy();
  const pancakeFactory = await smock.fake<IPancakeSwapV2Factory>("IPancakeSwapV2Factory");
  const comptrollerFactory = await smock.mock<ComptrollerHarness__factory>("ComptrollerHarness");
  const comptroller = await comptrollerFactory.deploy();

  const SwapRouter = await smock.mock<SwapRouter__factory>("SwapRouter");
  const swapRouter = await upgrades.deployProxy(SwapRouter, [comptroller.address], {
    constructorArgs: [wBNB.address, pancakeFactory.address],
  });

  const FaucetToken = await smock.mock<FaucetToken__factory>("FaucetToken");
  const tokenA = await FaucetToken.deploy(parseUnits("10000", 18), "TOKENA", 18, "A");
  const tokenB = await FaucetToken.deploy(parseUnits("10000", 18), "TOKENB", 18, "B");

  const DTFactory = await smock.mock<DeflatingERC20__factory>("DeflatingERC20");
  const dToken = await DTFactory.deploy(parseUnits("10000", 18));

  //Calculate tokenPair address
  let create2Address = getCreate2Address(pancakeFactory.address, [tokenA.address, tokenB.address]);
  const tokenPair = await smock.fake<IPancakePair>("IPancakePair", { address: create2Address.toLocaleLowerCase() });

  //Calculate wBNB pair address
  create2Address = getCreate2Address(pancakeFactory.address, [wBNB.address, tokenB.address]);
  const wBnbPair = await smock.fake<IPancakePair>("IPancakePair", { address: create2Address.toLocaleLowerCase() });

  create2Address = getCreate2Address(pancakeFactory.address, [tokenA.address, wBNB.address]);
  const tokenAwBnbPair = await smock.fake<IPancakePair>("IPancakePair", {
    address: create2Address.toLocaleLowerCase(),
  });

  //Calculate tokenPair address
  create2Address = getCreate2Address(pancakeFactory.address, [dToken.address, tokenB.address]);
  const dTokenPair = await smock.fake<IPancakePair>("IPancakePair", { address: create2Address.toLocaleLowerCase() });

  create2Address = getCreate2Address(pancakeFactory.address, [wBNB.address, dToken.address]);
  const dTokenPair2 = await smock.fake<IPancakePair>("IPancakePair", { address: create2Address.toLocaleLowerCase() });

  return {
    swapRouter,
    wBNB,
    vToken,
    tokenA,
    tokenB,
    pancakeFactory,
    tokenPair,
    wBnbPair,
    dToken,
    dTokenPair,
    dTokenPair2,
    tokenAwBnbPair,
    comptroller,
  };
}

async function configure(fixture: SwapFixture, user: SignerWithAddress) {
  const { tokenPair, wBnbPair, tokenA, swapRouter, wBNB, dToken, dTokenPair, dTokenPair2, tokenAwBnbPair, vToken } =
    fixture;
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
  dTokenPair.getReserves.returns({
    reserve0: DEFAULT_RESERVE,
    reserve1: DEFAULT_RESERVE,
    blockTimestampLast: 0,
  });
  dTokenPair2.getReserves.returns({
    reserve0: DEFAULT_RESERVE,
    reserve1: DEFAULT_RESERVE,
    blockTimestampLast: 0,
  });
  tokenAwBnbPair.getReserves.returns({
    reserve0: DEFAULT_RESERVE,
    reserve1: DEFAULT_RESERVE,
    blockTimestampLast: 0,
  });
  vToken.borrowBalanceCurrent.returns(MIN_AMOUNT_OUT);
  wBNB.withdraw.returns(true);
  wBNB.transfer.returns(true);
  await tokenA.allocateTo(user.address, SWAP_AMOUNT);
  await tokenA.allocateTo(tokenPair.address, DEFAULT_RESERVE);
  await dToken.transfer(user.address, parseUnits("5000", 18));
  await dToken.transfer(dTokenPair.address, DEFAULT_RESERVE);
  await dToken.transfer(dTokenPair2.address, DEFAULT_RESERVE);
  await wBNB.connect(user).setBalanceOf(wBnbPair.address, DEFAULT_RESERVE);
  await wBNB.connect(user).setBalanceOf(dTokenPair2.address, DEFAULT_RESERVE);
  await wBNB.connect(user).setBalanceOf(dTokenPair2.address, DEFAULT_RESERVE);
  await tokenA.connect(user).approve(swapRouter.address, SWAP_AMOUNT);
  await dToken.connect(user).approve(swapRouter.address, DEFAULT_RESERVE);
}

function getCreate2Address(factoryAddress: string, [tokenA, tokenB]: [string, string]): string {
  const [token0, token1] = BigNumber.from(tokenA).lt(BigNumber.from(tokenB)) ? [tokenA, tokenB] : [tokenB, tokenA];
  const create2Inputs = [
    "0xff",
    factoryAddress,
    keccak256(solidityPack(["address", "address"], [token0, token1])),
    "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5", //IPairBytecode Hash
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
  let wBNB: FakeContract<IWBNB>;
  let swapRouter: MockContract<SwapRouter>;
  let tokenA: FakeContract<EIP20Interface>;
  let tokenB: FakeContract<EIP20Interface>;
  let dToken: MockContract<DeflatingERC20>;
  let comptroller: MockContract<ComptrollerHarness>;

  beforeEach(async () => {
    [, user] = await ethers.getSigners();
    const contracts = await loadFixture(deploySwapContract);
    await configure(contracts, user);
    ({ vToken, wBNB, swapRouter, tokenA, tokenB, dToken, comptroller } = contracts);
  });

  it("revert if vToken address is not listed", async () => {
    const deadline = await getValidDeadline();
    await expect(
      swapRouter.swapAndSupply(tokenB.address, SWAP_AMOUNT, MIN_AMOUNT_OUT, [tokenA.address, tokenB.address], deadline),
    ).to.be.revertedWithCustomError(swapRouter, "VTokenNotListed");
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

    it("revert if deadline has passed at supporting fee", async () => {
      await expect(
        swapRouter.swapExactTokensForTokensAtSupportingFee(
          SWAP_AMOUNT,
          MIN_AMOUNT_OUT,
          [dToken.address, tokenB.address],
          user.address,
          0,
        ),
      ).to.be.revertedWithCustomError(swapRouter, "SwapDeadlineExpire");
    });

    it("should swap tokenA -> tokenB  at supporting fee", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapExactTokensForTokensAtSupportingFee(
            SWAP_AMOUNT,
            MIN_AMOUNT_OUT,
            [dToken.address, tokenB.address],
            user.address,
            deadline,
          ),
      ).to.emit(swapRouter, "SwapTokensForTokens");
    });

    it("should swap BNB -> token  at supporting fee", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapExactETHForTokensAtSupportingFee(
            MIN_AMOUNT_OUT,
            [wBNB.address, dToken.address],
            user.address,
            deadline,
            {
              value: SWAP_AMOUNT,
            },
          ),
      ).to.emit(swapRouter, "SwapBnbForTokens");
    });
  });

  describe("Supply", () => {
    beforeEach(async () => {
      await comptroller.harnessAddVtoken(vToken.address);
    });

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
      ).to.emit(swapRouter, "SwapTokensForTokens");
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
      ).to.emit(swapRouter, "SwapBnbForTokens");
    });

    it("revert if deadline has passed  at supporting fee", async () => {
      await expect(
        swapRouter.swapAndSupplyAtSupportingFee(
          vToken.address,
          SWAP_AMOUNT,
          MIN_AMOUNT_OUT,
          [dToken.address, tokenB.address],
          0,
        ),
      ).to.be.revertedWithCustomError(swapRouter, "SwapDeadlineExpire");
    });

    it("swap tokenA -> tokenB --> supply tokenB at supporting fee", async () => {
      const deadline = await getValidDeadline();
      await expect(
        swapRouter
          .connect(user)
          .swapAndSupplyAtSupportingFee(
            vToken.address,
            SWAP_AMOUNT,
            MIN_AMOUNT_OUT,
            [dToken.address, tokenB.address],
            deadline,
          ),
      );
    });

    it("swap BNB -> token --> supply token at supporting fee", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapBnbAndSupplyAtSupportingFee(vToken.address, MIN_AMOUNT_OUT, [wBNB.address, dToken.address], deadline, {
            value: SWAP_AMOUNT,
          }),
      );
    });

    it("swap tokenA -> exact tokenB", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapTokensForExactTokensAndSupply(
            vToken.address,
            MIN_AMOUNT_OUT,
            SWAP_AMOUNT,
            [tokenA.address, tokenB.address],
            deadline,
          ),
      ).to.emit(swapRouter, "SwapTokensForTokens");
    });

    it("swap bnb -> exact tokenB", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapETHForExactTokensAndSupply(vToken.address, MIN_AMOUNT_OUT, [wBNB.address, tokenB.address], deadline, {
            value: SWAP_AMOUNT,
          }),
      ).to.emit(swapRouter, "SwapBnbForTokens");
    });
  });

  describe("Repay", () => {
    beforeEach(async () => {
      await comptroller.harnessAddVtoken(vToken.address);
    });

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
      ).to.emit(swapRouter, "SwapTokensForTokens");
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
      ).to.emit(swapRouter, "SwapBnbForTokens");
    });

    it("revert if deadline has passed at supporting fee", async () => {
      await expect(
        swapRouter.swapAndRepayAtSupportingFee(
          vToken.address,
          SWAP_AMOUNT,
          MIN_AMOUNT_OUT,
          [dToken.address, tokenB.address],
          0,
        ),
      ).to.be.revertedWithCustomError(swapRouter, "SwapDeadlineExpire");
    });

    it("swap tokenA -> tokenB --> supply tokenB at supporting fee", async () => {
      const deadline = await getValidDeadline();
      await expect(
        swapRouter
          .connect(user)
          .swapAndRepayAtSupportingFee(
            vToken.address,
            SWAP_AMOUNT,
            MIN_AMOUNT_OUT,
            [dToken.address, tokenB.address],
            deadline,
          ),
      );
    });

    it("swap BNB -> token --> supply token at supporting fee", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapBnbAndRepayAtSupportingFee(vToken.address, MIN_AMOUNT_OUT, [wBNB.address, dToken.address], deadline, {
            value: SWAP_AMOUNT,
          }),
      );
    });

    it("swap tokenA -> exact tokenB", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapTokensForExactTokensAndRepay(
            vToken.address,
            MIN_AMOUNT_OUT,
            SWAP_AMOUNT,
            [tokenA.address, tokenB.address],
            deadline,
          ),
      ).to.emit(swapRouter, "SwapTokensForTokens");
    });

    it("swap tokenA -> full debt of tokenB", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapTokensForFullTokenDebtAndRepay(vToken.address, SWAP_AMOUNT, [tokenA.address, tokenB.address], deadline),
      ).to.emit(swapRouter, "SwapTokensForTokens");
    });

    it("swap bnb -> exact tokenB", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapETHForExactTokensAndRepay(vToken.address, MIN_AMOUNT_OUT, [wBNB.address, tokenB.address], deadline, {
            value: SWAP_AMOUNT,
          }),
      ).to.emit(swapRouter, "SwapBnbForTokens");
    });

    it("Exact tokens -> BNB", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapExactTokensForETHAndRepay(
            vToken.address,
            SWAP_AMOUNT,
            MIN_AMOUNT_OUT,
            [tokenA.address, wBNB.address],
            deadline,
          ),
      ).to.emit(swapRouter, "SwapTokensForBnb");
    });

    it("Exact tokens -> BNB at supporting fee", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapExactTokensForETHAndRepayAtSupportingFee(
            vToken.address,
            SWAP_AMOUNT,
            MIN_AMOUNT_OUT,
            [dToken.address, wBNB.address],
            deadline,
          ),
      );
    });

    it("Tokens -> Exact BNB", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapTokensForExactETHAndRepay(
            vToken.address,
            MIN_AMOUNT_OUT,
            SWAP_AMOUNT,
            [tokenA.address, wBNB.address],
            deadline,
            {
              value: SWAP_AMOUNT,
            },
          ),
      ).to.emit(swapRouter, "SwapTokensForBnb");
    });

    it("Tokens -> full debt of BNB", async () => {
      const deadline = await getValidDeadline();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      await expect(
        swapRouter
          .connect(user)
          .swapTokensForFullETHDebtAndRepay(vToken.address, SWAP_AMOUNT, [tokenA.address, wBNB.address], deadline, {
            value: SWAP_AMOUNT,
          }),
      ).to.emit(swapRouter, "SwapTokensForBnb");
    });
  });

  describe("Sweep Token", async () => {
    it("Sweep ERC-20 tokens", async () => {
      const accounts = await ethers.getSigners();
      const userAddress = await accounts[0].getAddress();

      const sweepAmount = 1000;
      const totalSupply = 100000000;

      const Bep20Factory = await smock.mock<BEP20Harness__factory>("BEP20Harness");
      const token = await Bep20Factory.deploy(totalSupply, "sweep", 4, "SWP");

      await token.transfer(swapRouter.address, 1000);
      expect(await token.balanceOf(swapRouter.address)).equal(sweepAmount);
      expect(await token.balanceOf(userAddress)).equal(totalSupply - sweepAmount);

      await swapRouter.sweepToken(token.address, userAddress, sweepAmount);
      expect(await token.balanceOf(swapRouter.address)).equal(0);
      expect(await token.balanceOf(userAddress)).equal(totalSupply);
    });
  });
});
