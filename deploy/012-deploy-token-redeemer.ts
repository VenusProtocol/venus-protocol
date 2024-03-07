import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const { normalVipTimelock } = ADDRESSES[hre.network.name];
  console.log(normalVipTimelock);

  await deploy("TokenRedeemer", {
    contract: "TokenRedeemer",
    from: deployer,
    log: true,
    autoMine: true,
    args: [normalVipTimelock],
  });
};

func.tags = ["TokenRedeemer"];

export default func;
