const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const VRTVaultProxyAddress = contractConfigData.Contracts.VRTVaultProxy;
  console.log(`VRTVaultProxyAddress: ${VRTVaultProxyAddress}`);
  const vrtVaultProxyContractInstance = await saddle.getContractAt("VRTVault", VRTVaultProxyAddress);
  const interestRatePerBlock = await vrtVaultProxyContractInstance.methods.vrt().call();
  console.log(`interestRatePerBlock: ${interestRatePerBlock}`);
})();
