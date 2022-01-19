const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);
const { bnbUnsigned } = require('../utils/web3-utils');

(async () => {

  const xvsStoreAddress = contractConfigData.Contracts.XVSStore;
  const xvsStoreContractInstance = await saddle.getContractAt('XVSStore', xvsStoreAddress);
  const xvsVaultProxyAddress = contractConfigData.Contracts.XVSVaultProxy;
  const setNewOwnerToXVSStoreTxn = await xvsStoreContractInstance.methods.setNewOwner(xvsVaultProxyAddress).send();
  console.log(`XVSStore -> ${xvsVaultProxyAddress} as NewOwner to XVSStore: ${xvsStoreAddress} has txnStatus: ${setNewOwnerToXVSStoreTxn.status}`);
})();
