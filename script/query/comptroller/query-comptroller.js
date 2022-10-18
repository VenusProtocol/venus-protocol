const [network] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const unitrollerAddress = contractConfigData.Contracts.Unitroller;
  const comptrollerContractInstance = await saddle.getContractAt("Comptroller", unitrollerAddress);
  const allMarkets = await comptrollerContractInstance.methods.getAllMarkets().call();
  console.log(`Comptroller -> ${unitrollerAddress} has Markets: ${allMarkets}`);
})();
