import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { isLocalNetwork, getContractAddressOrNullAddress } from "../helpers/deploymentConfig";

interface AdminAccounts {
  [key: string]: string;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  interface Config {
    [key: string]: number;
  }

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

  const networkName: string = network.name;
  const loopsLimit = 100;

  const acmAddress = (await deployments.get("AccessControlManager")).address;
  const xvsVaultAddress = (await deployments.get("XVSVaultProxy")).address;
  const xvsAddress = (await deployments.get("XVS")).address;

  const adminAccount: AdminAccounts = {
    sepolia: "0x94fa6078b6b8a26f0b6edffbe6501b22a10470fb",
    ethereum: "0x285960C5B22fD66A736C7136967A3eB15e93CC67",
    arbitrumsepolia: "0x1426A5Ae009c4443188DA8793751024E358A61C2",
    arbitrumone: "0x14e0E151b33f9802b3e75b621c1457afc44DcAA0",
    zksyncsepolia: "0xa2f83de95E9F28eD443132C331B6a9C9B7a9F866",
    zksyncmainnet: "0x751Aa759cfBB6CE71A43b48e40e1cCcFC66Ba4aa",
    opsepolia: "0xd57365EE4E850e881229e2F8Aa405822f289e78d",
    opmainnet: "0x2e94dd14E81999CdBF5deDE31938beD7308354b3",
    unichainsepolia: "0x9831D3A641E8c7F082EEA75b8249c99be9D09a34",
    basesepolia: "0xdf3b635d2b535f906BB02abb22AED71346E36a00",
    basemainnet: "0x1803Cf1D3495b43cC628aa1d8638A981F8CD341C",
    unichainmainnet: "0x1803Cf1D3495b43cC628aa1d8638A981F8CD341C",
    bscmainnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
    bsctestnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
  };

  const defaultProxyAdmin = await hre.artifacts.readArtifact(
    "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
  );

  // ============ Deploy PrimeLeaderboard ============
  const constructorArgs = [xvsVaultAddress, xvsAddress, xVSVaultPoolId[networkName]];

  const primeLeaderboardDeployment = await deploy("PrimeLeaderboard", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: constructorArgs,
    proxy: {
      owner: isLocalNetwork(network.name) ? deployer : adminAccount[networkName],
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: {
        methodName: "initialize",
        args: [acmAddress, loopsLimit],
      },
      viaAdminContract: {
        name: "DefaultProxyAdmin",
        artifact: defaultProxyAdmin,
      },
    },
  });

  const primeLeaderboard = await ethers.getContract("PrimeLeaderboard");
  console.log(`PrimeLeaderboard deployed: ${primeLeaderboard.address}`);

  // ============ Verify implementation ============
  if (!isLocalNetwork(network.name) && primeLeaderboardDeployment.implementation) {
    try {
      await hre.run("verify:verify", {
        address: primeLeaderboardDeployment.implementation,
        constructorArguments: constructorArgs,
      });
    } catch (error) {
      console.error("PrimeLeaderboard implementation verification failed:", error);
    }
  }

  // ============ Transfer ownership to Timelock ============
  if (!isLocalNetwork(network.name)) {
    console.log("Transferring PrimeLeaderboard ownership to Timelock...");
    await primeLeaderboard.transferOwnership(adminAccount[networkName]);
    console.log(`PrimeLeaderboard ownership transfer initiated to ${adminAccount[networkName]} (pending acceptance)`);
  }
};

func.tags = ["PrimeLeaderboard"];

export default func;
