const contractConfigData = require("../../../networks/testnet.json");

(async () => {
  const governorBravoDelegateAddress = contractConfigData.Contracts.GovernorBravoDelegate;
  const governorAlpha2ContractInstance = await saddle.getContractAt('GovernorBravoDelegate', governorBravoDelegateAddress);

  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;
  const setProposalCountToGovernorBravoDelegateTxn = await governorAlpha2ContractInstance.methods._initiate(governorAlpha2Address).send();

  console.log(`setProposalCountToGovernorBravoDelegateTxn has status: ${setProposalCountToGovernorBravoDelegateTxn.status}`);
})();