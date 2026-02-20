import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getContractAddressOrNullAddress } from "../helpers/deploymentConfig";

interface AdminAccounts {
  [key: string]: string;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName: string = network.name;
  const batchSize = 20;
  const loopsLimit = 20;

  const acmAddress = (await deployments.get("AccessControlManager")).address;
  const primeV2 = await ethers.getContract("PrimeV2");
  const primeLeaderboard = await ethers.getContract("PrimeLeaderboard");

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

  await deploy("PrimeV2Keeper", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    proxy: {
      owner: network.name === "hardhat" ? deployer : adminAccount[networkName],
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: {
        methodName: "initialize",
        args: [acmAddress, primeV2.address, primeLeaderboard.address, batchSize, loopsLimit],
      },
      viaAdminContract: {
        name: "DefaultProxyAdmin",
        artifact: defaultProxyAdmin,
      },
    },
  });

  const keeper = await ethers.getContract("PrimeV2Keeper");

  console.log("PrimeV2Keeper deployment complete.");
  console.log(`  PrimeV2Keeper: ${keeper.address}`);

  if (network.name !== "hardhat") {
    console.log("Transferring PrimeV2Keeper ownership to Timelock...");
    await keeper.transferOwnership(adminAccount[network.name]);
    console.log("Ownership transferred.");
  }
};

func.tags = ["PrimeV2Keeper"];
func.dependencies = ["PrimeV2"];

export default func;
