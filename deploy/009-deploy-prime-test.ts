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

  await deploy("AccessControlManagerMockTest", {
    contract: "AccessControlManagerMock",
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [deployer],
    proxy: false,
  });

  const acm = await ethers.getContract("AccessControlManagerMockTest");

  await deploy("PrimeLiquidityProviderTest", {
    contract: "PrimeLiquidityProvider",
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [],
    proxy: {
      owner: ADDRESSES[networkName].Timelock,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [acm.address, [], [], [], loopsLimit],
      },
    },
  });

  const plp = await ethers.getContract("PrimeLiquidityProviderTest");

  await deploy("PrimeTest", {
    contract: "Prime",
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
          ADDRESSES[networkName].XVSVaultProxy,
          ADDRESSES[networkName].XVS,
          xVSVaultPoolId,
          xvsVaultAlphaNumerator,
          xvsVaultAlphaDenominator,
          acm.address,
          plp.address,
          ADDRESSES[networkName].Unitroller,
          OTHER_ADDRESSES[networkName].oracle,
          loopsLimit,
        ],
      },
    },
  });

  console.log("Setting Prime token address in PLP");
  let tx = await plp.setPrimeToken((await ethers.getContract("PrimeTest")).address);
  await tx.wait();

  const assets = [
    ADDRESSES[networkName].ETH,
    ADDRESSES[networkName].BTCB,
    ADDRESSES[networkName].USDC,
    ADDRESSES[networkName].USDT,
  ];

  const markets = [
    ADDRESSES[networkName].vETH,
    ADDRESSES[networkName].vBTC,
    ADDRESSES[networkName].vUSDC,
    ADDRESSES[networkName].vUSDT,
  ];

  const speeds = [100, 10, 10, 10];

  console.log("Initializing tokens in PLP");
  tx = await plp.initializeTokens(assets);
  await tx.wait();

  console.log("Setting speeds in PLP");
  tx = await plp.setTokensDistributionSpeed(assets, speeds);
  await tx.wait();

  const prime = await ethers.getContract("PrimeTest");

  console.log("Adding markets to Prime");
  for (let i = 0; i < markets.length; i++) {
    tx = await prime.addMarket(markets[i], ethers.utils.parseEther("1"), ethers.utils.parseEther("1"));
    await tx.wait();
  }

  console.log("Setting Prime token limits");
  tx = await prime.setLimit(100, 100);
  await tx.wait();

  console.log("Issue Prime Token");
  tx = await prime.issue(true, ["0x2Ce1d0ffD7E869D9DF33e28552b12DdDed326706"]);
  await tx.wait();
};

func.tags = ["PrimeTest"];

export default func;
