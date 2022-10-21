import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("InterestRateModelVUSDC", {
    contract: "JumpRateModel",
    from: deployer,
    log: true,
    autoMine: true,
    args: [0, "50000000000000000", "1090000000000000000", "800000000000000000"],
  });

  await deploy("InterestRateModelVETH", {
    contract: "JumpRateModel",
    from: deployer,
    log: true,
    autoMine: true,
    args: [0, "40000000000000000", "1080000000000000000", "700000000000000000"],
  });
};

func.tags = ["InterestRateModel"];

export default func;
