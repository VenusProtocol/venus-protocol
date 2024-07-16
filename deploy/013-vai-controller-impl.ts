import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { skipRemoteNetworks } from "../helpers/deploymentConfig";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("VaiController", {
    contract: "VAIController",
    from: deployer,
    log: true,
    autoMine: true,
    args: [],
  });
};

func.tags = ["VAIController"];
func.skip = skipRemoteNetworks();

export default func;
