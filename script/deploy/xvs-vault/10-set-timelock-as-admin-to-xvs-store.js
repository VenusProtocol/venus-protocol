const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const xvsStoreAddress = contractConfigData.Contracts.XVSStore;
  const xvsStoreContractInstance = await saddle.getContractAt("XVSStore", xvsStoreAddress);
  const timelockAddress = contractConfigData.Contracts.Timelock;
  const setNewAdminToXVSStoreTxn = await xvsStoreContractInstance.methods.setNewAdmin(timelockAddress).send();
  console.log(
    `Timelock -> ${timelockAddress} as NewAdmin to XVSStore: ${xvsStoreAddress} has txnStatus: ${setNewAdminToXVSStoreTxn.status}`,
  );
})();
