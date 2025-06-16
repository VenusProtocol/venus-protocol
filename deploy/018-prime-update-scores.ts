import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { Prime } from "../typechain";

const fetchPrimeHolders = async (prime: Prime, fromBlock: number, toBlock: number): Promise<string[]> => {
  const events = await prime.queryFilter(prime.filters.Mint(), fromBlock, toBlock);
  const users = [];

  for (const event of events) {
    const user = event.args[0];
    users.push(user);
  }

  return users;
};

const func: DeployFunction = async function () {
  const prime: Prime = await ethers.getContract(`Prime`);
  const primeHolders: string[] = [];

  const fromBlock = 33264762;
  const toBlock = await ethers.provider.getBlockNumber();
  const chunkSize = 50000;

  let startBlock = fromBlock;

  while (startBlock <= toBlock) {
    const endBlock = Math.min(startBlock + chunkSize - 1, toBlock);
    const users = await fetchPrimeHolders(prime, startBlock, endBlock);
    if (users.length !== 0) {
      console.log(`Fetched ${users.length} prime holders from block ${startBlock} to ${endBlock}`);
    }
    primeHolders.push(...users);

    console.log(`Fetched events from block ${startBlock} to ${endBlock}`);
    startBlock = endBlock + 1;
  }

  const currentPrimeHolders = [];

  // check if user is a prime holder or not
  for (let i = 0; i < primeHolders.length; i++) {
    const token = await prime.tokens(primeHolders[i]);

    if (token.exists) {
      currentPrimeHolders.push(primeHolders[i]);
    }
  }

  console.log(`Total Prime Holders: ${currentPrimeHolders.length}`);
  console.log("Pending score updates: ", (await prime.pendingScoreUpdates()).toString());

  // update scrores with batch size 100
  const batchSize = 100;
  for (let i = 0; i < currentPrimeHolders.length; i += batchSize) {
    const batch = currentPrimeHolders.slice(i, i + batchSize);
    const tx = await prime.updateScores(batch);
    await tx.wait();

    console.log(`Updated scores for ${batch.length} users in batch starting from index ${i}`);
  }

  console.log("Pending score updates: ", (await prime.pendingScoreUpdates()).toString());
};

func.tags = ["prime-update-scores"];
func.skip = async (hre: HardhatRuntimeEnvironment) => !hre.network.live;

export default func;
