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

  const TEN_MINUTES = 60 * 10;
  const NINETY_DAYS = 90 * 24 * 60 * 60;
  const ZERO_ADDRESS = ethers.constants.AddressZero;

  interface Config {
    [key: string]: number;
  }
  const stakingPeriod: Config = {
    hardhat: TEN_MINUTES,
    bsctestnet: TEN_MINUTES,
    sepolia: TEN_MINUTES,
    arbitrumsepolia: TEN_MINUTES,
    zksyncsepolia: TEN_MINUTES,
    opsepolia: TEN_MINUTES,
    basesepolia: TEN_MINUTES,
    basemainnet: NINETY_DAYS,
    bscmainnet: NINETY_DAYS,
    ethereum: NINETY_DAYS,
    arbitrumone: NINETY_DAYS,
    zksyncmainnet: NINETY_DAYS,
    opmainnet: NINETY_DAYS,
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
    hardhat: 0,
    basesepolia: 0,
    basemainnet: 0
  };

  const blocksPerYear: Config = {
    bsctestnet: 10_512_000, // 3 sec per block
    sepolia: 2_628_000, // 12 sec per block
    arbitrumsepolia: 0, // time based contracts
    arbitrumone: 0, // time based contracts
    zksyncsepolia: 0, // time based contracts
    zksyncmainnet: 0, // time based contracts
    opsepolia: 0, // time based contracts
    opmainnet: 0, // time based contracts
    basesepolia: 0, // time based contracts
    basemainnet: 0, // time based contracts
    bscmainnet: 10_512_000,
    ethereum: 2_628_000,
    hardhat: 100,
  };

  const networkName: string = network.name;
  const maximumXVSCap = ethers.utils.parseEther("100000");
  const minimumXVS = ethers.utils.parseEther("1000");
  const xvsVaultAlphaNumerator = 1;
  const xvsVaultAlphaDenominator = 2;
  const loopsLimit = 20;
  const isTimeBased = true; // revise this value when deploying on L2s

  const corePoolAddress = await getContractAddressOrNullAddress(deployments, "Unitroller");
  const wrappedNativeToken = await getContractAddressOrNullAddress(deployments, "WBNB");
  const nativeMarket = await getContractAddressOrNullAddress(deployments, "vBNB");
  const acmAddress = "0x9E6CeEfDC6183e4D0DF8092A9B90cDF659687daB"; // (await deployments.get("AccessControlManager")).address;
  const xvsVaultAddress = "0x708B54F2C3f3606ea48a8d94dab88D9Ab22D7fCd"; // (await deployments.get("XVSVaultProxy")).address;
  const xvsAddress = "0xebB7873213c8d1d9913D8eA39Aa12d74cB107995"; // (await deployments.get("XVS")).address;
  const resilientOracleAddress = "0xcBBf58bD5bAdE357b634419B70b215D5E9d6FbeD"; // (await deployments.get("ResilientOracle")).address;

  const adminAccount: AdminAccounts = {
    sepolia: "0x94fa6078b6b8a26f0b6edffbe6501b22a10470fb", // SEPOLIA MULTISIG
    ethereum: "0x285960C5B22fD66A736C7136967A3eB15e93CC67", // ETHEREUM MULTISIG
    opbnbtestnet: "0xb15f6EfEbC276A3b9805df81b5FB3D50C2A62BDf", // OPBNBTESTNET MULTISIG
    opbnbmainnet: "0xC46796a21a3A9FAB6546aF3434F2eBfFd0604207", // OPBNBMAINNET MULTISIG
    arbitrumsepolia: "0x1426A5Ae009c4443188DA8793751024E358A61C2", // ARBITRUM SEPOLIA MULTISIG
    arbitrumone: "0x14e0E151b33f9802b3e75b621c1457afc44DcAA0", // ARBITRUM ONE MULTISIG
    zksyncsepolia: "0xa2f83de95E9F28eD443132C331B6a9C9B7a9F866", // ZKSYNC SEPOLIA MULTISIG
    zksyncmainnet: "0x751Aa759cfBB6CE71A43b48e40e1cCcFC66Ba4aa", // ZKSYNC MAINNET MULTISIG
    opsepolia: "0xd57365EE4E850e881229e2F8Aa405822f289e78d", // OPSEPOLIA MULTISIG
    opmainnet: "0x2e94dd14E81999CdBF5deDE31938beD7308354b3", // OPMAINNET MULTISIG
    basesepolia: "0xdf3b635d2b535f906BB02abb22AED71346E36a00", // BASE SEPOLIA MULTISIG
    basemainent: "0x1803Cf1D3495b43cC628aa1d8638A981F8CD341C", // BASE MAINNET MULTISIG
    bscmainnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
    bsctestnet: await getContractAddressOrNullAddress(deployments, "NormalTimelock"),
  };

  // Explicitly mentioning Default Proxy Admin contract path to fetch it from hardhat-deploy instead of OpenZeppelin
  // as zksync doesnot compile OpenZeppelin contracts using zksolc. It is backward compatible for all networks as well.
  const defaultProxyAdmin = await hre.artifacts.readArtifact(
    "hardhat-deploy/solc_0.8/openzeppelin/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
  );
  await deploy("PrimeLiquidityProvider", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [isTimeBased, blocksPerYear[networkName]],
    proxy: {
      owner: network.name === "hardhat" ? deployer : adminAccount[networkName],
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: {
        methodName: "initialize",
        args: [acmAddress, [], [], [], loopsLimit],
      },
      viaAdminContract: {
        name: "DefaultProxyAdmin",
        artifact: defaultProxyAdmin,
      },
    },
  });

  const plp = await ethers.getContract("PrimeLiquidityProvider");

  await deploy("Prime", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [
      wrappedNativeToken ? wrappedNativeToken : ZERO_ADDRESS,
      nativeMarket ? nativeMarket : ZERO_ADDRESS,
      blocksPerYear[networkName],
      stakingPeriod[networkName],
      minimumXVS,
      maximumXVSCap,
      isTimeBased,
    ],
    proxy: {
      owner: network.name === "hardhat" ? deployer : adminAccount[networkName],
      proxyContract: "OptimizedTransparentUpgradeableProxy",
      execute: {
        methodName: "initialize",
        args: [
          xvsVaultAddress,
          xvsAddress,
          xVSVaultPoolId[networkName],
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
};

func.tags = ["Prime"];

export default func;
