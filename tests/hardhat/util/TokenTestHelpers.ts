import { FakeContract, MockContract, smock } from "@defi-wonderland/smock";
import { BigNumber } from "bignumber.js";
import chai from "chai";
import { BigNumberish, Signer } from "ethers";
import { ethers } from "hardhat";

import { convertToUnit } from "../../../helpers/utils";
import {
  Comptroller,
  InterestRateModel,
  StableRateModel,
  VBNBHarness,
  VBNBHarness__factory,
  VBep20Harness,
  VBep20Harness__factory,
} from "../../../typechain";

chai.use(smock.matchers);

export type VTokenContracts = {
  vToken: MockContract<VBep20Harness>;
  underlying: MockContract<VBNBHarness>;
  interestRateModel: FakeContract<InterestRateModel>;
  stableInterestRateModel: FakeContract<StableRateModel>;
};

export async function makeVToken({
  name,
  comptroller,
  admin,
}: {
  name: string;
  comptroller: FakeContract<Comptroller>;
  admin: Signer;
}): Promise<VTokenContracts> {
  const interestRateModel = await smock.fake<InterestRateModel>(
    "contracts/InterestRateModels/InterestRateModel.sol:InterestRateModel",
  );
  interestRateModel.isInterestRateModel.returns(true);
  const stableInterestRateModel = await smock.fake<StableRateModel>(
    "contracts/InterestRateModels/StableRateModel.sol:StableRateModel",
  );
  stableInterestRateModel.isInterestRateModel.returns(true);
  const underlyingFactory = await smock.mock<VBNBHarness__factory>("VBNBHarness");
  const underlying = await underlyingFactory.deploy(
    comptroller.address,
    interestRateModel.address,
    1,
    name,
    "$",
    18,
    admin.getAddress(),
  );
  const VTokenFactory = await smock.mock<VBep20Harness__factory>("VBep20Harness");
  const initialExchangeRateMantissa = convertToUnit("1", 18);
  const vToken = await VTokenFactory.deploy(
    underlying.address,
    comptroller.address,
    interestRateModel.address,
    initialExchangeRateMantissa,
    `v${name}`,
    `v${name}`,
    8,
    await admin.getAddress(),
  );
  await vToken.harnessSetStableInterestRateModel(stableInterestRateModel.address);
  return { vToken, underlying, interestRateModel, stableInterestRateModel };
}

export type VTokenTestFixture = {
  comptroller: FakeContract<Comptroller>;
  vToken: MockContract<VBep20Harness>;
  underlying: MockContract<VBNBHarness>;
  interestRateModel: FakeContract<InterestRateModel>;
  stableInterestRateModel: FakeContract<StableRateModel>;
};

export async function vTokenTestFixture(): Promise<VTokenTestFixture> {
  const comptroller = await smock.fake<Comptroller>("Comptroller");
  comptroller.isComptroller.returns(true);
  const [admin] = await ethers.getSigners();
  const { vToken, interestRateModel, underlying, stableInterestRateModel } = await makeVToken({
    name: "BAT",
    comptroller,
    admin,
  });

  return { comptroller, vToken, interestRateModel, underlying, stableInterestRateModel };
}

type BalancesSnapshot = {
  [vToken: string]: HoldersSnapshot;
};

type HoldersSnapshot = {
  [holder: string]: HolderSnapshot;
};

type HolderSnapshot = {
  eth: string;
  cash: string;
  tokens: string;
  borrows: string;
  reserves?: string;
};

type BalanceDeltaEntry =
  | [MockContract<VBep20Harness>, string, keyof HolderSnapshot, string | number]
  | [MockContract<VBep20Harness>, keyof HolderSnapshot, string | number];

export async function getBalances(
  vTokens: MockContract<VBep20Harness>[],
  accounts: string[],
): Promise<BalancesSnapshot> {
  const balances: BalancesSnapshot = {};
  for (const vToken of vTokens) {
    const vBalances: HoldersSnapshot = (balances[vToken.address] = {});
    const underlying = await ethers.getContractAt("VBNBHarness", await vToken.underlying());
    for (const account of accounts) {
      vBalances[account] = {
        eth: (await ethers.provider.getBalance(account)).toString(),
        cash: (await underlying.balanceOf(account)).toString(),
        tokens: (await vToken.balanceOf(account)).toString(),
        borrows: (await vToken.harnessAccountBorrows(account)).principal.toString(),
      };
    }
    vBalances[vToken.address] = {
      eth: (await ethers.provider.getBalance(vToken.address)).toString(),
      cash: (await underlying.balanceOf(vToken.address)).toString(),
      tokens: (await vToken.totalSupply()).toString(),
      borrows: (await vToken.totalBorrows()).toString(),
      reserves: (await vToken.totalReserves()).toString(),
    };
  }
  return balances;
}

export function adjustBalances(balances: BalancesSnapshot, deltas: BalanceDeltaEntry[]) {
  for (const delta of deltas) {
    let vToken: MockContract<VBep20Harness>;
    let account: string;
    let key: keyof HolderSnapshot;
    let diff: string | number;
    if (delta.length == 4) {
      [vToken, account, key, diff] = delta;
    } else {
      [vToken, key, diff] = delta;
      account = vToken.address;
    }
    balances[vToken.address][account][key] = new BigNumber(balances[vToken.address][account][key]!)
      .plus(diff)
      .toString();
  }
  return balances;
}

export async function preApprove(
  erc20: MockContract<VBNBHarness>,
  vToken: MockContract<VBep20Harness>,
  from: Signer,
  amount: BigNumberish,
  opts: { faucet?: boolean } = {},
) {
  if (opts.faucet) {
    await erc20.connect(from).harnessSetBalance(await from.getAddress(), amount);
  }

  return erc20.connect(from).approve(vToken.address, amount);
}

export async function pretendBorrow(
  vToken: MockContract<VBep20Harness>,
  borrower: Signer,
  accountIndex: number,
  marketIndex: number,
  principalRaw: BigNumberish,
  blockNumber: number = 2e7,
) {
  await vToken.harnessSetTotalBorrows(principalRaw);
  await vToken.harnessSetAccountBorrows(await borrower.getAddress(), principalRaw, convertToUnit(accountIndex, 18));
  await vToken.harnessSetBorrowIndex(convertToUnit(marketIndex, 18));
  await vToken.harnessSetAccrualBlockNumber(blockNumber);
  await vToken.harnessSetBlockNumber(blockNumber);
}

export async function pretendStableBorrow(
  vToken: MockContract<VBep20Harness>,
  borrower: Signer,
  accountIndex: number,
  marketIndex: number,
  principalRaw: BigNumberish,
  stableRateMantissa: BigNumberish,
  blockNumber: number = 2e7,
) {
  await vToken.harnessSetTotalBorrows(principalRaw);
  await vToken.harnessStableBorrows(principalRaw);
  await vToken.harnessSetAccountStableBorrows(
    await borrower.getAddress(),
    principalRaw,
    convertToUnit(accountIndex, 18),
    stableRateMantissa,
    blockNumber,
  );
  await vToken.harnessSetStableBorrowIndex(convertToUnit(marketIndex, 18));
  await vToken.harnessSetAccrualBlockNumber(blockNumber);
  await vToken.harnessSetBlockNumber(blockNumber);
}
