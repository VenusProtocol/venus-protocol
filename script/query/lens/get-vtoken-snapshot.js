const [network, acct] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const snapshotLensAddress = contractConfigData.Contracts.SnapshotLens;
  const snapshotLensContractInstance = await saddle.getContractAt("SnapshotLens", snapshotLensAddress);
  const comptrollerAddress = contractConfigData.Contracts.Unitroller;
  const datasnapshot = await snapshotLensContractInstance.methods.getAccountSnapshot(acct, comptrollerAddress).call();
  console.log(`datasnapshot of account: ${acct} is: ${JSON.stringify(datasnapshot)}`);
})();
