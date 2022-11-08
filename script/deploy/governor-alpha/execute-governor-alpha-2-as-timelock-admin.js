const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const governorAlphaAddress = contractConfigData.Contracts.GovernorAlpha;

  const governorAlphaContractInstance = await saddle.getContractAt("GovernorAlpha", governorAlphaAddress);

  const governorAlpha2Address = contractConfigData.Contracts.GovernorAlpha2;
  const eta = contractConfigData.Accounts.eta;

  console.log(`execute SetTimelockPendingAdmin with governorAlpha2: ${governorAlpha2Address} - eta: ${eta}`);

  const executeSetTimelockPendingAdminTxn = await governorAlphaContractInstance.methods
    .__executeSetTimelockPendingAdmin(governorAlpha2Address, eta)
    .send();

  console.log(`executeSetTimelockPendingAdminTxn is: ${executeSetTimelockPendingAdminTxn.status}`);
})();
