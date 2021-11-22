const contractConfigData = require("../../../networks/testnet.json");
const { bnbUnsigned } = require('../utils/web3-utils');

(async () => {

  const xvsStoreAddress = contractConfigData.Contracts.XVSStore;
  const xvsStoreContractInstance = await saddle.getContractAt('XVSStore', xvsStoreAddress);
  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const setNewOwnerToXVSStoreTxn = await xvsStoreContractInstance.methods.setNewOwner(xvsVaultAddress).send();
  console.log(`XVSStore -> ${xvsVaultAddress} as NewOwner to XVSStore: ${xvsStoreAddress} has txnStatus: ${setNewOwnerToXVSStoreTxn.status}`);
})();
