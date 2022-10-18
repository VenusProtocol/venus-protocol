const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;

  const governorAlpha2ContractInstance = await saddle.getContractAt("GovernorAlpha2", governorAlpha2Address);

  const proposalCount = await governorAlpha2ContractInstance.methods.proposalCount().call();

  console.log(`proposalCount on governorAlpha2 ${governorAlpha2Address} is: ${proposalCount}`);

  const votingPeriod = await governorAlpha2ContractInstance.methods.votingPeriod().call();

  console.log(`votingPeriod on governorAlpha2 ${governorAlpha2Address} is: ${votingPeriod}`);
})();
