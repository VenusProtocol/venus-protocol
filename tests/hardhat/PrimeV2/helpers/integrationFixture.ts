import { FakeContract, smock } from "@defi-wonderland/smock";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Contract, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { convertToUnit } from "../../../../helpers/utils";
import {
  IAccessControlManagerV8,
  IPrimeLiquidityProvider,
  IXVSVault,
  InterfaceComptroller,
  PrimeLeaderboard,
  PrimeV2,
  ResilientOracleInterface,
} from "../../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

export const MAXIMUM_XVS_CAP = convertToUnit(100000, 18);
export const BLOCKS_PER_YEAR = 70080000;

export interface IntegrationFixture {
  primeV2: PrimeV2;
  primeLeaderboard: PrimeLeaderboard;
  accessControlManager: FakeContract<IAccessControlManagerV8>;
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

export async function deployIntegrationFixture(): Promise<IntegrationFixture> {
  const [admin, user1, user2, user3] = await ethers.getSigners();

  const xvsAddress = ethers.Wallet.createRandom().address;
  const wrappedNativeToken = ethers.Wallet.createRandom().address;
  const nativeMarket = ethers.Wallet.createRandom().address;

  const accessControlManager = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
  accessControlManager.isAllowedToCall.returns(true);

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
  await setBalance(xvsVault.address, ethers.utils.parseEther("10"));

  oracle.getPrice.returns(convertToUnit(3, 18));
  oracle.getUnderlyingPrice.returns(convertToUnit(1, 18));
  oracle.updateAssetPrice.returns();
  oracle.updatePrice.returns();

  comptroller.markets.returns(true);

  vToken.underlying.returns(underlyingAddress);
  vToken.borrowBalanceStored.returns(0);
  vToken.exchangeRateStored.returns(convertToUnit(1, 18));
  vToken.balanceOf.returns(0);

  primeLiquidityProvider.tokenAmountAccrued.returns(0);

  const PrimeV2Factory = await ethers.getContractFactory("PrimeV2");
  const primeV2 = (await upgrades.deployProxy(
    PrimeV2Factory,
    [1, 2, accessControlManager.address, primeLiquidityProvider.address, comptrollerAddress, oracle.address, 100],
    {
      constructorArgs: [
        wrappedNativeToken,
        nativeMarket,
        MAXIMUM_XVS_CAP,
        xvsVault.address,
        xvsAddress,
        0,
        false,
        BLOCKS_PER_YEAR,
      ],
      unsafeAllow: ["constructor", "state-variable-immutable", "internal-function-storage"],
    },
  )) as PrimeV2;

  const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");
  const primeLeaderboard = (await upgrades.deployProxy(PrimeLeaderboardFactory, [accessControlManager.address, 100], {
    unsafeAllow: ["constructor", "state-variable-immutable"],
    constructorArgs: [xvsVault.address, xvsAddress, 0],
  })) as PrimeLeaderboard;

  await primeLeaderboard.setPrimeV2(primeV2.address);

  return {
    primeV2,
    primeLeaderboard,
    accessControlManager,
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

/**
 * Simulate a vault deposit by setting the user's vault balance and calling xvsUpdated
 * through the vault wallet (to pass the msg.sender == xvsVault guard).
 */
export async function simulateVaultDeposit(
  f: IntegrationFixture,
  user: string,
  newTotalBalance: string,
): Promise<void> {
  f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user).returns([newTotalBalance, 0, 0]);
  await f.primeLeaderboard.connect(f.xvsVault.wallet).xvsUpdated(user);
}

/**
 * Simulate a vault withdrawal by setting the user's vault balance and calling xvsUpdated.
 */
export async function simulateVaultWithdrawal(
  f: IntegrationFixture,
  user: string,
  newTotalBalance: string,
): Promise<void> {
  f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, user).returns([newTotalBalance, 0, 0]);
  await f.primeLeaderboard.connect(f.xvsVault.wallet).xvsUpdated(user);
}

/**
 * Issue a Prime token and set up default vToken + XVS balances for a user.
 */
export async function issueAndSetupUser(
  f: IntegrationFixture,
  userAddress: string,
  xvsAmount: string = convertToUnit(1000, 18),
  vTokenBalance: string = convertToUnit(1000, 18),
): Promise<void> {
  f.vToken.balanceOf.whenCalledWith(userAddress).returns(vTokenBalance);
  f.xvsVault.getUserInfo.whenCalledWith(f.xvsAddress, 0, userAddress).returns([xvsAmount, 0, 0]);
  await f.primeV2["issue(address)"](userAddress);
}

// 0.01% relative tolerance for multi-operation assertions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function expectApprox(actual: any, expected: any): void {
  const exp = BigNumber.from(expected);
  const tolerance = exp.div(10000);
  expect(actual).to.be.closeTo(exp, tolerance);
}
