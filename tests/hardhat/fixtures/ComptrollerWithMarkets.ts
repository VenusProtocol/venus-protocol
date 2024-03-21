import { FakeContract, smock } from "@defi-wonderland/smock";
import { BaseContract, BigNumberish } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import {
  ComptrollerLens,
  ComptrollerLens__factory,
  ComptrollerMock,
  ComptrollerMock__factory,
  FaucetToken,
  IAccessControlManagerV5,
  IERC20,
  InterestRateModel,
  InterestRateModelHarness,
  JumpRateModel,
  Liquidator,
  MockVBNB,
  VAIController,
  VBep20,
  VBep20Harness,
} from "../../../typechain";
import { IProtocolShareReserve } from "../../../typechain/contracts/InterfacesV8.sol";
import { PriceOracle } from "../../../typechain/contracts/Oracle/PriceOracle";

type MaybeFake<T extends BaseContract> = T | FakeContract<T>;

interface ComptrollerFixture {
  accessControlManager: FakeContract<IAccessControlManagerV5>;
  oracle: FakeContract<PriceOracle>;
  vaiController: FakeContract<VAIController>;
  comptroller: ComptrollerMock;
  comptrollerLens: ComptrollerLens;
  vTokens: VBep20[];
  vBNB: MockVBNB;
  protocolShareReserve: BaseContract;
}

export const deployComptrollerWithMarkets = async ({
  numBep20Tokens,
  interestRateModel,
}: {
  numBep20Tokens: number;
  interestRateModel?: InterestRateModel;
}): Promise<ComptrollerFixture> => {
  const accessControlManager = await deployFakeAccessControlManager();
  const oracle = await deployFakeOracle();
  const comptrollerLens = await deployComptrollerLens();
  const comptroller = await deployComptroller({ accessControlManager, comptrollerLens });
  const protocolShareReserve = await deployProtocolShareReserve(comptroller.address);

  const vTokens: VBep20[] = [];
  for (let i = 0; i < numBep20Tokens; i++) {
    const vToken = await deployVToken({
      comptroller,
      accessControlManager,
      interestRateModel,
      protocolShareReserve: protocolShareReserve,
    });
    await comptroller._supportMarket(vToken.address);
    vTokens.push(vToken);
  }
  const vBNB = await deployVBNB({ comptroller });
  await comptroller._supportMarket(vBNB.address);

  const vaiController = await deployFakeVAIController();
  await comptroller._setVAIController(vaiController.address);
  return {
    accessControlManager,
    oracle,
    comptroller,
    comptrollerLens,
    vTokens,
    vBNB,
    vaiController,
    protocolShareReserve,
  };
};

export const deployFakeVAIController = async (
  opts: Partial<{ vai: FaucetToken }> = {},
): Promise<FakeContract<VAIController>> => {
  const vai = opts.vai ?? (await deployMockToken({ name: "VAI", symbol: "VAI", decimals: 18 }));
  const vaiController = await smock.fake<VAIController>("VAIController");
  vaiController.getVAIAddress.returns(vai.address);
  return vaiController;
};

export const deployLiquidatorContract = async ({
  comptroller,
  vBNB,
  treasuryAddress,
  treasuryPercentMantissa,
}: {
  comptroller: ComptrollerMock;
  vBNB: MockVBNB;
  treasuryAddress: string;
  treasuryPercentMantissa: BigNumberish;
}): Promise<Liquidator> => {
  const accessControlManager = await deployFakeAccessControlManager();
  const protocolShareReserve = await deployFakeProtocolShareReserve();
  const liquidatorFactory = await ethers.getContractFactory("Liquidator");
  const liquidator = (await upgrades.deployProxy(
    liquidatorFactory,
    [treasuryPercentMantissa, accessControlManager.address, protocolShareReserve.address],
    {
      constructorArgs: [comptroller.address, vBNB.address, treasuryAddress],
    },
  )) as Liquidator;
  await liquidator.setTreasuryPercent(treasuryPercentMantissa);
  await liquidator.deployed();
  await comptroller._setLiquidatorContract(liquidator.address);
  return liquidator;
};

export const deployFakeAccessControlManager = async (): Promise<FakeContract<IAccessControlManagerV5>> => {
  const acm = await smock.fake<IAccessControlManagerV5>("IAccessControlManagerV5");
  acm.isAllowedToCall.returns(true);
  return acm;
};

export const deployFakeProtocolShareReserve = async (): Promise<FakeContract<IProtocolShareReserve>> => {
  const psr = await smock.fake<IProtocolShareReserve>("contracts/InterfacesV8.sol:IProtocolShareReserve");
  return psr;
};

export const deployFakeOracle = async (): Promise<FakeContract<PriceOracle>> => {
  const oracle = await smock.fake<PriceOracle>("contracts/Oracle/PriceOracle.sol:PriceOracle");
  oracle.getUnderlyingPrice.returns(parseUnits("1", 18));
  return oracle;
};

export const deployComptroller = async (
  opts: Partial<{
    accessControlManager: MaybeFake<IAccessControlManagerV5>;
    oracle: MaybeFake<PriceOracle>;
    liquidationIncentiveMantissa: BigNumberish;
    closeFactorMantissa: BigNumberish;
    comptrollerLens: MaybeFake<ComptrollerLens>;
  }> = {},
): Promise<ComptrollerMock> => {
  const acm = opts.accessControlManager ?? (await deployFakeAccessControlManager());
  const oracle = opts.oracle ?? (await deployFakeOracle());
  const liquidationIncentiveMantissa = opts.liquidationIncentiveMantissa ?? parseUnits("1.1", 18);
  const closeFactorMantissa = opts.closeFactorMantissa ?? parseUnits("0.5", 18);
  const comptrollerLens = opts.comptrollerLens ?? (await deployComptrollerLens());

  const comptrollerFactory: ComptrollerMock__factory = await ethers.getContractFactory("ComptrollerMock");
  const comptroller = await comptrollerFactory.deploy();
  await comptroller.deployed();
  await comptroller._setComptrollerLens(comptrollerLens.address);
  await comptroller._setAccessControl(acm.address);
  await comptroller._setPriceOracle(oracle.address);
  await comptroller._setLiquidationIncentive(liquidationIncentiveMantissa);
  await comptroller._setCloseFactor(closeFactorMantissa);
  return comptroller;
};

export const deployComptrollerLens = async (): Promise<ComptrollerLens> => {
  const comptrollerLensFactory: ComptrollerLens__factory = await ethers.getContractFactory("ComptrollerLens");
  const comptrollerLens = await comptrollerLensFactory.deploy();
  await comptrollerLens.deployed();
  return comptrollerLens;
};

export const deployJumpRateModel = async ({
  baseRatePerYear,
  multiplierPerYear,
  jumpMultiplierPerYear,
  kink,
}: Partial<{
  baseRatePerYear: BigNumberish;
  multiplierPerYear: BigNumberish;
  jumpMultiplierPerYear: BigNumberish;
  kink: BigNumberish;
}> = {}): Promise<JumpRateModel> => {
  const jumpRateModelFactory = await ethers.getContractFactory("JumpRateModel");
  const jumpRateModel = await jumpRateModelFactory.deploy(
    baseRatePerYear ?? parseUnits("0.05", 18),
    multiplierPerYear ?? parseUnits("0.8", 18),
    jumpMultiplierPerYear ?? parseUnits("3", 18),
    kink ?? parseUnits("0.7", 18),
  );
  await jumpRateModel.deployed();
  return jumpRateModel;
};

export const deployInterestRateModelHarness = async ({
  baseRatePerYear,
}: Partial<{
  baseRatePerYear: BigNumberish;
}> = {}): Promise<InterestRateModelHarness> => {
  const interestRateModelFactory = await ethers.getContractFactory("InterestRateModelHarness");
  const interestRateModel = await interestRateModelFactory.deploy(baseRatePerYear ?? parseUnits("5", 10));
  await interestRateModel.deployed();
  return interestRateModel;
};

const deployProtocolShareReserve = async (comptroller: string) => {
  const vBNB = await deployVBNB();
  const wBNB = await deployMockToken();
  const protocolShareReserveFactory = await ethers.getContractFactory("ProtocolShareReserve");
  const protocolShareReserve = await protocolShareReserveFactory.deploy(comptroller, wBNB.address, vBNB.address);
  await protocolShareReserve.deployed();
  return protocolShareReserve;
};

export const deployMockToken = async ({
  name,
  symbol,
  decimals,
  initialSupply,
}: Partial<{
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: BigNumberish;
  owner: string;
}> = {}): Promise<FaucetToken> => {
  const faucetTokenFactory = await ethers.getContractFactory("FaucetToken");
  const faucetToken: FaucetToken = await faucetTokenFactory.deploy(
    initialSupply ?? parseUnits("1000000", 18),
    name ?? "FaucetToken",
    decimals ?? 18,
    symbol ?? "FAU",
  );
  await faucetToken.deployed();
  return faucetToken;
};

export const deployVToken = async (
  opts: Partial<{
    accessControlManager: MaybeFake<IAccessControlManagerV5>;
    underlying: IERC20;
    comptroller: ComptrollerMock;
    interestRateModel: InterestRateModel;
    initialExchangeRateMantissa: BigNumberish;
    name: string;
    symbol: string;
    decimals: number;
    admin: string;
    protocolShareReserve: BaseContract;
  }> = {},
): Promise<VBep20Harness> => {
  const accessControlManager = opts.accessControlManager ?? (await deployFakeAccessControlManager());
  const underlying = opts.underlying ?? (await deployMockToken());
  const comptroller = opts.comptroller ?? (await deployComptroller());
  const interestRateModel = opts.interestRateModel ?? (await deployJumpRateModel());
  const protocolShareReserve = opts.protocolShareReserve ?? (await deployProtocolShareReserve(comptroller.address));

  const initialExchangeRateMantissa = opts.initialExchangeRateMantissa ?? parseUnits("1", 18);
  const name = opts.name ?? "VToken";
  const symbol = opts.symbol ?? "VT";
  const decimals = opts.decimals ?? 8;
  const admin = opts.admin ?? (await ethers.getSigners())[0].address;

  const vTokenFactory = await ethers.getContractFactory("VBep20Harness");
  const vToken: VBep20Harness = await vTokenFactory.deploy(
    underlying.address,
    comptroller.address,
    interestRateModel.address,
    initialExchangeRateMantissa,
    name,
    symbol,
    decimals,
    admin,
  );
  await vToken.deployed();
  await vToken.setAccessControlManager(accessControlManager.address);
  await vToken.setProtocolShareReserve(protocolShareReserve.address);
  return vToken;
};

export const deployVBNB = async (
  opts: Partial<{
    comptroller: ComptrollerMock;
    interestRateModel: InterestRateModel;
    initialExchangeRateMantissa: BigNumberish;
    name: string;
    symbol: string;
    decimals: number;
    admin: string;
  }> = {},
) => {
  const comptroller = opts.comptroller ?? (await deployComptroller());
  const interestRateModel = opts.interestRateModel ?? (await deployJumpRateModel());
  const initialExchangeRateMantissa = opts.initialExchangeRateMantissa ?? parseUnits("1", 18);
  const name = opts.name ?? "Venus BNB";
  const symbol = opts.symbol ?? "vBNB";
  const decimals = opts.decimals ?? 8;
  const admin = opts.admin ?? (await ethers.getSigners())[0].address;

  const vTokenFactory = await ethers.getContractFactory("MockVBNB");
  const vBNB: MockVBNB = await vTokenFactory.deploy(
    comptroller.address,
    interestRateModel.address,
    initialExchangeRateMantissa,
    name,
    symbol,
    decimals,
    admin,
  );
  return vBNB;
};
