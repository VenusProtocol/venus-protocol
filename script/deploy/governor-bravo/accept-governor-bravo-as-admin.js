const contractConfigData = require("../../../networks/testnet.json");

(async () => {  

  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoDelegatorContractInstance = await saddle.getContractAt('GovernorBravoDelegator', governorBravoDelegatorAddress);

  await governorBravoDelegatorContractInstance.methods.__acceptAdmin().send();

})();
