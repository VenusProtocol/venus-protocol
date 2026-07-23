import { isLocalNetwork } from "../helpers/deploymentConfig";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const normalVipTimelockAddress = (await deployments.get("NormalTimelock")).address;
  const vBNBAddress = (await deployments.get("vBNB")).address;

  await deploy("TokenRedeemer", {
    contract: "TokenRedeemer",
    from: deployer,
    log: true,
    autoMine: true,
    args: [normalVipTimelockAddress, vBNBAddress],
  });
};

func.tags = ["TokenRedeemer"];
func.skip = async hre => !isLocalNetwork(hre.network.name) && hre.network.name !== "bscmainnet";

export default func;
