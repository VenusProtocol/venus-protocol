import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const normalVipTimelockAddress = (await deployments.get("NormalTimelock")).address;

  const prime = await ethers.getContract("Prime");
  const plp = await ethers.getContract("PrimeLiquidityProvider");

  console.log("Transferring Prime ownership to Timelock");
  await prime.transferOwnership(normalVipTimelockAddress);

  console.log("Transferring PLP ownership to Timelock");
  await plp.transferOwnership(normalVipTimelockAddress);
};

func.tags = ["Prime"];
func.id = "configure_prime"; // id required to prevent re-execution

export default func;
