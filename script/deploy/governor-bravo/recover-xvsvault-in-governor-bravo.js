const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;
  const governorBravoDelegatorContractInstance = await saddle.getContractAt(
    "GovernorBravoDelegate",
    governorBravoDelegatorAddress,
  );
  const xvsVaultProxyAddress = contractConfigData.Contracts.XVSVaultProxy;
  const txn = await governorBravoDelegatorContractInstance.methods.recoverVault(xvsVaultProxyAddress).send();
  console.log(
    `GovernorBravoDelegator - recovered to new XVSVaultProxy for Delegator with transactionStatus ${txn.status}`,
  );
})();
