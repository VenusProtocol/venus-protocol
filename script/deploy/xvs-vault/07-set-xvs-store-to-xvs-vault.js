const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const xvsVaultProxyAddress = contractConfigData.Contracts.XVSVaultProxy;
  const xvsVaultContractInstance = await saddle.getContractAt("XVSVault", xvsVaultProxyAddress);

  const xvsAddress = contractConfigData.Contracts.XVS;
  const xvsStoreAddress = contractConfigData.Contracts.XVSStore;
  const setXVSStoreTxn = await xvsVaultContractInstance.methods.setXvsStore(xvsAddress, xvsStoreAddress).send();

  console.log(`XVSVault -> set XVSStore: ${xvsStoreAddress} with XVS: ${xvsAddress} on XVSVaultProxy: ${xvsVaultProxyAddress} 
    - with transactionStatus: ${setXVSStoreTxn.status}`);
})();
