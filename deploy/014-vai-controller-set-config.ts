import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";

import { skipRemoteNetworks } from "../helpers/deploymentConfig";

const func: DeployFunction = async function () {
  const vaiController = await ethers.getContract("VaiController");

  let vaiUnitroller = await ethers.getContract("VaiUnitroller");

  await vaiUnitroller._setPendingImplementation(vaiController.address);
  await vaiController._become(vaiUnitroller.address);

  vaiUnitroller = await ethers.getContractAt("VAIController", (await ethers.getContract("VaiUnitroller")).address);
  await vaiUnitroller.initialize();
};

func.tags = ["VAIController", "configuration"];
func.id = "vai_controller_config"; // id required to prevent re-execution
func.skip = skipRemoteNetworks();

export default func;
