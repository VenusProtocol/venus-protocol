const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const XVSVaultProxyAddress = contractConfigData.Contracts.XVSVaultProxy;
  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const xvsVaultContractInstance = await saddle.getContractAt("XVSVault", xvsVaultAddress);

  //become Implementation of XVSVaultProxy
  console.log(`XVSVault: ${xvsVaultAddress} becoming implementation for XVSVaultProxy: ${XVSVaultProxyAddress}`);
  const becomeImplementationAddress = await xvsVaultContractInstance.methods._become(XVSVaultProxyAddress).send();
  console.log(`XVSVault-> becomeImplementationTxn has Status: ${becomeImplementationAddress.status}`);

  //query Implementation of XVSVaultProxy
  const xvsVaultProxyContractInstance = await saddle.getContractAt("XVSVaultProxy", XVSVaultProxyAddress);
  const implementationAddress = await xvsVaultProxyContractInstance.methods.implementation().call();
  console.log(`XVSVaultProxy-> has Implementation: ${implementationAddress}`);
})();
