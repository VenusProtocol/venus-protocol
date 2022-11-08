const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorAlphaAddress = contractConfigData.Contracts.GovernorAlpha;

  const governorAlphaContractInstance = await saddle.getContractAt("GovernorAlpha", governorAlphaAddress);

  const proposalCount = await governorAlphaContractInstance.methods.proposalCount().call();

  console.log(`proposalCount on governorAlpha ${governorAlphaAddress} is: ${proposalCount}`);
})();
