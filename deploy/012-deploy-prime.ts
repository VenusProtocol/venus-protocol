import arbitrumoneGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/arbitrumone.json";
import arbitrumsepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/arbitrumsepolia.json";
import basemainnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/basemainnet.json";
import basesepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/basesepolia.json";
import ethereumGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/ethereum.json";
import opbnbmainnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/opbnbmainnet.json";
import opbnbtestnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/opbnbtestnet.json";
import opmainnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/opmainnet.json";
import opsepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/opsepolia.json";
import sepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/sepolia.json";
import zksyncmainnetGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/zksyncmainnet.json";
import zksyncsepoliaGovernanceDeployments from "@venusprotocol/governance-contracts/deployments/zksyncsepolia.json";
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
    unichainsepolia: TEN_MINUTES,
    basesepolia: TEN_MINUTES,
    berachainbartio: TEN_MINUTES,
    basemainnet: NINETY_DAYS,
    bscmainnet: NINETY_DAYS,
    ethereum: NINETY_DAYS,
    arbitrumone: NINETY_DAYS,
    zksyncmainnet: NINETY_DAYS,
    opmainnet: NINETY_DAYS,
    unichainmainnet: NINETY_DAYS,
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
    berachainbartio: 0,
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
    unichainsepolia: 0, // time based contracts
    basesepolia: 0, // time based contracts
    basemainnet: 0, // time based contracts
    berachainbartio: 0, // time based contracts
    unichainmainnet: 0,
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
  const isTimeBased = blocksPerYear[network.name] === 0;

  const corePoolAddress = await getContractAddressOrNullAddress(deployments, "Unitroller");
  const wrappedNativeToken = await getContractAddressOrNullAddress(deployments, "WBNB");
  const nativeMarket = await getContractAddressOrNullAddress(deployments, "vBNB");
  const acmAddress = "0xEf368e4c1f9ACC9241E66CD67531FEB195fF7536"; // (await deployments.get("AccessControlManager")).address;
  const xvsVaultAddress = "0x622E4e8104F7ebc94Aa81Db2613A751c39e6688b"; // (await deployments.get("XVSVaultProxy")).address;
  const xvsAddress = "0x75A3668f0b0d06E45601C883b0c66f7Dd2364208"; // (await deployments.get("XVS")).address;
  const resilientOracleAddress = "0x279Bd38D27247BFb28064cab434f71816BD4aF4B"; // (await deployments.get("ResilientOracle")).address;

  const adminAccount: AdminAccounts = {
    sepolia: sepoliaGovernanceDeployments.contracts.NormalTimelock.address,
    ethereum: ethereumGovernanceDeployments.contracts.NormalTimelock.address,
    opbnbtestnet: opbnbtestnetGovernanceDeployments.contracts.NormalTimelock.address,
    opbnbmainnet: opbnbmainnetGovernanceDeployments.contracts.NormalTimelock.address,
    arbitrumsepolia: arbitrumsepoliaGovernanceDeployments.contracts.NormalTimelock.address,
    arbitrumone: arbitrumoneGovernanceDeployments.contracts.NormalTimelock.address,
    zksyncsepolia: zksyncsepoliaGovernanceDeployments.contracts.NormalTimelock.address,
    zksyncmainnet: zksyncmainnetGovernanceDeployments.contracts.NormalTimelock.address,
    opsepolia: opsepoliaGovernanceDeployments.contracts.NormalTimelock.address,
    opmainnet: opmainnetGovernanceDeployments.contracts.NormalTimelock.address,
    basesepolia: basesepoliaGovernanceDeployments.contracts.NormalTimelock.address,
    basemainnet: basemainnetGovernanceDeployments.contracts.NormalTimelock.address,
    unichainsepolia: "0x5e20F5A2e23463D39287185DF84607DF7068F314", // unichainsepoliaGovernanceDeployments.contracts.NormalTimelock.address
    unichainmainnet: "0xCb04dc78c99E20724023e5265fE177aa532E8164", // unichainmainnetGovernanceDeployments.contracts.NormalTimelock.address
    berachainbartio: "0x8699D418D8bae5CFdc566E4fce897B08bd9B03B0", // berachainbartioGovernanceDeployments.contracts.NormalTimelock.address
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
