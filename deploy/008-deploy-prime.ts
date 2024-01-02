import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const signer = await ethers.getSigner(deployer);

  const TEN_MINUTES = 60 * 10;
  const NINETY_DAYS = 90 * 24 * 60 * 60;
  const ZERO_ADDRESS = ethers.constants.AddressZero;

  interface Config {
    [key: string]: number;
  }
  const stakingPeriod: Config = {
    bsctestnet: TEN_MINUTES,
    sepolia: TEN_MINUTES,
    bscmainnet: NINETY_DAYS,
    ethereum: NINETY_DAYS,
  };

  const xVSVaultPoolId: Config = {
    bsctestnet: 1,
    sepolia: 0,
    bscmainnet: 0,
  };

  const blocksPeryear: Config = {
    bsctestnet: 10_512_000, // 3 sec per block
    sepolia: 2_628_000, // 12 sec per block
    bscmainnet: 10_512_000,
    ethereum: 2_628_000,
  };

  const networkName: string = network.name;
  const maximumXVSCap = ethers.utils.parseEther("100000");
  const minimumXVS = ethers.utils.parseEther("1000");
  const xvsVaultAlphaNumerator = 1;
  const xvsVaultAlphaDenominator = 2;
  const loopsLimit = 20;
  const isTimeBased = false; // revise this value when deploying on L2s

  await deploy("PrimeLiquidityProvider", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [isTimeBased, blocksPeryear[networkName]],
    proxy: {
      owner: ADDRESSES[networkName].normalVipTimelock,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [ADDRESSES[networkName].acm, [], [], [], loopsLimit],
      },
    },
  });

  const plp = await ethers.getContract("PrimeLiquidityProvider");

  const corePoolAddress = ADDRESSES[networkName].unitroller;
  const wrappedNativeToken = ADDRESSES[networkName].wbnb;
  const nativeMarket = ADDRESSES[networkName].vbnb;

  await deploy("Prime", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [
      wrappedNativeToken ? wrappedNativeToken : ZERO_ADDRESS,
      nativeMarket ? nativeMarket : ZERO_ADDRESS,
      blocksPeryear[networkName],
      stakingPeriod[networkName],
      minimumXVS,
      maximumXVSCap,
      isTimeBased,
    ],
    proxy: {
      owner: ADDRESSES[networkName].normalVipTimelock,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [
          ADDRESSES[networkName].xvsVault,
          ADDRESSES[networkName].xvs,
          xVSVaultPoolId[networkName],
          xvsVaultAlphaNumerator,
          xvsVaultAlphaDenominator,
          ADDRESSES[networkName].acm,
          plp.address,
          corePoolAddress ? corePoolAddress : ZERO_ADDRESS,
          ADDRESSES[networkName].oracle,
          loopsLimit,
        ],
      },
    },
  });

  if (!corePoolAddress) {
    console.log(`Reinitialising Prime with PoolRegsitry.`);
    const prime = await ethers.getContract("Prime");
    await prime.initializeV2(ADDRESSES[networkName].poolRegistry);
  }

  if (networkName === "bscmainnet" || networkName === "bsctestnet") {
    await deploy("XVSVault", {
      from: deployer,
      log: true,
      deterministicDeployment: false,
      args: [],
      proxy: false,
    });

    await deploy("PolicyFacet", {
      from: deployer,
      log: true,
      deterministicDeployment: false,
      args: [],
      proxy: false,
    });

    await deploy("SetterFacet", {
      from: deployer,
      log: true,
      deterministicDeployment: false,
      args: [],
      proxy: false,
    });
  }

  console.log("Transferring Prime ownership to Timelock");
  const prime = await ethers.getContract("Prime");
  await prime.transferOwnership(ADDRESSES[networkName].normalVipTimelock);

  console.log("Transferring PLP ownership to Timelock");
  await plp.transferOwnership(ADDRESSES[networkName].normalVipTimelock);
};

func.tags = ["Prime"];

export default func;
