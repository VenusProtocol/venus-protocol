const contractConfigData = require("../../../networks/testnet.json");

(async () => {  

  //Timelock
  const GovernorBravoDelegator = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoContractInstance = await saddle.getContractAt('GovernorBravoDelegate', GovernorBravoDelegator);

  const castVoteTxn = await governorBravoContractInstance.methods.castVote(67, 1).send();

  console.log(`casted Vote on GovernorBravo with transactionStatus: ${castVoteTxn.status}`);
})();
