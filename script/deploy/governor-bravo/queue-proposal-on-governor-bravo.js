const contractConfigData = require("../../../networks/testnet.json");

(async () => {  

  const GovernorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoContractInstance = await saddle.getContractAt('GovernorBravoDelegate', GovernorBravoDelegatorAddress);

  const proposalId = 67;

  const queueProposalTxn = await governorBravoContractInstance.methods.queue(proposalId).send();

  console.log(`Queued Proposal: ${proposalId} on GovernorBravo with transactionStatus: ${queueProposalTxn.status}`);
})();
