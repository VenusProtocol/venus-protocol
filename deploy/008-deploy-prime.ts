import { ethers } from "hardhat";
import { Address, DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { Contracts as Mainnet } from "../networks/mainnet.json";
import { Contracts as Testnet } from "../networks/testnet.json";

interface AddressConfig {
  [key: string]: {
    [key: string]: Address;
  };
}

const ADDRESSES: AddressConfig = {
  bsctestnet: Testnet,
  bscmainnet: Mainnet,
};

const OTHER_ADDRESSES: any = {
  bsctestnet: {
    acm: "0x45f8a08F534f34A97187626E05d4b6648Eeaa9AA",
    psr: "0x25c7c7D6Bf710949fD7f03364E9BA19a1b3c10E3",
    oracle: "0x3cD69251D04A28d887Ac14cbe2E14c52F3D57823",
  },
  bscmainnet: {
    acm: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
    psr: "0xCa01D5A9A248a830E9D93231e791B1afFed7c446",
    oracle: "0x6592b5DE802159F3E74B2486b091D11a8256ab8A",
  },
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
  const stakingPeriod = networkName === "bscmainnet" ? 90 * 24 * 60 * 60 : 60 * 10;
  const maximumXVSCap =
    networkName === "bscmainnet" ? ethers.utils.parseEther("100000") : ethers.utils.parseEther("100");
  const minimumXVS = networkName === "bscmainnet" ? ethers.utils.parseEther("1000") : ethers.utils.parseEther("10");
  const xVSVaultPoolId = networkName === "bscmainnet" ? 1 : 1;
  const xvsVaultAlphaNumerator = networkName === "bscmainnet" ? 1 : 1;
  const xvsVaultAlphaDenominator = networkName === "bscmainnet" ? 2 : 2;
  const blocksPeryear = networkName === "bscmainnet" ? 10512000 : 10512000;
  const loopsLimit = networkName === "bscmainnet" ? 20 : 20;

  await deploy("PrimeLiquidityProvider", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [],
    proxy: {
      owner: ADDRESSES[networkName].Timelock,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [OTHER_ADDRESSES[networkName].acm, [], [], [], loopsLimit],
      },
    },
  });

  const plp = await ethers.getContract("PrimeLiquidityProvider");

  await deploy("Prime", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [
      ADDRESSES[networkName].WBNB,
      ADDRESSES[networkName].vBNB,
      blocksPeryear,
      stakingPeriod,
      minimumXVS,
      maximumXVSCap,
    ],
    proxy: {
      owner: ADDRESSES[networkName].Timelock,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [
          ADDRESSES[networkName].XVSVault,
          ADDRESSES[networkName].XVS,
          xVSVaultPoolId,
          xvsVaultAlphaNumerator,
          xvsVaultAlphaDenominator,
          OTHER_ADDRESSES[networkName].acm,
          plp.address,
          ADDRESSES[networkName].Unitroller,
          OTHER_ADDRESSES[networkName].oracle,
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
  await prime.transferOwnership(ADDRESSES[networkName].Timelock);

  console.log("Transferring PLP ownership to Timelock");
  await plp.transferOwnership(ADDRESSES[networkName].Timelock);
};

func.tags = ["Prime"];

export default func;
