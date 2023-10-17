import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const accessControlManager = await ethers.getContract("AccessControlManager");
  const xvsVault = await ethers.getContract("XVSVault");
  const xvs = await ethers.getContract("XVS");

  const tx = await accessControlManager.giveCallPermission(
    ethers.constants.AddressZero,
    "add(address,uint256,address,uint256,uint256)",
    deployer,
  );
  await tx.wait();

  // Add token pool to xvs vault
  const allocPoint = 100;
  const token = xvs.address;
  const rewardToken = xvs.address;
  const rewardPerBlock = "61805555555555555";
  const lockPeriod = 604800;

  await xvsVault.add(rewardToken, allocPoint, token, rewardPerBlock, lockPeriod);
};

func.tags = ["xvs-vault"];

export default func;
