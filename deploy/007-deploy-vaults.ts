import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import deployedContracts from '@venusprotocol/governance-contracts/deployments/deployments.json'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const xvsDeployment = await deploy('XVS', {
    from: deployer,
    args: [deployer],
    log: true,
    autoMine: true,
  });
  const xvsAddress = xvsDeployment.address;

  const xvsVaultDeployment = await deploy('XVSVault', {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const xvsVaultAddress = xvsVaultDeployment.address;

  const xvsVaultProxyDeployment = await deploy('XVSVaultProxy', {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const xvsVaultProxyAddress = xvsVaultProxyDeployment.address;

  await deploy('XVSStore', {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const xvsVault = await ethers.getContract('XVSVault');
  const xvsStore = await ethers.getContract('XVSStore');
  const xvsVaultProxy = await ethers.getContract('XVSVaultProxy');
  const chainId = await hre.getChainId() as keyof typeof deployedContracts;
  const accessControlManager = hre.network.live ? await ethers.getContractAt('AccessControlManager', deployedContracts[chainId][0].contracts.AccessControlManager.address ) : await deployments.get("AccessControlManager");


  let txn = await xvsVault.setXvsStore(xvsAddress, xvsStore.address);
  await txn.wait(1);

  txn = await xvsVault.setAccessControl(accessControlManager.address);
  await txn.wait(1);

  // Become Implementation of XVSVaultProxy
  await xvsVaultProxy._setPendingImplementation(xvsVaultAddress);
  await xvsVault._become(xvsVaultProxyAddress);

  // Set new owner to xvs store
  await xvsStore.setNewOwner(xvsVaultAddress);
};

func.tags = ['xvs-vault'];

export default func;
