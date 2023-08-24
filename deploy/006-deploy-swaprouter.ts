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

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
  const WBNBAddress = ADDRESSES[networkName].WBNB;
  const pancakeFactoryAddress = ADDRESSES[networkName].pancakeFactory;

  await deploy("SwapRouter", {
    contract: "SwapRouter",
    from: deployer,
    args: [WBNBAddress, pancakeFactoryAddress, ADDRESSES[networkName].Unitroller],
    log: true,
    autoMine: true,
  });
};

func.tags = ["SwapRouter"];

export default func;
