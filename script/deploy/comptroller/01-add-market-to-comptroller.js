const [network, tokenSymbol] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {

  const comptrollerAddress = contractConfigData.Contracts.Comptroller;
  const comptrollerContractInstance = await saddle.getContractAt('Comptroller', comptrollerAddress);
  const market = contractConfigData.Contracts[tokenSymbol];

  console.log(`Comptroller -> Adding market for ${tokenSymbol} with Address: ${market} to Comtproller :${comptrollerAddress}`)

  const addMarketToComptrollerTxn = await comptrollerContractInstance.methods.supplyMarket(market).send();

  console.log(`Comptroller -> Added Market for: ${tokenSymbol} to Comptroller: ${comptrollerAddress} - with transactionStatus: ${addMarketToComptrollerTxn.status}`);
})();
