const contractConfigData = require("../../../networks/testnet.json");

(async () => {

  const xvsVaultAddress = contractConfigData.Contracts.XVSVault;
  const xvsVaultContractInstance = await saddle.getContractAt('XVSVault', xvsVaultAddress);
  const timelockAddress = contractConfigData.Contracts.Timelock;
  const setNewAdminToXVSVaultTxn = await xvsVaultContractInstance.methods.setNewAdmin(timelockAddress).send();
  console.log(`Timelock -> ${timelockAddress} as NewAdmin to XVSVault: ${xvsVaultAddress} has txnStatus: ${setNewAdminToXVSVaultTxn.status}`);
})();
