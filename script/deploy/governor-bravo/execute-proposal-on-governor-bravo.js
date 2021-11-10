const contractConfigData = require("../../../networks/testnet.json");

(async () => {  

  const GovernorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoContractInstance = await saddle.getContractAt('GovernorBravoDelegate', GovernorBravoDelegatorAddress);

  const proposalId = 65;

  const castVoteTxn = await governorBravoContractInstance.methods.execute(proposalId).send();

  console.log(`Executed Proposal: ${proposalId} on GovernorBravo with transactionStatus: ${castVoteTxn.status}`);
})();
