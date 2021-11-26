const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {  
  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const xvsVaultContractInstance = await saddle.getContractAt('XVSVault', xvsVaultAddress);
  
  const xvsAddress = contractConfigData.Contracts.XVS;
  const xvsStoreAddress = contractConfigData.Contracts.XVSStore;
  const setXVSStoreTxn = await xvsVaultContractInstance.methods.setXvsStore(xvsAddress, xvsStoreAddress).send();

  console.log(`XVSVault -> set XVSStore: ${xvsStoreAddress} with XVS: ${xvsAddress} on XVSVault: ${xvsVaultAddress} 
    - with transactionStatus: ${setXVSStoreTxn.status}`);
})();
