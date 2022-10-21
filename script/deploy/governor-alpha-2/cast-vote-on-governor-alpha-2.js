const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  //Timelock
  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;

  const governorAlpha2ContractInstance = await saddle.getContractAt("GovernorAlpha2", governorAlpha2Address);

  const castVoteTxn = await governorAlpha2ContractInstance.methods.castVote(101, true).send();

  console.log(`casted Vote on GovernorAlpha2 with transactionStatus: ${castVoteTxn.status}`);
})();
