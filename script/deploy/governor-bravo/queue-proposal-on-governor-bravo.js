const [network, proposalId] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const GovernorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoContractInstance = await saddle.getContractAt(
    "GovernorBravoDelegate",
    GovernorBravoDelegatorAddress,
  );

  //113
  const queueProposalTxn = await governorBravoContractInstance.methods.queue(parseInt(proposalId)).send();

  console.log(`Queued Proposal: ${proposalId} on GovernorBravo with transactionStatus: ${queueProposalTxn.status}`);
})();
