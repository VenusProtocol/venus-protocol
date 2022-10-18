const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;
  const governorBravoDelegatorContractInstance = await saddle.getContractAt(
    "GovernorBravoDelegator",
    governorBravoDelegatorAddress,
  );
  const governorBravoDelegateAddress = contractConfigData.Contracts.GovernorBravoDelegate;
  const txn = await governorBravoDelegatorContractInstance.methods
    ._setImplementation(governorBravoDelegateAddress)
    .send();
  console.log(`GovernorBravoDelegator - set new implementation for Delegator with transactionStatus ${txn.status}`);
})();
