const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorBravoDelegatorAddress = contractConfigData.Contracts.GovernorBravoDelegator;
  const governorBravoDelegateContractInstance = await saddle.getContractAt(
    "GovernorBravoDelegate",
    governorBravoDelegatorAddress,
  );

  const adminOfGovernanceBravoDelegate = await governorBravoDelegateContractInstance.methods.admin().call();
  console.log(`adminOfGovernanceBravoDelegate is: ${adminOfGovernanceBravoDelegate}`);

  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;
  console.log(`calling _initiate on GovernorBravoDelegate with argument: ${governorAlpha2Address}`);
  const setProposalCountToGovernorBravoDelegateTxn = await governorBravoDelegateContractInstance.methods
    ._initiate(governorAlpha2Address)
    .send();

  console.log(
    `setProposalCountToGovernorBravoDelegateTxn has status: ${setProposalCountToGovernorBravoDelegateTxn.status}`,
  );
})();
