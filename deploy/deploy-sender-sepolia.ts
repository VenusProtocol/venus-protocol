import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";
import { LZ_ENDPOINTS, SOURCE_CHAIN_ID, SUPPORTED_NETWORKS } from "../helpers/constants";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const networkName = network.name;

  const { acm } = ADDRESSES[networkName];
  const sourceNetwork = "bsctestnet"; // or bscmainnet

  await deploy("VotesSyncSender", {
    from: deployer,
    args: [LZ_ENDPOINTS[networkName as SUPPORTED_NETWORKS], acm, SOURCE_CHAIN_ID[sourceNetwork]],
    log: true,
    autoMine: true,
  });
};
func.tags = ["VotesSyncSender"];
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.name === "bsctestnet" || hre.network.name === "bscmainnet" || hre.network.name === "hardhat";
export default func;
