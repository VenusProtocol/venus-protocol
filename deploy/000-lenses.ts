import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { skipRemoteNetworks } from "../helpers/deploymentConfig";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("ComptrollerLens", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  await deploy("SnapshotLens", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  await deploy("VenusLens", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });
};

func.tags = ["Lens"];
func.skip = skipRemoteNetworks();

export default func;
