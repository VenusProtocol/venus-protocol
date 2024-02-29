import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

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
    bscmainnet: NINETY_DAYS,
    ethereum: NINETY_DAYS,
  };

  const xVSVaultPoolId: Config = {
    bsctestnet: 1,
    sepolia: 0,
    bscmainnet: 0,
    ethereum: 0,
    hardhat: 0,
  };

  const blocksPerYear: Config = {
    bsctestnet: 10_512_000, // 3 sec per block
    sepolia: 2_628_000, // 12 sec per block
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
  const isTimeBased = false; // revise this value when deploying on L2s

  const corePoolAddress = (await deployments.get('Comptroller')).address
  const wrappedNativeToken = (await deployments.get('WBNB')).address
  const nativeMarket = (await deployments.get('vBNB')).address
  const acmAddress = (await deployments.get('AccessControlManager')).address
  const xvsVaultAddress = (await deployments.get('XVSVault')).address
  const xvsAddress = (await deployments.get('XVS')).address
  const resilientOracleAddress = (await deployments.get('ResilientOracle')).address
  const normalVipTimelockAddress = (await deployments.get('Timelock_Normal')).address

  await deploy("PrimeLiquidityProvider", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [isTimeBased, blocksPerYear[networkName]],
    proxy: {
      owner: network.name === 'hardhat' ? deployer : normalVipTimelockAddress,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [acmAddress, [], [], [], loopsLimit],
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
      owner: network.name === 'hardhat' ? deployer : normalVipTimelockAddress,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [
          xvsVaultAddress,
          xvsAddress,
          xVSVaultPoolId[networkName],
          xvsVaultAlphaNumerator,
          xvsVaultAlphaDenominator,
          normalVipTimelockAddress,
          plp.address,
          corePoolAddress ? corePoolAddress : ZERO_ADDRESS,
          resilientOracleAddress,
          loopsLimit,
        ],
      },
    },
  });

  const prime = await ethers.getContract("Prime");
  // @todo move to IL repo
  // await prime.initializeV2(ADDRESSES[networkName].poolRegistry);

  console.log("Transferring Prime ownership to Timelock");
  await prime.transferOwnership(normalVipTimelockAddress);

  console.log("Transferring PLP ownership to Timelock");
  await plp.transferOwnership(normalVipTimelockAddress);
};

func.tags = ["Prime"];

export default func;
