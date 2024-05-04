import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

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
func.skip = async hre => hre.network.name !== "bscmainnet" && hre.network.name !== "bsctestnet";

export default func;
