import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { network } from "hardhat";

async function setForkBlock(blockNumber: number) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.BSC_ARCHIVE_NODE_URL,
          blockNumber,
        },
      },
    ],
  });
}

export const forking = (blockNumber: number, fn: () => void) => {
  describe(`At block #${blockNumber}`, () => {
    before(async () => {
      await setForkBlock(blockNumber);
    });
    fn();
  });
};

export const initMainnetUser = async (user: string) => {
  await impersonateAccount(user);
  return ethers.getSigner(user);
};

export const FORK_MAINNET = process.env.FORK_MAINNET === "true";
