const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;
  const governorBravoDelegateContractInstance = await saddle.getContractAt(
    "GovernorBravoDelegate",
    governorBravoDelegatorAddress,
  );

  const admin = await governorBravoDelegateContractInstance.methods.admin().call();
  const guardian = await governorBravoDelegateContractInstance.methods.guardian().call();
  const proposalCount = await governorBravoDelegateContractInstance.methods.proposalCount().call();
  const proposalThreshold = await governorBravoDelegateContractInstance.methods.proposalThreshold().call();
  const votingPeriod = await governorBravoDelegateContractInstance.methods.votingPeriod().call();

  console.log(
    `GovernorBravoDelegate admin is: ${admin} - \n guardian is:${guardian} - \n proposalCount is: ${proposalCount} - \n proposalThreshold: ${proposalThreshold} \n votingPeriod: ${votingPeriod}`,
  );
})();
