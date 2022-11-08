const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;

  const governorAlpha2ContractInstance = await saddle.getContractAt("GovernorAlpha2", governorAlpha2Address);

  const proposalInfo = await governorAlpha2ContractInstance.methods.proposals(101).call();

  console.log(`proposalInfo on governorAlpha2 ${governorAlpha2Address} is: ${JSON.stringify(proposalInfo)}`);
})();
