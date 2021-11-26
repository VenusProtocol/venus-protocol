const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {  

  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoDelegatorContractInstance = await saddle.getContractAt('GovernorBravoDelegator', governorBravoDelegatorAddress);

  await governorBravoDelegatorContractInstance.methods.__acceptAdmin().send();

})();
