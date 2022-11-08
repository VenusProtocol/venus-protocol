const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const xvsStoreAddress = contractConfigData.Contracts.XVSStore;
  const xvsStoreContractInstance = await saddle.getContractAt("XVSStore", xvsStoreAddress);
  const admin = await xvsStoreContractInstance.methods.admin().call();
  const owner = await xvsStoreContractInstance.methods.owner().call();
  console.log(`XVSStore -> has admin: ${admin} and owner: ${owner}`);
})();
