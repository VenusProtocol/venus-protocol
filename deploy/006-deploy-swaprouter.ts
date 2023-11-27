import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
  const addresses = ADDRESSES[networkName];
  const WBNBAddress = addresses.wbnb;
  const pancakeFactoryAddress = addresses.pancakeFactory;

  await deploy("SwapRouter", {
    contract: "SwapRouter",
    from: deployer,
    args: [WBNBAddress, pancakeFactoryAddress, addresses.unitroller, addresses.vbnb],
    log: true,
    autoMine: true,
  });
};

func.tags = ["SwapRouter"];

export default func;
