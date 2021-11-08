const contractConfigData = require("../../../networks/testnet.json");

(async () => {
  const governorBravoDelegateAddress = contractConfigData.Contracts.GovernorBravoDelegate;
  const governorBravoDelegateContractInstance = await saddle.getContractAt('GovernorBravoDelegate', governorBravoDelegateAddress);

  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;
  console.log(`calling _initiate on GovernorBravoDelegate with argument: ${governorAlpha2Address}`);
  const setProposalCountToGovernorBravoDelegateTxn = await governorBravoDelegateContractInstance.methods._initiate(governorAlpha2Address).send();

  console.log(`setProposalCountToGovernorBravoDelegateTxn has status: ${setProposalCountToGovernorBravoDelegateTxn.status}`);
})();