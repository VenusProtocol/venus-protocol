import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";
import { LZ_ENDPOINTS, SUPPORTED_NETWORKS } from "../helpers/constants";
import { getSourceChainId } from "../helpers/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const networkName = network.name;

  const { acm } = ADDRESSES[networkName];

  await deploy("VotesSyncSender", {
    from: deployer,
    args: [
      LZ_ENDPOINTS[networkName as SUPPORTED_NETWORKS],
      acm,
      await getSourceChainId(networkName as SUPPORTED_NETWORKS),
    ],
    log: true,
    autoMine: true,
  });
};
func.tags = ["VotesSyncSender"];
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.name === "bsctestnet" || hre.network.name === "bscmainnet" || hre.network.name === "hardhat";
export default func;
