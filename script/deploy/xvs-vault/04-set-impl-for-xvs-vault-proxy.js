const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const XVSVaultProxyAddress = contractConfigData.Contracts.XVSVaultProxy;
  const xvsVaultProxyContractInstance = await saddle.getContractAt("XVSVaultProxy", XVSVaultProxyAddress);

  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const setPendingImplementationTxn = await xvsVaultProxyContractInstance.methods
    ._setPendingImplementation(xvsVaultAddress)
    .send();

  console.log(`XVSVaultProxy-> set XVSVault: ${xvsVaultAddress} as PendingImplementation on XVSVaultProxyAddress: ${XVSVaultProxyAddress} 
    - with transactionStatus: ${setPendingImplementationTxn.status}`);
})();
