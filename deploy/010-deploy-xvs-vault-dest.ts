import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const XVSVaultDestDeployment = await deploy("XVSVaultDest", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });
  const xvsVaultDestAddress = XVSVaultDestDeployment.address;

  const xvsVaultProxyDeployment = await deploy("XVSVaultProxy", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  const xvsVaultProxyAddress = xvsVaultProxyDeployment.address;
  await deploy("XVSStore", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  const xvsVaultDest = await ethers.getContract("XVSVaultDest");
  const xvsStore = await ethers.getContract("XVSStore");
  const xvsVaultProxy = await ethers.getContract("XVSVaultProxy");

  // Become Implementation of XVSVaultProxy
  const tx = await xvsVaultProxy._setPendingImplementation(xvsVaultDestAddress);
  await tx.wait();

  await xvsVaultDest._become(xvsVaultProxyAddress);
  await tx.wait();

  // Set new owner to xvs store
  await xvsStore.setNewOwner(xvsVaultProxyAddress);
  await tx.wait();
};
func.tags = ["XVSVaultDest"];
func.skip = async (hre: HardhatRuntimeEnvironment) =>
  hre.network.name === "bsctestnet" || hre.network.name === "bscmainnet" || hre.network.name === "hardhat";
export default func;
