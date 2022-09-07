const { bnbUnsigned, bnbMantissa } = require('../../deploy/utils/web3-utils');
const deployXvsVault = require('./deploy-xvs-vault')
const deployXvsVaultProxy = require('./deploy-xvs-vault-proxy')
const deployXvsStore = require('./deploy-xvs-store')

const deployAndConfigureXvsVault = async ({ timelockAddress }) => {
  const [root] = await ethers.getSigners();
  const XvsContract = await ethers.getContractFactory('XVS');
  const xvs = await XvsContract.deploy(root.address);
  const xvsAddress = xvs.address;

  const xvsVault = await deployXvsVault();
  const xvsVaultAddress = xvsVault.address;

  const xvsVaultProxy = await deployXvsVaultProxy();
  const xvsVaultProxyAddress = xvsVaultProxy.address;

  const xvsStore = await deployXvsStore();
  const xvsStoreAddress = xvsStore.address;
  const txn = await xvsVault.setXvsStore(xvsAddress, xvsStore.address);
  await txn.wait(1)

  // Become Implementation of XVSVaultProxy
  console.log(`XVSVault: ${xvsVaultAddress} becoming implementation for XVSVaultProxy: ${xvsVaultProxy.address}`);
  await xvsVaultProxy._setPendingImplementation(xvsVaultAddress)
  await xvsVault._become(xvsVaultProxyAddress);
  console.log(`XVSVault-> becomeImplementationTxn called`);

  // Set implementation for xvs vault proxy
  await xvsVaultProxy._setPendingImplementation(xvsVaultAddress);
  console.log(`XVSVaultProxy-> set XVSVault: ${xvsVaultAddress} as PendingImplementation on XVSVaultProxyAddress`);

  // Set new owner to xvs store
  await xvsStore.setNewOwner(xvsVaultAddress);
  console.log(`XVSStore -> ${xvsVaultProxyAddress} as NewOwner to XVSStore`);

  // Set xvs store to xvs vault
  await xvsVault.setXvsStore(xvsAddress, xvsStoreAddress);
  console.log(`XVSVault -> set XVSStore: ${xvsStoreAddress} with XVS: ${xvsAddress} on XVSVaultProxy`);

  // Delegate voting power to xvs vault
  const delegatee = '0x0000000000000000000000000000000000000000';
  await xvsVault.delegate(delegatee);
  console.log(`xvsVault-> deleagted to: ${delegatee} on xvsVaultProxyAddress`);

  // Add token pool to xvs vault
  const _allocPoint = 100;
  const _token = xvsAddress;
  const _rewardToken = xvsAddress;
  const _rewardPerBlock = bnbUnsigned(1e16);
  const _lockPeriod = 300;
  const _withUpdate = 0;

  console.log(`XVSVault -> Adding xvs: ${_token} as tokenPool 
  \n XVS :${_rewardToken} as RewardToken
  \n allocPoint: ${_allocPoint}
   \n rewardPerBlock: ${_rewardPerBlock}
   \n lockPeriod: ${_lockPeriod} 
   \n witnUpdate: ${_withUpdate}`)

  await xvsVault.add(_rewardToken, _allocPoint, _token,
    _rewardPerBlock, _lockPeriod);

  console.log(`XVS -> created TokenPool for: ${_rewardToken} on xvsVaultProxyAddress`);

  // Set timelock as admin to xvs vault proxy
  await xvsVaultProxy._setPendingAdmin(timelockAddress);
  console.log(`Timelock -> ${timelockAddress} as PendingAdmin to XVSVaultProxy`);

  // approve xvs spending to xvs vault
  const approvalAmount = bnbMantissa(1e10);
  await xvs.approve(xvsVaultAddress, approvalAmount);

  console.log(`XVS -> approved spending for : ${approvalAmount} to xvsVaultAddress`);

  // deposit xvs to xvs vault
  const amount = bnbMantissa(7e5);
  await xvsVault.deposit(xvsAddress, 0, amount);

  console.log(`XVS -> deposit : ${amount} to xvsVaultAddress`);

  return {
    xvsVault,
    xvsVaultProxy,
    xvs,
    xvsStore,
  };
}

module.exports = deployAndConfigureXvsVault;
