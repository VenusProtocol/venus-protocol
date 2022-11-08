const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;

  const governorAlpha2ContractInstance = await saddle.getContractAt("GovernorAlpha2", governorAlpha2Address);

  const governorBavoAddress = contractConfigData.Contracts.GovernorBravoDelegator;
  const eta = contractConfigData.Accounts.eta;

  console.log(`execute SetTimelockPendingAdmin with governorBavo: ${governorBavoAddress} - eta: ${eta}`);

  const executeSetTimelockPendingAdminTxn = await governorAlpha2ContractInstance.methods
    .__executeSetTimelockPendingAdmin(governorBavoAddress, eta)
    .send();

  console.log(`executeSetTimelockPendingAdminTxn is: ${executeSetTimelockPendingAdminTxn.status}`);
})();
