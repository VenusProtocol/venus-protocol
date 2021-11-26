const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {  

  const governorBravoAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoContractInstance = await saddle.getContractAt('GovernorBravoDelegate', governorBravoAddress);

  const proposalId = 73;
  const proposalInfo = await governorBravoContractInstance.methods.proposals(proposalId).call();
  const state = await governorBravoContractInstance.methods.state(proposalId).call();

  console.log(`proposalInfo on governorBravo ${governorBravoAddress} is: ${JSON.stringify(proposalInfo)} with state: ${state}`);
})();
