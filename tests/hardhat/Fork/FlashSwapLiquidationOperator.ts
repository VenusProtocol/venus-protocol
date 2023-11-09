import { smock } from "@defi-wonderland/smock";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { BigNumberish } from "ethers";
import { BytesLike, parseEther, parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  BUSDLiquidator,
  ComptrollerMock,
  FaucetToken,
  FlashSwapLiquidationOperator,
  FlashSwapLiquidationOperator__factory,
  VBep20,
} from "../../../typechain";
import { deployJumpRateModel } from "../fixtures/ComptrollerWithMarkets";
import { FORK_MAINNET, forking, initMainnetUser } from "./utils";

const { expect } = chai;
chai.use(smock.matchers);

const LIQUIDATOR_PERCENT = parseUnits("1.01", 18);

const addresses = {
  bscmainnet: {
    COMPTROLLER: "0xfD36E2c2a6789Db23113685031d7F16329158384",
    VBUSD: "0x95c78222B3D6e262426483D42CfA53685A67Ab9D",
    VBNB: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
    TIMELOCK: "0x939bD8d64c0A9583A7Dcea9933f7b21697ab6396",
    ACCESS_CONTROL_MANAGER: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
    PCS_SWAP_ROUTER_V3: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
    PCS_V3_DEPOLYER: "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9",
    BUSD_HOLDER: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
  },
};

const deployBUSDLiquidator = async ({
  comptroller,
  vBUSD,
  treasuryAddress,
  liquidatorShareMantissa,
}: {
  comptroller: ComptrollerMock;
  vBUSD: VBep20;
  treasuryAddress: string;
  liquidatorShareMantissa: BigNumberish;
}) => {
  const busdLiquidatorFactory = await ethers.getContractFactory("BUSDLiquidator");
  const busdLiquidator = (await upgrades.deployProxy(busdLiquidatorFactory, [liquidatorShareMantissa], {
    constructorArgs: [comptroller.address, vBUSD.address, treasuryAddress],
  })) as BUSDLiquidator;
  await busdLiquidator.deployed();
  return busdLiquidator;
};

interface BorrowerPosition {
  borrowerAddress: string;
  vTokenCollateral: string;
}

interface BUSDLiquidatorFixture {
  comptroller: ComptrollerMock;
  busdLiquidator: BUSDLiquidator;
  vBUSD: VBep20;
  busd: FaucetToken;
  treasuryAddress: string;
  flashSwapper: FlashSwapLiquidationOperator;
  borrowerPositions: BorrowerPosition[];
}

const setupFork = async (): Promise<BUSDLiquidatorFixture> => {
  const zeroRateModel = await deployJumpRateModel({
    baseRatePerYear: 0,
    multiplierPerYear: 0,
    jumpMultiplierPerYear: 0,
  });

  const comptroller = await ethers.getContractAt("ComptrollerMock", addresses.bscmainnet.COMPTROLLER);
  const vBUSD = await ethers.getContractAt("VBep20", addresses.bscmainnet.VBUSD);
  const busd = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vBUSD.underlying());
  const treasuryAddress = await comptroller.treasuryAddress();
  const acm = await ethers.getContractAt("IAccessControlManager", addresses.bscmainnet.ACCESS_CONTROL_MANAGER);

  const busdLiquidator = await deployBUSDLiquidator({
    comptroller,
    vBUSD,
    treasuryAddress: await comptroller.treasuryAddress(),
    liquidatorShareMantissa: LIQUIDATOR_PERCENT,
  });

  const timelock = await initMainnetUser(addresses.bscmainnet.TIMELOCK, parseEther("1"));
  await acm
    .connect(timelock)
    .giveCallPermission(comptroller.address, "_setActionsPaused(address[],uint8[],bool)", busdLiquidator.address);
  await comptroller.connect(timelock)._setForcedLiquidation(vBUSD.address, true);
  await vBUSD.connect(timelock)._setInterestRateModel(zeroRateModel.address);
  const MINT_ACTION = 0;
  await comptroller.connect(timelock)._setActionsPaused([vBUSD.address], [MINT_ACTION], false);
  await comptroller.connect(timelock)._setMarketSupplyCaps([vBUSD.address], [ethers.constants.MaxUint256]);

  const flashSwapperFactory: FlashSwapLiquidationOperator__factory =
    await ethers.getContractFactory<FlashSwapLiquidationOperator__factory>("FlashSwapLiquidationOperator");
  const flashSwapper = await flashSwapperFactory.deploy(
    addresses.bscmainnet.VBNB,
    addresses.bscmainnet.PCS_SWAP_ROUTER_V3,
    busdLiquidator.address,
  );

  const borrowerPositions = [
    {
      borrowerAddress: "",
      vTokenCollateral: "",
    },
  ];

  return { comptroller, busdLiquidator, vBUSD, busd, treasuryAddress, flashSwapper, borrowerPositions };
};

const injectBUSDLiquidity = async () => {
  const vBUSD = await ethers.getContractAt("VBep20", addresses.bscmainnet.VBUSD);
  const busd = await ethers.getContractAt("contracts/Utils/IBEP20.sol:IBEP20", await vBUSD.underlying());
  const busdHolder = await initMainnetUser(addresses.bscmainnet.BUSD_HOLDER, parseEther("1"));
  await busd.connect(busdHolder).approve(vBUSD.address, parseUnits("10000000", 18));
  await vBUSD.connect(busdHolder).mint(parseUnits("10000000", 18));
};

interface Pool {
  tokenA: string;
  tokenB: string;
  fee: BigNumberish;
}

const pool = (tokenA: string, tokenB: string, fee: BigNumberish) => ({
  tokenA,
  tokenB,
  fee,
});

const encodeFee = (fee: BigNumberish): string => ethers.utils.hexZeroPad(ethers.BigNumber.from(fee).toHexString(), 3);

const makePath = (pools: Pool[]) => {
  const path: BytesLike[] = [];
  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    if (i === 0) {
      path.push(pool.tokenA);
    } else {
      if (path[path.length - 1] != pool.tokenA) {
        throw new Error("Invalid path");
      }
    }
    path.push(encodeFee(pool.fee));
    path.push(pool.tokenB);
  }
  return ethers.utils.hexConcat(path);
};

const test = (setup: () => Promise<BUSDLiquidatorFixture>) => () => {
  describe("FlashSwapLiquidationOperator", () => {
    let owner: SignerWithAddress;
    let flashSwapper: FlashSwapLiquidationOperator;

    const WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
    const BUSD = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
    const ADA = "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47";
    const VADA = "0x9A0AF7FDb2065Ce470D72664DE73cAE409dA28Ec";
    const VBNB = addresses.bscmainnet.VBNB;
    const VBUSD = addresses.bscmainnet.VBUSD;

    beforeEach(async () => {
      ({ flashSwapper } = await loadFixture(setup));
      [owner] = await ethers.getSigners();
    });

    it("sets the address parameters correctly upon deployment", async () => {
      expect(await flashSwapper.vTokenBorrowed()).to.equal(VBUSD);
      expect(await flashSwapper.borrowedToken()).to.equal(BUSD);
      expect(await flashSwapper.vNative()).to.equal(VBNB);
      expect(await flashSwapper.swapRouter()).to.equal(addresses.bscmainnet.PCS_SWAP_ROUTER_V3);
      expect(await flashSwapper.deployer()).to.equal(addresses.bscmainnet.PCS_V3_DEPOLYER);
    });

    it("executes an in-kind liquidation", async () => {
      await injectBUSDLiquidity();
      // Using WBNB-BUSD pool as a source of BUSD liquidity
      const REVERSED_WBNB_BUSD_PATH = makePath([pool(BUSD, WBNB, 500)]);
      await flashSwapper.liquidate({
        beneficiary: owner.address,
        borrower: "0xDF3df3EE9Fb6D5c9B4fdcF80A92D25d2285A859C",
        repayAmount: parseUnits("1", 18),
        vTokenCollateral: VBUSD, // Notice in-kind liquidation, repaying BUSD and seizing BUSD
        path: REVERSED_WBNB_BUSD_PATH,
        deadline: 1698457358,
      });
    });

    it("executes a single-hop flash liquidation", async () => {
      const REVERSED_WBNB_BUSD_PATH = makePath([pool(BUSD, WBNB, 500)]);
      await flashSwapper.liquidate({
        beneficiary: owner.address,
        borrower: "0x3D5A1FB54234Da332f85881575E9216b3bB2D83d",
        repayAmount: parseUnits("1", 18),
        vTokenCollateral: VBNB,
        path: REVERSED_WBNB_BUSD_PATH,
        deadline: 1698457358,
      });
    });

    it("executes a multihop flash liquidation", async () => {
      const REVERSED_ADA_BUSD_PATH = makePath([pool(BUSD, WBNB, 500), pool(WBNB, ADA, 2500)]);
      await flashSwapper.liquidate({
        beneficiary: owner.address,
        borrower: "0x3D5A1FB54234Da332f85881575E9216b3bB2D83d",
        repayAmount: parseUnits("1", 18),
        vTokenCollateral: VADA,
        path: REVERSED_ADA_BUSD_PATH,
        deadline: 1698457358,
      });
    });
  });
};

if (FORK_MAINNET) {
  const blockNumber = 32652750;
  forking(blockNumber, test(setupFork));
}
