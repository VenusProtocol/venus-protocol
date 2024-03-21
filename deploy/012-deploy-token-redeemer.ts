import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const normalVipTimelockAddress = (await deployments.get("NormalTimelock")).address;

  await deploy("TokenRedeemer", {
    contract: "TokenRedeemer",
    from: deployer,
    log: true,
    autoMine: true,
    args: [normalVipTimelockAddress],
  });
};

func.tags = ["TokenRedeemer"];

export default func;
