const [network, acct, symbol] = args;
const contractConfigData = require(`../../../networks/${network}.json`);

(async () => {
  const venusLensAddress = contractConfigData.Contracts.VenusLens;
  const venusLensContractInstance = await saddle.getContractAt("VenusLens", venusLensAddress);
  const vtokenAddress = contractConfigData.Contracts[symbol];
  const vTokenBalance = await venusLensContractInstance.methods.vTokenBalances(vtokenAddress, acct).call();
  console.log(`vTokenBalance of symbol: ${symbol} of account: ${acct} is: ${JSON.stringify(vTokenBalance)}`);
})();
