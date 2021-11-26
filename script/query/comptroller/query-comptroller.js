const contractConfigData = require("../../../networks/mainnet.json");

(async () => {  

  const comptrollerAddress = contractConfigData.Contracts.Comptroller;
  const comptrollerContractInstance = await saddle.getContractAt('Comptroller', comptrollerAddress);
  const allMarkets = await comptrollerContractInstance.methods.getAllMarkets().call();
  console.log(`Comptroller -> ${comptrollerAddress} has Markets: ${allMarkets}`);

})();
