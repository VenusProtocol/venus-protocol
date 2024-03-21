import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { NumberLike } from "@nomicfoundation/hardhat-network-helpers/dist/src/types";
import { BigNumber, BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { network } from "hardhat";

export const setForkBlock = async (blockNumber: number) => {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env[`ARCHIVE_NODE_${process.env.FORKED_NETWORK}`],
          blockNumber,
        },
      },
    ],
  });
};

export const forking = (blockNumber: number, fn: () => void) => {
  describe(`At block #${blockNumber}`, () => {
    before(async () => {
      await setForkBlock(blockNumber);
    });
    fn();
  });
};

export const initMainnetUser = async (user: string, balance?: NumberLike) => {
  await impersonateAccount(user);
  if (balance !== undefined) {
    await setBalance(user, balance);
  }
  return ethers.getSigner(user);
};

export const FORK_MAINNET = process.env.FORK === "true" && process.env.FORKED_NETWORK === "bscmainnet";

export const around = (expected: BigNumberish, tolerance: BigNumberish) => {
  return (actual: BigNumberish) => {
    const diff = BigNumber.from(expected).sub(actual).abs();
    return diff.lte(tolerance);
  };
};

export enum FacetCutAction {
  Add,
  Replace,
  Remove,
}
