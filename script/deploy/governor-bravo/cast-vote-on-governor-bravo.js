const [network, proposalId, support] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  //Timelock
  const GovernorBravoDelegator = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoContractInstance = await saddle.getContractAt("GovernorBravoDelegate", GovernorBravoDelegator);

  //testnet 114 1
  const castVoteTxn = await governorBravoContractInstance.methods
    .castVote(parseInt(proposalId), parseInt(support))
    .send();

  console.log(`casted Vote on GovernorBravo with transactionStatus: ${castVoteTxn.status}`);
})();
