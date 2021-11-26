const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {  

  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const xvsVaultContractInstance = await saddle.getContractAt('XVSVault', xvsVaultAddress);
  const delegatee = contractConfigData.Accounts.Delegatee;
  const delegateTxn = await xvsVaultContractInstance.methods.delegate(delegatee).send();
  console.log(`xvsVault-> deleagted to: ${delegatee} on xvsVaultAddress: ${xvsVaultAddress} - with transactionStatus: ${delegateTxn.status}`);
})();
