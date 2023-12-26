import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const xvsVaultProxyDeployment = await deploy("XVSVaultProxy", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const xvsVaultProxyAddress = xvsVaultProxyDeployment.address;

  await deploy("XVSStore", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const xvsVault = await ethers.getContract("XVSVault");
  const xvsStore = await ethers.getContract("XVSStore");
  const xvsVaultProxy = await ethers.getContract("XVSVaultProxy");

  // Become Implementation of XVSVaultProxy
  const tx = await xvsVaultProxy._setPendingImplementation(xvsVault.address);
  await tx.wait();

  await xvsVault._become(xvsVaultProxyAddress);
  await tx.wait();

  // Set new owner to xvs store
  await xvsStore.setNewOwner(xvsVaultProxyAddress);
  await tx.wait();
};

func.tags = ["deploy-vault"];

export default func;
