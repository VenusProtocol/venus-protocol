import { FakeContract, smock } from "@defi-wonderland/smock";
import chai from "chai";
import { Contract, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../../helpers/utils";
import {
  IAccessControlManagerV8,
  IPrimeLeaderboard,
  IPrimeLiquidityProvider,
  IXVSVault,
  InterfaceComptroller,
  PrimeV2,
  ResilientOracleInterface,
} from "../../../../typechain";

chai.use(smock.matchers);

export const BLOCKS_PER_YEAR = 70080000;

export interface PrimeV2Fixture {
  primeV2: PrimeV2;
  accessControlManager: FakeContract<IAccessControlManagerV8>;
  primeLeaderboard: FakeContract<IPrimeLeaderboard>;
  primeLiquidityProvider: FakeContract<IPrimeLiquidityProvider>;
  xvsVault: FakeContract<IXVSVault>;
  oracle: FakeContract<ResilientOracleInterface>;
  comptroller: FakeContract<InterfaceComptroller>;
  vToken: FakeContract<Contract>;
  underlyingToken: FakeContract<Contract>;
  admin: Signer;
  user1: Signer;
  user2: Signer;
  user3: Signer;
  xvsAddress: string;
  comptrollerAddress: string;
  wrappedNativeToken: string;
  nativeMarket: string;
  underlyingAddress: string;
}

export async function deployPrimeV2Fixture(): Promise<PrimeV2Fixture> {
  const [admin, user1, user2, user3] = await ethers.getSigners();

  const xvsAddress = ethers.Wallet.createRandom().address;
  const wrappedNativeToken = ethers.Wallet.createRandom().address;
  const nativeMarket = ethers.Wallet.createRandom().address;

  const accessControlManager = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
  accessControlManager.isAllowedToCall.returns(true);

  const primeLeaderboard = await smock.fake<IPrimeLeaderboard>(
    "contracts/Tokens/Prime/IPrimeLeaderboard.sol:IPrimeLeaderboard",
  );
  const primeLiquidityProvider = await smock.fake<IPrimeLiquidityProvider>("IPrimeLiquidityProvider");
  const xvsVault = await smock.fake<IXVSVault>("IXVSVault");
  const oracle = await smock.fake<ResilientOracleInterface>("ResilientOracleInterface");
  const comptroller = await smock.fake<InterfaceComptroller>(
    "contracts/Tokens/Prime/Interfaces/InterfaceComptroller.sol:InterfaceComptroller",
  );
  const vToken = await smock.fake("contracts/Tokens/Prime/Interfaces/IVToken.sol:IVToken");
  const comptrollerAddress = comptroller.address;

  const underlyingToken = await smock.fake(
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol:IERC20MetadataUpgradeable",
  );
  const underlyingAddress = underlyingToken.address;
  underlyingToken.decimals.returns(18);

  xvsVault.xvsAddress.returns(xvsAddress);
  xvsVault.getUserInfo.returns([convertToUnit(1000, 18), 0, 0]);

  oracle.getPrice.returns(convertToUnit(3, 18));
  oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));
  oracle.updateAssetPrice.returns();
  oracle.updatePrice.returns();

  comptroller.markets.returns(true);

  vToken.underlying.returns(underlyingAddress);
  vToken.borrowBalanceStored.returns(0);
  vToken.exchangeRateStored.returns(convertToUnit(1, 18));
  vToken.balanceOf.returns(0);

  const PrimeV2Factory = await ethers.getContractFactory("PrimeV2");
  const primeV2 = (await upgrades.deployProxy(
    PrimeV2Factory,
    [1, 2, accessControlManager.address, primeLiquidityProvider.address, comptrollerAddress, oracle.address, 100],
    {
      constructorArgs: [wrappedNativeToken, nativeMarket, xvsVault.address, xvsAddress, 0, false, BLOCKS_PER_YEAR],
      unsafeAllow: ["constructor", "state-variable-immutable", "internal-function-storage"],
    },
  )) as PrimeV2;

  return {
    primeV2,
    accessControlManager,
    primeLeaderboard,
    primeLiquidityProvider,
    xvsVault,
    oracle,
    comptroller,
    vToken,
    underlyingToken,
    admin,
    user1,
    user2,
    user3,
    xvsAddress,
    comptrollerAddress,
    wrappedNativeToken,
    nativeMarket,
    underlyingAddress,
  };
}
