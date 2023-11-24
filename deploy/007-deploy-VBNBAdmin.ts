import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import ADDRESSES from "../helpers/address";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const networkName = network.name === "bscmainnet" ? "bscmainnet" : "bsctestnet";
  const {
    vbnb: vBNBAddress,
    wbnb: WBNBAddress,
    acm: ACMAddress,
    protocolShareReserve: ProtocolShareReserveAddress,
    normalVipTimelock: TimelockAddress,
  } = ADDRESSES[networkName];

  await deploy("VBNBAdmin", {
    contract: "VBNBAdmin",
    from: deployer,
    args: [vBNBAddress, WBNBAddress],
    log: true,
    autoMine: true,
    proxy: {
      owner: TimelockAddress,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        methodName: "initialize",
        args: [ProtocolShareReserveAddress, ACMAddress],
      },
    },
  });

  const vBNBAdmin = await ethers.getContract("VBNBAdmin");

  if (network.name !== "hardhat") {
    await vBNBAdmin.transferOwnership(TimelockAddress);
    console.log(`VBNBAdmin Contract (${vBNBAdmin.address}) owner changed from ${deployer} to ${TimelockAddress}`);
  }
  return hre.network.live; // when live network, record the script as executed to prevent rexecution
};

func.id = "vbnbadmin_deploy"; // id required to prevent re-execution
func.tags = ["VBNBAdmin"];

export default func;
