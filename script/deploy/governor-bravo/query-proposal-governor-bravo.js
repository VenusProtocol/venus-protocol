const [network, proposalId] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorBravoAddress = contractConfigData.Contracts.GovernorBravoDelegator;

  const governorBravoContractInstance = await saddle.getContractAt("GovernorBravoDelegate", governorBravoAddress);

  const proposalInfo = await governorBravoContractInstance.methods.proposals(parseInt(proposalId)).call();
  const state = await governorBravoContractInstance.methods.state(proposalId).call();

  console.log(
    `proposalInfo on governorBravo ${governorBravoAddress} is: ${JSON.stringify(proposalInfo)} with state: ${state}`,
  );
})();
