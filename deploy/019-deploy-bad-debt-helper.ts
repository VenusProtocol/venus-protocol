import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { skipRemoteNetworks } from "../helpers/deploymentConfig";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("BadDebtHelper", {
    contract: "BadDebtHelper",
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  return hre.network.live;
};

func.id = "bad_debt_helper_deploy";
func.tags = ["BadDebtHelper"];
func.skip = skipRemoteNetworks();

export default func;
