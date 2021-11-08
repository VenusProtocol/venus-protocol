const contractConfigData = require("../../../networks/testnet.json");

(async () => {
  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;
  const governorBravoDelegateContractInstance = await saddle.getContractAt('GovernorBravoDelegate', governorBravoDelegatorAddress);

  const admin = await governorBravoDelegateContractInstance.methods.admin().call();
  const guardian = await governorBravoDelegateContractInstance.methods.guardian().call();

  console.log(`GovernorBravoDelegate admin is: ${admin} - guardian is: ${guardian}`);
})();