import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
  const stakingPeriod = networkName === "bscmainnet" ? 90 * 24 * 60 * 60 : 60 * 10;
  const maximumXVSCap = ethers.utils.parseEther("100000");
  const minimumXVS = ethers.utils.parseEther("1000");
  const xVSVaultPoolId = networkName === "bscmainnet" ? 0 : 1;
  const xvsVaultAlphaNumerator = 1;
  const xvsVaultAlphaDenominator = 2;
  const blocksPeryear = 10512000;
  const loopsLimit = 20;

  await deploy("PrimeLiquidityProvider", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [],
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

  await deploy("Prime", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [
      ADDRESSES[networkName].wbnb,
      ADDRESSES[networkName].vbnb,
      blocksPeryear,
      stakingPeriod,
      minimumXVS,
      maximumXVSCap,
    ],
    proxy: {
      owner: ADDRESSES[networkName].normalVipTimelock,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [
          ADDRESSES[networkName].xvsVault,
          ADDRESSES[networkName].xvs,
          xVSVaultPoolId,
          xvsVaultAlphaNumerator,
          xvsVaultAlphaDenominator,
          ADDRESSES[networkName].acm,
          plp.address,
          ADDRESSES[networkName].unitroller,
          ADDRESSES[networkName].oracle,
          loopsLimit,
        ],
      },
    },
  });

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

  console.log("Transferring Prime ownership to Timelock");
  const prime = await ethers.getContract("Prime");
  await prime.transferOwnership(ADDRESSES[networkName].normalVipTimelock);

  console.log("Transferring PLP ownership to Timelock");
  await plp.transferOwnership(ADDRESSES[networkName].normalVipTimelock);
};

func.tags = ["Prime"];

export default func;
