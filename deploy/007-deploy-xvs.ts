import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("XVS", {
    from: deployer,
    args: [deployer],
    log: true,
    autoMine: true,
  });
};

func.tags = ["xvs"];

func.skip = async (hre: HardhatRuntimeEnvironment) => hre.network.live;

export default func;
