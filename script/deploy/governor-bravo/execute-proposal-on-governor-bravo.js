const [network, proposalId] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {  

  const GovernorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoContractInstance = await saddle.getContractAt('GovernorBravoDelegate', GovernorBravoDelegatorAddress);

  const castVoteTxn = await governorBravoContractInstance.methods.execute(parseInt(proposalId)).send();

  console.log(`Executed Proposal: ${proposalId} on GovernorBravo with transactionStatus: ${castVoteTxn.status}`);
})();
