const [network, acct] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const venusLensAddress = contractConfigData.Contracts.VenusLens;
  const venusLensContractInstance = await saddle.getContractAt("VenusLens", venusLensAddress);
  const comptrollerAddress = contractConfigData.Contracts.Unitroller;
  const dailyXVS = await venusLensContractInstance.methods.getDailyXVS(acct, comptrollerAddress).call();
  console.log(`dailyXVS of account: ${acct} is: ${dailyXVS}`);
})();
