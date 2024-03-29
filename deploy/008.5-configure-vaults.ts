import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function () {
  const xvsVault = await ethers.getContract("XVSVaultProxy_Implementation");
  const xvsStore = await ethers.getContract("XVSStore");
  const xvsVaultProxy = await ethers.getContract("XVSVaultProxy");

  // Become Implementation of XVSVaultProxy
  await xvsVaultProxy._setPendingImplementation(xvsVault.address);
  await xvsVault._become(xvsVaultProxy.address);

  await xvsStore.setNewOwner(xvsVaultProxy.address);
};

func.tags = ["configure-xvs-vault"];
func.id = "configure_xvs_vaults"; // id required to prevent re-execution

export default func;
