const [network, symbol] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const venusLensAddress = contractConfigData.Contracts.VenusLens;
  const venusLensContractInstance = await saddle.getContractAt("VenusLens", venusLensAddress);
  const vtokenAddress = contractConfigData.Contracts[symbol];
  const underlyingPriceResponse = await venusLensContractInstance.methods.vTokenUnderlyingPrice(vtokenAddress).call();
  console.log(`underlyingPriceResponse of symbol: ${symbol} is: ${JSON.stringify(underlyingPriceResponse)}`);
})();
