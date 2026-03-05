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

  const ZERO_ADDRESS = ethers.constants.AddressZero;

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
    basesepolia: 0,
    basemainnet: 0,
    unichainmainnet: 0,
  };

  const networkName: string = network.name;
  const maximumXVSCap = ethers.utils.parseEther("100000");
  const xvsVaultAlphaNumerator = 1;
  const xvsVaultAlphaDenominator = 2;
  const loopsLimit = 20;
  const isTimeBased = blocksPerYear[network.name] === 0;

  const corePoolAddress = await getContractAddressOrNullAddress(deployments, "Unitroller");
  const wrappedNativeToken = await getContractAddressOrNullAddress(deployments, "WBNB");
  const nativeMarket = await getContractAddressOrNullAddress(deployments, "vBNB");
  const acmAddress = (await deployments.get("AccessControlManager")).address;
  const xvsVaultAddress = (await deployments.get("XVSVaultProxy")).address;
  const xvsAddress = (await deployments.get("XVS")).address;
  const resilientOracleAddress = (await deployments.get("ResilientOracle")).address;

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
  await deploy("PrimeLeaderboard", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [xvsVaultAddress, xvsAddress, xVSVaultPoolId[networkName]],
    proxy: {
      owner: network.name === "hardhat" ? deployer : adminAccount[networkName],
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: {
        methodName: "initialize",
        args: [acmAddress, 100],
      },
      viaAdminContract: {
        name: "DefaultProxyAdmin",
        artifact: defaultProxyAdmin,
      },
    },
  });

  const primeLeaderboard = await ethers.getContract("PrimeLeaderboard");

  // ============ Deploy PrimeV2 ============
  const plp = await ethers.getContract("PrimeLiquidityProvider");

  await deploy("PrimeV2", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [
      wrappedNativeToken ? wrappedNativeToken : ZERO_ADDRESS,
      nativeMarket ? nativeMarket : ZERO_ADDRESS,
      maximumXVSCap,
      xvsVaultAddress,
      xvsAddress,
      xVSVaultPoolId[networkName],
      isTimeBased,
      blocksPerYear[networkName],
    ],
    proxy: {
      owner: network.name === "hardhat" ? deployer : adminAccount[networkName],
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: {
        methodName: "initialize",
        args: [
          xvsVaultAlphaNumerator,
          xvsVaultAlphaDenominator,
          acmAddress,
          plp.address,
          corePoolAddress,
          resilientOracleAddress,
          loopsLimit,
        ],
      },
      viaAdminContract: {
        name: "DefaultProxyAdmin",
        artifact: defaultProxyAdmin,
      },
    },
  });

  const primeV2 = await ethers.getContract("PrimeV2");

  // ============ Grant ACM permissions for wiring ============
  if (network.name === "hardhat") {
    const accessControlManager = await ethers.getContract("AccessControlManager");
    await accessControlManager.giveCallPermission(primeV2.address, "setPrimeLeaderboard(address)", deployer);
    await accessControlManager.giveCallPermission(primeLeaderboard.address, "setPrimeV2(address)", deployer);
  }

  // ============ Wire contracts together ============
  console.log("Setting PrimeLeaderboard on PrimeV2...");
  await primeV2.setPrimeLeaderboard(primeLeaderboard.address);

  console.log("Setting PrimeV2 on PrimeLeaderboard...");
  await primeLeaderboard.setPrimeV2(primeV2.address);

  console.log("PrimeV2 deployment complete.");
  console.log(`  PrimeLeaderboard: ${primeLeaderboard.address}`);
  console.log(`  PrimeV2: ${primeV2.address}`);
};

func.tags = ["PrimeV2"];
func.dependencies = ["Prime"]; // Depends on PrimeLiquidityProvider from Prime deployment

export default func;
