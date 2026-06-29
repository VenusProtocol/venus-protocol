import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Deploys PrimeLens — a stateless view-only helper that exposes per-user APR
 * figures against an already-deployed PrimeV2 proxy.
 *
 * Run with: `npx hardhat deploy --tags PrimeLens --network <network>`
 *
 * PrimeLens has no admin, no proxy, and no wiring — it is a pure read-only
 * contract whose immutable `primeV2` reference is set in the constructor.
 * Redeploy when the PrimeV2 proxy address changes; not required on PrimeV2
 * implementation upgrades.
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const primeV2 = await ethers.getContract("PrimeV2");

  const constructorArgs = [primeV2.address];

  const lensDeployment = await deploy("PrimeLens", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: constructorArgs,
  });

  console.log(`PrimeLens: ${lensDeployment.address}`);
  console.log(`  reads from PrimeV2: ${primeV2.address}`);

  if (network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: lensDeployment.address,
        constructorArguments: constructorArgs,
      });
    } catch (error) {
      console.error("PrimeLens verification failed:", error);
    }
  }
};

func.tags = ["PrimeLens"];

export default func;
