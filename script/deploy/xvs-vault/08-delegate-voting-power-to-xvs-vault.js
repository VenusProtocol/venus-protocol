const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const xvsVaultProxyAddress = contractConfigData.Contracts.XVSVaultProxy;
  const xvsVaultContractInstance = await saddle.getContractAt("XVSVault", xvsVaultProxyAddress);
  const delegatee = contractConfigData.Accounts.Delegatee;
  const delegateTxn = await xvsVaultContractInstance.methods.delegate(delegatee).send();
  console.log(
    `xvsVault-> deleagted to: ${delegatee} on xvsVaultProxyAddress: ${xvsVaultProxyAddress} - with transactionStatus: ${delegateTxn.status}`,
  );
})();
