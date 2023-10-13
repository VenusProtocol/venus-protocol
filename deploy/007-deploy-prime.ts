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
    psr: "0xF1d8bcED87d5e077e662160490797cd2B5494d4A",
    oracle: "0x3cD69251D04A28d887Ac14cbe2E14c52F3D57823"
  },
  bscmainnet: {
    acm: "0x4788629ABc6cFCA10F9f969efdEAa1cF70c23555",
    psr: "0x3DA3619EE1FE1031051c3d0dfFe252a145F2630D",
    oracle: "0x6592b5DE802159F3E74B2486b091D11a8256ab8A"
  },
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
  const WBNBAddress = ADDRESSES[networkName].WBNB;
  const pancakeFactoryAddress = ADDRESSES[networkName].pancakeFactory;

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
        args: [
          OTHER_ADDRESSES[networkName].acm,
          [],
          []
        ],
      },
    },
  });

  await deploy("Prime", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
    args: [
      ADDRESSES[networkName].WBNB,
      ADDRESSES[networkName].vBNB,
      10512000
    ],
    proxy: {
      owner: ADDRESSES[networkName].Timelock,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [
          ADDRESSES[networkName].XVSVault,
          ADDRESSES[networkName].XVS,
          1,
          1,
          2,
          OTHER_ADDRESSES[networkName].acm,
          OTHER_ADDRESSES[networkName].psr,
          ADDRESSES[networkName].Unitroller,
          ADDRESSES[networkName].Comptroller,
          OTHER_ADDRESSES[networkName].oracle,
          20
        ],
      },
    },
  });  
};

func.tags = ["Prime"];

export default func;
