import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { isLocalNetwork, getContractAddressOrNullAddress } from "../helpers/deploymentConfig";

/**
 * Deploys ONLY a new PrimeV2 implementation contract — no proxy, no wiring.
 * Run with: `npx hardhat deploy --tags PrimeV2Impl --network <network>`
 *
 * The proxy at the existing PrimeV2 address is Timelock-owned, so the
 * upgrade must be performed via a governance VIP that calls
 * `ProxyAdmin.upgrade(PrimeV2_proxy, newImpl)`.
 *
 * Constructor args mirror deploy/014-deploy-prime-v2.ts so the immutables on
 * the new impl match the proxy's existing immutables (required for in-place
 * upgrade — immutables live in code, not storage).
 */

interface Config {
  [key: string]: number;
}

const blocksPerYear: Config = {
  bsctestnet: 70_080_000,
  sepolia: 2_628_000,
  arbitrumsepolia: 0,
  arbitrumone: 0,
  zksyncsepolia: 0,
  zksyncmainnet: 0,
  opsepolia: 0,
  opmainnet: 0,
  unichainsepolia: 0,
  basesepolia: 0,
  basemainnet: 0,
  unichainmainnet: 0,
  bscmainnet: 70_080_000,
  ethereum: 2_628_000,
  hardhat: 100,
  localhost: 100,,
};

const xVSVaultPoolId: Config = {
  bsctestnet: 1,
  sepolia: 0,
  arbitrumsepolia: 0,
  bscmainnet: 0,
  ethereum: 0,
  arbitrumone: 0,
  zksyncsepolia: 0,
  zksyncmainnet: 0,
  opsepolia: 0,
  opmainnet: 0,
  unichainsepolia: 0,
  hardhat: 0,
  localhost: 0,,
  basesepolia: 0,
  basemainnet: 0,
  unichainmainnet: 0,
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const networkName = network.name;

  const ZERO_ADDRESS = ethers.constants.AddressZero;

  const wrappedNativeToken = await getContractAddressOrNullAddress(deployments, "WBNB");
  const nativeMarket = await getContractAddressOrNullAddress(deployments, "vBNB");
  const xvsVaultAddress = (await deployments.get("XVSVaultProxy")).address;
  const xvsAddress = (await deployments.get("XVS")).address;
  const poolId = xVSVaultPoolId[networkName];
  const bpy = blocksPerYear[networkName];
  const isTimeBased = bpy === 0;

  const constructorArgs = [
    wrappedNativeToken ? wrappedNativeToken : ZERO_ADDRESS,
    nativeMarket ? nativeMarket : ZERO_ADDRESS,
    xvsVaultAddress,
    xvsAddress,
    poolId,
    isTimeBased,
    bpy,
  ];

  // ============ Deploy PrimeV2 implementation only ============
  const implDeployment = await deploy("PrimeV2_Impl", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    contract: "PrimeV2",
    args: constructorArgs,
  });

  console.log(`PrimeV2 implementation: ${implDeployment.address}`);

  // ============ Verify implementation ============
  if (!isLocalNetwork(network.name)) {
    try {
      await hre.run("verify:verify", {
        address: implDeployment.address,
        constructorArguments: constructorArgs,
      });
    } catch (error) {
      console.error("PrimeV2 implementation verification failed:", error);
    }
  }

  console.log("Next step — VIP action to point the proxy at the new impl:");
  console.log(`  ProxyAdmin.upgrade(PrimeV2_proxy, ${implDeployment.address})`);
};

func.tags = ["PrimeV2Impl"];

export default func;
