const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;

  const governorAlpha2ContractInstance = await saddle.getContractAt("GovernorAlpha2", governorAlpha2Address);

  const proposalId = 101;

  const castVoteTxn = await governorAlpha2ContractInstance.methods.queue(proposalId).send();

  console.log(`Queued Proposal: ${proposalId} on GovernorAlpha2 with transactionStatus: ${castVoteTxn.status}`);
})();
