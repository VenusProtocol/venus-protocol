import { FakeContract, smock } from "@defi-wonderland/smock";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import chai from "chai";
import { BigNumber, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

import { IAccessControlManagerV8, IXVSVault, PrimeLeaderboard } from "../../../../typechain";

const { expect } = chai;
chai.use(smock.matchers);

export const DAY = 24 * 60 * 60;

export interface PrimeLeaderboardFixture {
  primeLeaderboard: PrimeLeaderboard;
  accessControlManager: FakeContract<IAccessControlManagerV8>;
  xvsVault: FakeContract<IXVSVault>;
  admin: Signer;
  user1: Signer;
  user2: Signer;
  user3: Signer;
  xvsAddress: string;
}

export async function deployPrimeLeaderboardFixture(): Promise<PrimeLeaderboardFixture> {
  const [admin, user1, user2, user3] = await ethers.getSigners();

  const xvsAddress = ethers.Wallet.createRandom().address;

  const accessControlManager = await smock.fake<IAccessControlManagerV8>("IAccessControlManagerV8");
  accessControlManager.isAllowedToCall.returns(true);

  const xvsVault = await smock.fake<IXVSVault>("IXVSVault");
  xvsVault.xvsAddress.returns(xvsAddress);
  xvsVault.getUserInfo.returns([0, 0, 0]);
  await setBalance(xvsVault.address, ethers.utils.parseEther("10"));

  const PrimeLeaderboardFactory = await ethers.getContractFactory("PrimeLeaderboard");
  const primeLeaderboard = (await upgrades.deployProxy(PrimeLeaderboardFactory, [accessControlManager.address, 100], {
    unsafeAllow: ["constructor", "state-variable-immutable"],
    constructorArgs: [xvsVault.address, xvsAddress, 0],
  })) as PrimeLeaderboard;

  return { primeLeaderboard, accessControlManager, xvsVault, admin, user1, user2, user3, xvsAddress };
}

export async function simulateDeposit(
  primeLeaderboard: PrimeLeaderboard,
  xvsVault: FakeContract<IXVSVault>,
  xvsAddress: string,
  user: string,
  newTotalBalance: string,
): Promise<void> {
  xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user).returns([newTotalBalance, 0, 0]);
  await primeLeaderboard.connect(xvsVault.wallet).xvsUpdated(user);
}

export async function simulateWithdrawal(
  primeLeaderboard: PrimeLeaderboard,
  xvsVault: FakeContract<IXVSVault>,
  xvsAddress: string,
  user: string,
  newTotalBalance: string,
): Promise<void> {
  xvsVault.getUserInfo.whenCalledWith(xvsAddress, 0, user).returns([newTotalBalance, 0, 0]);
  await primeLeaderboard.connect(xvsVault.wallet).xvsUpdated(user);
}

// 0.01% relative tolerance for multi-operation assertions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function expectApprox(actual: any, expected: any): void {
  const exp = BigNumber.from(expected);
  const tolerance = exp.div(10000);
  expect(actual).to.be.closeTo(exp, tolerance);
}
