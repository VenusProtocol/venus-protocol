import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";
import { LZ_ENDPOINTS, SUPPORTED_NETWORKS } from "../helpers/constants";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name;

  const { acm, normalVipTimelock } = ADDRESSES[networkName];
  const xvsVaultAddress = (await ethers.getContract("XVSVault")).address;

  const multichainVoteRegistry = await deploy("MultichainVoteRegistry", {
    from: deployer,
    args: [xvsVaultAddress],
    contract: "MultichainVoteRegistry",
    proxy: {
      owner: network.live ? normalVipTimelock : deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [acm],
      },
      upgradeIndex: 0,
    },
    log: true,
    autoMine: true,
  });

  const votesSyncReceiver = await deploy("VotesSyncReceiver", {
    from: deployer,
    args: [LZ_ENDPOINTS[networkName as SUPPORTED_NETWORKS], multichainVoteRegistry.address],
    log: true,
    autoMine: true,
  });

  await deploy("VotesSyncReceiverAdmin", {
    from: deployer,
    args: [votesSyncReceiver.address],
    contract: "VotesSyncReceiverAdmin",
    proxy: {
      owner: network.live ? normalVipTimelock : deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [acm],
      },
      upgradeIndex: 0,
    },
    log: true,
    autoMine: true,
  });
};
func.tags = ["Receiver"];
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  !(hre.network.name === "bsctestnet" || hre.network.name === "bscmainnet" || hre.network.name === "hardhat");
export default func;
