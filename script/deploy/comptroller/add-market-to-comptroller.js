const [network, tokenSymbol] = args;
const contractConfigData = require(`../../../networks/${network}.json`);
const { ComptrollerErrorCodes } = require("./ComptrollerErrorReporter");

(async () => {
  const unitrollerAddress = contractConfigData.Contracts.Unitroller;
  const comptrollerContractInstance = await saddle.getContractAt("Comptroller", unitrollerAddress);
  const market = contractConfigData.Contracts[tokenSymbol];

  console.log(
    `Comptroller -> Adding market for ${tokenSymbol} with Address: ${market} to Comtproller :${unitrollerAddress}`,
  );

  const addMarketToComptrollerTxn = await comptrollerContractInstance.methods._supportMarket(market).send();

  const txnEvents = addMarketToComptrollerTxn.events;

  if (txnEvents["Failure"]) {
    const errorCode = txnEvents["Failure"]["returnValues"]["error"];
    const errorDescription = ComptrollerErrorCodes[parseInt(errorCode)];
    console.error(
      `Failed to add ${tokenSymbol} to supportedMarkets. ErrorCode: ${errorCode} - ErrorDescription: ${errorDescription}`,
    );
  } else {
    console.log(
      `Comptroller -> Added Market for: ${tokenSymbol} to Comptroller: ${unitrollerAddress} - with transactionStatus: ${addMarketToComptrollerTxn.status}`,
    );
  }
})();
