const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;

  const governorAlpha2ContractInstance = await saddle.getContractAt("GovernorAlpha2", governorAlpha2Address);

  await governorAlpha2ContractInstance.methods.__acceptAdmin().send();
})();
