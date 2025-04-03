import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getContractAddressOrNullAddress } from "../helpers/deploymentConfig";

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
    basemainnet: NINETY_DAYS,
    bscmainnet: NINETY_DAYS,
    ethereum: NINETY_DAYS,
    arbitrumone: NINETY_DAYS,
    zksyncmainnet: NINETY_DAYS,
    opmainnet: NINETY_DAYS,
    unichainmainnet: NINETY_DAYS,
  };

  const blocksPerYear: Config = {
    bsctestnet: 21024000, // 1.5 sec per block
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
    unichainmainnet: 0,
    bscmainnet: 10_512_000,
    ethereum: 2_628_000,
    hardhat: 100,
  };

  const networkName: string = network.name;
  const maximumXVSCap = ethers.utils.parseEther("100000");
  const minimumXVS = ethers.utils.parseEther("1000");
  const isTimeBased = blocksPerYear[network.name] === 0;

  const wrappedNativeToken = await getContractAddressOrNullAddress(deployments, "WBNB");
  const nativeMarket = await getContractAddressOrNullAddress(deployments, "vBNB");

  await deploy("Prime_Implementation", {
    contract: "Prime",
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
  });

  await deploy("PrimeLiquidityProvider_Implementation", {
    contract: "PrimeLiquidityProvider",
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [isTimeBased, blocksPerYear[networkName]],
  });
};

func.tags = ["Prime-Impl"];

export default func;
